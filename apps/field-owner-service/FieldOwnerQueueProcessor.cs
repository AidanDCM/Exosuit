using System.Diagnostics;
using System.Text;

namespace Exosuit.FieldOwner;

internal sealed class FieldOwnerQueueProcessor
{
    private readonly string policyPath;

    internal FieldOwnerQueueProcessor(string policyPath) => this.policyPath = policyPath;

    internal async Task ProcessAvailableAsync(CancellationToken cancellationToken)
    {
        var policy = FieldOwnerPolicyStore.Load(policyPath);
        FieldOwnerPolicyStore.ValidateInstalledFiles(policy);
        Directory.CreateDirectory(FieldOwnerPaths.PendingRoot);
        Directory.CreateDirectory(FieldOwnerPaths.ProcessingRoot);
        Directory.CreateDirectory(FieldOwnerPaths.ResultsRoot);
        foreach (var pending in Directory.EnumerateDirectories(FieldOwnerPaths.PendingRoot).Order(StringComparer.Ordinal))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var name = Path.GetFileName(pending);
            if (!Guid.TryParseExact(name, "D", out var packageId)) continue;
            var readyPath = Path.Combine(pending, ".ready");
            if (!File.Exists(readyPath) || File.GetAttributes(readyPath).HasFlag(FileAttributes.ReparsePoint)) continue;
            var submissionClaim = Path.Combine(FieldOwnerPaths.PendingRoot, $".claimed-{name}");
            var claimed = Path.Combine(FieldOwnerPaths.ProcessingRoot, name);
            try
            {
                Directory.Move(pending, submissionClaim);
            }
            catch (IOException)
            {
                continue;
            }
            Directory.CreateDirectory(claimed);
            try { SnapshotSubmission(packageId, submissionClaim, claimed); }
            catch (Exception exception) when (exception is InvalidOperationException or IOException or UnauthorizedAccessException or System.Text.Json.JsonException) { }
            await ProcessClaimedAsync(policy, packageId, claimed, cancellationToken).ConfigureAwait(false);
            TryDeleteSubmissionClaim(submissionClaim);
        }
    }

    private static void SnapshotSubmission(Guid packageId, string submissionClaim, string protectedClaim)
    {
        var jobSource = Path.Combine(submissionClaim, "job.json");
        var jobDestination = Path.Combine(protectedClaim, "job.json");
        CopyRegularFileExclusive(jobSource, jobDestination, 32 * 1024);
        FieldOwnerJob? job = null;
        try { job = FieldOwnerPolicyStore.LoadJob(jobDestination); }
        catch (Exception exception) when (exception is InvalidOperationException or IOException or UnauthorizedAccessException or System.Text.Json.JsonException) { }
        if (job is null || job.JobId != packageId) return;
        AssertSubmissionShape(submissionClaim, job.Operation);
        if (job.Operation == "provision")
        {
            CopyRegularFileExclusive(Path.Combine(submissionClaim, "plan.json"), Path.Combine(protectedClaim, "plan.json"), 256 * 1024);
            CopyRegularTreeExclusive(Path.Combine(submissionClaim, "guest-seed"), Path.Combine(protectedClaim, "guest-seed"), 16, 4 * 1024 * 1024);
        }
        else if (job.Operation == "observe")
        {
            CopyRegularFileExclusive(Path.Combine(submissionClaim, "runtime-config.json"), Path.Combine(protectedClaim, "runtime-config.json"), 64 * 1024);
            CopyRegularFileExclusive(Path.Combine(submissionClaim, "host-secret.txt"), Path.Combine(protectedClaim, "host-secret.txt"), 4 * 1024);
        }
    }

    private static void AssertSubmissionShape(string root, string operation)
    {
        var expected = operation switch
        {
            "provision" => new[] { ".ready", "guest-seed", "job.json", "plan.json" },
            "observe" => new[] { ".ready", "host-secret.txt", "job.json", "runtime-config.json" },
            "destroy" => new[] { ".ready", "job.json" },
            _ => throw new InvalidOperationException("Submitted job operation is unsupported."),
        };
        var actual = Directory.EnumerateFileSystemEntries(root).Select(Path.GetFileName).Order(StringComparer.Ordinal).ToArray();
        if (!expected.Order(StringComparer.Ordinal).SequenceEqual(actual, StringComparer.Ordinal)) throw new InvalidOperationException("Submitted job package contains missing or unexpected entries.");
    }

    private static void CopyRegularTreeExclusive(string source, string destination, int maximumFiles, long maximumBytes)
    {
        if (!Directory.Exists(source) || File.GetAttributes(source).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("Submitted job tree is missing or a reparse point.");
        var directories = Directory.EnumerateDirectories(source, "*", SearchOption.AllDirectories).ToArray();
        var files = Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories).ToArray();
        if (directories.Length != 0 || files.Length is < 1 || files.Length > maximumFiles) throw new InvalidOperationException("Submitted job tree shape exceeds its bound.");
        if (files.Any(path => File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint))) throw new InvalidOperationException("Submitted job tree contains a reparse point.");
        Directory.CreateDirectory(destination);
        long total = 0;
        foreach (var sourceFile in files.Order(StringComparer.Ordinal))
        {
            var name = Path.GetFileName(sourceFile);
            if (name.Length == 0 || name is "." or "..") throw new InvalidOperationException("Submitted job filename is invalid.");
            var destinationFile = Path.Combine(destination, name);
            total += CopyRegularFileExclusive(sourceFile, destinationFile, maximumBytes - total);
            if (total > maximumBytes) throw new InvalidOperationException("Submitted job tree exceeds its byte bound.");
        }
    }

    private static long CopyRegularFileExclusive(string source, string destination, long maximumBytes)
    {
        if (maximumBytes <= 0 || !File.Exists(source) || File.GetAttributes(source).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("Submitted job file is missing or invalid.");
        using var input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.None, 4096, FileOptions.SequentialScan);
        if (input.Length is <= 0 || input.Length > maximumBytes) throw new InvalidOperationException("Submitted job file is empty or oversized.");
        using var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough);
        input.CopyTo(output);
        output.Flush(flushToDisk: true);
        return input.Length;
    }

    private static async Task ProcessClaimedAsync(FieldOwnerPolicy policy, Guid packageId, string claimed, CancellationToken cancellationToken)
    {
        var terminalResultPath = Path.Combine(FieldOwnerPaths.ResultsRoot, $"{packageId:D}.json");
        if (File.Exists(terminalResultPath))
        {
            TryDeleteClaimedPackage(packageId, claimed);
            return;
        }
        var startedAt = DateTimeOffset.UtcNow;
        FieldOwnerJob? job = null;
        var status = "denied";
        var exitCode = -1;
        string? failureCode = "validation_failed";
        var effectStarted = false;
        try
        {
            var jobPath = Path.Combine(claimed, "job.json");
            if (!File.Exists(jobPath) || File.GetAttributes(jobPath).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("Claimed package lacks a regular job.json file.");
            job = FieldOwnerPolicyStore.LoadJob(jobPath);
            if (job.JobId != packageId) throw new InvalidOperationException("Job ID does not match its package directory.");
            FieldOwnerPolicyStore.ValidateJob(policy, job, DateTimeOffset.UtcNow);
            if (job.Operation == "provision" && CountGenerationRoots(policy.StorageRoot) >= policy.MaxActiveFields)
                throw new InvalidOperationException("Owner policy active-Field bound has been reached.");
            var startInfo = FieldOwnerCommandFactory.Create(policy, job, claimed);
            using var process = Process.Start(startInfo) ?? throw new InvalidOperationException("Field owner service could not start the fixed lifecycle command.");
            effectStarted = true;
            var stdoutTask = CaptureBoundedAsync(process.StandardOutput, 1_000_000, cancellationToken);
            var stderrTask = CaptureBoundedAsync(process.StandardError, 200_000, cancellationToken);
            try
            {
                await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                if (!process.HasExited) process.Kill(entireProcessTree: true);
                throw;
            }
            var stdout = await stdoutTask.ConfigureAwait(false);
            var stderr = await stderrTask.ConfigureAwait(false);
            exitCode = process.ExitCode;
            WriteLog(job.JobId, "stdout", stdout.Output);
            WriteLog(job.JobId, "stderr", stderr.Output);
            if (stdout.Exceeded || stderr.Exceeded)
                throw new InvalidOperationException("Field lifecycle output exceeded its bound.");
            status = exitCode == 0 ? "succeeded" : "failed";
            failureCode = exitCode == 0 ? null : "lifecycle_command_failed";
        }
        catch (OperationCanceledException)
        {
            status = effectStarted ? "effect_uncertain" : "cancelled";
            failureCode = effectStarted ? "reconcile_before_retry" : "service_stopping";
        }
        catch (Exception exception) when (exception is InvalidOperationException or IOException or UnauthorizedAccessException or System.Text.Json.JsonException)
        {
            status = effectStarted ? "effect_uncertain" : "denied";
            failureCode = effectStarted ? "reconcile_before_retry" : exception is UnauthorizedAccessException ? "access_denied" : "validation_failed";
        }
        finally
        {
            var result = new FieldOwnerJobResult
            {
                ContractVersion = 1,
                JobId = job?.JobId ?? packageId,
                PolicyId = job?.PolicyId ?? policy.PolicyId,
                Operation = job?.Operation ?? "unknown",
                FieldId = job?.FieldId ?? Guid.Empty,
                FieldGeneration = job?.FieldGeneration ?? 0,
                Status = status,
                StartedAt = startedAt,
                CompletedAt = DateTimeOffset.UtcNow,
                ExitCode = exitCode,
                SourceHead = job?.SourceHead ?? new string('0', 40),
                FailureCode = failureCode,
            };
            FieldOwnerPolicyStore.WriteResult(terminalResultPath, result);
            TryDeleteClaimedPackage(packageId, claimed);
        }
    }

    private static async Task<(string Output, bool Exceeded)> CaptureBoundedAsync(StreamReader reader, int maximumCharacters, CancellationToken cancellationToken)
    {
        var buffer = new char[4096];
        var output = new StringBuilder();
        var exceeded = false;
        while (true)
        {
            var read = await reader.ReadAsync(buffer.AsMemory(), cancellationToken).ConfigureAwait(false);
            if (read == 0) break;
            var remaining = maximumCharacters - output.Length;
            if (remaining > 0) output.Append(buffer, 0, Math.Min(read, remaining));
            if (read > remaining) exceeded = true;
        }
        return (output.ToString(), exceeded);
    }

    private static int CountGenerationRoots(string storageRoot)
    {
        if (!Directory.Exists(storageRoot)) return 0;
        var count = 0;
        foreach (var fieldRoot in Directory.EnumerateDirectories(storageRoot))
        {
            if (File.GetAttributes(fieldRoot).HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("Field storage contains a reparse-point field root.");
            count += Directory.EnumerateDirectories(fieldRoot, "generation-*", SearchOption.TopDirectoryOnly).Count();
        }
        return count;
    }

    private static void TryDeleteClaimedPackage(Guid jobId, string claimed)
    {
        var expected = Path.GetFullPath(Path.Combine(FieldOwnerPaths.ProcessingRoot, jobId.ToString("D")));
        if (!string.Equals(expected, Path.GetFullPath(claimed), StringComparison.OrdinalIgnoreCase) || !Directory.Exists(claimed)) return;
        if (File.GetAttributes(claimed).HasFlag(FileAttributes.ReparsePoint)) return;
        foreach (var entry in Directory.EnumerateFileSystemEntries(claimed, "*", SearchOption.AllDirectories))
            if (File.GetAttributes(entry).HasFlag(FileAttributes.ReparsePoint)) return;
        Directory.Delete(claimed, recursive: true);
    }

    private static void TryDeleteSubmissionClaim(string claimed)
    {
        var prefix = Path.GetFullPath(FieldOwnerPaths.PendingRoot).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var full = Path.GetFullPath(claimed);
        if (!full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) || !Path.GetFileName(full).StartsWith(".claimed-", StringComparison.Ordinal) || !Directory.Exists(full)) return;
        if (File.GetAttributes(full).HasFlag(FileAttributes.ReparsePoint)) return;
        foreach (var entry in Directory.EnumerateFileSystemEntries(full, "*", SearchOption.AllDirectories))
            if (File.GetAttributes(entry).HasFlag(FileAttributes.ReparsePoint)) return;
        try { Directory.Delete(full, recursive: true); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    private static void WriteLog(Guid jobId, string stream, string content)
    {
        Directory.CreateDirectory(FieldOwnerPaths.EvidenceRoot);
        File.WriteAllText(Path.Combine(FieldOwnerPaths.EvidenceRoot, $"{jobId:D}.{stream}.log"), content);
    }
}
