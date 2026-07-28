using Exosuit.Agent;

namespace Exosuit.Agent.Tests;

public sealed class MotorTests
{
    private static readonly WindowInfo Window = new(
        "win-raw", "Motor Test", "test-app", 7, true, false, new Bounds(100, 100, 800, 600));

    private static readonly UiElement Field = new(
        "field-raw", Window.Id, "Notes", "Edit", "notes", null,
        true, true, false, false, new Bounds(140, 180, 500, 200),
        ElementSource.Fake, new[] { ActionType.TypeText });

    [Fact]
    public void StartupDefaultsToSafeStateWhenPhysicalInputIsOff()
    {
        var decision = AgentStartupConfigurationResolver.ResolvePhysicalInput(
            "windows", ControlMode.Observe, false, null, null, Allowlist("test-app"));

        Assert.Equal(ControlMode.Observe, decision.InitialMode);
        Assert.False(decision.PhysicalInputEnabled);
        Assert.False(decision.LocalFullControlEnabled);
    }

    [Fact]
    public void StartupRequiresAllFullControlConditions()
    {
        Assert.Throws<InvalidOperationException>(() =>
            AgentStartupConfigurationResolver.ResolvePhysicalInput(
                "windows", ControlMode.Observe, true, null, "full_control", Allowlist("test-app")));
        Assert.Throws<InvalidOperationException>(() =>
            AgentStartupConfigurationResolver.ResolvePhysicalInput(
                "windows", ControlMode.Observe, true,
                AgentStartupConfigurationResolver.FullControlAcknowledgement,
                "observe", Allowlist("test-app")));
        Assert.Throws<InvalidOperationException>(() =>
            AgentStartupConfigurationResolver.ResolvePhysicalInput(
                "windows", ControlMode.Observe, true,
                AgentStartupConfigurationResolver.FullControlAcknowledgement,
                "full_control", Allowlist()));
        Assert.Throws<InvalidOperationException>(() =>
            AgentStartupConfigurationResolver.ResolvePhysicalInput(
                "fake", ControlMode.Sandbox, true,
                AgentStartupConfigurationResolver.FullControlAcknowledgement,
                "full_control", Allowlist("test-app")));
    }

    [Fact]
    public void StartupEnablesPhysicalInputOnlyForExactLocalContract()
    {
        var decision = AgentStartupConfigurationResolver.ResolvePhysicalInput(
            "windows",
            ControlMode.Observe,
            true,
            AgentStartupConfigurationResolver.FullControlAcknowledgement,
            "full_control",
            Allowlist("test-app"));

        Assert.Equal(ControlMode.FullControl, decision.InitialMode);
        Assert.True(decision.PhysicalInputEnabled);
        Assert.True(decision.LocalFullControlEnabled);
    }

    [Fact]
    public void RawPointerInsideFreshActiveAllowlistedWindowRequiresTypedReview()
    {
        var decision = EvaluateRaw(ActionType.ClickPointer, coordinates: new Point(300, 300));
        Assert.Equal(PermissionStatus.ReviewRequired, decision.Status);
        Assert.Equal(RiskLevel.Critical, decision.RiskLevel);
        Assert.Equal(ApprovalType.TypedConfirmation, decision.ApprovalType);
        Assert.Equal("raw-input-confirmation", decision.PolicyRule);
    }

    [Fact]
    public void RawPointerOutsideFreshWindowIsBlocked()
    {
        var decision = EvaluateRaw(ActionType.ClickPointer, coordinates: new Point(1, 1));
        Assert.Equal(PermissionStatus.Block, decision.Status);
        Assert.Equal("raw-pointer-outside-window", decision.PolicyRule);
    }

    [Fact]
    public void RawInputRejectsWrongProcessAndMissingTextTarget()
    {
        var state = FullControlState("other-app");
        var action = RawAction(ActionType.Hotkey, keys: new[] { "CTRL", "S" });
        var processDecision = new SafetyPolicy().Evaluate(action, state, "windows-ui-automation+windows-sendinput", Window, Window, null);
        Assert.Equal("raw-process-scope-deny", processDecision.PolicyRule);

        var textDecision = new SafetyPolicy().Evaluate(
            RawAction(ActionType.TypeText, text: "hello", targetElementId: "missing"),
            FullControlState("test-app"),
            "windows-ui-automation+windows-sendinput",
            Window,
            Window,
            null);
        Assert.Equal("raw-text-target-required", textDecision.PolicyRule);
    }

    [Fact]
    public async Task SimulatedMotorRecordsBoundedMovementClickTypingAndHotkey()
    {
        var motor = new SimulatedMotorDriver();
        var profile = new MotorProfile(DurationMilliseconds: 20_000, Steps: 9_999, Bend: 9, InterKeyDelayMilliseconds: 0);

        Assert.True((await motor.MovePointerAsync(new Point(20, 30), profile, CancellationToken.None)).Succeeded);
        Assert.True((await motor.ClickAsync(new Point(40, 50), profile, CancellationToken.None)).Succeeded);
        Assert.True((await motor.TypeTextAsync("Hi", profile, CancellationToken.None)).Succeeded);
        Assert.True((await motor.HotkeyAsync(new[] { "ctrl", "s" }, profile, CancellationToken.None)).Succeeded);

        Assert.Contains("move:20,30:240", motor.Events);
        Assert.Contains("click:left", motor.Events);
        Assert.Contains("type:72", motor.Events);
        Assert.Contains("type:105", motor.Events);
        Assert.Contains("hotkey:CTRL+S", motor.Events);
    }

    [Fact]
    public async Task SimulatedMotorCanBeCancelled()
    {
        var motor = new SimulatedMotorDriver();
        var operation = motor.MovePointerAsync(
            new Point(100, 100),
            new MotorProfile(DurationMilliseconds: 3_000),
            CancellationToken.None);
        await motor.CancelAsync(CancellationToken.None);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => operation);
        Assert.Contains("cancel", motor.Events);
    }

    [Fact]
    public void VirtualKeyMapAllowsDocumentedKeysAndRejectsUnknownKeys()
    {
        Assert.Equal(new[] { "CTRL", "S", "F12" }, VirtualKeyMap.NormalizeAndValidate(new[] { "ctrl", "s", "f12" }));
        Assert.Throws<ArgumentException>(() => VirtualKeyMap.NormalizeAndValidate(new[] { "CTRL", "UNSUPPORTED_KEY" }));
    }

    [Fact]
    public async Task MotorizedProviderRoutesRawInputAndPreservesSemanticProvider()
    {
        var motor = new SimulatedMotorDriver();
        var provider = new MotorizedDesktopProvider(new FakeDesktopProvider(), motor);

        var raw = await provider.ExecuteAsync(
            RawAction(ActionType.ClickPointer, coordinates: new Point(300, 300)), CancellationToken.None);
        Assert.True(raw.Succeeded);
        Assert.Equal("simulated-motor", raw.Evidence["motorDriver"]);
        Assert.Equal("click_pointer", raw.Evidence["actionType"]);

        var semantic = await provider.ExecuteAsync(new DesktopAction(
            "semantic-1",
            ActionType.SetElementValue,
            ActionRoute.OsAccessibility,
            "win-notepad",
            "el-editor",
            "delegated",
            null,
            null,
            null,
            "Verify semantic delegation.",
            new VerificationExpectation("element_value", "el-editor", "delegated"),
            "test"), CancellationToken.None);
        Assert.True(semantic.Succeeded);
    }

    private static PermissionDecision EvaluateRaw(
        ActionType actionType,
        Point? coordinates = null,
        string? text = null,
        IReadOnlyList<string>? keys = null) =>
        new SafetyPolicy().Evaluate(
            RawAction(actionType, coordinates, text, keys, actionType == ActionType.TypeText ? Field.Id : null),
            FullControlState("test-app"),
            "windows-ui-automation+windows-sendinput",
            Window,
            Window,
            actionType == ActionType.TypeText ? Field : null);

    private static DesktopAction RawAction(
        ActionType actionType,
        Point? coordinates = null,
        string? text = null,
        IReadOnlyList<string>? keys = null,
        string? targetElementId = null) =>
        new(
            $"raw-{Guid.NewGuid():N}",
            actionType,
            ActionRoute.VisualMouseKeyboard,
            Window.Id,
            targetElementId,
            text,
            keys,
            null,
            coordinates,
            "Validate locally gated physical input.",
            new VerificationExpectation("window_active", windowId: Window.Id),
            "test");

    private static AgentRuntimeState FullControlState(params string[] allowlistedProcesses) =>
        new(
            ControlMode.FullControl,
            physicalInputEnabled: true,
            screenshotCaptureEnabled: false,
            localFullControlEnabled: true,
            Allowlist(allowlistedProcesses),
            enforceStartupEnvironment: false);

    private static IReadOnlySet<string> Allowlist(params string[] values) =>
        new HashSet<string>(values, StringComparer.OrdinalIgnoreCase);
}
