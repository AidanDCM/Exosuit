using System.Text.Json;
using System.Text.Json.Serialization;

namespace Exosuit.Agent;

/// <summary>
/// Opt-in configuration for live scene production.
///
/// Scene production is off unless this file exists and says otherwise. That default matters:
/// the guest runtime as it stands produced the CHN-001 live evidence, and an unconfigured guest
/// must behave exactly as it did then. Enabling scene production is a deliberate act, not a
/// side effect of deploying a newer agent.
/// </summary>
public sealed record FieldSceneSessionConfiguration(
    int ContractVersion,
    bool Enabled,
    int ExpectedSessionId,
    string InteractiveUserSid,
    string ProducerExecutablePath,
    string ProducerExecutableSha256,
    FieldDisplayContract Display,
    int PollIntervalMilliseconds)
{
    /// <summary>Where the guest looks. Absent means disabled.</summary>
    public const string ProductionPath = @"C:\Exosuit\Config\scene-session.json";

    public void Validate()
    {
        if (ContractVersion != 1)
            throw new InvalidOperationException("Unsupported Field scene session contract version.");
        Display.Validate();
        if (ExpectedSessionId <= 0)
            throw new InvalidOperationException("Field scene session requires an interactive session; session zero cannot observe a desktop.");
        if (string.IsNullOrWhiteSpace(InteractiveUserSid) ||
            !InteractiveUserSid.StartsWith("S-1-5-21-", StringComparison.Ordinal))
            throw new InvalidOperationException("Field scene session requires an exact local interactive-user SID.");
        if (string.IsNullOrWhiteSpace(ProducerExecutablePath))
            throw new InvalidOperationException("Field scene session requires a producer executable path.");
        if (ProducerExecutableSha256.Length != 64 ||
            ProducerExecutableSha256.Any(character => character is not (>= '0' and <= '9') and not (>= 'a' and <= 'f')))
            throw new InvalidOperationException("Field scene session producer digest must be lowercase SHA-256.");
        if (PollIntervalMilliseconds is < 250 or > 10_000)
            throw new InvalidOperationException("Field scene poll interval must be from 250 through 10,000 milliseconds.");
    }

    public FieldSceneProducerLaunchPolicy ToLaunchPolicy() =>
        new(ExpectedSessionId, InteractiveUserSid, ProducerExecutablePath, ProducerExecutableSha256,
            FieldSceneProducerConfiguration.ProductionPath);

    /// <summary>
    /// The configuration the launched producer reads. Built from the session and the current boot,
    /// so a producer cannot be started for a boot the session does not belong to.
    /// </summary>
    public FieldSceneProducerConfiguration ToProducerConfiguration(FieldReference field, Guid bootId, string agentId) =>
        new(1, field, bootId, agentId, ExpectedSessionId, Display, PollIntervalMilliseconds);

    /// <summary>
    /// Reads the configuration, or returns null when the file is absent. A malformed or invalid
    /// file is an error rather than a silent disable: a guest that was meant to produce scenes
    /// and quietly does not is worse than one that refuses to start.
    /// </summary>
    public static FieldSceneSessionConfiguration? ReadOptional(string path)
    {
        if (!File.Exists(path)) return null;
        var configuration = JsonSerializer.Deserialize<FieldSceneSessionConfiguration>(
            File.ReadAllText(path), SessionJson)
            ?? throw new InvalidOperationException("Field scene session configuration is empty.");
        configuration.Validate();
        return configuration.Enabled ? configuration : null;
    }

    private static readonly JsonSerializerOptions SessionJson = CreateSessionJson();

    private static JsonSerializerOptions CreateSessionJson()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = false,
            UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        };
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
        return options;
    }
}

/// <summary>
/// The side-effecting operations one scene cycle needs. Abstracted so the cycle's ordering and
/// failure handling are testable without a guest, a producer, or a registry.
/// </summary>
public interface IFieldSceneSessionPorts
{
    /// <summary>Launches the producer into the approved interactive session.</summary>
    FieldSceneProducerLaunchResult LaunchProducer(FieldSceneProducerLaunchPolicy policy);

    /// <summary>Accepts one bounded frame and returns the signed scene envelope.</summary>
    Task<FieldChannelEnvelope> AcceptAndSignSceneAsync(Guid bootId, CancellationToken cancellationToken);

    /// <summary>Publishes the signed envelope on the guest KVP scene value.</summary>
    void PublishScene(FieldChannelEnvelope envelope);
}

/// <summary>
/// The production implementation: real launcher, real one-way intake, real relay signing, real
/// KVP write. Each scene gets a fresh intake because the intake deliberately allows one
/// connection for its lifetime.
/// </summary>
public sealed class WindowsFieldSceneSessionPorts(
    FieldKvpRuntimeConfiguration channel,
    FieldSceneSessionConfiguration session,
    string channelSecret,
    string? callerSid,
    Guid bootId) : IFieldSceneSessionPorts
{
    public FieldSceneProducerLaunchResult LaunchProducer(FieldSceneProducerLaunchPolicy policy)
    {
        // Written before the launch, because the launcher refuses to start a producer whose
        // configuration is absent. A producer started without one runs the general agent host and
        // never connects to the intake — a launch that looks successful and produces nothing.
        var producer = session.ToProducerConfiguration(channel.Field, bootId, channel.AgentId);
        var directory = Path.GetDirectoryName(FieldSceneProducerConfiguration.ProductionPath);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        File.WriteAllText(
            FieldSceneProducerConfiguration.ProductionPath,
            JsonSerializer.Serialize(producer, FieldSceneProducerConfiguration.Json));

        return FieldSceneProducerLauncher.Launch(policy, callerSid);
    }

    public async Task<FieldChannelEnvelope> AcceptAndSignSceneAsync(Guid bootId, CancellationToken cancellationToken)
    {
        var policy = new FieldSceneRelayPolicy(
            channel.Field,
            bootId,
            channel.AgentId,
            session.ExpectedSessionId,
            session.InteractiveUserSid,
            session.Display,
            session.ProducerExecutablePath,
            session.ProducerExecutableSha256);

        await using var intake = new FieldSceneRelayPipeServer(
            channel.Field, bootId, session.InteractiveUserSid, callerSid);

        return await FieldSceneRelayIntakeService.AcceptAndSignSingleSceneAsync(
            intake,
            policy,
            channel,
            channelSecret,
            FieldKvpRuntime.ReserveNextGuestSequence(channel),
            callerSid,
            now: null,
            cancellationToken).ConfigureAwait(false);
    }

    public void PublishScene(FieldChannelEnvelope envelope) =>
        FieldKvpRuntime.PublishScene(channel, envelope, callerSid);
}

/// <summary>
/// One scene production cycle: supervise, launch if needed, accept, publish, record.
///
/// The order is deliberate and fail-closed. Supervision runs first, so a change that happened
/// since the last cycle invalidates before anything new is accepted — otherwise a scene could be
/// published into a lifecycle that was already stale. A launch never implies readiness; only a
/// published scene that the lifecycle accepts does.
///
/// A failure anywhere in the cycle invalidates rather than being retried in place. Retrying a
/// scene acceptance whose effect is unknown is exactly the blind retry the safety rules forbid:
/// the producer may already have written a frame, and accepting a second one would leave two
/// scenes with no way to tell which described the desktop.
/// </summary>
public sealed class FieldSceneSessionRunner(
    FieldSceneSessionConfiguration configuration,
    FieldSceneSupervisor supervisor,
    IFieldSceneSessionPorts ports)
{
    private readonly FieldSceneSessionConfiguration configuration =
        configuration ?? throw new ArgumentNullException(nameof(configuration));
    private readonly FieldSceneSupervisor supervisor =
        supervisor ?? throw new ArgumentNullException(nameof(supervisor));
    private readonly IFieldSceneSessionPorts ports = ports ?? throw new ArgumentNullException(nameof(ports));

    /// <summary>Runs one cycle. Never throws for an expected failure; it invalidates instead.</summary>
    public async Task RunCycleAsync(CancellationToken cancellationToken)
    {
        if (supervisor.IsStopped) return;

        // Supervision first: act on what changed before accepting anything new.
        supervisor.Poll();
        if (supervisor.IsStopped) return;

        // A reboot ends this session outright. Relaunching into the same lifecycle would
        // re-establish readiness against a boot that no longer exists; the caller must build a
        // new session for the new boot.
        if (supervisor.IsBootStale)
        {
            supervisor.Stop("boot identity changed; this scene session is bound to a boot that has ended");
            return;
        }

        if (!supervisor.State.ProducerRunning)
        {
            try
            {
                supervisor.RecordLaunch(ports.LaunchProducer(configuration.ToLaunchPolicy()));
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                supervisor.NotifyProducerUnavailable($"producer could not be launched: {exception.Message}");
                return;
            }
        }

        FieldChannelEnvelope envelope;
        try
        {
            envelope = await ports.AcceptAndSignSceneAsync(supervisor.State.BootId, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            supervisor.NotifyProducerUnavailable($"scene could not be accepted: {exception.Message}");
            return;
        }

        try
        {
            ports.PublishScene(envelope);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // The scene may or may not have reached the value. Never re-publish blindly;
            // invalidate and let the next cycle produce a fresh scene.
            supervisor.NotifyProducerUnavailable($"scene could not be published: {exception.Message}");
            return;
        }

        var desktop = supervisor.State;
        supervisor.RecordScene(envelope, desktop.BootId, desktop.SessionId);
    }

    /// <summary>Runs cycles at the configured cadence until cancelled, then tears down.</summary>
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested && !supervisor.IsStopped)
            {
                await RunCycleAsync(cancellationToken).ConfigureAwait(false);
                await Task.Delay(configuration.PollIntervalMilliseconds, cancellationToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            // Cancellation is a normal stop, not a fault.
        }
        finally
        {
            if (!supervisor.IsStopped) supervisor.Stop("scene session ended");
        }
    }
}
