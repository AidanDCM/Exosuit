using System.Diagnostics;
using Exosuit.FieldOwner;

namespace Exosuit.Agent.Tests;

public sealed class FieldOwnerServiceTests
{
    private static readonly Guid PolicyId = Guid.Parse("95f508f4-76bb-4fc3-86ca-ad003d0f2bf5");
    private static readonly Guid FieldId = Guid.Parse("8f2671f4-a70f-4025-922a-5b8fb5a2534f");
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-08-02T16:00:00Z");

    [Fact]
    public void Service_requires_local_system()
    {
        FieldOwnerServiceHost.AssertSystemIdentity(FieldOwnerPaths.SystemSid);
        Assert.Throws<InvalidOperationException>(() => FieldOwnerServiceHost.AssertSystemIdentity("S-1-5-21-1"));
    }

    [Fact]
    public void Policy_is_bounded_and_rejects_unknown_authority()
    {
        var policy = Policy();
        FieldOwnerPolicyStore.Validate(policy);
        Assert.Throws<InvalidOperationException>(() => FieldOwnerPolicyStore.Validate(policy with { AllowedOperations = ["provision", "shell"] }));
        Assert.Throws<InvalidOperationException>(() => FieldOwnerPolicyStore.Validate(policy with { ExpiresAt = policy.CreatedAt.AddDays(181) }));
        Assert.Throws<InvalidOperationException>(() => FieldOwnerPolicyStore.Validate(policy with { OwnerSid = FieldOwnerPaths.SystemSid }));
        Assert.Throws<InvalidOperationException>(() => FieldOwnerPolicyStore.Validate(policy with { StorageRoot = @"C:\" }));
    }

    [Fact]
    public void Jobs_require_fresh_exact_generation_and_policy_binding()
    {
        var policy = Policy();
        var job = Job("provision") with { PlanSha256 = new string('a', 64), DevelopmentAccess = true };
        FieldOwnerPolicyStore.ValidateJob(policy, job, Now);
        Assert.Throws<InvalidOperationException>(() => FieldOwnerPolicyStore.ValidateJob(policy, job with { PolicyId = Guid.NewGuid() }, Now));
        Assert.Throws<InvalidOperationException>(() => FieldOwnerPolicyStore.ValidateJob(policy, job with { FieldGeneration = 0 }, Now));
        Assert.Throws<InvalidOperationException>(() => FieldOwnerPolicyStore.ValidateJob(policy, job with { CreatedAt = Now.AddMinutes(-20), ExpiresAt = Now.AddMinutes(-19) }, Now));
        Assert.Throws<InvalidOperationException>(() => FieldOwnerPolicyStore.ValidateJob(policy, job with { Operation = "rotate_key" }, Now));
        Assert.Throws<InvalidOperationException>(() => FieldOwnerPolicyStore.ValidateJob(policy, Job("destroy") with { PlanSha256 = new string('a', 64) }, Now));
        FieldOwnerPolicyStore.ValidateJob(policy, Job("observe") with { RuntimeConfigSha256 = new string('e', 64), HostSecretSha256 = new string('f', 64) }, Now);
        Assert.Throws<InvalidOperationException>(() => FieldOwnerPolicyStore.ValidateJob(policy, Job("observe") with { RuntimeConfigSha256 = new string('e', 64) }, Now));
    }

    [Fact]
    public void Command_factory_has_fixed_executable_and_no_shell_or_user_script_path()
    {
        var source = File.ReadAllText(Path.Combine(RepositoryRoot(), "apps", "field-owner-service", "FieldOwnerCommandFactory.cs"));
        Assert.Contains("FieldOwnerPaths.PowerShellPath", source, StringComparison.Ordinal);
        Assert.Contains("FieldOwnerPaths.ProvisionScriptPath", source, StringComparison.Ordinal);
        Assert.Contains("FieldOwnerPaths.DestroyScriptPath", source, StringComparison.Ordinal);
        Assert.Contains("UseShellExecute = false", source, StringComparison.Ordinal);
        Assert.DoesNotContain("Invoke-Expression", source, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("cmd.exe", source, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("job.Script", source, StringComparison.Ordinal);
        Assert.Contains("AssertExactPackageShape", source, StringComparison.Ordinal);
    }

    [Fact]
    public void Queue_processor_enforces_replay_capacity_cancellation_and_confined_cleanup()
    {
        var source = File.ReadAllText(Path.Combine(RepositoryRoot(), "apps", "field-owner-service", "FieldOwnerQueueProcessor.cs"));
        Assert.Contains("terminalResultPath", source, StringComparison.Ordinal);
        Assert.Contains("if (File.Exists(terminalResultPath))", source, StringComparison.Ordinal);
        Assert.Contains("policy.MaxActiveFields", source, StringComparison.Ordinal);
        Assert.Contains("process.Kill(entireProcessTree: true)", source, StringComparison.Ordinal);
        Assert.Contains("effect_uncertain", source, StringComparison.Ordinal);
        Assert.Contains("reconcile_before_retry", source, StringComparison.Ordinal);
        Assert.Contains("FieldOwnerPaths.ProcessingRoot", source, StringComparison.Ordinal);
        Assert.Contains("FileAttributes.ReparsePoint", source, StringComparison.Ordinal);
        Assert.Contains("FileShare.None", source, StringComparison.Ordinal);
        Assert.Contains("FileMode.CreateNew", source, StringComparison.Ordinal);
        Assert.Contains("SnapshotSubmission", source, StringComparison.Ordinal);
        Assert.Contains("if (read > remaining) exceeded = true", source, StringComparison.Ordinal);
        Assert.Contains("if (stdout.Exceeded || stderr.Exceeded)", source, StringComparison.Ordinal);
        Assert.DoesNotContain("Invoke-Expression", source, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Service_contract_exposes_no_policy_consent_key_recording_export_or_mcp_operation()
    {
        var source = File.ReadAllText(Path.Combine(RepositoryRoot(), "apps", "field-owner-service", "FieldOwnerContracts.cs"));
        foreach (var forbidden in new[] { "enter_teach", "enter_shadow", "enter_pilot", "rotate_channel_key", "delete_demonstrations", "export_sensitive_artifact", "full_control", "recordingConsent" })
            Assert.DoesNotContain($"\"{forbidden}\"", source, StringComparison.Ordinal);
    }

    [Fact]
    public void Strict_json_rejects_duplicate_properties()
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes("{\"contractVersion\":1,\"contractVersion\":1}");
        Assert.Throws<InvalidOperationException>(() => FieldOwnerPolicyStore.ParseStrictJson(bytes, 10));
    }

    private static FieldOwnerPolicy Policy() => new()
    {
        ContractVersion = 1,
        PolicyId = PolicyId,
        CreatedAt = Now.AddMinutes(-1),
        ExpiresAt = Now.AddDays(90),
        OwnerSid = "S-1-5-21-111-222-333-1001",
        StorageRoot = @"C:\ProgramData\Exosuit\Fields",
        HostConfigSha256 = new string('a', 64),
        ProvisionScriptSha256 = new string('b', 64),
        DestroyScriptSha256 = new string('c', 64),
        ObserveScriptSha256 = new string('d', 64),
        ObserverAgentSha256 = new string('e', 64),
        AllowedOperations = ["provision", "observe", "destroy"],
        AllowDevelopmentAccess = true,
        MaxActiveFields = 2,
        MaxJobAgeSeconds = 300,
    };

    private static FieldOwnerJob Job(string operation) => new()
    {
        ContractVersion = 1,
        JobId = Guid.NewGuid(),
        PolicyId = PolicyId,
        CreatedAt = Now.AddSeconds(-5),
        ExpiresAt = Now.AddMinutes(2),
        SourceHead = new string('d', 40),
        Operation = operation,
        FieldId = FieldId,
        FieldGeneration = 24,
        DevelopmentAccess = false,
    };

    private static string RepositoryRoot() => Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
}
