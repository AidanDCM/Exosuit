using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Exosuit.Agent;

public enum FieldChannelDirection { HostToGuest, GuestToHost }
public enum FieldChannelMessageType { Handshake, BootstrapStatus, Heartbeat, SceneObservation, Command, CommandResult, Event, EmergencyStop, Shutdown }

public sealed record FieldChannelEnvelope(
    int ContractVersion,
    Guid MessageId,
    FieldReference Field,
    FieldChannelDirection Direction,
    long Sequence,
    FieldChannelMessageType MessageType,
    DateTimeOffset SentAt,
    DateTimeOffset ExpiresAt,
    string Nonce,
    string KeyId,
    string PayloadHash,
    IReadOnlyDictionary<string, object?> Payload,
    string Signature);

public static class FieldChannelAuthentication
{
    public static FieldChannelEnvelope Create(
        FieldReference field,
        FieldChannelDirection direction,
        long sequence,
        FieldChannelMessageType messageType,
        IReadOnlyDictionary<string, object?> payload,
        string keyId,
        string secret,
        DateTimeOffset sentAt,
        TimeSpan ttl,
        Guid? messageId = null,
        string? nonce = null)
    {
        ValidateSecret(secret);
        if (sequence < 0) throw new ArgumentOutOfRangeException(nameof(sequence));
        if (ttl <= TimeSpan.Zero || ttl > TimeSpan.FromMinutes(5)) throw new ArgumentOutOfRangeException(nameof(ttl));
        if (string.IsNullOrWhiteSpace(keyId)) throw new ArgumentException("Field channel key ID is required.", nameof(keyId));
        var envelope = new FieldChannelEnvelope(
            1,
            messageId ?? Guid.NewGuid(),
            field,
            direction,
            sequence,
            messageType,
            sentAt,
            sentAt.Add(ttl),
            nonce ?? Base64Url(RandomNumberGenerator.GetBytes(16)),
            keyId,
            Sha256(CanonicalJson.Serialize(payload)),
            payload,
            string.Empty);
        return envelope with { Signature = Sign(envelope, secret) };
    }

    public static FieldChannelEnvelope Verify(
        FieldChannelEnvelope envelope,
        string secret,
        FieldReference expectedField,
        FieldChannelDirection expectedDirection,
        DateTimeOffset now,
        string? expectedKeyId = null)
    {
        ValidateSecret(secret);
        if (envelope.ContractVersion != 1) throw new InvalidOperationException("Unsupported Field channel contract version.");
        if (envelope.Field != expectedField) throw new InvalidOperationException("Field channel message refers to a different Field generation.");
        if (envelope.Direction != expectedDirection) throw new InvalidOperationException("Field channel message direction is invalid.");
        if (expectedKeyId is not null && !string.Equals(envelope.KeyId, expectedKeyId, StringComparison.Ordinal))
            throw new InvalidOperationException("Field channel key identity is invalid.");
        if (now < envelope.SentAt) throw new InvalidOperationException("Field channel message is not valid yet.");
        if (now >= envelope.ExpiresAt) throw new InvalidOperationException("Field channel message has expired.");
        if (envelope.Sequence < 0) throw new InvalidOperationException("Field channel sequence cannot be negative.");
        if (!string.Equals(envelope.PayloadHash, Sha256(CanonicalJson.Serialize(envelope.Payload)), StringComparison.Ordinal))
            throw new InvalidOperationException("Field channel payload hash is invalid.");
        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(CanonicalUnsigned(envelope)));
        byte[] actual;
        try { actual = FromBase64Url(envelope.Signature); }
        catch (FormatException) { throw new InvalidOperationException("Field channel signature is invalid."); }
        if (actual.Length != expected.Length || !CryptographicOperations.FixedTimeEquals(actual, expected))
            throw new InvalidOperationException("Field channel signature is invalid.");
        return envelope;
    }

    private static string Sign(FieldChannelEnvelope envelope, string secret) =>
        Base64Url(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(CanonicalUnsigned(envelope))));

    private static string CanonicalUnsigned(FieldChannelEnvelope envelope) => CanonicalJson.Serialize(new Dictionary<string, object?>
    {
        ["contractVersion"] = envelope.ContractVersion,
        ["messageId"] = envelope.MessageId.ToString(),
        ["field"] = new Dictionary<string, object?> { ["fieldId"] = envelope.Field.FieldId.ToString(), ["fieldGeneration"] = envelope.Field.FieldGeneration },
        ["direction"] = envelope.Direction == FieldChannelDirection.HostToGuest ? "host_to_guest" : "guest_to_host",
        ["sequence"] = envelope.Sequence,
        ["messageType"] = ToWire(envelope.MessageType),
        ["sentAt"] = WireDate(envelope.SentAt),
        ["expiresAt"] = WireDate(envelope.ExpiresAt),
        ["nonce"] = envelope.Nonce,
        ["keyId"] = envelope.KeyId,
        ["payloadHash"] = envelope.PayloadHash,
        ["payload"] = envelope.Payload,
    });

    private static string ToWire(FieldChannelMessageType value) => value switch
    {
        FieldChannelMessageType.Handshake => "handshake",
        FieldChannelMessageType.BootstrapStatus => "bootstrap_status",
        FieldChannelMessageType.Heartbeat => "heartbeat",
        FieldChannelMessageType.SceneObservation => "scene_observation",
        FieldChannelMessageType.Command => "command",
        FieldChannelMessageType.CommandResult => "command_result",
        FieldChannelMessageType.Event => "event",
        FieldChannelMessageType.EmergencyStop => "emergency_stop",
        FieldChannelMessageType.Shutdown => "shutdown",
        _ => throw new ArgumentOutOfRangeException(nameof(value)),
    };

    private static string WireDate(DateTimeOffset value) =>
        value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    private static void ValidateSecret(string secret)
    {
        if (secret.Length < 32) throw new ArgumentException("Field channel secret must contain at least 32 characters.", nameof(secret));
    }

    private static string Sha256(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
    private static string Base64Url(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    private static byte[] FromBase64Url(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded += new string('=', (4 - padded.Length % 4) % 4);
        return Convert.FromBase64String(padded);
    }
}

public sealed class FieldChannelReplayGuard
{
    private readonly FieldReference _field;
    private readonly FieldChannelDirection _direction;
    private readonly string? _keyId;
    private readonly int _maxRemembered;
    private readonly string? _stateFilePath;
    private readonly HashSet<Guid> _messageIds = [];
    private readonly HashSet<string> _nonces = new(StringComparer.Ordinal);
    private readonly Queue<ReplayEntry> _order = [];
    private long _lastSequence = -1;

    public FieldChannelReplayGuard(
        FieldReference field,
        FieldChannelDirection direction,
        string? expectedKeyId = null,
        int maxRemembered = 10_000,
        string? stateFilePath = null)
    {
        if (maxRemembered is < 1 or > 1_000_000) throw new ArgumentOutOfRangeException(nameof(maxRemembered));
        _field = field;
        _direction = direction;
        _keyId = expectedKeyId;
        _maxRemembered = maxRemembered;
        _stateFilePath = stateFilePath;
        Hydrate();
    }

    public FieldChannelEnvelope Accept(FieldChannelEnvelope envelope, string secret, DateTimeOffset now)
    {
        var verified = FieldChannelAuthentication.Verify(envelope, secret, _field, _direction, now, _keyId);
        if (_messageIds.Contains(verified.MessageId)) throw new InvalidOperationException("Field channel message ID was replayed.");
        if (_nonces.Contains(verified.Nonce)) throw new InvalidOperationException("Field channel nonce was replayed.");
        if (verified.Sequence <= _lastSequence) throw new InvalidOperationException("Field channel sequence must increase strictly.");
        _messageIds.Add(verified.MessageId);
        _nonces.Add(verified.Nonce);
        _order.Enqueue(new ReplayEntry(verified.MessageId, verified.Nonce));
        _lastSequence = verified.Sequence;
        while (_order.Count > _maxRemembered)
        {
            var removed = _order.Dequeue();
            _messageIds.Remove(removed.MessageId);
            _nonces.Remove(removed.Nonce);
        }
        Persist();
        return verified;
    }

    public long LastSequence => _lastSequence;

    private void Hydrate()
    {
        if (_stateFilePath is null || !File.Exists(_stateFilePath)) return;
        var state = JsonSerializer.Deserialize<ReplayState>(File.ReadAllText(_stateFilePath))
            ?? throw new InvalidOperationException("Persisted Field replay state is empty.");
        if (state.ContractVersion != 1 || state.Field != _field || state.Direction != _direction ||
            !string.Equals(state.ExpectedKeyId, _keyId, StringComparison.Ordinal))
            throw new InvalidOperationException("Persisted Field replay state identity does not match this channel.");
        if (state.Entries.Count > _maxRemembered)
            throw new InvalidOperationException("Persisted Field replay state exceeds the configured bound.");
        _lastSequence = state.LastSequence;
        foreach (var entry in state.Entries)
        {
            if (!_messageIds.Add(entry.MessageId) || !_nonces.Add(entry.Nonce))
                throw new InvalidOperationException("Persisted Field replay state contains duplicate identities.");
            _order.Enqueue(entry);
        }
    }

    private void Persist()
    {
        if (_stateFilePath is null) return;
        var directory = Path.GetDirectoryName(Path.GetFullPath(_stateFilePath))
            ?? throw new InvalidOperationException("Field replay state path has no parent directory.");
        Directory.CreateDirectory(directory);
        var state = new ReplayState(1, _field, _direction, _keyId, _lastSequence, [.. _order]);
        var temporary = $"{_stateFilePath}.{Environment.ProcessId}.{Guid.NewGuid():N}.tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(state));
        File.Move(temporary, _stateFilePath, true);
    }

    private sealed record ReplayEntry(Guid MessageId, string Nonce);
    private sealed record ReplayState(
        int ContractVersion,
        FieldReference Field,
        FieldChannelDirection Direction,
        string? ExpectedKeyId,
        long LastSequence,
        IReadOnlyList<ReplayEntry> Entries);
}

public enum FieldGuestLifecycle { Provisioning, Ready, Teaching, Shadowing, Piloting, Stopping, Faulted }

public sealed record FieldHeartbeat(
    int ContractVersion,
    FieldReference Field,
    string AgentId,
    Guid BootId,
    long Sequence,
    DateTimeOffset ObservedAt,
    FieldGuestLifecycle Lifecycle,
    bool DesktopReady,
    bool SessionLocked,
    bool SecureDesktopActive,
    int InputQueueDepth,
    int PendingCommandCount,
    long WorkingSetBytes,
    string? LastErrorCode = null);

public enum FieldHealthState { Unknown, Healthy, Degraded, Faulted }
public sealed record FieldHealthAssessment(FieldHealthState State, string Reason, TimeSpan? Age = null, FieldHeartbeat? Heartbeat = null);

public sealed class FieldHeartbeatMonitor
{
    private readonly FieldReference _field;
    private readonly string _agentId;
    private readonly TimeSpan _degradedAfter;
    private readonly TimeSpan _faultAfter;
    private FieldHeartbeat? _latest;

    public FieldHeartbeatMonitor(FieldReference field, string agentId, TimeSpan? degradedAfter = null, TimeSpan? faultAfter = null)
    {
        _field = field;
        _agentId = string.IsNullOrWhiteSpace(agentId) ? throw new ArgumentException("Agent ID is required.", nameof(agentId)) : agentId;
        _degradedAfter = degradedAfter ?? TimeSpan.FromSeconds(5);
        _faultAfter = faultAfter ?? TimeSpan.FromSeconds(15);
        if (_degradedAfter <= TimeSpan.Zero || _faultAfter <= _degradedAfter) throw new ArgumentException("Heartbeat thresholds are invalid.");
    }

    public FieldHeartbeat Accept(FieldHeartbeat heartbeat, DateTimeOffset now)
    {
        if (heartbeat.ContractVersion != 1) throw new InvalidOperationException("Unsupported heartbeat contract version.");
        if (heartbeat.Field != _field) throw new InvalidOperationException("Heartbeat cannot cross Field generations.");
        if (!string.Equals(heartbeat.AgentId, _agentId, StringComparison.Ordinal)) throw new InvalidOperationException("Heartbeat agent identity is invalid.");
        if (heartbeat.ObservedAt > now.AddSeconds(2)) throw new InvalidOperationException("Heartbeat timestamp is too far in the future.");
        if ((heartbeat.SessionLocked || heartbeat.SecureDesktopActive) && heartbeat.DesktopReady)
            throw new InvalidOperationException("A locked or secure Field session cannot report the desktop ready.");
        if (_latest is not null)
        {
            if (heartbeat.BootId != _latest.BootId) throw new InvalidOperationException("Guest boot identity changed inside one Field generation.");
            if (heartbeat.Sequence <= _latest.Sequence) throw new InvalidOperationException("Heartbeat sequence must increase strictly.");
            if (heartbeat.ObservedAt < _latest.ObservedAt) throw new InvalidOperationException("Heartbeat timestamps cannot move backwards.");
        }
        _latest = heartbeat;
        return heartbeat;
    }

    public FieldHealthAssessment Assess(DateTimeOffset now)
    {
        if (_latest is null) return new(FieldHealthState.Unknown, "No guest heartbeat has been accepted.");
        var age = now - _latest.ObservedAt;
        if (_latest.Lifecycle == FieldGuestLifecycle.Faulted || _latest.LastErrorCode is not null)
            return new(FieldHealthState.Faulted, _latest.LastErrorCode ?? "Guest reported a faulted lifecycle.", age, _latest);
        if (age >= _faultAfter) return new(FieldHealthState.Faulted, "Guest heartbeat expired.", age, _latest);
        if (age >= _degradedAfter) return new(FieldHealthState.Degraded, "Guest heartbeat is stale.", age, _latest);
        if (_latest.SessionLocked) return new(FieldHealthState.Degraded, "Guest session is locked.", age, _latest);
        if (_latest.SecureDesktopActive) return new(FieldHealthState.Degraded, "Guest secure desktop is active.", age, _latest);
        return new(FieldHealthState.Healthy, "Guest heartbeat is current.", age, _latest);
    }
}

internal static class CanonicalJson
{
    // The encoder must match the peer's. System.Text.Json's default escapes characters that are
    // safe in JSON but that it treats as HTML-unsafe — notably '+' becomes "+" — while
    // JavaScript's JSON.stringify emits them literally. Canonical bytes that differ by an escape
    // hash differently, so a payload signed on the guest could not be verified on the host. That
    // is not a theoretical concern: it was exactly the defect this encoder change fixes.
    //
    // "Unsafe" here refers to HTML/JS injection contexts. These bytes are hashed and compared,
    // never interpolated into markup or script, so the relaxed encoder is the correct choice and
    // the strict default was actively wrong.
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static string Serialize(object? value)
    {
        var element = JsonSerializer.SerializeToElement(value, Options);
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream)) Write(writer, element);
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    private static void Write(Utf8JsonWriter writer, JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                writer.WriteStartObject();
                foreach (var property in element.EnumerateObject().OrderBy(property => property.Name, StringComparer.Ordinal))
                {
                    writer.WritePropertyName(property.Name);
                    Write(writer, property.Value);
                }
                writer.WriteEndObject();
                break;
            case JsonValueKind.Array:
                writer.WriteStartArray();
                foreach (var item in element.EnumerateArray()) Write(writer, item);
                writer.WriteEndArray();
                break;
            default:
                element.WriteTo(writer);
                break;
        }
    }
}
