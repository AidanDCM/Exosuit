namespace Exosuit.Agent.Tests;

public sealed class FieldSceneLifecycleTests
{
    private static readonly FieldReference Field = new(Guid.Parse("4401b702-334f-475e-b867-b7d06798443d"), 3);
    private static readonly Guid BootId = Guid.Parse("29a19dbc-5021-4dc3-8979-0026660fad17");
    private const string ApprovedSid = "S-1-5-21-1000-1000-1000-1001";
    private const int SessionId = 2;
    private const int ProducerPid = 4242;

    private static FieldSceneProducerLaunchPolicy LaunchPolicy() =>
        new(SessionId, ApprovedSid, @"C:\Exosuit\Agent\Exosuit.Agent.exe", new string('a', 64));

    private static FieldSceneLifecycle Lifecycle() => new(Field, BootId, LaunchPolicy());

    private static FieldSceneProducerLaunchResult Launch(int sessionId = SessionId, string sid = ApprovedSid) =>
        new(ProducerPid, sessionId, sid);

    private static FieldChannelEnvelope Scene(
        FieldReference? field = null,
        FieldChannelMessageType messageType = FieldChannelMessageType.SceneObservation) =>
        new(
            ContractVersion: 1,
            MessageId: Guid.NewGuid(),
            Field: field ?? Field,
            Direction: FieldChannelDirection.GuestToHost,
            Sequence: 1,
            MessageType: messageType,
            SentAt: DateTimeOffset.UtcNow,
            ExpiresAt: DateTimeOffset.UtcNow.AddMinutes(1),
            Nonce: "nonce",
            KeyId: "key-1",
            PayloadHash: new string('b', 64),
            Payload: new Dictionary<string, object?> { ["contractVersion"] = 1 },
            Signature: "signature");

    /// <summary>Drives the lifecycle to a genuinely actionable scene.</summary>
    private static FieldSceneLifecycle Ready()
    {
        var lifecycle = Lifecycle();
        lifecycle.OnProducerLaunched(Launch());
        lifecycle.OnScenePublished(Scene(), BootId, SessionId, desktopActionable: true);
        Assert.True(lifecycle.IsActionable);
        return lifecycle;
    }

    // ---- startup ----

    [Fact]
    public void StartsNotReadyAndIsNotActionable()
    {
        var lifecycle = Lifecycle();
        Assert.Equal(FieldSceneReadiness.NotReady, lifecycle.State.Readiness);
        Assert.False(lifecycle.IsActionable);
        Assert.Null(lifecycle.State.SceneSha256);
    }

    [Fact]
    public void ALaunchAloneIsNeverReadiness()
    {
        var lifecycle = Lifecycle();
        lifecycle.OnProducerLaunched(Launch());

        // The producer is running, but nothing has been observed yet.
        Assert.True(lifecycle.State.ProducerRunning);
        Assert.False(lifecycle.IsActionable);
    }

    [Fact]
    public void ReachesReadyOnlyAfterAVerifiedSceneOnAnActionableDesktop()
    {
        var lifecycle = Ready();
        Assert.Equal(FieldSceneReadiness.Ready, lifecycle.State.Readiness);
        Assert.NotNull(lifecycle.State.SceneSha256);
    }

    [Fact]
    public void RefusesASceneWhenNoProducerIsRunning()
    {
        var lifecycle = Lifecycle();
        Assert.Throws<InvalidOperationException>(() =>
            lifecycle.OnScenePublished(Scene(), BootId, SessionId, desktopActionable: true));
    }

    // ---- wrong session / user: no launch is accepted ----

    [Fact]
    public void RejectsAProducerLaunchedIntoTheWrongSession()
    {
        var lifecycle = Lifecycle();
        Assert.Throws<InvalidOperationException>(() => lifecycle.OnProducerLaunched(Launch(sessionId: 3)));
        Assert.False(lifecycle.IsActionable);
    }

    [Fact]
    public void RejectsAProducerLaunchedIntoSessionZero()
    {
        var lifecycle = Lifecycle();
        Assert.Throws<InvalidOperationException>(() => lifecycle.OnProducerLaunched(Launch(sessionId: 0)));
    }

    [Fact]
    public void RejectsAProducerRunningAsADifferentUser()
    {
        var lifecycle = Lifecycle();
        Assert.Throws<InvalidOperationException>(() =>
            lifecycle.OnProducerLaunched(Launch(sid: "S-1-5-21-1000-1000-1000-9999")));
    }

    // ---- producer dies ----

    [Fact]
    public void ProducerDeathInvalidatesReadiness()
    {
        var lifecycle = Ready();
        lifecycle.OnProducerExited(exitCode: -1);

        Assert.Equal(FieldSceneReadiness.Invalidated, lifecycle.State.Readiness);
        Assert.False(lifecycle.IsActionable);
        Assert.False(lifecycle.State.ProducerRunning);
        Assert.Null(lifecycle.State.SceneSha256);
        Assert.Contains("exited", lifecycle.State.InvalidationReason!, StringComparison.Ordinal);
    }

    [Fact]
    public void ACleanProducerExitInvalidatesJustAsFirmlyAsACrash()
    {
        var lifecycle = Ready();
        lifecycle.OnProducerExited(exitCode: 0);
        Assert.False(lifecycle.IsActionable);
    }

    [Fact]
    public void ADeadProducerCannotPublishAFurtherScene()
    {
        var lifecycle = Ready();
        lifecycle.OnProducerExited(0);
        Assert.Throws<InvalidOperationException>(() =>
            lifecycle.OnScenePublished(Scene(), BootId, SessionId, desktopActionable: true));
    }

    // ---- stale generation / boot / session bindings ----

    [Fact]
    public void RejectsASceneFromADifferentFieldGeneration()
    {
        var lifecycle = Lifecycle();
        lifecycle.OnProducerLaunched(Launch());
        Assert.Throws<InvalidOperationException>(() =>
            lifecycle.OnScenePublished(Scene(field: Field with { FieldGeneration = 4 }), BootId, SessionId, true));
        Assert.False(lifecycle.IsActionable);
    }

    [Fact]
    public void RejectsASceneFromADifferentBoot()
    {
        var lifecycle = Lifecycle();
        lifecycle.OnProducerLaunched(Launch());
        Assert.Throws<InvalidOperationException>(() =>
            lifecycle.OnScenePublished(Scene(), Guid.NewGuid(), SessionId, true));
    }

    [Fact]
    public void RejectsASceneFromADifferentSession()
    {
        var lifecycle = Lifecycle();
        lifecycle.OnProducerLaunched(Launch());
        Assert.Throws<InvalidOperationException>(() =>
            lifecycle.OnScenePublished(Scene(), BootId, sceneSessionId: 3, desktopActionable: true));
    }

    [Fact]
    public void RejectsANonSceneEnvelope()
    {
        var lifecycle = Lifecycle();
        lifecycle.OnProducerLaunched(Launch());
        Assert.Throws<InvalidOperationException>(() =>
            lifecycle.OnScenePublished(Scene(messageType: FieldChannelMessageType.Heartbeat), BootId, SessionId, true));
    }

    // ---- KVP value missing or corrupt ----

    [Fact]
    public void AnUnreadableSceneValueInvalidatesAndDoesNotReuseTheLastScene()
    {
        var lifecycle = Ready();
        var previous = lifecycle.State.SceneSha256;

        lifecycle.OnSceneValueUnreadable("digest mismatch across chunks");

        Assert.False(lifecycle.IsActionable);
        Assert.Null(lifecycle.State.SceneSha256);
        Assert.NotNull(previous);
        Assert.Contains("digest mismatch", lifecycle.State.InvalidationReason!, StringComparison.Ordinal);
    }

    [Fact]
    public void AMissingSceneValueDoesNotFallBackToAnOlderScene()
    {
        var lifecycle = Ready();
        lifecycle.OnSceneValueUnreadable("value absent");
        Assert.Equal(FieldSceneReadiness.Invalidated, lifecycle.State.Readiness);
    }

    // ---- host intake restart ----

    [Fact]
    public void HostIntakeRestartRequiresAFreshSceneRatherThanCachedState()
    {
        var lifecycle = Ready();
        lifecycle.OnHostIntakeRestarted();

        Assert.False(lifecycle.IsActionable);
        Assert.Null(lifecycle.State.SceneSha256);

        // Only a new scene restores readiness.
        lifecycle.OnScenePublished(Scene(), BootId, SessionId, desktopActionable: true);
        Assert.True(lifecycle.IsActionable);
    }

    // ---- guest reboot / boot-ID change ----

    [Fact]
    public void BootIdChangeInvalidatesThePreviousSceneAndTheProducer()
    {
        var lifecycle = Ready();
        lifecycle.OnBootIdChanged(Guid.NewGuid());

        Assert.False(lifecycle.IsActionable);
        Assert.False(lifecycle.State.ProducerRunning);
        Assert.Contains("boot identity changed", lifecycle.State.InvalidationReason!, StringComparison.Ordinal);
    }

    [Fact]
    public void AnUnchangedBootIdIsNotAnInvalidation()
    {
        var lifecycle = Ready();
        lifecycle.OnBootIdChanged(BootId);
        Assert.True(lifecycle.IsActionable);
        Assert.False(lifecycle.IsBootStale);
    }

    [Fact]
    public void ABootChangeIsTerminalAndTheLifecycleCannotBeRelaunchedInto()
    {
        var lifecycle = Ready();
        lifecycle.OnBootIdChanged(Guid.NewGuid());

        Assert.True(lifecycle.IsBootStale);

        // Relaunching into this lifecycle would re-establish readiness against a boot that no
        // longer exists. A new lifecycle must be constructed for the new boot.
        Assert.Throws<InvalidOperationException>(() => lifecycle.OnProducerLaunched(Launch()));
        Assert.Throws<InvalidOperationException>(() =>
            lifecycle.OnScenePublished(Scene(), BootId, SessionId, desktopActionable: true));
    }

    // ---- lock / Secure Desktop ----

    [Fact]
    public void LockClearsActionableReadinessWhileTheProducerKeepsRunning()
    {
        var lifecycle = Ready();
        lifecycle.OnDesktopStateChanged(sessionLocked: true, secureDesktopActive: false);

        Assert.False(lifecycle.IsActionable);
        Assert.True(lifecycle.State.ProducerRunning);
        Assert.Contains("locked", lifecycle.State.InvalidationReason!, StringComparison.Ordinal);
    }

    [Fact]
    public void SecureDesktopClearsActionableReadinessWhileTheProducerKeepsRunning()
    {
        var lifecycle = Ready();
        lifecycle.OnDesktopStateChanged(sessionLocked: false, secureDesktopActive: true);

        Assert.False(lifecycle.IsActionable);
        Assert.True(lifecycle.State.ProducerRunning);
        Assert.Contains("Secure Desktop", lifecycle.State.InvalidationReason!, StringComparison.Ordinal);
    }

    [Fact]
    public void UnlockingAloneDoesNotRestoreReadiness()
    {
        var lifecycle = Ready();
        lifecycle.OnDesktopStateChanged(sessionLocked: true, secureDesktopActive: false);
        lifecycle.OnDesktopStateChanged(sessionLocked: false, secureDesktopActive: false);

        // The desktop may have changed while nothing was observing it.
        Assert.False(lifecycle.IsActionable);

        lifecycle.OnScenePublished(Scene(), BootId, SessionId, desktopActionable: true);
        Assert.True(lifecycle.IsActionable);
    }

    [Fact]
    public void ASceneObservedOnANonActionableDesktopIsNeverRetained()
    {
        var lifecycle = Lifecycle();
        lifecycle.OnProducerLaunched(Launch());
        lifecycle.OnScenePublished(Scene(), BootId, SessionId, desktopActionable: false);

        Assert.False(lifecycle.IsActionable);
        Assert.Null(lifecycle.State.SceneSha256);
    }

    // ---- teardown ----

    [Fact]
    public void TeardownReportsTheExactProducerAndFieldLifecycleToStop()
    {
        var lifecycle = Ready();
        var teardown = lifecycle.Teardown("generation destroyed");

        Assert.Equal(ProducerPid, teardown.ProducerProcessId);
        Assert.Equal(Field, teardown.Field);
        Assert.Equal(BootId, teardown.BootId);
        Assert.Equal(SessionId, teardown.SessionId);
        Assert.False(lifecycle.IsActionable);
        Assert.True(lifecycle.IsTornDown);
    }

    [Fact]
    public void ATornDownLifecycleCannotBeReused()
    {
        var lifecycle = Ready();
        lifecycle.Teardown("generation destroyed");

        Assert.Throws<InvalidOperationException>(() =>
            lifecycle.OnScenePublished(Scene(), BootId, SessionId, true));
        Assert.Throws<InvalidOperationException>(() => lifecycle.OnProducerLaunched(Launch()));
        Assert.Throws<InvalidOperationException>(() => lifecycle.Teardown("again"));
    }

    [Fact]
    public void TeardownAfterProducerDeathReportsNoOrphanToStop()
    {
        var lifecycle = Ready();
        lifecycle.OnProducerExited(0);
        var teardown = lifecycle.Teardown("generation destroyed");

        Assert.Null(teardown.ProducerProcessId);
    }

    // ---- construction guards ----

    [Fact]
    public void RequiresAnExactBootIdentity()
    {
        Assert.Throws<InvalidOperationException>(() => new FieldSceneLifecycle(Field, Guid.Empty, LaunchPolicy()));
    }

    [Fact]
    public void RequiresAValidFieldGeneration()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new FieldSceneLifecycle(new FieldReference(Field.FieldId, 0), BootId, LaunchPolicy()));
    }
}
