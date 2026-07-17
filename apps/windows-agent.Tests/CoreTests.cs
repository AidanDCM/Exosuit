using System.Text.Json;
using System.Text.Json.Serialization;
using Exosuit.Agent;

namespace Exosuit.Agent.Tests;

public sealed class CoreTests
{
    private static readonly WindowInfo Window = new(
        "win-1", "Test", "test-app", 1, true, false, new Bounds(0, 0, 800, 600));

    private static readonly UiElement Element = new(
        "el-1", "win-1", "Name field", "Edit", "name", null,
        true, true, false, false, new Bounds(10, 10, 200, 30),
        ElementSource.Fake, new[] { ActionType.SetElementValue });

    [Fact]
    public void PolicyAllowsSemanticSandboxAction()
    {
        var policy = new SafetyPolicy();
        var state = State(ControlMode.Sandbox);
        var result = policy.Evaluate(Action(), state, "fake-sandbox", Window, Window, Element);
        Assert.Equal(PermissionStatus.Allow, result.Status);
        Assert.Equal("sandbox-semantic-action", result.PolicyRule);
    }

    [Fact]
    public void PolicyBlocksMutationInObserveMode()
    {
        var result = new SafetyPolicy().Evaluate(Action(), State(ControlMode.Observe), "fake-sandbox", Window, Window, Element);
        Assert.Equal(PermissionStatus.Block, result.Status);
        Assert.Equal("mode-read-only", result.PolicyRule);
    }

    [Fact]
    public void PolicyBlocksSensitiveTarget()
    {
        var sensitive = Element with { Name = "Password", IsSensitive = true };
        var result = new SafetyPolicy().Evaluate(Action(), State(ControlMode.Sandbox), "fake-sandbox", Window, Window, sensitive);
        Assert.Equal(PermissionStatus.Block, result.Status);
        Assert.Equal(RiskLevel.Critical, result.RiskLevel);
        Assert.Equal("credential-hard-deny", result.PolicyRule);
    }

    [Fact]
    public void PolicyBlocksWrongWindow()
    {
        var other = Window with { Id = "win-other" };
        var result = new SafetyPolicy().Evaluate(Action(), State(ControlMode.Sandbox), "fake-sandbox", other, Window, Element);
        Assert.Equal(PermissionStatus.Block, result.Status);
        Assert.Equal("wrong-window-deny", result.PolicyRule);
    }

    [Fact]
    public void PolicyBlocksRawInputWithoutLocalFullControl()
    {
        var raw = Action() with
        {
            ActionType = ActionType.ClickPointer,
            TargetElementId = null,
            Coordinates = new Point(10, 10)
        };
        var result = new SafetyPolicy().Evaluate(raw, State(ControlMode.Sandbox), "fake-sandbox", Window, Window, null);
        Assert.Equal(PermissionStatus.Block, result.Status);
        Assert.Equal("raw-input-local-only", result.PolicyRule);
    }

    [Fact]
    public async Task FakeProviderExecutesAndVerifiesValue()
    {
        var provider = new FakeDesktopProvider();
        var execution = await provider.ExecuteAsync(Action() with
        {
            TargetWindowId = "win-notepad",
            TargetElementId = "el-editor",
            Text = "Exosuit validation successful",
            Expected = new VerificationExpectation("element_value", "el-editor", "Exosuit validation successful")
        }, CancellationToken.None);
        var verification = await provider.VerifyAsync(
            new VerificationExpectation("element_value", "el-editor", "Exosuit validation successful"),
            execution,
            CancellationToken.None);
        Assert.True(execution.Succeeded);
        Assert.True(verification.Passed);
    }

    [Fact]
    public void MotorTrajectoryStartsAndEndsExactlyAndRemainsFinite()
    {
        var start = new Point(10, 20);
        var end = new Point(400, 300);
        var points = MotorTrajectory.CubicBezier(start, end, 60);
        Assert.Equal(start, points[0]);
        Assert.Equal(end, points[^1]);
        Assert.All(points, point =>
        {
            Assert.True(double.IsFinite(point.X));
            Assert.True(double.IsFinite(point.Y));
        });
    }

    [Fact]
    public async Task AuditLedgerRedactsAndDetectsTampering()
    {
        var path = Path.Combine(Path.GetTempPath(), $"exosuit-audit-{Guid.NewGuid():N}.jsonl");
        try
        {
            var options = JsonOptions();
            var ledger = new HashChainAuditLedger(path, options);
            await ledger.AppendAsync("test", "unit-test", new Dictionary<string, object?>
            {
                ["token"] = "super-secret-token",
                ["note"] = "Authorization: Bearer abcdefghijklmnop"
            });
            await ledger.AppendAsync("second", "unit-test", new Dictionary<string, object?> { ["ok"] = true });
            Assert.True(ledger.Verify().Valid);
            Assert.Equal("[REDACTED]", ledger.Tail(2)[0].Payload["token"]);

            var changed = ledger.Tail(2).Select(entry => entry with
            {
                Payload = new Dictionary<string, object?> { ["tampered"] = true }
            }).ToArray();
            Assert.False(ledger.Verify(changed).Valid);
        }
        finally
        {
            if (File.Exists(path)) File.Delete(path);
        }
    }

    [Fact]
    public void ApprovalFingerprintIsStableAndBindsImmutableContent()
    {
        var pending = Proposal();
        var approved = pending with { Status = ProposalStatus.Approved };
        Assert.Equal(ProposalFingerprint.Compute(pending), ProposalFingerprint.Compute(approved));

        var changedAction = approved with { Action = approved.Action with { Text = "different" } };
        Assert.NotEqual(ProposalFingerprint.Compute(approved), ProposalFingerprint.Compute(changedAction));
    }

    [Fact]
    public void ApprovalRegistryRejectsModifiedProposal()
    {
        var registry = new ProposalApprovalRegistry();
        var approved = Proposal() with { Status = ProposalStatus.Approved };
        registry.Approve(approved);
        Assert.True(registry.IsValid(approved));
        Assert.False(registry.IsValid(approved with { Action = approved.Action with { TargetElementId = "other" } }));
        Assert.True(registry.Remove(approved.ProposalId));
        Assert.False(registry.IsValid(approved));
    }

    [Fact]
    public async Task ProviderDeadlineStopsHungOperation()
    {
        var exception = await Assert.ThrowsAsync<ProviderDeadlineExceededException>(() =>
            ProviderDeadline.RunAsync(async token =>
            {
                await Task.Delay(TimeSpan.FromSeconds(5), token);
                return true;
            }, TimeSpan.FromMilliseconds(50), CancellationToken.None));
        Assert.Equal(50, exception.Timeout.TotalMilliseconds);
    }

    [Fact]
    public async Task ProviderDeadlinePreservesCallerCancellation()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var exception = await Record.ExceptionAsync(() =>
            ProviderDeadline.RunAsync(async token =>
            {
                await Task.Delay(TimeSpan.FromSeconds(5), token);
                return true;
            }, TimeSpan.FromSeconds(1), cancellation.Token));
        Assert.IsAssignableFrom<OperationCanceledException>(exception);
        Assert.IsNotType<ProviderDeadlineExceededException>(exception);
    }

    [Fact]
    public void ProviderDeadlineConfigurationIsBounded()
    {
        Assert.Equal(1_000, ProviderDeadline.ReadMilliseconds("10", 15_000, 1_000, 120_000).TotalMilliseconds);
        Assert.Equal(120_000, ProviderDeadline.ReadMilliseconds("999999", 15_000, 1_000, 120_000).TotalMilliseconds);
        Assert.Equal(15_000, ProviderDeadline.ReadMilliseconds("invalid", 15_000, 1_000, 120_000).TotalMilliseconds);
    }

    [Fact]
    public void WireEnumsUseSnakeCase()
    {
        var json = JsonSerializer.Serialize(new
        {
            mode = ControlMode.SkillAutopilot,
            status = PermissionStatus.ReviewRequired,
            route = ActionRoute.OsAccessibility
        }, JsonOptions());
        Assert.Contains("skill_autopilot", json);
        Assert.Contains("review_required", json);
        Assert.Contains("os_accessibility", json);
    }

    [Fact]
    public async Task SharedWireFixtureDeserializesAcrossDotNetContracts()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "wire-contract-v1.json");
        var fixture = JsonSerializer.Deserialize<WireContractFixture>(
            await File.ReadAllTextAsync(path),
            JsonOptions());

        Assert.NotNull(fixture);
        Assert.Equal(ControlMode.Sandbox, fixture.Status.Mode);
        Assert.Equal("fake-sandbox", fixture.Status.Provider);
        var element = Assert.Single(fixture.Observation.Elements);
        Assert.Equal(ElementSource.Fake, element.Source);
        Assert.Contains(ActionType.SetElementValue, element.SupportedActions);
        Assert.Equal(ActionType.SetElementValue, fixture.Proposal.Action.ActionType);
        Assert.Equal(ActionRoute.OsAccessibility, fixture.Proposal.Action.Route);
        Assert.Equal(PermissionStatus.Allow, fixture.Proposal.Decision.Status);
        Assert.Equal(ResultStatus.Succeeded, fixture.Result.Status);
        Assert.Equal(VerificationStatus.Passed, fixture.Result.VerificationStatus);
        Assert.Equal(64, fixture.AuditEvent.Hash.Length);
    }

    private static AgentRuntimeState State(ControlMode mode) => new(
        mode,
        physicalInputEnabled: false,
        screenshotCaptureEnabled: false,
        localFullControlEnabled: false,
        new HashSet<string>(new[] { "test-app" }, StringComparer.OrdinalIgnoreCase));

    private static DesktopAction Action() => new(
        "action-1",
        ActionType.SetElementValue,
        ActionRoute.OsAccessibility,
        Window.Id,
        Element.Id,
        "hello",
        null,
        null,
        null,
        "Test the field.",
        new VerificationExpectation("element_value", Element.Id, "hello"),
        "test");

    private static ActionProposal Proposal()
    {
        var now = new DateTimeOffset(2026, 7, 17, 20, 0, 0, TimeSpan.Zero);
        return new ActionProposal(
            "proposal-1",
            now,
            now.AddMinutes(5),
            Action(),
            new PermissionDecision(
                PermissionStatus.ReviewRequired,
                RiskLevel.High,
                ApprovalType.LocalClick,
                "Local review required.",
                "test-review"),
            Window.Id,
            ProposalStatus.PendingReview);
    }

    private static JsonSerializerOptions JsonOptions()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DictionaryKeyPolicy = JsonNamingPolicy.CamelCase
        };
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
        return options;
    }

    private sealed record WireContractFixture(
        AgentStatus Status,
        DesktopObservation Observation,
        ActionProposal Proposal,
        ActionResult Result,
        AuditEvent AuditEvent);
}
