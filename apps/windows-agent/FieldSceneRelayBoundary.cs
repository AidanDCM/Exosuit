using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Exosuit.Agent;

public sealed record FieldSceneRelayPolicy(
    FieldReference Field,
    Guid BootId,
    string AgentId,
    int ActiveWindowsSessionId,
    string InteractiveUserSid,
    FieldDisplayContract Display,
    string ProducerExecutablePath,
    string ProducerExecutableSha256);

public sealed record FieldSceneRelayClientFacts(
    int ProcessId,
    int WindowsSessionId,
    string UserSid,
    string ExecutablePath,
    string ExecutableSha256);

public static class FieldSceneRelayBoundary
{
    private const string ProductionAgentPath = @"C:\Exosuit\Agent\Exosuit.Agent.exe";
    private static readonly JsonSerializerOptions WireJson = CreateWireJson();

    public static FieldChannelEnvelope AcceptAndSign(
        FieldSceneRelayPolicy policy,
        FieldSceneRelayClientFacts client,
        FieldKvpRuntimeConfiguration channel,
        string channelSecret,
        long sequence,
        ReadOnlySpan<byte> payloadUtf8,
        string? relayCallerSid,
        DateTimeOffset? now = null)
    {
        FieldGuestServiceHost.AssertSystemIdentity(relayCallerSid);
        ValidatePolicy(policy, channel);
        ValidateClient(policy, client);
        if (payloadUtf8.Length is <= 0 or > FieldSceneProducerBoundary.MaximumStructuralPayloadBytes)
            throw new InvalidOperationException("Scene relay payload is empty or exceeds the 12 KiB bound.");

        using var document = JsonDocument.Parse(payloadUtf8.ToArray(), new JsonDocumentOptions
        {
            AllowTrailingCommas = false,
            CommentHandling = JsonCommentHandling.Disallow,
            MaxDepth = 32,
        });
        RejectDuplicateProperties(document.RootElement);
        var payload = JsonSerializer.Deserialize<StructuralFieldScenePayload>(document.RootElement.GetRawText(), WireJson)
            ?? throw new InvalidOperationException("Scene relay payload is empty.");
        if (payload.ContractVersion != 1 || payload.BootId != policy.BootId ||
            !string.Equals(payload.AgentId, policy.AgentId, StringComparison.Ordinal) ||
            !string.Equals(payload.WindowsSessionId, policy.ActiveWindowsSessionId.ToString(
                System.Globalization.CultureInfo.InvariantCulture), StringComparison.Ordinal))
            throw new InvalidOperationException("Scene relay payload identity does not match the active Field boot and session.");

        var normalized = FieldSceneProducerBoundary.Create(
            new FieldSceneProducerIdentity(policy.Field, policy.BootId, policy.AgentId, policy.ActiveWindowsSessionId, policy.Display),
            payload.Observation, payload.Cursor, payload.Modal, client.UserSid, client.WindowsSessionId, now);
        var normalizedDictionary = FieldSceneProducerBoundary.ToChannelPayload(normalized);
        if (!string.Equals(CanonicalJson.Serialize(document.RootElement), CanonicalJson.Serialize(normalizedDictionary), StringComparison.Ordinal))
            throw new InvalidOperationException("Scene relay payload is not the exact structural producer representation.");

        return FieldKvpRuntime.CreateEnvelope(
            channel, channelSecret, policy.BootId, sequence, FieldChannelMessageType.SceneObservation,
            normalizedDictionary, now);
    }

    private static void ValidatePolicy(FieldSceneRelayPolicy policy, FieldKvpRuntimeConfiguration channel)
    {
        policy.Field.Validate();
        policy.Display.Validate();
        if (channel.Field != policy.Field || !string.Equals(channel.AgentId, policy.AgentId, StringComparison.Ordinal))
            throw new InvalidOperationException("Scene relay policy does not match the Field channel configuration.");
        if (policy.BootId == Guid.Empty || policy.ActiveWindowsSessionId <= 0 || string.IsNullOrWhiteSpace(policy.AgentId))
            throw new InvalidOperationException("Scene relay boot, agent, and active session identity are required.");
        if (!policy.InteractiveUserSid.StartsWith("S-1-5-21-", StringComparison.Ordinal))
            throw new InvalidOperationException("Scene relay requires an exact local interactive-user SID.");
        _ = new SecurityIdentifier(policy.InteractiveUserSid);
        if (!PathEquals(policy.ProducerExecutablePath, ProductionAgentPath))
            throw new InvalidOperationException("Scene relay producer path is not the fixed compiled agent path.");
        ValidateDigest(policy.ProducerExecutableSha256, "Scene relay producer digest");
    }

    private static void ValidateClient(FieldSceneRelayPolicy policy, FieldSceneRelayClientFacts client)
    {
        if (client.ProcessId <= 0 || client.WindowsSessionId != policy.ActiveWindowsSessionId)
            throw new InvalidOperationException("Scene relay client process is not in the active interactive session.");
        if (!string.Equals(client.UserSid, policy.InteractiveUserSid, StringComparison.Ordinal))
            throw new InvalidOperationException("Scene relay client user SID is invalid.");
        if (!PathEquals(client.ExecutablePath, policy.ProducerExecutablePath))
            throw new InvalidOperationException("Scene relay client executable path is invalid.");
        ValidateDigest(client.ExecutableSha256, "Scene relay client digest");
        if (!FixedTimeDigestEquals(client.ExecutableSha256, policy.ProducerExecutableSha256))
            throw new InvalidOperationException("Scene relay client executable digest is invalid.");
    }

    private static void RejectDuplicateProperties(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in element.EnumerateObject())
            {
                if (!names.Add(property.Name)) throw new InvalidOperationException("Scene relay payload contains a duplicate property.");
                RejectDuplicateProperties(property.Value);
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray()) RejectDuplicateProperties(item);
        }
    }

    private static bool PathEquals(string left, string right) =>
        string.Equals(Path.GetFullPath(left), Path.GetFullPath(right), StringComparison.OrdinalIgnoreCase);

    private static void ValidateDigest(string digest, string name)
    {
        if (digest.Length != 64 || digest.Any(character => character is not (>= '0' and <= '9') and not (>= 'a' and <= 'f')))
            throw new InvalidOperationException($"{name} must be lowercase SHA-256.");
    }

    private static bool FixedTimeDigestEquals(string left, string right) =>
        CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(left), Encoding.ASCII.GetBytes(right));

    private static JsonSerializerOptions CreateWireJson()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = false,
            UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
        return options;
    }
}
