using System.Diagnostics;
using System.Text.Json;

namespace Exosuit.FieldOwner;

internal static class FieldOwnerCommandFactory
{
    internal static ProcessStartInfo Create(FieldOwnerPolicy policy, FieldOwnerJob job, string claimedPackageRoot)
    {
        var root = EnsureExactClaimedRoot(job.JobId, claimedPackageRoot);
        AssertExactPackageShape(root, job.Operation);
        var startInfo = new ProcessStartInfo
        {
            FileName = FieldOwnerPaths.PowerShellPath,
            WorkingDirectory = FieldOwnerPaths.InstallRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        AddCommon(startInfo);
        if (job.Operation == "provision")
        {
            var planPath = EnsureChildFile(root, "plan.json");
            var seedPath = EnsureChildDirectory(root, "guest-seed");
            if (!string.Equals(FieldOwnerPolicyStore.ComputeSha256(planPath), job.PlanSha256, StringComparison.Ordinal))
                throw new InvalidOperationException("Provision plan digest does not match the claimed job.");
            AssertPlanIdentity(planPath, job);
            Add(startInfo, "-File", FieldOwnerPaths.ProvisionScriptPath,
                "-PlanPath", planPath,
                "-HostConfigPath", FieldOwnerPaths.HostConfigPath,
                "-Apply",
                "-TypedConfirmation", $"CREATE FIELD {job.FieldId:D} GENERATION {job.FieldGeneration}",
                "-GuestSeedDirectory", seedPath,
                "-EvidenceDirectory", FieldOwnerPaths.EvidenceRoot,
                "-Confirm:$false");
            if (job.DevelopmentAccess) startInfo.ArgumentList.Add("-DevelopmentAccess");
        }
        else if (job.Operation == "destroy")
        {
            Add(startInfo, "-File", FieldOwnerPaths.DestroyScriptPath,
                "-FieldId", job.FieldId.ToString("D"),
                "-FieldGeneration", job.FieldGeneration.ToString(System.Globalization.CultureInfo.InvariantCulture),
                "-HostConfigPath", FieldOwnerPaths.HostConfigPath,
                "-TypedConfirmation", $"DESTROY FIELD {job.FieldId:D} GENERATION {job.FieldGeneration}",
                "-EvidenceDirectory", FieldOwnerPaths.EvidenceRoot,
                "-Confirm:$false");
        }
        else if (job.Operation == "observe")
        {
            var runtimeConfigPath = EnsureChildFile(root, "runtime-config.json");
            var hostSecretPath = EnsureChildFile(root, "host-secret.txt");
            if (!string.Equals(FieldOwnerPolicyStore.ComputeSha256(runtimeConfigPath), job.RuntimeConfigSha256, StringComparison.Ordinal) ||
                !string.Equals(FieldOwnerPolicyStore.ComputeSha256(hostSecretPath), job.HostSecretSha256, StringComparison.Ordinal))
                throw new InvalidOperationException("Observation input digest does not match the claimed job.");
            AssertObservationIdentity(runtimeConfigPath, hostSecretPath, job);
            var evidenceDirectory = Path.Combine(FieldOwnerPaths.EvidenceRoot, job.FieldId.ToString("D"), $"generation-{job.FieldGeneration}", "kvp");
            Add(startInfo, "-File", FieldOwnerPaths.ObserveScriptPath,
                "-VmName", $"Exosuit-Field-{job.FieldId:D}-G{job.FieldGeneration}",
                "-RuntimeConfigPath", runtimeConfigPath,
                "-AgentPath", FieldOwnerPaths.ObserverAgentPath,
                "-EvidenceDirectory", evidenceDirectory);
        }
        else
        {
            throw new InvalidOperationException("Unsupported Field owner job operation.");
        }
        return startInfo;
    }

    private static void AssertExactPackageShape(string root, string operation)
    {
        var expected = operation switch
        {
            "provision" => new[] { "guest-seed", "job.json", "plan.json" },
            "observe" => new[] { "host-secret.txt", "job.json", "runtime-config.json" },
            _ => new[] { "job.json" },
        };
        var actual = Directory.EnumerateFileSystemEntries(root).Select(Path.GetFileName).Order(StringComparer.Ordinal).ToArray();
        if (!expected.Order(StringComparer.Ordinal).SequenceEqual(actual, StringComparer.Ordinal))
            throw new InvalidOperationException("Field owner job package contains missing or unexpected top-level entries.");
    }

    private static void AddCommon(ProcessStartInfo info) => Add(info, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass");

    private static void Add(ProcessStartInfo info, params string[] values)
    {
        foreach (var value in values) info.ArgumentList.Add(value);
    }

    private static string EnsureExactClaimedRoot(Guid jobId, string value)
    {
        var expected = Path.GetFullPath(Path.Combine(FieldOwnerPaths.ProcessingRoot, jobId.ToString("D")));
        var actual = Path.GetFullPath(value);
        if (!string.Equals(expected, actual, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Claimed job path is outside the fixed processing root.");
        return actual;
    }

    private static string EnsureChildFile(string root, string name)
    {
        var path = Path.GetFullPath(Path.Combine(root, name));
        EnsureChild(root, path);
        if (!File.Exists(path) || File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException($"Required job file is missing or a reparse point: {name}");
        return path;
    }

    private static string EnsureChildDirectory(string root, string name)
    {
        var path = Path.GetFullPath(Path.Combine(root, name));
        EnsureChild(root, path);
        if (!Directory.Exists(path) || File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException($"Required job directory is missing or a reparse point: {name}");
        foreach (var entry in Directory.EnumerateFileSystemEntries(path, "*", SearchOption.AllDirectories))
            if (File.GetAttributes(entry).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("Job input tree contains a reparse point.");
        return path;
    }

    private static void EnsureChild(string root, string target)
    {
        var prefix = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!target.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Job input escapes the claimed package root.");
    }

    private static void AssertPlanIdentity(string planPath, FieldOwnerJob job)
    {
        using var document = FieldOwnerPolicyStore.ParseStrictJson(File.ReadAllBytes(planPath), 100);
        var identity = document.RootElement.GetProperty("identity");
        if (!Guid.TryParse(identity.GetProperty("fieldId").GetString(), out var fieldId) || fieldId != job.FieldId || identity.GetProperty("fieldGeneration").GetInt32() != job.FieldGeneration)
            throw new InvalidOperationException("Provision plan identity does not match the exact job Field generation.");
        var subsystem = identity.GetProperty("subsystem").GetString();
        if (!string.Equals(subsystem, "field", StringComparison.Ordinal)) throw new InvalidOperationException("Provision plan is not a Field plan.");
        if (job.DevelopmentAccess != document.RootElement.TryGetProperty("developmentAccess", out _))
            throw new InvalidOperationException("Provision plan development-access state does not match the job.");
    }

    private static void AssertObservationIdentity(string runtimeConfigPath, string hostSecretPath, FieldOwnerJob job)
    {
        using var document = FieldOwnerPolicyStore.ParseStrictJson(File.ReadAllBytes(runtimeConfigPath), 30);
        var root = document.RootElement;
        if (root.GetProperty("contractVersion").GetInt32() != 1) throw new InvalidOperationException("Observation runtime contract version is invalid.");
        var field = root.GetProperty("field");
        if (!Guid.TryParse(field.GetProperty("fieldId").GetString(), out var fieldId) || fieldId != job.FieldId || field.GetProperty("fieldGeneration").GetInt32() != job.FieldGeneration)
            throw new InvalidOperationException("Observation runtime identity does not match the exact job Field generation.");
        if (!string.Equals(Path.GetFullPath(root.GetProperty("secretPath").GetString() ?? ""), Path.GetFullPath(hostSecretPath), StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Observation runtime secret path is outside the claimed job package.");
        var secretLength = new FileInfo(hostSecretPath).Length;
        if (secretLength is < 32 or > 4096) throw new InvalidOperationException("Observation host secret is missing or outside its byte bound.");
    }
}
