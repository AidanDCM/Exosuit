using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Exosuit.Agent;

public sealed record LedgerVerification(bool Valid, int Checked, long? FirstInvalidSequence = null, string? Reason = null);

public sealed class HashChainAuditLedger
{
    private static readonly Regex SecretKeyPattern = new(
        "token|password|passcode|secret|authorization|cookie|api[_-]?key|private[_-]?key|credential",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex[] InlineSecretPatterns =
    {
        new("\\bsk-[A-Za-z0-9_-]{12,}\\b", RegexOptions.Compiled | RegexOptions.CultureInvariant),
        new("\\bBearer\\s+[A-Za-z0-9._~+\\/-]+=*\\b", RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant),
        new("\\b(?:api[_-]?key|token|password|secret)\\s*[:=]\\s*[^\\s,;]+", RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant)
    };

    private readonly string _path;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly List<AuditEvent> _events = new();
    private readonly JsonSerializerOptions _jsonOptions;

    public HashChainAuditLedger(string path, JsonSerializerOptions jsonOptions)
    {
        _path = path;
        _jsonOptions = jsonOptions;
    }

    public IReadOnlyList<AuditEvent> Tail(int limit)
    {
        lock (_events)
        {
            return _events.Skip(Math.Max(0, _events.Count - Math.Max(0, limit))).ToArray();
        }
    }

    public async Task<(int Loaded, int Skipped)> HydrateAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (!File.Exists(_path)) return (0, 0);
            var loaded = new List<AuditEvent>();
            var skipped = 0;
            foreach (var line in await File.ReadAllLinesAsync(_path, cancellationToken))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                try
                {
                    var entry = JsonSerializer.Deserialize<AuditEvent>(line, _jsonOptions);
                    if (entry is null) skipped++;
                    else loaded.Add(entry);
                }
                catch (JsonException)
                {
                    skipped++;
                }
            }

            var verification = Verify(loaded);
            if (!verification.Valid)
                throw new InvalidDataException($"Audit ledger failed verification: {verification.Reason}");

            lock (_events)
            {
                _events.Clear();
                _events.AddRange(loaded);
            }
            return (loaded.Count, skipped);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<AuditEvent> AppendAsync(
        string eventType,
        string actor,
        IReadOnlyDictionary<string, object?> payload,
        CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            AuditEvent entry;
            lock (_events)
            {
                var previousHash = _events.LastOrDefault()?.Hash ?? "GENESIS";
                var sequence = _events.Count;
                var redacted = (IReadOnlyDictionary<string, object?>)Redact(payload, string.Empty)!;
                var eventId = Guid.NewGuid().ToString("D");
                var createdAt = DateTimeOffset.UtcNow;
                var hash = ComputeHash(sequence, eventId, eventType, createdAt, actor, redacted, previousHash);
                entry = new AuditEvent(sequence, eventId, eventType, createdAt, actor, redacted, previousHash, hash);
                _events.Add(entry);
            }

            var directory = Path.GetDirectoryName(_path);
            if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);
            await File.AppendAllTextAsync(
                _path,
                JsonSerializer.Serialize(entry, _jsonOptions) + Environment.NewLine,
                new UTF8Encoding(false),
                cancellationToken);
            return entry;
        }
        finally
        {
            _gate.Release();
        }
    }

    public LedgerVerification Verify(IReadOnlyList<AuditEvent>? entries = null)
    {
        IReadOnlyList<AuditEvent> snapshot;
        if (entries is null)
        {
            lock (_events) snapshot = _events.ToArray();
        }
        else snapshot = entries;

        var previousHash = "GENESIS";
        for (var index = 0; index < snapshot.Count; index++)
        {
            var entry = snapshot[index];
            if (entry.Sequence != index)
                return new LedgerVerification(false, index, entry.Sequence, "Sequence mismatch");
            if (!CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(entry.PreviousHash), Encoding.UTF8.GetBytes(previousHash)))
                return new LedgerVerification(false, index, entry.Sequence, "Previous hash mismatch");

            var expectedHash = ComputeHash(
                entry.Sequence,
                entry.EventId,
                entry.EventType,
                entry.CreatedAt,
                entry.Actor,
                entry.Payload,
                entry.PreviousHash);
            if (!CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(entry.Hash), Encoding.UTF8.GetBytes(expectedHash)))
                return new LedgerVerification(false, index, entry.Sequence, "Event hash mismatch");
            previousHash = entry.Hash;
        }
        return new LedgerVerification(true, snapshot.Count);
    }

    public static object? Redact(object? value, string keyHint = "")
    {
        if (SecretKeyPattern.IsMatch(keyHint)) return "[REDACTED]";
        if (value is null) return null;
        if (value is string text)
        {
            foreach (var pattern in InlineSecretPatterns) text = pattern.Replace(text, "[REDACTED]");
            return text.Length > 20_000 ? text[..20_000] + "…[TRUNCATED]" : text;
        }
        if (value is JsonElement element) return RedactJsonElement(element, keyHint);
        if (value is IReadOnlyDictionary<string, object?> readOnlyDictionary)
            return readOnlyDictionary.OrderBy(static pair => pair.Key, StringComparer.Ordinal)
                .ToDictionary(static pair => pair.Key, pair => Redact(pair.Value, pair.Key), StringComparer.Ordinal);
        if (value is IDictionary<string, object?> dictionary)
            return dictionary.OrderBy(static pair => pair.Key, StringComparer.Ordinal)
                .ToDictionary(static pair => pair.Key, pair => Redact(pair.Value, pair.Key), StringComparer.Ordinal);
        if (value is System.Collections.IEnumerable enumerable and not string)
            return enumerable.Cast<object?>().Select(item => Redact(item)).ToArray();
        return value;
    }

    private static object? RedactJsonElement(JsonElement element, string keyHint) => element.ValueKind switch
    {
        JsonValueKind.Object => element.EnumerateObject().OrderBy(static property => property.Name, StringComparer.Ordinal)
            .ToDictionary(static property => property.Name, property => RedactJsonElement(property.Value, property.Name), StringComparer.Ordinal),
        JsonValueKind.Array => element.EnumerateArray().Select(item => RedactJsonElement(item, keyHint)).ToArray(),
        JsonValueKind.String => Redact(element.GetString(), keyHint),
        JsonValueKind.Number when element.TryGetInt64(out var integer) => integer,
        JsonValueKind.Number when element.TryGetDecimal(out var number) => number,
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Null => null,
        _ => element.ToString()
    };

    private static string ComputeHash(
        long sequence,
        string eventId,
        string eventType,
        DateTimeOffset createdAt,
        string actor,
        IReadOnlyDictionary<string, object?> payload,
        string previousHash)
    {
        var canonical = new SortedDictionary<string, object?>(StringComparer.Ordinal)
        {
            ["actor"] = actor,
            ["createdAt"] = createdAt.ToUniversalTime().ToString("O"),
            ["eventId"] = eventId,
            ["eventType"] = eventType,
            ["payload"] = Redact(payload),
            ["previousHash"] = previousHash,
            ["sequence"] = sequence
        };
        var bytes = JsonSerializer.SerializeToUtf8Bytes(canonical);
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }
}
