using Exosuit.Agent;

namespace Exosuit.Agent.Tests;

public sealed class FocusedTextInputTests
{
    [Fact]
    public void PhysicalTextInputRequiresFreshFocusedField()
    {
        var window = new WindowInfo(
            "win-text", "Text Test", "test-app", 88, true, false, new Bounds(0, 0, 800, 600));
        var unfocused = new UiElement(
            "field-unfocused", window.Id, "Notes", "Edit", "notes", null,
            true, false, false, false, new Bounds(20, 20, 400, 200),
            ElementSource.Fake, new[] { ActionType.TypeText });
        var action = new DesktopAction(
            "type-unfocused",
            ActionType.TypeText,
            ActionRoute.VisualMouseKeyboard,
            window.Id,
            unfocused.Id,
            "must not type",
            null,
            null,
            null,
            "Prove that physical text cannot land in an unfocused field.",
            new VerificationExpectation("element_value", unfocused.Id, "must not type"),
            "test");
        var state = new AgentRuntimeState(
            ControlMode.FullControl,
            physicalInputEnabled: true,
            screenshotCaptureEnabled: false,
            localFullControlEnabled: true,
            new HashSet<string>(new[] { "test-app" }, StringComparer.OrdinalIgnoreCase),
            enforceStartupEnvironment: false);

        var decision = new SafetyPolicy().Evaluate(
            action,
            state,
            "windows-ui-automation+windows-sendinput",
            window,
            window,
            unfocused);

        Assert.Equal(PermissionStatus.Block, decision.Status);
        Assert.Equal("raw-text-target-required", decision.PolicyRule);
    }
}
