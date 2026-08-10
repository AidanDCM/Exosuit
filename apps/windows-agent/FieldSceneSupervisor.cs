using System.Diagnostics;

namespace Exosuit.Agent;

/// <summary>What the supervisor observes each tick.</summary>
public sealed record FieldDesktopState(bool SessionLocked, bool SecureDesktopActive);

/// <summary>
/// The live facts the supervisor needs. Abstracted so the supervisor's ordering and
/// fail-closed behaviour are testable without a guest; the Windows implementation below is the
/// only part that touches the platform.
/// </summary>
public interface IFieldSceneEnvironment
{
    /// <summary>The guest's current boot identity.</summary>
    Guid CurrentBootId();

    /// <summary>Whether the exact producer process is still alive.</summary>
    bool IsProducerAlive(int processId);

    /// <summary>Lock and Secure Desktop state for the supervised interactive session.</summary>
    FieldDesktopState ObserveDesktop(int sessionId);

    /// <summary>Terminates the exact producer process.</summary>
    void TerminateProducer(int processId);
}

/// <summary>
/// Drives a <see cref="FieldSceneLifecycle"/> from live observations.
///
/// The lifecycle decides; this decides *when to ask*. Two things matter here that the decision
/// layer cannot express on its own.
///
/// First, ordering. A tick evaluates the most fundamental invalidation first — boot, then
/// producer liveness, then desktop state — so a reboot is never reported as a mere lock, and a
/// dead producer is never masked by a desktop that happens to look fine.
///
/// Second, orphan safety. The supervisor tracks the last producer PID it saw independently of
/// the lifecycle's own view. When a boot change or an unobservable failure makes the lifecycle
/// drop its reference, the process may still be running; teardown must still be able to stop
/// it. A supervisor that could only terminate what the lifecycle still admits to knowing about
/// would leave exactly the orphan it exists to prevent.
///
/// A probe that throws is treated as a failure to observe, not as evidence of health. The
/// lifecycle is invalidated and the reason recorded.
/// </summary>
public sealed class FieldSceneSupervisor
{
    private readonly FieldSceneLifecycle lifecycle;
    private readonly IFieldSceneEnvironment environment;
    private int? lastKnownProducerPid;
    private bool stopped;

    public FieldSceneSupervisor(FieldSceneLifecycle lifecycle, IFieldSceneEnvironment environment)
    {
        this.lifecycle = lifecycle ?? throw new ArgumentNullException(nameof(lifecycle));
        this.environment = environment ?? throw new ArgumentNullException(nameof(environment));
    }

    public FieldSceneLifecycleState State => lifecycle.State;

    public bool IsActionable => !stopped && lifecycle.IsActionable;

    /// <summary>The PID teardown would stop, whatever the lifecycle currently believes.</summary>
    public int? SupervisedProducerProcessId => lastKnownProducerPid;

    /// <summary>
    /// True once the guest has rebooted. Terminal: this supervisor and its lifecycle are bound
    /// to a boot that has ended and must be replaced rather than reused.
    /// </summary>
    public bool IsBootStale => lifecycle.IsBootStale;

    /// <summary>Records a launch with both the lifecycle and the supervisor's own orphan tracking.</summary>
    public void RecordLaunch(FieldSceneProducerLaunchResult result)
    {
        ArgumentNullException.ThrowIfNull(result);
        RequireRunning();

        // Tracked before the lifecycle validates, so a launch that lands somewhere invalid is
        // still a process this supervisor knows it must clean up.
        lastKnownProducerPid = result.ProcessId > 0 ? result.ProcessId : null;
        lifecycle.OnProducerLaunched(result);
    }

    /// <summary>
    /// One observation tick. Evaluates boot, then producer liveness, then desktop state, and
    /// stops at the first invalidation so the recorded reason is the most fundamental one.
    /// </summary>
    public void Poll()
    {
        RequireRunning();
        if (lifecycle.IsTornDown) return;

        Guid observedBootId;
        try
        {
            observedBootId = environment.CurrentBootId();
        }
        catch (Exception exception)
        {
            lifecycle.OnSceneValueUnreadable($"boot identity could not be observed: {exception.Message}");
            return;
        }

        if (observedBootId != lifecycle.State.BootId)
        {
            lifecycle.OnBootIdChanged(observedBootId);
            return;
        }

        var pid = lifecycle.State.ProducerProcessId;
        if (lifecycle.State.ProducerRunning && pid is not null)
        {
            bool alive;
            try
            {
                alive = environment.IsProducerAlive(pid.Value);
            }
            catch (Exception exception)
            {
                // Failing to observe the producer is not evidence that it is healthy.
                lifecycle.OnSceneValueUnreadable($"producer liveness could not be observed: {exception.Message}");
                return;
            }

            if (!alive)
            {
                lifecycle.OnProducerExited(exitCode: -1);
                return;
            }
        }

        FieldDesktopState desktop;
        try
        {
            desktop = environment.ObserveDesktop(lifecycle.State.SessionId);
        }
        catch (Exception exception)
        {
            lifecycle.OnSceneValueUnreadable($"desktop state could not be observed: {exception.Message}");
            return;
        }

        lifecycle.OnDesktopStateChanged(desktop.SessionLocked, desktop.SecureDesktopActive);
    }

    /// <summary>Signals that the host-side intake restarted, so cached state is not evidence.</summary>
    public void NotifyHostIntakeRestarted()
    {
        RequireRunning();
        lifecycle.OnHostIntakeRestarted();
    }

    /// <summary>
    /// Records that the producer could not be launched, reached, or published for. Any of these
    /// means the current scene is no longer backed by a working producer, so readiness clears.
    /// </summary>
    public void NotifyProducerUnavailable(string reason)
    {
        RequireRunning();
        lifecycle.OnSceneValueUnreadable(reason);
    }

    /// <summary>
    /// Offers a published scene to the lifecycle, with the desktop state observed now rather
    /// than taken from the previous tick — a lock between the tick and the scene must not be
    /// missed. A scene the lifecycle refuses invalidates with the reason recorded instead of
    /// propagating, so one bad scene cannot take down the supervisor loop.
    /// </summary>
    public void RecordScene(FieldChannelEnvelope envelope, Guid sceneBootId, int sceneSessionId)
    {
        ArgumentNullException.ThrowIfNull(envelope);
        RequireRunning();

        FieldDesktopState desktop;
        try
        {
            desktop = environment.ObserveDesktop(lifecycle.State.SessionId);
        }
        catch (Exception exception)
        {
            lifecycle.OnSceneValueUnreadable($"desktop state could not be observed: {exception.Message}");
            return;
        }

        var actionable = !desktop.SessionLocked && !desktop.SecureDesktopActive;
        try
        {
            lifecycle.OnScenePublished(envelope, sceneBootId, sceneSessionId, actionable);
        }
        catch (InvalidOperationException exception)
        {
            lifecycle.OnSceneValueUnreadable($"scene rejected: {exception.Message}");
        }
    }

    /// <summary>
    /// Tears the lifecycle down and terminates the exact producer, using the supervisor's own
    /// tracking so a producer the lifecycle has already forgotten is still stopped. Termination
    /// failure is surfaced rather than swallowed: an orphaned producer holding a desktop
    /// observation channel is precisely what must not pass silently.
    /// </summary>
    public FieldSceneTeardown Stop(string reason)
    {
        RequireRunning();
        var teardown = lifecycle.Teardown(reason);
        stopped = true;

        var pid = teardown.ProducerProcessId ?? lastKnownProducerPid;
        if (pid is not null)
        {
            environment.TerminateProducer(pid.Value);
            lastKnownProducerPid = null;
        }

        return teardown with { ProducerProcessId = pid };
    }

    public bool IsStopped => stopped;

    private void RequireRunning()
    {
        if (stopped) throw new InvalidOperationException("Scene supervisor has stopped and cannot be reused.");
    }
}

/// <summary>The Windows implementation. The only part of supervision that touches the platform.</summary>
public sealed class WindowsFieldSceneEnvironment(Guid bootId) : IFieldSceneEnvironment
{
    public Guid CurrentBootId() => bootId;

    public bool IsProducerAlive(int processId)
    {
        try
        {
            using var process = Process.GetProcessById(processId);
            return !process.HasExited;
        }
        catch (ArgumentException)
        {
            // The process no longer exists.
            return false;
        }
    }

    public FieldDesktopState ObserveDesktop(int sessionId)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("Field scene supervision requires Windows.");

        var session = checked((uint)sessionId);
        var locked = FieldKvpRuntime.IsSessionLocked(session);
        var secureDesktop = Process.GetProcessesByName("consent").Any(process => process.SessionId == sessionId);
        return new FieldDesktopState(locked, secureDesktop);
    }

    public void TerminateProducer(int processId)
    {
        try
        {
            using var process = Process.GetProcessById(processId);
            if (!process.HasExited) process.Kill(entireProcessTree: true);
        }
        catch (ArgumentException)
        {
            // Already gone; nothing to orphan.
        }
    }
}
