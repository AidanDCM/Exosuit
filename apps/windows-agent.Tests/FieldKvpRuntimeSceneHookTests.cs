using System.Text.Json;

namespace Exosuit.Agent.Tests;

/// <summary>
/// Covers the guest runtime's own scene decision — the property that an unconfigured guest
/// starts nothing. Previously this could only be argued from reading the code path, which is
/// exactly the kind of claim this project has learned not to accept.
/// </summary>
public sealed class FieldKvpRuntimeSceneHookTests : IDisposable
{
    private static readonly FieldReference Field = new(Guid.Parse("4401b702-334f-475e-b867-b7d06798443d"), 3);
    private static readonly Guid BootId = Guid.Parse("29a19dbc-5021-4dc3-8979-0026660fad17");
    private const string ApprovedSid = "S-1-5-21-1000-1000-1000-1001";
    private const int SessionId = 2;
    private const int ProducerPid = 4242;

    private readonly string path = Path.Combine(Path.GetTempPath(), $"exosuit-scene-hook-{Guid.NewGuid():N}.json");

    public void Dispose()
    {
        if (File.Exists(path)) File.Delete(path);
    }

    private sealed class FakeEnvironment : IFieldSceneEnvironment
    {
        public List<int> Terminated { get; } = [];
        public Guid CurrentBootId() => BootId;
        public bool IsProducerAlive(int processId) => true;
        public FieldDesktopState ObserveDesktop(int sessionId) => new(false, false);
        public void TerminateProducer(int processId) => Terminated.Add(processId);
    }

    private sealed class RecordingPorts : IFieldSceneSessionPorts
    {
        private readonly TaskCompletionSource firstPublish =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public int Launches { get; private set; }
        public int Accepts { get; private set; }
        public int Publishes { get; private set; }

        public void ArmSceneIntake(Guid bootId) { }
        public void DisarmSceneIntake() { }

        /// <summary>Completes once a cycle has really produced a scene, so tests wait on
        /// progress rather than on the clock.</summary>
        public Task FirstPublish => firstPublish.Task;

        public FieldSceneProducerLaunchResult LaunchProducer(FieldSceneProducerLaunchPolicy policy)
        {
            Launches++;
            return new FieldSceneProducerLaunchResult(ProducerPid, SessionId, ApprovedSid);
        }

        public void RecordFailure(string reason) { }

        public Task<FieldChannelEnvelope> AcceptAndSignSceneAsync(Guid bootId, CancellationToken cancellationToken)
        {
            Accepts++;
            return Task.FromResult<FieldChannelEnvelope>(new(
                1, Guid.NewGuid(), Field, FieldChannelDirection.GuestToHost, 1,
                FieldChannelMessageType.SceneObservation, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddMinutes(1),
                "nonce", "key-1", new string('b', 64),
                new Dictionary<string, object?> { ["contractVersion"] = 1 }, "signature"));
        }

        public void PublishScene(FieldChannelEnvelope envelope)
        {
            Publishes++;
            firstPublish.TrySetResult();
        }
    }

    private static FieldKvpRuntimeConfiguration Channel() =>
        new(1, Field, "agent-1", "key-1", "secret.bin", "bootstrap.json", 1_000);

    private static FieldSceneSessionConfiguration Session() =>
        new(1, true, SessionId, ApprovedSid, @"C:\Exosuit\Agent\Exosuit.Agent.exe", new string('a', 64),
            new FieldDisplayContract(1, 1920, 1080, 100, 100, "en-US", false), 250);

    private void WriteSessionFile(bool enabled) =>
        File.WriteAllText(path, JsonSerializer.Serialize(new
        {
            contractVersion = 1,
            enabled,
            expectedSessionId = SessionId,
            interactiveUserSid = ApprovedSid,
            producerExecutablePath = @"C:\Exosuit\Agent\Exosuit.Agent.exe",
            producerExecutableSha256 = new string('a', 64),
            display = new
            {
                monitorCount = 1, width = 1920, height = 1080, scalePercent = 100,
                browserZoomPercent = 100, keyboardLayout = "en-US", dynamicResolutionAllowed = false,
            },
            pollIntervalMilliseconds = 250,
        }, new JsonSerializerOptions(JsonSerializerDefaults.Web)));

    // ---- the opt-in default ----

    [Fact]
    public void AnUnconfiguredGuestReadsNoSceneSession()
    {
        Assert.Null(FieldKvpRuntime.ReadSceneSessionConfiguration(path));
    }

    [Fact]
    public void ADisabledSessionFileReadsAsNoSceneSession()
    {
        WriteSessionFile(enabled: false);
        Assert.Null(FieldKvpRuntime.ReadSceneSessionConfiguration(path));
    }

    [Fact]
    public void AnEnabledSessionFileReads()
    {
        WriteSessionFile(enabled: true);
        Assert.NotNull(FieldKvpRuntime.ReadSceneSessionConfiguration(path));
    }

    [Fact]
    public void TheRuntimeReadsTheFixedProductionPath()
    {
        Assert.Equal(@"C:\Exosuit\Config\scene-session.json", FieldSceneSessionConfiguration.ProductionPath);
    }

    [Fact]
    public async Task AnUnconfiguredGuestStartsNothingAtAll()
    {
        var ports = new RecordingPorts();
        var factoryInvocations = 0;

        var task = FieldKvpRuntime.StartSceneSessionIfEnabled(
            session: null,
            Channel(),
            secret: "secret",
            BootId,
            FieldGuestServiceHost.SystemSid,
            CancellationToken.None,
            portsFactory: _ => { factoryInvocations++; return ports; },
            environment: new FakeEnvironment());

        await task;

        // No session, no ports, no producer, no scene, and the caller gets a task that is
        // already done rather than a loop that quietly runs.
        Assert.True(task.IsCompletedSuccessfully);
        Assert.Same(Task.CompletedTask, task);
        Assert.Equal(0, factoryInvocations);
        Assert.Equal(0, ports.Launches);
        Assert.Equal(0, ports.Accepts);
        Assert.Equal(0, ports.Publishes);
    }

    // ---- the configured path actually runs ----

    [Fact]
    public async Task AConfiguredGuestRunsTheSceneCycleAndTearsDownOnCancellation()
    {
        var ports = new RecordingPorts();
        var environment = new FakeEnvironment();
        using var cancellation = new CancellationTokenSource();

        var task = FieldKvpRuntime.StartSceneSessionIfEnabled(
            Session(),
            Channel(),
            secret: "secret",
            BootId,
            FieldGuestServiceHost.SystemSid,
            cancellation.Token,
            portsFactory: _ => ports,
            environment: environment);

        Assert.NotSame(Task.CompletedTask, task);
        // Wait for a real cycle rather than a wall-clock guess.
        await ports.FirstPublish.WaitAsync(TimeSpan.FromSeconds(10));
        await cancellation.CancelAsync();
        await task;

        Assert.True(ports.Launches >= 1);
        Assert.True(ports.Accepts >= 1);
        Assert.True(ports.Publishes >= 1);

        // The producer the runtime started is the producer the runtime stops.
        Assert.Contains(ProducerPid, environment.Terminated);
    }

    [Fact]
    public async Task TheSessionIsBuiltFromTheConfigurationTheRuntimeRead()
    {
        FieldSceneSessionConfiguration? observed = null;
        var ports = new RecordingPorts();
        using var cancellation = new CancellationTokenSource();
        var session = Session();

        var task = FieldKvpRuntime.StartSceneSessionIfEnabled(
            session,
            Channel(),
            secret: "secret",
            BootId,
            FieldGuestServiceHost.SystemSid,
            cancellation.Token,
            portsFactory: configuration => { observed = configuration; return ports; },
            environment: new FakeEnvironment());

        await ports.FirstPublish.WaitAsync(TimeSpan.FromSeconds(10));
        await cancellation.CancelAsync();
        await task;

        Assert.Same(session, observed);
    }
}
