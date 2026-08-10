using System.Text.Json;

namespace Exosuit.Agent.Tests;

public sealed class FieldSceneSessionConfigurationTests : IDisposable
{
    private readonly string path = Path.Combine(Path.GetTempPath(), $"exosuit-scene-{Guid.NewGuid():N}.json");

    public void Dispose()
    {
        if (File.Exists(path)) File.Delete(path);
    }

    private static object Valid(object? overrides = null) => new
    {
        contractVersion = 1,
        enabled = true,
        expectedSessionId = 2,
        interactiveUserSid = "S-1-5-21-1000-1000-1000-1001",
        producerExecutablePath = @"C:\Exosuit\Agent\Exosuit.Agent.exe",
        producerExecutableSha256 = new string('a', 64),
        display = new
        {
            monitorCount = 1,
            width = 1920,
            height = 1080,
            scalePercent = 100,
            browserZoomPercent = 100,
            keyboardLayout = "en-US",
            dynamicResolutionAllowed = false,
        },
        pollIntervalMilliseconds = 1000,
    };

    private void Write(object configuration) =>
        File.WriteAllText(path, JsonSerializer.Serialize(configuration, new JsonSerializerOptions(JsonSerializerDefaults.Web)));

    [Fact]
    public void AnAbsentFileMeansSceneProductionIsOff()
    {
        // The guest runtime that produced CHN-001 evidence must be unchanged when unconfigured.
        Assert.Null(FieldSceneSessionConfiguration.ReadOptional(path));
    }

    [Fact]
    public void ReadsAValidEnabledConfiguration()
    {
        Write(Valid());
        var configuration = FieldSceneSessionConfiguration.ReadOptional(path);

        Assert.NotNull(configuration);
        Assert.Equal(2, configuration!.ExpectedSessionId);
        Assert.Equal(2, configuration.ToLaunchPolicy().ExpectedSessionId);
    }

    [Fact]
    public void AnExplicitlyDisabledConfigurationMeansOff()
    {
        Write(new
        {
            contractVersion = 1,
            enabled = false,
            expectedSessionId = 2,
            interactiveUserSid = "S-1-5-21-1000-1000-1000-1001",
            producerExecutablePath = @"C:\Exosuit\Agent\Exosuit.Agent.exe",
            producerExecutableSha256 = new string('a', 64),
            display = new
            {
                monitorCount = 1, width = 1920, height = 1080, scalePercent = 100,
                browserZoomPercent = 100, keyboardLayout = "en-US", dynamicResolutionAllowed = false,
            },
            pollIntervalMilliseconds = 1000,
        });

        Assert.Null(FieldSceneSessionConfiguration.ReadOptional(path));
    }

    [Fact]
    public void AMalformedConfigurationIsAnErrorRatherThanASilentDisable()
    {
        File.WriteAllText(path, "{ not json");
        // A guest that was meant to produce scenes and quietly does not is worse than one that
        // refuses to start.
        Assert.ThrowsAny<Exception>(() => FieldSceneSessionConfiguration.ReadOptional(path));
    }

    [Fact]
    public void RejectsSessionZero()
    {
        Write(new
        {
            contractVersion = 1, enabled = true, expectedSessionId = 0,
            interactiveUserSid = "S-1-5-21-1000-1000-1000-1001",
            producerExecutablePath = @"C:\Exosuit\Agent\Exosuit.Agent.exe",
            producerExecutableSha256 = new string('a', 64),
            display = new
            {
                monitorCount = 1, width = 1920, height = 1080, scalePercent = 100,
                browserZoomPercent = 100, keyboardLayout = "en-US", dynamicResolutionAllowed = false,
            },
            pollIntervalMilliseconds = 1000,
        });

        Assert.Throws<InvalidOperationException>(() => FieldSceneSessionConfiguration.ReadOptional(path));
    }

    [Theory]
    [InlineData("S-1-5-18")]
    [InlineData("S-1-1-0")]
    public void RejectsANonInteractiveSid(string sid)
    {
        Write(new
        {
            contractVersion = 1, enabled = true, expectedSessionId = 2, interactiveUserSid = sid,
            producerExecutablePath = @"C:\Exosuit\Agent\Exosuit.Agent.exe",
            producerExecutableSha256 = new string('a', 64),
            display = new
            {
                monitorCount = 1, width = 1920, height = 1080, scalePercent = 100,
                browserZoomPercent = 100, keyboardLayout = "en-US", dynamicResolutionAllowed = false,
            },
            pollIntervalMilliseconds = 1000,
        });

        Assert.Throws<InvalidOperationException>(() => FieldSceneSessionConfiguration.ReadOptional(path));
    }

    [Theory]
    [InlineData(100)]
    [InlineData(60_000)]
    public void RejectsAPollCadenceOutsideTheBound(int interval)
    {
        Write(new
        {
            contractVersion = 1, enabled = true, expectedSessionId = 2,
            interactiveUserSid = "S-1-5-21-1000-1000-1000-1001",
            producerExecutablePath = @"C:\Exosuit\Agent\Exosuit.Agent.exe",
            producerExecutableSha256 = new string('a', 64),
            display = new
            {
                monitorCount = 1, width = 1920, height = 1080, scalePercent = 100,
                browserZoomPercent = 100, keyboardLayout = "en-US", dynamicResolutionAllowed = false,
            },
            pollIntervalMilliseconds = interval,
        });

        Assert.Throws<InvalidOperationException>(() => FieldSceneSessionConfiguration.ReadOptional(path));
    }

    [Fact]
    public void RejectsAnUnknownProperty()
    {
        Write(new
        {
            contractVersion = 1, enabled = true, expectedSessionId = 2,
            interactiveUserSid = "S-1-5-21-1000-1000-1000-1001",
            producerExecutablePath = @"C:\Exosuit\Agent\Exosuit.Agent.exe",
            producerExecutableSha256 = new string('a', 64),
            display = new
            {
                monitorCount = 1, width = 1920, height = 1080, scalePercent = 100,
                browserZoomPercent = 100, keyboardLayout = "en-US", dynamicResolutionAllowed = false,
            },
            pollIntervalMilliseconds = 1000,
            unexpected = "value",
        });

        Assert.ThrowsAny<Exception>(() => FieldSceneSessionConfiguration.ReadOptional(path));
    }
}

public sealed class FieldSceneSessionRunnerTests
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
        public List<int> Terminated { get; } = [];

        public Guid CurrentBootId() => BootIdValue;
        public bool IsProducerAlive(int processId) => ProducerAlive;
        public FieldDesktopState ObserveDesktop(int sessionId) => Desktop;
        public void TerminateProducer(int processId) => Terminated.Add(processId);
    }

    private sealed class FakePorts : IFieldSceneSessionPorts
    {
        public int Launches { get; private set; }
        public int Accepts { get; private set; }
        public int Publishes { get; private set; }
        public Exception? LaunchThrows { get; set; }
        public Exception? AcceptThrows { get; set; }
        public Exception? PublishThrows { get; set; }
        public FieldReference SceneField { get; set; } = Field;

        public FieldSceneProducerLaunchResult LaunchProducer(FieldSceneProducerLaunchPolicy policy)
        {
            Launches++;
            if (LaunchThrows is not null) throw LaunchThrows;
            return new FieldSceneProducerLaunchResult(ProducerPid, SessionId, ApprovedSid);
        }

        public Task<FieldChannelEnvelope> AcceptAndSignSceneAsync(Guid bootId, CancellationToken cancellationToken)
        {
            Accepts++;
            if (AcceptThrows is not null) throw AcceptThrows;
            return Task.FromResult(Scene(SceneField));
        }

        public void PublishScene(FieldChannelEnvelope envelope)
        {
            Publishes++;
            if (PublishThrows is not null) throw PublishThrows;
        }
    }

    private static FieldChannelEnvelope Scene(FieldReference field) =>
        new(1, Guid.NewGuid(), field, FieldChannelDirection.GuestToHost, 1,
            FieldChannelMessageType.SceneObservation, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddMinutes(1),
            "nonce", "key-1", new string('b', 64),
            new Dictionary<string, object?> { ["contractVersion"] = 1 }, "signature");

    private static FieldSceneSessionConfiguration Configuration() =>
        new(1, true, SessionId, ApprovedSid, @"C:\Exosuit\Agent\Exosuit.Agent.exe", new string('a', 64),
            new FieldDisplayContract(1, 1920, 1080, 100, 100, "en-US", false), 250);

    private static (FieldSceneSessionRunner Runner, FieldSceneSupervisor Supervisor, FakeEnvironment Environment, FakePorts Ports) Build()
    {
        var environment = new FakeEnvironment();
        var ports = new FakePorts();
        var lifecycle = new FieldSceneLifecycle(Field, BootId, Configuration().ToLaunchPolicy());
        var supervisor = new FieldSceneSupervisor(lifecycle, environment);
        return (new FieldSceneSessionRunner(Configuration(), supervisor, ports), supervisor, environment, ports);
    }

    [Fact]
    public async Task AFullCycleLaunchesAcceptsPublishesAndBecomesActionable()
    {
        var (runner, supervisor, _, ports) = Build();
        await runner.RunCycleAsync(CancellationToken.None);

        Assert.Equal(1, ports.Launches);
        Assert.Equal(1, ports.Accepts);
        Assert.Equal(1, ports.Publishes);
        Assert.True(supervisor.IsActionable);
    }

    [Fact]
    public async Task DoesNotRelaunchAProducerThatIsAlreadyRunning()
    {
        var (runner, _, _, ports) = Build();
        await runner.RunCycleAsync(CancellationToken.None);
        await runner.RunCycleAsync(CancellationToken.None);

        Assert.Equal(1, ports.Launches);
        Assert.Equal(2, ports.Accepts);
    }

    [Fact]
    public async Task RelaunchesAfterTheProducerDies()
    {
        var (runner, _, environment, ports) = Build();
        await runner.RunCycleAsync(CancellationToken.None);

        environment.ProducerAlive = false;
        await runner.RunCycleAsync(CancellationToken.None);   // detects death, invalidates
        environment.ProducerAlive = true;
        await runner.RunCycleAsync(CancellationToken.None);   // relaunches

        Assert.Equal(2, ports.Launches);
    }

    [Fact]
    public async Task ALaunchFailureInvalidatesRatherThanThrowing()
    {
        var (runner, supervisor, _, ports) = Build();
        ports.LaunchThrows = new InvalidOperationException("digest mismatch");

        await runner.RunCycleAsync(CancellationToken.None);

        Assert.False(supervisor.IsActionable);
        Assert.Contains("could not be launched", supervisor.State.InvalidationReason!, StringComparison.Ordinal);
        Assert.Equal(0, ports.Accepts);
    }

    [Fact]
    public async Task AnAcceptFailureInvalidatesAndDoesNotPublish()
    {
        var (runner, supervisor, _, ports) = Build();
        ports.AcceptThrows = new InvalidOperationException("frame exceeded bound");

        await runner.RunCycleAsync(CancellationToken.None);

        Assert.False(supervisor.IsActionable);
        Assert.Equal(0, ports.Publishes);
    }

    [Fact]
    public async Task APublishFailureInvalidatesAndIsNeverRetriedInPlace()
    {
        var (runner, supervisor, _, ports) = Build();
        ports.PublishThrows = new InvalidOperationException("registry unavailable");

        await runner.RunCycleAsync(CancellationToken.None);

        // The scene may or may not have reached the value; republishing blindly is exactly the
        // forbidden retry of a possibly successful effect.
        Assert.Equal(1, ports.Publishes);
        Assert.False(supervisor.IsActionable);
    }

    [Fact]
    public async Task ASceneFromAStaleGenerationIsRejectedWithoutKillingTheLoop()
    {
        var (runner, supervisor, _, ports) = Build();
        ports.SceneField = Field with { FieldGeneration = 4 };

        await runner.RunCycleAsync(CancellationToken.None);

        Assert.False(supervisor.IsActionable);
        Assert.Contains("scene rejected", supervisor.State.InvalidationReason!, StringComparison.Ordinal);

        // The loop survives; a later good scene still works.
        ports.SceneField = Field;
        await runner.RunCycleAsync(CancellationToken.None);
        Assert.True(supervisor.IsActionable);
    }

    [Fact]
    public async Task ASceneAcceptedWhileLockedIsNotActionable()
    {
        var (runner, supervisor, environment, _) = Build();
        environment.Desktop = new FieldDesktopState(SessionLocked: true, SecureDesktopActive: false);

        await runner.RunCycleAsync(CancellationToken.None);

        Assert.False(supervisor.IsActionable);
    }

    [Fact]
    public async Task SupervisionRunsBeforeAnyNewSceneIsAccepted()
    {
        var (runner, supervisor, environment, ports) = Build();
        await runner.RunCycleAsync(CancellationToken.None);
        Assert.True(supervisor.IsActionable);

        // A reboot between cycles must invalidate before a new scene is taken, and must end the
        // session rather than relaunching into a lifecycle bound to a dead boot.
        environment.BootIdValue = Guid.NewGuid();
        await runner.RunCycleAsync(CancellationToken.None);

        Assert.False(supervisor.IsActionable);
        Assert.True(supervisor.IsBootStale);
        Assert.True(supervisor.IsStopped);
        Assert.Equal(1, ports.Launches);
        Assert.Equal(1, ports.Accepts);
    }

    [Fact]
    public async Task ACycleOnAStoppedSupervisorDoesNothing()
    {
        var (runner, supervisor, _, ports) = Build();
        supervisor.Stop("generation destroyed");

        await runner.RunCycleAsync(CancellationToken.None);

        Assert.Equal(0, ports.Launches);
        Assert.Equal(0, ports.Accepts);
    }

    [Fact]
    public async Task RunAsyncStopsAndTearsDownOnCancellation()
    {
        var (runner, supervisor, environment, _) = Build();
        using var cancellation = new CancellationTokenSource();
        var run = runner.RunAsync(cancellation.Token);
        await Task.Delay(50);
        await cancellation.CancelAsync();
        await run;

        Assert.True(supervisor.IsStopped);
        Assert.Contains(ProducerPid, environment.Terminated);
    }

    [Fact]
    public void RequiresConfigurationSupervisorAndPorts()
    {
        var environment = new FakeEnvironment();
        var lifecycle = new FieldSceneLifecycle(Field, BootId, Configuration().ToLaunchPolicy());
        var supervisor = new FieldSceneSupervisor(lifecycle, environment);
        Assert.Throws<ArgumentNullException>(() => new FieldSceneSessionRunner(null!, supervisor, new FakePorts()));
        Assert.Throws<ArgumentNullException>(() => new FieldSceneSessionRunner(Configuration(), null!, new FakePorts()));
        Assert.Throws<ArgumentNullException>(() => new FieldSceneSessionRunner(Configuration(), supervisor, null!));
    }
}
