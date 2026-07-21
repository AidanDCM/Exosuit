namespace Exosuit.Agent.Tests;

public sealed class FieldFoundationTests
{
    private static FieldIdentity Identity() => new(
        ExosuitSubsystem.Field,
        new FieldReference(Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), 1),
        "field-agent-a",
        "vm-a",
        "session-a",
        new string('a', 64),
        new string('b', 64),
        "task-disk-a",
        DateTimeOffset.Parse("2026-07-21T18:00:00Z"));

    [Fact]
    public void Field_identity_and_display_contract_validate_strictly()
    {
        Identity().Validate();
        new FieldDisplayContract(1, 1920, 1080, 100, 100, "en-US", false).Validate();
        Assert.Throws<ArgumentException>(() => (Identity() with { Subsystem = ExosuitSubsystem.Glove }).Validate());
        Assert.Throws<ArgumentException>(() => (Identity() with { BaseImageDigest = "bad" }).Validate());
        Assert.Throws<ArgumentException>(() => new FieldDisplayContract(2, 1920, 1080, 100, 100, "en-US", false).Validate());
        Assert.Throws<ArgumentException>(() => new FieldDisplayContract(1, 1920, 1080, 100, 100, "en-US", true).Validate());
    }

    [Fact]
    public void Field_lifecycle_is_separate_from_the_bound_glove_agent()
    {
        var state = new FieldLifecycleState(Identity(), "glove-agent-a", DateTimeOffset.Parse("2026-07-21T18:00:00Z"));
        state.Transition(FieldLifecycle.Provisioning);
        state.Transition(FieldLifecycle.Ready);
        state.Transition(FieldLifecycle.Teaching);
        Assert.Equal(ExosuitSubsystem.Field, state.AssertModeReady(FieldOperatingMode.Teach, "glove-agent-a").Subsystem);
        Assert.Throws<InvalidOperationException>(() => state.AssertModeReady(FieldOperatingMode.Pilot, "glove-agent-a"));
        Assert.Throws<InvalidOperationException>(() => state.AssertModeReady(FieldOperatingMode.Teach, "another-glove"));
    }

    [Fact]
    public void Invalid_transitions_and_unexplained_faults_are_rejected()
    {
        var state = new FieldLifecycleState(Identity(), "glove-agent-a");
        Assert.Throws<InvalidOperationException>(() => state.Transition(FieldLifecycle.Piloting));
        state.Transition(FieldLifecycle.Provisioning);
        Assert.Throws<InvalidOperationException>(() => state.Transition(FieldLifecycle.Faulted));
        Assert.Contains("heartbeat", state.Transition(FieldLifecycle.Faulted, "Guest heartbeat expired.").FaultReason, StringComparison.OrdinalIgnoreCase);
        Assert.Throws<InvalidOperationException>(() => state.Transition(FieldLifecycle.Ready));
    }

    [Fact]
    public void Demonstration_payload_redaction_preserves_timing_and_removes_secret_values()
    {
        var redacted = DemonstrationPayloadRedactor.Redact(new Dictionary<string, object?>
        {
            ["keyDownAtUs"] = 100L,
            ["nested"] = new Dictionary<string, object?>
            {
                ["accessToken"] = "secret-value",
                ["ordinaryText"] = "hello"
            }
        });

        Assert.Equal(100L, redacted["keyDownAtUs"]);
        var nested = Assert.IsAssignableFrom<IReadOnlyDictionary<string, object?>>(redacted["nested"]);
        Assert.Equal("[REDACTED]", nested["accessToken"]);
        Assert.Equal("hello", nested["ordinaryText"]);
    }
}
