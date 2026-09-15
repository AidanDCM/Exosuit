using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Exosuit.Agent;

/// <summary>
/// Everything needed to author a scene session except the producer digest, which is never
/// supplied. A caller-provided digest proves nothing about the file that will actually run — the
/// same reasoning the launcher applies before `CreateProcessAsUser`.
/// </summary>
public sealed record FieldSceneSessionAuthoringRequest(
    int ContractVersion,
    bool Enabled,
    int ExpectedSessionId,
    string InteractiveUserSid,
    string ProducerExecutablePath,
    FieldDisplayContract Display,
    int PollIntervalMilliseconds);

/// <summary>
/// Authors `scene-session.json`.
///
/// The point of this command is that an invalid configuration can never reach the guest runtime:
/// it is validated here, at authoring time, by <see cref="FieldSceneSessionConfiguration.Validate"/>
/// — the exact method the runtime calls. There is deliberately no second implementation of those
/// rules. A separate authoring validator would be free to drift from the runtime's, and the drift
/// would surface as a guest that quietly declines to produce scenes.
///
/// The digest is computed from the file on disk. Accepting one from the request would let a
/// mistyped or stale value be written into the config and then be checked against itself.
///
/// An existing file is never overwritten. Enabling scene production is a deliberate act; silently
/// replacing a live session file — possibly on a Field that is mid-ceremony — is exactly the kind
/// of side effect the opt-in default exists to prevent. Removing the old file is the deliberate
/// step.
/// </summary>
public static class FieldSceneSessionAuthoringCommand
{
    private static readonly JsonSerializerOptions Json = CreateJson();

    /// <summary>Builds a validated configuration, computing the digest from the producer image.</summary>
    public static FieldSceneSessionConfiguration Author(
        FieldSceneSessionAuthoringRequest request,
        string? expectedProducerPath = null)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (!File.Exists(request.ProducerExecutablePath))
            throw new InvalidOperationException(
                $"Producer image not found at {request.ProducerExecutablePath}; the digest cannot be computed.");

        var configuration = new FieldSceneSessionConfiguration(
            request.ContractVersion,
            request.Enabled,
            request.ExpectedSessionId,
            request.InteractiveUserSid,
            request.ProducerExecutablePath,
            ComputeDigest(request.ProducerExecutablePath),
            request.Display,
            request.PollIntervalMilliseconds);

        // The runtime's own rules, not a copy of them.
        configuration.Validate(expectedProducerPath);
        return configuration;
    }

    /// <summary>Opened without delete sharing so the file cannot be swapped while it is hashed.</summary>
    private static string ComputeDigest(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    public static string Serialize(FieldSceneSessionConfiguration configuration) =>
        JsonSerializer.Serialize(configuration, Json);

    public static FieldSceneSessionAuthoringRequest ReadRequest(string path) =>
        JsonSerializer.Deserialize<FieldSceneSessionAuthoringRequest>(File.ReadAllText(path), Json)
        ?? throw new InvalidOperationException("Scene session authoring request is empty.");

    /// <summary>
    /// Reads a request, authors a validated configuration, and writes it. Returns the JSON that
    /// was written so the caller can show it rather than guess at it.
    /// </summary>
    public static string Run(string requestPath, string outputPath, string? expectedProducerPath = null)
    {
        if (File.Exists(outputPath))
            throw new InvalidOperationException(
                $"{outputPath} already exists. Remove it deliberately before authoring a new scene session.");

        var configuration = Author(ReadRequest(requestPath), expectedProducerPath);
        var json = Serialize(configuration);

        var directory = Path.GetDirectoryName(Path.GetFullPath(outputPath));
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);

        // Written whole rather than streamed: a half-written session file that happens to parse
        // would be worse than none.
        File.WriteAllText(outputPath, json);
        return json;
    }

    private static JsonSerializerOptions CreateJson()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = false,
            // A request carrying producerExecutableSha256 is rejected rather than ignored, so a
            // caller who believes they are pinning a digest is told they are not.
            UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
            WriteIndented = true,
        };
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
        return options;
    }
}
