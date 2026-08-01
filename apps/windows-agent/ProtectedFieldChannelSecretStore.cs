using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Exosuit.Agent;

public sealed record ProtectedFieldChannelSecretEnvelope(
    int ContractVersion,
    FieldReference Field,
    string KeyId,
    string Algorithm,
    string CiphertextBase64);

public interface IFieldChannelSecretProtector
{
    string Algorithm { get; }
    byte[] Protect(byte[] plaintext, byte[] scope);
    byte[] Unprotect(byte[] ciphertext, byte[] scope);
}

public interface IFieldChannelSecretFilePolicy
{
    void Seal(string path);
    void AssertProtected(string path);
}

public interface IProtectedFieldChannelSecretStore
{
    void Save(string path, FieldReference field, string keyId, ReadOnlySpan<byte> secret);
    byte[] Load(string path, FieldReference field, string keyId);
}

public sealed class DpapiLocalMachineFieldChannelSecretProtector : IFieldChannelSecretProtector
{
    public string Algorithm => "dpapi-local-machine";

    public byte[] Protect(byte[] plaintext, byte[] scope)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("DPAPI Field secret protection requires Windows.");
        return ProtectedData.Protect(plaintext, scope, DataProtectionScope.LocalMachine);
    }

    public byte[] Unprotect(byte[] ciphertext, byte[] scope)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("DPAPI Field secret protection requires Windows.");
        return ProtectedData.Unprotect(ciphertext, scope, DataProtectionScope.LocalMachine);
    }
}

public sealed class WindowsRestrictedFieldChannelSecretFilePolicy : IFieldChannelSecretFilePolicy
{
    private static readonly SecurityIdentifier LocalSystem = new(WellKnownSidType.LocalSystemSid, null);
    private static readonly SecurityIdentifier Administrators = new(WellKnownSidType.BuiltinAdministratorsSid, null);

    public void Seal(string path)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Field secret ACL protection requires Windows.");
        var security = new FileSecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        security.AddAccessRule(new FileSystemAccessRule(LocalSystem, FileSystemRights.FullControl, AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(Administrators, FileSystemRights.FullControl, AccessControlType.Allow));
        new FileInfo(path).SetAccessControl(security);
    }

    public void AssertProtected(string path)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Field secret ACL protection requires Windows.");
        var security = new FileInfo(path).GetAccessControl(AccessControlSections.Access);
        if (!security.AreAccessRulesProtected)
            throw new InvalidOperationException("Protected Field channel secret ACL inheritance is enabled.");

        var rules = security.GetAccessRules(includeExplicit: true, includeInherited: true, typeof(SecurityIdentifier))
            .Cast<FileSystemAccessRule>()
            .ToArray();
        if (rules.Length != 2 || rules.Any(rule => rule.IsInherited || rule.AccessControlType != AccessControlType.Allow))
            throw new InvalidOperationException("Protected Field channel secret ACL contains an unexpected rule.");

        var expected = new[] { LocalSystem.Value, Administrators.Value }.Order(StringComparer.Ordinal).ToArray();
        var actual = rules.Select(rule => ((SecurityIdentifier)rule.IdentityReference).Value).Order(StringComparer.Ordinal).ToArray();
        if (!actual.SequenceEqual(expected, StringComparer.Ordinal) ||
            rules.Any(rule => (rule.FileSystemRights & FileSystemRights.FullControl) != FileSystemRights.FullControl))
            throw new InvalidOperationException("Protected Field channel secret ACL does not grant only the required authorities.");
    }
}

public sealed class ProtectedFieldChannelSecretStore : IProtectedFieldChannelSecretStore
{
    private const int ContractVersion = 1;
    private const int MinimumSecretBytes = 32;
    private const int MaximumSecretBytes = 16 * 1024;
    private const int MaximumEnvelopeBytes = 64 * 1024;
    private const int MaximumCiphertextBase64Characters = 48 * 1024;
    private const string ScopeDomain = "exosuit-field-channel-secret-v1";
    private static readonly UTF8Encoding StrictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
    private static readonly JsonSerializerOptions JsonOptions = CreateJsonOptions();
    private readonly IFieldChannelSecretProtector _protector;
    private readonly IFieldChannelSecretFilePolicy _filePolicy;

    public ProtectedFieldChannelSecretStore(
        IFieldChannelSecretProtector protector,
        IFieldChannelSecretFilePolicy filePolicy)
    {
        _protector = protector ?? throw new ArgumentNullException(nameof(protector));
        _filePolicy = filePolicy ?? throw new ArgumentNullException(nameof(filePolicy));
        ValidateAlgorithm(_protector.Algorithm);
    }

    public void Save(string path, FieldReference field, string keyId, ReadOnlySpan<byte> secret)
    {
        var fullPath = ValidateTarget(path, field, keyId);
        ValidateSecret(secret);
        var directory = Path.GetDirectoryName(fullPath)!;
        if (!Directory.Exists(directory))
            throw new InvalidOperationException("Protected Field channel secret directory does not exist.");

        var plaintext = secret.ToArray();
        var scope = CreateScope(field, keyId, _protector.Algorithm);
        byte[]? ciphertext = null;
        var temporary = Path.Combine(directory, $".{Path.GetFileName(fullPath)}.{Guid.NewGuid():N}.tmp");
        try
        {
            ciphertext = _protector.Protect(plaintext, scope);
            if (ciphertext.Length == 0)
                throw new InvalidOperationException("Field channel secret protector returned an empty ciphertext.");
            var envelope = new ProtectedFieldChannelSecretEnvelope(
                ContractVersion, field, keyId, _protector.Algorithm, Convert.ToBase64String(ciphertext));
            var serialized = StrictUtf8.GetBytes(JsonSerializer.Serialize(envelope, JsonOptions) + "\n");
            if (envelope.CiphertextBase64.Length > MaximumCiphertextBase64Characters || serialized.Length > MaximumEnvelopeBytes)
                throw new InvalidOperationException("Protected Field channel secret envelope exceeds its byte limit.");

            using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
            {
                stream.Write(serialized);
                stream.Flush(flushToDisk: true);
            }
            _filePolicy.Seal(temporary);
            _filePolicy.AssertProtected(temporary);
            File.Move(temporary, fullPath, overwrite: true);
            _filePolicy.AssertProtected(fullPath);
        }
        catch
        {
            TryDelete(temporary);
            throw;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plaintext);
            CryptographicOperations.ZeroMemory(scope);
            if (ciphertext is not null) CryptographicOperations.ZeroMemory(ciphertext);
        }
    }

    public byte[] Load(string path, FieldReference field, string keyId)
    {
        var fullPath = ValidateTarget(path, field, keyId);
        _filePolicy.AssertProtected(fullPath);
        byte[] serialized;
        using (var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            if (stream.Length is <= 0 or > MaximumEnvelopeBytes)
                throw new InvalidOperationException("Protected Field channel secret is empty or oversized.");
            serialized = new byte[checked((int)stream.Length)];
            stream.ReadExactly(serialized);
        }

        ProtectedFieldChannelSecretEnvelope envelope;
        try
        {
            envelope = JsonSerializer.Deserialize<ProtectedFieldChannelSecretEnvelope>(StrictUtf8.GetString(serialized), JsonOptions)
                ?? throw new JsonException();
        }
        catch (Exception exception) when (exception is JsonException or DecoderFallbackException)
        {
            throw new InvalidOperationException("Protected Field channel secret envelope is malformed.");
        }
        finally
        {
            CryptographicOperations.ZeroMemory(serialized);
        }

        if (envelope.ContractVersion != ContractVersion || envelope.Field != field ||
            !string.Equals(envelope.KeyId, keyId, StringComparison.Ordinal))
            throw new InvalidOperationException("Protected Field channel secret cannot cross Field generations or key identities.");
        ValidateAlgorithm(envelope.Algorithm);
        if (!string.Equals(envelope.Algorithm, _protector.Algorithm, StringComparison.Ordinal))
            throw new InvalidOperationException("Protected Field channel secret algorithm is not available.");
        if (string.IsNullOrEmpty(envelope.CiphertextBase64) || envelope.CiphertextBase64.Length > MaximumCiphertextBase64Characters)
            throw new InvalidOperationException("Protected Field channel secret ciphertext is malformed.");

        byte[] ciphertext;
        try
        {
            ciphertext = Convert.FromBase64String(envelope.CiphertextBase64);
            if (!string.Equals(Convert.ToBase64String(ciphertext), envelope.CiphertextBase64, StringComparison.Ordinal))
                throw new FormatException();
        }
        catch (FormatException)
        {
            throw new InvalidOperationException("Protected Field channel secret ciphertext is malformed.");
        }

        var scope = CreateScope(field, keyId, envelope.Algorithm);
        try
        {
            byte[] plaintext;
            try
            {
                plaintext = _protector.Unprotect(ciphertext, scope);
            }
            catch (Exception exception) when (exception is CryptographicException or InvalidOperationException)
            {
                throw new InvalidOperationException("Protected Field channel secret could not be decrypted.");
            }
            try
            {
                ValidateSecret(plaintext);
                return plaintext;
            }
            catch
            {
                CryptographicOperations.ZeroMemory(plaintext);
                throw;
            }
        }
        finally
        {
            CryptographicOperations.ZeroMemory(ciphertext);
            CryptographicOperations.ZeroMemory(scope);
        }
    }

    private static string ValidateTarget(string path, FieldReference field, string keyId)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("A protected Field channel secret path is required.", nameof(path));
        ArgumentNullException.ThrowIfNull(field);
        field.Validate();
        if (string.IsNullOrWhiteSpace(keyId) || keyId.Length > 200 || !string.Equals(keyId, keyId.Trim(), StringComparison.Ordinal) ||
            keyId.Any(char.IsControl))
            throw new ArgumentException("Field channel key ID must be 1 to 200 visible characters without surrounding whitespace.", nameof(keyId));
        return Path.GetFullPath(path);
    }

    private static void ValidateSecret(ReadOnlySpan<byte> secret)
    {
        if (secret.Length is < MinimumSecretBytes or > MaximumSecretBytes)
            throw new ArgumentException($"Field channel secret must contain between {MinimumSecretBytes} and {MaximumSecretBytes} bytes.", nameof(secret));
    }

    private static void ValidateAlgorithm(string algorithm)
    {
        if (string.IsNullOrWhiteSpace(algorithm) || algorithm.Length > 100 || !string.Equals(algorithm, algorithm.Trim(), StringComparison.Ordinal) ||
            algorithm.Any(character => char.IsControl(character) || char.IsWhiteSpace(character)))
            throw new InvalidOperationException("Field channel secret protection algorithm identifier is invalid.");
    }

    private static byte[] CreateScope(FieldReference field, string keyId, string algorithm)
    {
        using var stream = new MemoryStream();
        using (var writer = new BinaryWriter(stream, StrictUtf8, leaveOpen: true))
        {
            writer.Write(ScopeDomain);
            writer.Write(field.FieldId.ToByteArray());
            writer.Write(field.FieldGeneration);
            writer.Write(keyId);
            writer.Write(algorithm);
        }
        return SHA256.HashData(stream.ToArray());
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch { }
    }

    private static JsonSerializerOptions CreateJsonOptions() => new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = false,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };
}
