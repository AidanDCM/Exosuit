using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Exosuit.FieldOwner;

internal static class FieldOwnerPaths
{
    internal const string ServiceName = "ExosuitFieldOwner";
    internal const string SystemSid = "S-1-5-18";
    internal const string InstallRoot = @"C:\Program Files\Exosuit\FieldOwner";
    internal const string DataRoot = @"C:\ProgramData\Exosuit\FieldOwner";
    internal const string PolicyPath = DataRoot + @"\policy.json";
    internal const string HostConfigPath = DataRoot + @"\host-config.json";
    internal const string PendingRoot = DataRoot + @"\Queue\Pending";
    internal const string ProcessingRoot = DataRoot + @"\Queue\Processing";
    internal const string ResultsRoot = DataRoot + @"\Results";
    internal const string EvidenceRoot = DataRoot + @"\Evidence";
    internal const string ProvisionScriptPath = InstallRoot + @"\Scripts\Invoke-ExosuitFieldProvisioning.ps1";
    internal const string HostCheckScriptPath = InstallRoot + @"\Scripts\Test-ExosuitFieldHost.ps1";
    internal const string DestroyScriptPath = InstallRoot + @"\Scripts\Remove-ExosuitFieldGeneration.ps1";
    internal const string ObserveScriptPath = InstallRoot + @"\Scripts\Read-ExosuitFieldGuestKvp.ps1";
    internal const string ObserverAgentPath = InstallRoot + @"\Observer\Exosuit.Agent.exe";
    internal const string PowerShellPath = @"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
internal sealed record FieldOwnerPolicy
{
    public required int ContractVersion { get; init; }
    public required Guid PolicyId { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset ExpiresAt { get; init; }
    public required string OwnerSid { get; init; }
    public required string StorageRoot { get; init; }
    public required string HostConfigSha256 { get; init; }
    public required string ProvisionScriptSha256 { get; init; }
    public required string HostCheckScriptSha256 { get; init; }
    public required string DestroyScriptSha256 { get; init; }
    public required string ObserveScriptSha256 { get; init; }
    public required string ObserverAgentSha256 { get; init; }
    public required string[] AllowedOperations { get; init; }
    public required bool AllowDevelopmentAccess { get; init; }
    public required int MaxActiveFields { get; init; }
    public required int MaxJobAgeSeconds { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
internal sealed record FieldOwnerJob
{
    public required int ContractVersion { get; init; }
    public required Guid JobId { get; init; }
    public required Guid PolicyId { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset ExpiresAt { get; init; }
    public required string SourceHead { get; init; }
    public required string Operation { get; init; }
    public required Guid FieldId { get; init; }
    public required int FieldGeneration { get; init; }
    public string? PlanSha256 { get; init; }
    public string? RuntimeConfigSha256 { get; init; }
    public string? HostSecretSha256 { get; init; }
    public bool DevelopmentAccess { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
internal sealed record FieldOwnerJobResult
{
    public required int ContractVersion { get; init; }
    public required Guid JobId { get; init; }
    public required Guid PolicyId { get; init; }
    public required string Operation { get; init; }
    public required Guid FieldId { get; init; }
    public required int FieldGeneration { get; init; }
    public required string Status { get; init; }
    public required DateTimeOffset StartedAt { get; init; }
    public required DateTimeOffset CompletedAt { get; init; }
    public required int ExitCode { get; init; }
    public required string SourceHead { get; init; }
    public string? FailureCode { get; init; }
}

internal static partial class FieldOwnerPolicyStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    [GeneratedRegex("^[0-9a-f]{64}$", RegexOptions.CultureInvariant)]
    private static partial Regex Sha256Pattern();

    [GeneratedRegex("^[0-9a-f]{40}$", RegexOptions.CultureInvariant)]
    private static partial Regex GitHeadPattern();

    internal static FieldOwnerPolicy Load(string path)
    {
        var bytes = ReadBounded(path, 64 * 1024);
        using (var document = ParseStrictJson(bytes, 30)) { }
        var policy = JsonSerializer.Deserialize<FieldOwnerPolicy>(bytes, JsonOptions)
            ?? throw new InvalidOperationException("Field owner policy is empty.");
        Validate(policy);
        return policy;
    }

    internal static FieldOwnerJob LoadJob(string path)
    {
        var bytes = ReadBounded(path, 32 * 1024);
        using (var document = ParseStrictJson(bytes, 20)) { }
        var job = JsonSerializer.Deserialize<FieldOwnerJob>(bytes, JsonOptions)
            ?? throw new InvalidOperationException("Field owner job is empty.");
        return job;
    }

    internal static void Validate(FieldOwnerPolicy policy)
    {
        if (policy.ContractVersion != 1) throw new InvalidOperationException("Unsupported Field owner policy contract version.");
        if (policy.PolicyId == Guid.Empty) throw new InvalidOperationException("Field owner policy ID is invalid.");
        if (policy.CreatedAt >= policy.ExpiresAt) throw new InvalidOperationException("Field owner policy validity interval is invalid.");
        if (policy.ExpiresAt - policy.CreatedAt > TimeSpan.FromDays(180)) throw new InvalidOperationException("Field owner policy cannot exceed 180 days.");
        SecurityIdentifier sid;
        try
        {
            sid = new SecurityIdentifier(policy.OwnerSid);
        }
        catch (ArgumentException exception)
        {
            throw new InvalidOperationException("Field owner policy requires a valid Windows owner SID.", exception);
        }
        if (sid.IsWellKnown(WellKnownSidType.LocalSystemSid)) throw new InvalidOperationException("Field owner policy requires a non-SYSTEM Windows owner SID.");
        var storageRoot = Path.GetFullPath(policy.StorageRoot).TrimEnd(Path.DirectorySeparatorChar);
        if (Path.GetPathRoot(storageRoot) == storageRoot) throw new InvalidOperationException("Field storage root cannot be an entire drive.");
        foreach (var digest in new[] { policy.HostConfigSha256, policy.ProvisionScriptSha256, policy.HostCheckScriptSha256, policy.DestroyScriptSha256, policy.ObserveScriptSha256, policy.ObserverAgentSha256 })
            if (!Sha256Pattern().IsMatch(digest)) throw new InvalidOperationException("Field owner policy contains an invalid SHA-256 digest.");
        var operations = policy.AllowedOperations.Distinct(StringComparer.Ordinal).ToArray();
        if (operations.Length != policy.AllowedOperations.Length || operations.Length == 0 || operations.Any(op => op is not ("provision" or "observe" or "destroy")))
            throw new InvalidOperationException("Field owner policy contains an unsupported or duplicate operation.");
        if (policy.MaxActiveFields is < 1 or > 4) throw new InvalidOperationException("Field owner policy active-Field bound is invalid.");
        if (policy.MaxJobAgeSeconds is < 30 or > 900) throw new InvalidOperationException("Field owner policy job-age bound is invalid.");
    }

    internal static void ValidateJob(FieldOwnerPolicy policy, FieldOwnerJob job, DateTimeOffset now)
    {
        if (job.ContractVersion != 1 || job.JobId == Guid.Empty || job.PolicyId != policy.PolicyId)
            throw new InvalidOperationException("Field owner job identity or contract is invalid.");
        if (!GitHeadPattern().IsMatch(job.SourceHead)) throw new InvalidOperationException("Field owner job source head is invalid.");
        if (job.FieldId == Guid.Empty || job.FieldGeneration < 1) throw new InvalidOperationException("Field owner job requires an exact Field generation.");
        if (!policy.AllowedOperations.Contains(job.Operation, StringComparer.Ordinal)) throw new InvalidOperationException("Field owner job operation is outside owner policy.");
        if (job.CreatedAt > now.AddSeconds(30) || now - job.CreatedAt > TimeSpan.FromSeconds(policy.MaxJobAgeSeconds) || now >= job.ExpiresAt || job.ExpiresAt <= job.CreatedAt)
            throw new InvalidOperationException("Field owner job is stale, future-dated, expired, or has an invalid interval.");
        if (job.ExpiresAt - job.CreatedAt > TimeSpan.FromSeconds(policy.MaxJobAgeSeconds)) throw new InvalidOperationException("Field owner job validity exceeds owner policy.");
        if (now < policy.CreatedAt || now >= policy.ExpiresAt) throw new InvalidOperationException("Field owner policy is not currently valid.");
        if (job.DevelopmentAccess && !policy.AllowDevelopmentAccess) throw new InvalidOperationException("Development access is outside owner policy.");
        if (job.Operation == "provision")
        {
            if (job.PlanSha256 is null || !Sha256Pattern().IsMatch(job.PlanSha256)) throw new InvalidOperationException("Provision job requires an exact plan digest.");
            if (job.RuntimeConfigSha256 is not null || job.HostSecretSha256 is not null) throw new InvalidOperationException("Provision job cannot carry observation inputs.");
        }
        else if (job.Operation == "observe")
        {
            if (job.PlanSha256 is not null || job.DevelopmentAccess || job.RuntimeConfigSha256 is null || job.HostSecretSha256 is null || !Sha256Pattern().IsMatch(job.RuntimeConfigSha256) || !Sha256Pattern().IsMatch(job.HostSecretSha256))
                throw new InvalidOperationException("Observe job requires only exact runtime-config and host-secret digests.");
        }
        else if (job.PlanSha256 is not null || job.RuntimeConfigSha256 is not null || job.HostSecretSha256 is not null || job.DevelopmentAccess)
        {
            throw new InvalidOperationException("Destroy job cannot carry provisioning fields.");
        }
    }

    internal static void ValidateInstalledFiles(FieldOwnerPolicy policy)
    {
        var expected = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [FieldOwnerPaths.HostConfigPath] = policy.HostConfigSha256,
            [FieldOwnerPaths.ProvisionScriptPath] = policy.ProvisionScriptSha256,
            [FieldOwnerPaths.HostCheckScriptPath] = policy.HostCheckScriptSha256,
            [FieldOwnerPaths.DestroyScriptPath] = policy.DestroyScriptSha256,
            [FieldOwnerPaths.ObserveScriptPath] = policy.ObserveScriptSha256,
            [FieldOwnerPaths.ObserverAgentPath] = policy.ObserverAgentSha256,
        };
        foreach (var pair in expected)
        {
            if (!File.Exists(pair.Key)) throw new InvalidOperationException($"Required installed Field owner file is missing: {pair.Key}");
            if (!CryptographicOperations.FixedTimeEquals(Convert.FromHexString(pair.Value), SHA256.HashData(File.ReadAllBytes(pair.Key))))
                throw new InvalidOperationException($"Installed Field owner file digest is invalid: {pair.Key}");
        }
    }

    internal static string SerializeSummary(FieldOwnerPolicy policy) => JsonSerializer.Serialize(new
    {
        contractVersion = 1,
        policyId = policy.PolicyId,
        policy.CreatedAt,
        policy.ExpiresAt,
        policy.OwnerSid,
        policy.StorageRoot,
        policy.AllowedOperations,
        policy.AllowDevelopmentAccess,
        policy.MaxActiveFields,
        policy.MaxJobAgeSeconds,
    }, JsonOptions);

    internal static void WriteResult(string path, FieldOwnerJobResult result)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temporary = path + ".tmp-" + Guid.NewGuid().ToString("N");
        File.WriteAllText(temporary, JsonSerializer.Serialize(result, JsonOptions));
        File.Move(temporary, path, false);
    }

    internal static string ComputeSha256(string path) => Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))).ToLowerInvariant();

    internal static JsonDocument ParseStrictJson(byte[] bytes, int maximumDepth)
    {
        var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = maximumDepth, AllowTrailingCommas = false, CommentHandling = JsonCommentHandling.Disallow });
        try { AssertNoDuplicateProperties(document.RootElement); }
        catch { document.Dispose(); throw; }
        return document;
    }

    private static void AssertNoDuplicateProperties(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in element.EnumerateObject())
            {
                if (!names.Add(property.Name)) throw new InvalidOperationException("Field owner JSON contains a duplicate property.");
                AssertNoDuplicateProperties(property.Value);
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray()) AssertNoDuplicateProperties(item);
        }
    }

    private static byte[] ReadBounded(string path, int maximumBytes)
    {
        var info = new FileInfo(path);
        if (!info.Exists || info.Length <= 0 || info.Length > maximumBytes) throw new InvalidOperationException("Field owner JSON file is missing, empty, or oversized.");
        return File.ReadAllBytes(path);
    }
}
