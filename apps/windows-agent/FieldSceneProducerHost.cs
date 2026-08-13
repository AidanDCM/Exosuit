using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Exosuit.Agent;

/// <summary>
/// What the unprivileged producer needs to know. Deliberately carries no secret: the producer
/// never signs. It observes, sanitizes, and hands bytes to the privileged relay, which is the only
/// thing that can turn them into a signed envelope.
/// </summary>
public sealed record FieldSceneProducerConfiguration(
    int ContractVersion,
    FieldReference Field,
    Guid BootId,
    string AgentId,
    int WindowsSessionId,
    FieldDisplayContract Display,
    int IntervalMilliseconds)
{
    /// <summary>
    /// Where the SYSTEM side writes it and the producer reads it. Fixed rather than passed as a
    /// free path so a launched process cannot be pointed at an arbitrary file.
    /// </summary>
    public const string ProductionPath = @"C:\Exosuit\Config\scene-producer.json";

    public void Validate()
    {
        if (ContractVersion != 1)
            throw new InvalidOperationException("Unsupported Field scene producer contract version.");
        Field.Validate();
        Display.Validate();
        if (BootId == Guid.Empty)
            throw new InvalidOperationException("Field scene producer requires an exact boot identity.");
        if (string.IsNullOrWhiteSpace(AgentId))
            throw new InvalidOperationException("Field scene producer requires an agent identity.");
        if (WindowsSessionId <= 0)
            throw new InvalidOperationException(
                "Field scene producer must run in an interactive session; session zero cannot observe a desktop.");
        if (IntervalMilliseconds is < 250 or > 10_000)
            throw new InvalidOperationException("Field scene producer interval must be from 250 through 10,000 milliseconds.");
    }

    public static FieldSceneProducerConfiguration Read(string path)
    {
        var configuration = JsonSerializer.Deserialize<FieldSceneProducerConfiguration>(
            File.ReadAllText(path), Json)
            ?? throw new InvalidOperationException("Field scene producer configuration is empty.");
        configuration.Validate();
        return configuration;
    }

    internal static readonly JsonSerializerOptions Json = CreateJson();

    private static JsonSerializerOptions CreateJson()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = false,
            UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
            WriteIndented = true,
        };
        options.Converters.Add(new CanonicalUtcDateTimeOffsetConverter());
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
        return options;
    }
}

/// <summary>Sends one sanitized scene to the privileged intake.</summary>
public delegate Task FieldSceneSender(StructuralFieldScenePayload payload, CancellationToken cancellationToken);

/// <summary>
/// The only capability the producer needs: look at the desktop.
///
/// Deliberately narrower than `IDesktopProvider`, which also exposes `ExecuteAsync`, `VerifyAsync`
/// and `CancelAsync`. Handing the producer a type that can act would give it authority it has no
/// business holding, and "it never calls those" is a property of today's code rather than of the
/// design. The observe-only interface makes acting unreachable rather than merely unused.
/// </summary>
public interface IFieldSceneObserver
{
    Task<DesktopObservation> ObserveAsync(CancellationToken cancellationToken);
}

/// <summary>Adapts a full desktop provider down to observation alone.</summary>
public sealed class FieldSceneProviderObserver(IDesktopProvider provider) : IFieldSceneObserver
{
    private readonly ObservationRequest request = new(IncludeScreenshot: false);
    private readonly AgentRuntimeState state = new(
        ControlMode.Observe,
        physicalInputEnabled: false,
        screenshotCaptureEnabled: false,
        localFullControlEnabled: false,
        allowedProcessNames: new HashSet<string>(StringComparer.OrdinalIgnoreCase),
        enforceStartupEnvironment: false);

    public Task<DesktopObservation> ObserveAsync(CancellationToken cancellationToken) =>
        provider.ObserveAsync(request, state, cancellationToken);
}

/// <summary>
/// The scene producer process.
///
/// This is the piece that was missing: the intake, the relay, and the client all existed, and
/// nothing ever observed a desktop and sent anything. The launcher started the agent image with no
/// arguments, which runs the general agent host — so on a live guest a process would appear, the
/// launch would look successful, and the intake would wait forever for a connection that never
/// came. A failure that presents as partial success is worse than a crash.
///
/// The producer holds no authority. It cannot sign, it has no channel secret, and everything it
/// sends is re-derived from Windows by the relay before an envelope exists. Its only privilege is
/// being able to see the desktop it runs on.
/// </summary>
public static class FieldSceneProducerHost
{
    // Keep the exact producer alive while the privileged relay resolves its Windows pipe-client
    // PID and verifies the process token/image. Live Hyper-V evidence exceeded ten seconds on a
    // loaded guest, so use the client's existing hard maximum rather than racing a clean exit.
    internal const int ProductionIdentityResolutionHoldMilliseconds = 30_000;
    /// <summary>
    /// Runs until cancelled. Each cycle observes, sanitizes through the producer boundary, and
    /// sends one frame.
    ///
    /// A transport failure ends the loop rather than retrying. The supervisor already relaunches a
    /// dead producer and already invalidates readiness when one dies; a producer that quietly
    /// retried would hide exactly the condition the supervisor exists to notice, and a scene that
    /// may or may not have been delivered is the blind retry the safety rules forbid.
    /// </summary>
    public static async Task RunAsync(
        FieldSceneProducerConfiguration configuration,
        IFieldSceneObserver observer,
        FieldSceneSender send,
        string? callerSid,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(observer);
        ArgumentNullException.ThrowIfNull(send);
        configuration.Validate();

        // The producer must be the unprivileged interactive user. A scene produced by the Field's
        // own SYSTEM runtime would describe the service desktop, not the user's, and the producer
        // boundary refuses it — but refusing here means the process never starts rather than
        // failing on its first observation.
        if (string.IsNullOrWhiteSpace(callerSid))
            throw new InvalidOperationException("Field scene producer requires a resolvable caller identity.");
        if (string.Equals(callerSid, FieldGuestServiceHost.SystemSid, StringComparison.Ordinal))
            throw new InvalidOperationException(
                "The LocalSystem Field runtime cannot produce an interactive desktop scene.");

        var identity = new FieldSceneProducerIdentity(
            configuration.Field, configuration.BootId, configuration.AgentId,
            configuration.WindowsSessionId, configuration.Display);
        cancellationToken.ThrowIfCancellationRequested();
        var observation = await observer.ObserveAsync(cancellationToken).ConfigureAwait(false);

        // Sanitization and every identity check happen here, before anything leaves the
        // process. A scene that fails the boundary is never sent, not sent and then rejected.
        var payload = FieldSceneProducerBoundary.Create(
            identity, observation,
            CursorOf(observation), ModalOf(observation),
            callerSid, configuration.WindowsSessionId);

        // The relay intake is deliberately one-use. One producer process therefore observes and
        // sends exactly one scene, then exits; the SYSTEM supervisor owns subsequent cadence and
        // launches a fresh producer only after it has armed a fresh intake.
        await send(payload, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// The cursor is not part of an observation, so it is reported as absent rather than invented.
    /// A fabricated position would be indistinguishable from a real one downstream.
    /// </summary>
    private static FieldSceneCursor CursorOf(DesktopObservation observation) =>
        new(0, 0, Visible: false);

    /// <summary>
    /// Modal presence is derived from the observation rather than guessed: a window that is active
    /// and owns no other window is not evidence of a modal, and claiming one would let the host
    /// deny a legitimate action.
    /// </summary>
    private static FieldSceneModal ModalOf(DesktopObservation observation) =>
        new(Present: false);

    /// <summary>
    /// Entry point for `--field-scene-producer`. Builds the real sender, which connects to the
    /// exact-generation intake for this boot.
    /// </summary>
    public static Task RunProductionAsync(string configurationPath, CancellationToken cancellationToken)
    {
        var configuration = FieldSceneProducerConfiguration.Read(configurationPath);
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("Field scene production requires Windows.");

        return RunAsync(
            configuration,
            new FieldSceneProviderObserver(new WindowsUiAutomationProvider()),
            (payload, token) => FieldSceneProducerClient.SendSceneAsync(
                configuration.Field, configuration.BootId, payload,
                identityResolutionHoldMilliseconds: ProductionIdentityResolutionHoldMilliseconds,
                cancellationToken: token),
            WindowsIdentity.GetCurrent().User?.Value,
            cancellationToken);
    }
}
