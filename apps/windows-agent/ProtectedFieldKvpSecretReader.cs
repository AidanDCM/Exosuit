using System.Security.Cryptography;

namespace Exosuit.Agent;

public interface IFieldKvpSecretReader
{
    byte[] Read(
        string runtimeConfigurationPath,
        FieldKvpRuntimeConfiguration configuration,
        string? callerSid);
}

public sealed class ProtectedFieldKvpSecretReader : IFieldKvpSecretReader
{
    private const int MinimumSecretBytes = 32;
    private const int MaximumSecretBytes = 16 * 1024;
    private readonly string _configRoot;
    private readonly IProtectedFieldChannelSecretStore _store;
    private readonly IFieldChannelSecretPathInspector _pathInspector;

    public ProtectedFieldKvpSecretReader(
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

    public byte[] Read(
        string runtimeConfigurationPath,
        FieldKvpRuntimeConfiguration configuration,
        string? callerSid)
    {
        FieldGuestServiceHost.AssertSystemIdentity(callerSid);
        ArgumentNullException.ThrowIfNull(configuration);
        FieldKvpRuntime.ValidateConfiguration(configuration);

        var expectedConfigurationPath = Path.Combine(
            _configRoot,
            FieldChannelSecretProtectionCommand.RuntimeConfigurationFileName);
        if (!string.Equals(runtimeConfigurationPath, expectedConfigurationPath, StringComparison.Ordinal) ||
            !string.Equals(Path.GetFullPath(runtimeConfigurationPath), expectedConfigurationPath, StringComparison.Ordinal))
            throw new InvalidOperationException("Protected Field KVP runtime requires the exact Config/guest-runtime.json path.");

        var expectedSecretPath = Path.Combine(_configRoot, FieldChannelSecretProtectionCommand.SeedFileName);
        if (!string.Equals(configuration.SecretPath, expectedSecretPath, StringComparison.Ordinal))
            throw new InvalidOperationException("Protected Field KVP runtime requires the exact Config/channel-secret.txt path.");
        if (!Directory.Exists(_configRoot)) throw new InvalidOperationException("Field Config root does not exist.");
        if (_pathInspector.IsReparsePoint(_configRoot)) throw new InvalidOperationException("Field Config root cannot be a reparse point.");
        if (!File.Exists(expectedSecretPath)) throw new InvalidOperationException("Protected Field channel secret is missing.");
        if (_pathInspector.IsReparsePoint(expectedSecretPath)) throw new InvalidOperationException("Protected Field channel secret cannot be a reparse point.");

        var secret = _store.Load(expectedSecretPath, configuration.Field, configuration.KeyId);
        try
        {
            if (secret.Length is < MinimumSecretBytes or > MaximumSecretBytes ||
                secret.Any(value => value is < 0x20 or > 0x7e))
                throw new InvalidOperationException("Protected Field channel secret is not a bounded printable ASCII channel secret.");
            return secret;
        }
        catch
        {
            CryptographicOperations.ZeroMemory(secret);
            throw;
        }
    }

    public static ProtectedFieldKvpSecretReader CreateProduction()
    {
        var store = new ProtectedFieldChannelSecretStore(
            new DpapiLocalMachineFieldChannelSecretProtector(),
            new WindowsRestrictedFieldChannelSecretFilePolicy());
        return new ProtectedFieldKvpSecretReader(FieldChannelSecretProtectionCommand.ProductionConfigRoot, store);
    }
}
