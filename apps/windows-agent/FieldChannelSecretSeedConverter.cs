using System.Security.Cryptography;

namespace Exosuit.Agent;

public enum FieldChannelSecretSeedConversionStatus
{
    Converted,
    AlreadyProtected,
}

public sealed record FieldChannelSecretSeedConversionResult(
    int ContractVersion,
    FieldReference Field,
    string KeyId,
    FieldChannelSecretSeedConversionStatus Status,
    string CiphertextEnvelopeSha256,
    DateTimeOffset CompletedAt);

public interface IFieldChannelSecretPathInspector
{
    bool IsReparsePoint(string path);
}

public sealed class FileSystemFieldChannelSecretPathInspector : IFieldChannelSecretPathInspector
{
    public bool IsReparsePoint(string path) => (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0;
}

public interface IFieldChannelSecretSeedConverter
{
    FieldChannelSecretSeedConversionResult Convert(
        string path,
        FieldReference field,
        string keyId,
        string? callerSid,
        DateTimeOffset? now = null);
}

public sealed class FieldChannelSecretSeedConverter : IFieldChannelSecretSeedConverter
{
    private const int MaximumSeedBytes = 16 * 1024;
    private const string CanonicalSeedFileName = "channel-secret.txt";
    private readonly string _configRoot;
    private readonly IProtectedFieldChannelSecretStore _store;
    private readonly IFieldChannelSecretPathInspector _pathInspector;

    public FieldChannelSecretSeedConverter(
        string configRoot,
        IProtectedFieldChannelSecretStore store,
        IFieldChannelSecretPathInspector? pathInspector = null)
    {
        if (string.IsNullOrWhiteSpace(configRoot)) throw new ArgumentException("A Field Config root is required.", nameof(configRoot));
        _configRoot = Path.GetFullPath(configRoot).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (Path.GetPathRoot(_configRoot) == _configRoot)
            throw new ArgumentException("The Field Config root cannot be an entire drive.", nameof(configRoot));
        _store = store ?? throw new ArgumentNullException(nameof(store));
        _pathInspector = pathInspector ?? new FileSystemFieldChannelSecretPathInspector();
    }

    public FieldChannelSecretSeedConversionResult Convert(
        string path,
        FieldReference field,
        string keyId,
        string? callerSid,
        DateTimeOffset? now = null)
    {
        FieldGuestServiceHost.AssertSystemIdentity(callerSid);
        var fullPath = ValidatePath(path);
        ArgumentNullException.ThrowIfNull(field);
        field.Validate();
        if (!Directory.Exists(_configRoot)) throw new InvalidOperationException("Field Config root does not exist.");
        RejectReparsePoint(_configRoot, "Field Config root");
        if (!File.Exists(fullPath)) throw new InvalidOperationException("Field channel secret seed is missing.");
        RejectReparsePoint(fullPath, "Field channel secret seed");

        var raw = ReadBounded(fullPath);
        try
        {
            var first = raw.FirstOrDefault(value => value is not (byte)' ' and not (byte)'\t' and not (byte)'\r' and not (byte)'\n');
            if (first == (byte)'{')
            {
                VerifyProtected(fullPath, field, keyId);
                return Result(field, keyId, FieldChannelSecretSeedConversionStatus.AlreadyProtected, fullPath, now);
            }

            var normalizedLength = raw.Length;
            while (normalizedLength > 0 && raw[normalizedLength - 1] is (byte)'\r' or (byte)'\n') normalizedLength--;
            var seed = raw.AsSpan(0, normalizedLength);
            var invalidSeedByte = false;
            foreach (var value in seed)
            {
                if (value is < 0x21 or > 0x7e) invalidSeedByte = true;
            }
            if (seed.Length is < 32 or > MaximumSeedBytes || invalidSeedByte)
                throw new InvalidOperationException("Field channel secret seed must be 32 to 16384 printable ASCII bytes with only an optional trailing line ending.");

            _store.Save(fullPath, field, keyId, seed);
            var verified = _store.Load(fullPath, field, keyId);
            try
            {
                if (!CryptographicOperations.FixedTimeEquals(seed, verified))
                    throw new InvalidOperationException("Protected Field channel secret verification failed.");
            }
            finally
            {
                CryptographicOperations.ZeroMemory(verified);
            }
            return Result(field, keyId, FieldChannelSecretSeedConversionStatus.Converted, fullPath, now);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(raw);
        }
    }

    private string ValidatePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("A Field channel secret seed path is required.", nameof(path));
        var fullPath = Path.GetFullPath(path);
        if (!string.Equals(Path.GetDirectoryName(fullPath), _configRoot, StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(Path.GetFileName(fullPath), CanonicalSeedFileName, StringComparison.Ordinal))
            throw new InvalidOperationException("Field channel secret conversion requires the exact Config/channel-secret.txt path.");
        return fullPath;
    }

    private static byte[] ReadBounded(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.None);
        if (stream.Length is <= 0 or > MaximumSeedBytes)
            throw new InvalidOperationException("Field channel secret seed is empty or oversized.");
        var bytes = new byte[checked((int)stream.Length)];
        stream.ReadExactly(bytes);
        return bytes;
    }

    private void VerifyProtected(string path, FieldReference field, string keyId)
    {
        var verified = _store.Load(path, field, keyId);
        CryptographicOperations.ZeroMemory(verified);
    }

    private void RejectReparsePoint(string path, string description)
    {
        if (_pathInspector.IsReparsePoint(path))
            throw new InvalidOperationException($"{description} cannot be a reparse point.");
    }

    private static FieldChannelSecretSeedConversionResult Result(
        FieldReference field,
        string keyId,
        FieldChannelSecretSeedConversionStatus status,
        string path,
        DateTimeOffset? now)
    {
        var digest = System.Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))).ToLowerInvariant();
        return new FieldChannelSecretSeedConversionResult(1, field, keyId, status, digest, now ?? DateTimeOffset.UtcNow);
    }
}
