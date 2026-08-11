namespace Exosuit.Agent.Tests;

public sealed class FieldSceneSupervisorTests
{
    private static readonly FieldReference Field = new(Guid.Parse("4401b702-334f-475e-b867-b7d06798443d"), 3);
    private static readonly Guid BootId = Guid.Parse("29a19dbc-5021-4dc3-8979-0026660fad17");
    private const string ApprovedSid = "S-1-5-21-1000-1000-1000-1001";
    private const int SessionId = 2;
    private const int ProducerPid = 4242;

    private sealed class FakeEnvironment : IFieldSceneEnvironment
    {
        public Guid BootIdValue { get; set; } = BootId;
        public bool ProducerAlive { get; set; } = true;
        public FieldDesktopState Desktop { get; set; } = new(false, false);
        public Exception? BootThrows { get; set; }
        public Exception? LivenessThrows { get; set; }
        public Exception? DesktopThrows { get; set; }
        public List<int> Terminated { get; } = [];

        public Guid CurrentBootId() => BootThrows is null ? BootIdValue : throw BootThrows;

        public bool IsProducerAlive(int processId) =>
            LivenessThrows is null ? ProducerAlive : throw LivenessThrows;

        public FieldDesktopState ObserveDesktop(int sessionId) =>
            DesktopThrows is null ? Desktop : throw DesktopThrows;

        public void TerminateProducer(int processId) => Terminated.Add(processId);
    }

    private static FieldSceneProducerLaunchPolicy LaunchPolicy() =>
        new(SessionId, ApprovedSid, @"C:\Exosuit\Agent\Exosuit.Agent.exe", new string('a', 64),
            @"C:\Exosuit\Config\scene-producer.json");

    private static FieldChannelEnvelope Scene() =>
        new(1, Guid.NewGuid(), Field, FieldChannelDirection.GuestToHost, 1,
            FieldChannelMessageType.SceneObservation, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddMinutes(1),
            "nonce", "key-1", new string('b', 64),
            new Dictionary<string, object?> { ["contractVersion"] = 1 }, "signature");

    private static (FieldSceneSupervisor Supervisor, FieldSceneLifecycle Lifecycle, FakeEnvironment Environment) Ready()
    {
        var environment = new FakeEnvironment();
        var lifecycle = new FieldSceneLifecycle(Field, BootId, LaunchPolicy());
        var supervisor = new FieldSceneSupervisor(lifecycle, environment);
        supervisor.RecordLaunch(new FieldSceneProducerLaunchResult(ProducerPid, SessionId, ApprovedSid));
        lifecycle.OnScenePublished(Scene(), BootId, SessionId, desktopActionable: true);
        Assert.True(supervisor.IsActionable);
        return (supervisor, lifecycle, environment);
    }

    [Fact]
    public void AQuietTickLeavesAHealthySceneActionable()
    {
        var (supervisor, _, _) = Ready();
        supervisor.Poll();
        Assert.True(supervisor.IsActionable);
    }

    [Fact]
    public void DetectsProducerDeathAndInvalidates()
    {
        var (supervisor, _, environment) = Ready();
        environment.ProducerAlive = false;

        supervisor.Poll();

        Assert.False(supervisor.IsActionable);
        Assert.Contains("exited", supervisor.State.InvalidationReason!, StringComparison.Ordinal);
    }

    [Fact]
    public void DetectsLockAndInvalidatesWhileTheProducerKeepsRunning()
    {
        var (supervisor, _, environment) = Ready();
        environment.Desktop = new FieldDesktopState(SessionLocked: true, SecureDesktopActive: false);

        supervisor.Poll();

        Assert.False(supervisor.IsActionable);
        Assert.True(supervisor.State.ProducerRunning);
    }

    [Fact]
    public void DetectsSecureDesktopAndInvalidates()
    {
        var (supervisor, _, environment) = Ready();
        environment.Desktop = new FieldDesktopState(SessionLocked: false, SecureDesktopActive: true);

        supervisor.Poll();

        Assert.Contains("Secure Desktop", supervisor.State.InvalidationReason!, StringComparison.Ordinal);
    }

    [Fact]
    public void DetectsBootChangeAndInvalidates()
    {
        var (supervisor, _, environment) = Ready();
        environment.BootIdValue = Guid.NewGuid();

        supervisor.Poll();

        Assert.False(supervisor.IsActionable);
        Assert.Contains("boot identity changed", supervisor.State.InvalidationReason!, StringComparison.Ordinal);
    }

    [Fact]
    public void ReportsARebootAsARebootRatherThanAsALock()
    {
        var (supervisor, _, environment) = Ready();
        // A reboot and a lock are visible in the same tick; the most fundamental one must win.
        environment.BootIdValue = Guid.NewGuid();
        environment.ProducerAlive = false;
        environment.Desktop = new FieldDesktopState(SessionLocked: true, SecureDesktopActive: true);

        supervisor.Poll();

        Assert.Contains("boot identity changed", supervisor.State.InvalidationReason!, StringComparison.Ordinal);
    }

    [Fact]
    public void ReportsADeadProducerRatherThanAHealthyLookingDesktop()
    {
        var (supervisor, _, environment) = Ready();
        environment.ProducerAlive = false;
        environment.Desktop = new FieldDesktopState(SessionLocked: false, SecureDesktopActive: false);

        supervisor.Poll();

        Assert.Contains("exited", supervisor.State.InvalidationReason!, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("boot")]
    [InlineData("liveness")]
    [InlineData("desktop")]
    public void AFailedProbeIsTreatedAsFailureToObserveRatherThanAsHealth(string probe)
    {
        var (supervisor, _, environment) = Ready();
        var failure = new InvalidOperationException("probe unavailable");
        switch (probe)
        {
            case "boot": environment.BootThrows = failure; break;
            case "liveness": environment.LivenessThrows = failure; break;
            default: environment.DesktopThrows = failure; break;
        }

        supervisor.Poll();

        Assert.False(supervisor.IsActionable);
        Assert.Contains("could not be observed", supervisor.State.InvalidationReason!, StringComparison.Ordinal);
    }

    [Fact]
    public void HostIntakeRestartRequiresAFreshScene()
    {
        var (supervisor, lifecycle, _) = Ready();
        supervisor.NotifyHostIntakeRestarted();

        Assert.False(supervisor.IsActionable);

        lifecycle.OnScenePublished(Scene(), BootId, SessionId, desktopActionable: true);
        Assert.True(supervisor.IsActionable);
    }

    [Fact]
    public void StopTerminatesTheExactProducer()
    {
        var (supervisor, _, environment) = Ready();
        var teardown = supervisor.Stop("generation destroyed");

        Assert.Equal(ProducerPid, teardown.ProducerProcessId);
        Assert.Equal(new[] { ProducerPid }, environment.Terminated);
        Assert.True(supervisor.IsStopped);
        Assert.False(supervisor.IsActionable);
    }

    [Fact]
    public void StopStillTerminatesAProducerTheLifecycleHasForgotten()
    {
        var (supervisor, _, environment) = Ready();
        // A boot change makes the lifecycle drop its producer reference, but the process may
        // still be running. Teardown must not leave it orphaned.
        environment.BootIdValue = Guid.NewGuid();
        supervisor.Poll();
        Assert.Null(supervisor.State.ProducerProcessId);

        var teardown = supervisor.Stop("generation destroyed");

        Assert.Equal(ProducerPid, teardown.ProducerProcessId);
        Assert.Equal(new[] { ProducerPid }, environment.Terminated);
    }

    [Fact]
    public void StopTerminatesAProducerWhoseLaunchWasRejected()
    {
        var environment = new FakeEnvironment();
        var lifecycle = new FieldSceneLifecycle(Field, BootId, LaunchPolicy());
        var supervisor = new FieldSceneSupervisor(lifecycle, environment);

        // The launch landed in the wrong session and is refused, but a process exists.
        Assert.Throws<InvalidOperationException>(() =>
            supervisor.RecordLaunch(new FieldSceneProducerLaunchResult(ProducerPid, 3, ApprovedSid)));
        Assert.Equal(ProducerPid, supervisor.SupervisedProducerProcessId);

        supervisor.Stop("rejected launch");
        Assert.Equal(new[] { ProducerPid }, environment.Terminated);
    }

    [Fact]
    public void StopWithNoProducerTerminatesNothing()
    {
        var environment = new FakeEnvironment();
        var lifecycle = new FieldSceneLifecycle(Field, BootId, LaunchPolicy());
        var supervisor = new FieldSceneSupervisor(lifecycle, environment);

        var teardown = supervisor.Stop("never started");

        Assert.Null(teardown.ProducerProcessId);
        Assert.Empty(environment.Terminated);
    }

    [Fact]
    public void AStoppedSupervisorCannotBeReused()
    {
        var (supervisor, _, _) = Ready();
        supervisor.Stop("generation destroyed");

        Assert.Throws<InvalidOperationException>(() => supervisor.Poll());
        Assert.Throws<InvalidOperationException>(() => supervisor.NotifyHostIntakeRestarted());
        Assert.Throws<InvalidOperationException>(() => supervisor.Stop("again"));
    }

    [Fact]
    public void RequiresALifecycleAndAnEnvironment()
    {
        var environment = new FakeEnvironment();
        var lifecycle = new FieldSceneLifecycle(Field, BootId, LaunchPolicy());
        Assert.Throws<ArgumentNullException>(() => new FieldSceneSupervisor(null!, environment));
        Assert.Throws<ArgumentNullException>(() => new FieldSceneSupervisor(lifecycle, null!));
    }
}
