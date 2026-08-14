namespace Exosuit.Agent.Tests;

/// <summary>
/// The producer process itself — the piece that was missing while the intake, relay and client all
/// existed and nothing ever observed a desktop.
/// </summary>
public sealed class FieldSceneProducerHostTests
{
    private static readonly FieldReference Field = new(Guid.Parse("4401b702-334f-475e-b867-b7d06798443d"), 3);
    private static readonly Guid BootId = Guid.Parse("29a19dbc-5021-4dc3-8979-0026660fad17");
    private const string UserSid = "S-1-5-21-1000-1000-1000-1001";

    private static FieldSceneProducerConfiguration Configuration(
        int sessionId = 2, int interval = 250, Guid? bootId = null) =>
        new(1, Field, bootId ?? BootId, "glove-agent", sessionId,
            new FieldDisplayContract(1, 1920, 1080, 100, 100, "en-US", false), interval);

    private sealed class StubProvider : IFieldSceneObserver
    {
        public int Observations { get; private set; }

        public Task<DesktopObservation> ObserveAsync(CancellationToken cancellationToken)
        {
            Observations++;
            var window = new WindowInfo("window-1", "private title", "notepad", 1, true, false, new Bounds(0, 0, 1920, 1080));
            return Task.FromResult(new DesktopObservation(
                $"observation-{Observations}", DateTimeOffset.UtcNow, ControlMode.Observe,
                "windows-ui-automation", window, [window],
                [new UiElement("e1", "window-1", "Save", "Button", "save", "secret-value", true, true, false, false,
                    new Bounds(1, 1, 10, 10), ElementSource.Accessibility, [ActionType.InvokeElement])],
                null, null, []));
        }
    }

    private sealed class NeverCompletesProvider : IFieldSceneObserver
    {
        public Task<DesktopObservation> ObserveAsync(CancellationToken cancellationToken) =>
            new TaskCompletionSource<DesktopObservation>(
                TaskCreationOptions.RunContinuationsAsynchronously).Task;
    }

    private static async Task<List<StructuralFieldScenePayload>> RunOnceAsync(
        FieldSceneProducerConfiguration configuration,
        IFieldSceneObserver observer,
        string? callerSid = UserSid)
    {
        var sent = new List<StructuralFieldScenePayload>();
        await FieldSceneProducerHost.RunAsync(configuration, observer, (payload, _) =>
        {
            sent.Add(payload);
            return Task.CompletedTask;
        }, callerSid, CancellationToken.None);
        return sent;
    }

    [Fact]
    public async Task ObservesAndSendsExactlyOneSanitizedSceneThenExits()
    {
        var provider = new StubProvider();

        var sent = await RunOnceAsync(Configuration(), provider);

        Assert.Single(sent);
        Assert.Equal(1, provider.Observations);
    }

    [Fact]
    public async Task SanitizesBeforeAnythingLeavesTheProcess()
    {
        var sent = await RunOnceAsync(Configuration(), new StubProvider());
        var payload = Assert.Single(sent);

        // The stub observation carried a window title and an element value. A scene that failed
        // the boundary is never sent — not sent and then rejected downstream.
        Assert.Equal(string.Empty, payload.Observation.Windows[0].Title);
        Assert.Equal(string.Empty, payload.Observation.Elements[0].Name);
        Assert.Null(payload.Observation.Elements[0].Value);
    }

    [Fact]
    public async Task BindsEverySceneToTheConfiguredBootAndSession()
    {
        var sent = await RunOnceAsync(Configuration(), new StubProvider());
        var payload = Assert.Single(sent);

        Assert.Equal(BootId, payload.BootId);
        Assert.Equal("2", payload.WindowsSessionId);
        Assert.Equal("glove-agent", payload.AgentId);
    }

    [Fact]
    public async Task RefusesToRunAsTheSystemFieldRuntime()
    {
        // A scene produced by the Field's own SYSTEM runtime would describe the service desktop.
        // Refusing here means the process never starts, rather than failing on first observation.
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            RunOnceAsync(Configuration(), new StubProvider(), FieldGuestServiceHost.SystemSid));
    }

    [Fact]
    public async Task RefusesToRunWithoutAResolvableIdentity()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            RunOnceAsync(Configuration(), new StubProvider(), callerSid: null));
    }

    [Fact]
    public async Task RefusesSessionZero()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            RunOnceAsync(Configuration(sessionId: 0), new StubProvider()));
    }

    [Fact]
    public async Task RefusesAnEmptyBootIdentity()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            RunOnceAsync(Configuration(bootId: Guid.Empty), new StubProvider()));
    }

    [Theory]
    [InlineData(100)]
    [InlineData(60_000)]
    public async Task RefusesAnIntervalOutsideTheBound(int interval)
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            RunOnceAsync(Configuration(interval: interval), new StubProvider()));
    }

    [Fact]
    public async Task ATransportFailureEndsTheProcessRatherThanRetrying()
    {
        var attempts = 0;
        using var cancellation = new CancellationTokenSource();

        await Assert.ThrowsAsync<IOException>(() =>
            FieldSceneProducerHost.RunAsync(Configuration(), new StubProvider(), (_, _) =>
            {
                attempts++;
                throw new IOException("pipe is broken");
            }, UserSid, cancellation.Token));

        // The supervisor already relaunches a dead producer and invalidates readiness when one
        // dies. A producer that quietly retried would hide exactly that condition, and a scene
        // that may or may not have been delivered is the forbidden blind retry.
        Assert.Equal(1, attempts);
    }

    [Fact]
    public void ConfigurationRoundTripsThroughItsOwnReader()
    {
        var path = Path.Combine(Path.GetTempPath(), $"producer-{Guid.NewGuid():N}.json");
        try
        {
            File.WriteAllText(path, System.Text.Json.JsonSerializer.Serialize(
                Configuration(), FieldSceneProducerConfiguration.Json));

            var read = FieldSceneProducerConfiguration.Read(path);

            Assert.Equal(BootId, read.BootId);
            Assert.Equal(2, read.WindowsSessionId);
            Assert.Equal(250, read.IntervalMilliseconds);
        }
        finally
        {
            if (File.Exists(path)) File.Delete(path);
        }
    }

    [Fact]
    public void ProductionKeepsTheSingleShotProcessAliveForWindowsIdentityResolution()
    {
        Assert.InRange(FieldSceneProducerHost.ProductionIdentityResolutionHoldMilliseconds, 1, 30_000);
    }

    [Fact]
    public void InitialProductionObservationIsStructuralWindowsOnlyAndBounded()
    {
        var request = FieldSceneProviderObserver.InitialProductionRequest;

        Assert.False(request.IncludeElements);
        Assert.False(request.IncludeScreenshot);
        Assert.InRange(request.MaxElements, 1, FieldSceneProducerBoundary.MaximumElements);
    }

    [Fact]
    public async Task CancellationStillInterruptsBoundedProductionObservation()
    {
        Assert.InRange(FieldSceneProducerHost.ProductionObservationTimeoutMilliseconds, 1, 30_000);

        using var cancellation = new CancellationTokenSource(TimeSpan.FromMilliseconds(25));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            FieldSceneProducerHost.RunAsync(
                Configuration(), new NeverCompletesProvider(), (_, _) => Task.CompletedTask,
                UserSid, cancellation.Token));
    }

    [Fact]
    public void ASessionConfigurationProducesAMatchingProducerConfiguration()
    {
        var session = new FieldSceneSessionConfiguration(
            1, true, 2, UserSid, @"C:\Exosuit\Agent\Exosuit.Agent.exe", new string('a', 64),
            new FieldDisplayContract(1, 1920, 1080, 100, 100, "en-US", false), 1_000);

        var producer = session.ToProducerConfiguration(Field, BootId, "glove-agent");

        // The producer cannot be started for a boot the session does not belong to.
        producer.Validate();
        Assert.Equal(BootId, producer.BootId);
        Assert.Equal(session.ExpectedSessionId, producer.WindowsSessionId);
        Assert.Equal(session.PollIntervalMilliseconds, producer.IntervalMilliseconds);
        Assert.Equal(FieldSceneProducerConfiguration.ProductionPath, session.ToLaunchPolicy().ProducerConfigurationPath);
    }
}
