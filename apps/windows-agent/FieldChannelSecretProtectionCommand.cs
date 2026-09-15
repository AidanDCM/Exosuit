using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Exosuit.Agent;

public sealed class FieldChannelSecretProtectionCommand
{
    internal const string ProductionConfigRoot = @"C:\Exosuit\Config";
    internal const string RuntimeConfigurationFileName = "guest-runtime.json";
    internal const string SeedFileName = "channel-secret.txt";
    private const int MaximumRuntimeConfigurationBytes = 32 * 1024;
    private static readonly JsonSerializerOptions StrictJson = CreateStrictJson();
    private readonly string _configRoot;
    private readonly IFieldChannelSecretSeedConverter _converter;
    private readonly IFieldChannelSecretPathInspector _pathInspector;

    public FieldChannelSecretProtectionCommand(
        string configRoot,
        IFieldChannelSecretSeedConverter converter,
        IFieldChannelSecretPathInspector? pathInspector = null)
    {
        if (string.IsNullOrWhiteSpace(configRoot)) throw new ArgumentException("A Field Config root is required.", nameof(configRoot));
        _configRoot = Path.GetFullPath(configRoot).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (Path.GetPathRoot(_configRoot) == _configRoot)
            throw new ArgumentException("The Field Config root cannot be an entire drive.", nameof(configRoot));
        _converter = converter ?? throw new ArgumentNullException(nameof(converter));
        _pathInspector = pathInspector ?? new FileSystemFieldChannelSecretPathInspector();
    }

    public FieldChannelSecretSeedConversionResult Execute(
        string runtimeConfigurationPath,
        string? callerSid,
        DateTimeOffset? now = null)
    {
        var configuration = ReadValidatedRuntimeConfiguration(
            _configRoot, runtimeConfigurationPath, callerSid, _pathInspector);
        return _converter.Convert(configuration.SecretPath, configuration.Field, configuration.KeyId, callerSid, now);
    }

    internal static FieldKvpRuntimeConfiguration ReadValidatedRuntimeConfiguration(
        string configRoot,
        string runtimeConfigurationPath,
        string? callerSid,
        IFieldChannelSecretPathInspector? pathInspector = null)
    {
        FieldGuestServiceHost.AssertSystemIdentity(callerSid);
        if (string.IsNullOrWhiteSpace(configRoot)) throw new ArgumentException("A Field Config root is required.", nameof(configRoot));
        var fullConfigRoot = Path.GetFullPath(configRoot).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (Path.GetPathRoot(fullConfigRoot) == fullConfigRoot)
            throw new ArgumentException("The Field Config root cannot be an entire drive.", nameof(configRoot));
        var inspector = pathInspector ?? new FileSystemFieldChannelSecretPathInspector();
        var fullConfigPath = ValidateRuntimeConfigurationPath(fullConfigRoot, runtimeConfigurationPath);
        if (!Directory.Exists(fullConfigRoot)) throw new InvalidOperationException("Field Config root does not exist.");
        if (inspector.IsReparsePoint(fullConfigRoot)) throw new InvalidOperationException("Field Config root cannot be a reparse point.");
        if (!File.Exists(fullConfigPath)) throw new InvalidOperationException("Field runtime configuration is missing.");
        if (inspector.IsReparsePoint(fullConfigPath)) throw new InvalidOperationException("Field runtime configuration cannot be a reparse point.");

        var configuration = ReadStrictConfiguration(fullConfigPath);
        FieldKvpRuntime.ValidateConfiguration(configuration);
        var expectedSeedPath = Path.Combine(fullConfigRoot, SeedFileName);
        if (!string.Equals(configuration.SecretPath, expectedSeedPath, StringComparison.Ordinal))
            throw new InvalidOperationException("Field runtime configuration must bind the exact channel-secret seed path.");
        return configuration;
    }

    public static FieldChannelSecretSeedConversionResult RunProduction(string runtimeConfigurationPath)
    {
        if (!OperatingSystem.IsWindows()) throw new InvalidOperationException("Field channel-secret protection requires Windows.");
        var store = new ProtectedFieldChannelSecretStore(
            new DpapiLocalMachineFieldChannelSecretProtector(),
            new WindowsRestrictedFieldChannelSecretFilePolicy());
        var converter = new FieldChannelSecretSeedConverter(ProductionConfigRoot, store);
        var command = new FieldChannelSecretProtectionCommand(ProductionConfigRoot, converter);
        return command.Execute(runtimeConfigurationPath, WindowsIdentity.GetCurrent().User?.Value);
    }

    public static string SerializeResult(FieldChannelSecretSeedConversionResult result) =>
        JsonSerializer.Serialize(result, StrictJson);

    private static string ValidateRuntimeConfigurationPath(string configRoot, string path)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("A Field runtime configuration path is required.", nameof(path));
        var expectedPath = Path.Combine(configRoot, RuntimeConfigurationFileName);
        if (!string.Equals(path, expectedPath, StringComparison.Ordinal))
            throw new InvalidOperationException("Field channel-secret protection requires the exact Config/guest-runtime.json path.");
        var fullPath = Path.GetFullPath(path);
        if (!string.Equals(fullPath, expectedPath, StringComparison.Ordinal))
            throw new InvalidOperationException("Field channel-secret protection requires the exact Config/guest-runtime.json path.");
        return fullPath;
    }

    private static FieldKvpRuntimeConfiguration ReadStrictConfiguration(string path)
    {
        byte[] serialized;
        using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            if (stream.Length is <= 0 or > MaximumRuntimeConfigurationBytes)
                throw new InvalidOperationException("Field runtime configuration is empty or oversized.");
            serialized = new byte[checked((int)stream.Length)];
            stream.ReadExactly(serialized);
        }
        try
        {
            using var document = JsonDocument.Parse(serialized);
            ValidateNoDuplicateProperties(document.RootElement);
            return JsonSerializer.Deserialize<FieldKvpRuntimeConfiguration>(serialized, StrictJson)
                ?? throw new InvalidOperationException("Field runtime configuration is empty.");
        }
        catch (JsonException)
        {
            throw new InvalidOperationException("Field runtime configuration is malformed.");
        }
        finally
        {
            Array.Clear(serialized);
        }
    }

    private static void ValidateNoDuplicateProperties(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in element.EnumerateObject())
            {
                if (!names.Add(property.Name))
                    throw new InvalidOperationException("Field runtime configuration contains duplicate properties.");
                ValidateNoDuplicateProperties(property.Value);
            }
            return;
        }
        if (element.ValueKind != JsonValueKind.Array) return;
        foreach (var item in element.EnumerateArray()) ValidateNoDuplicateProperties(item);
    }

    private static JsonSerializerOptions CreateStrictJson()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = false,
            UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        };
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
        return options;
    }
}
