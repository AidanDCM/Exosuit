using System.Security.Cryptography;
using System.Text;

namespace Exosuit.Agent;

/// <summary>
/// Whether the current scene may be acted on.
///
/// There is no "probably ready". A scene is actionable only while every condition that made
/// it meaningful still holds; the moment any of them changes it becomes
/// <see cref="Invalidated"/> and stays there until a fresh scene arrives.
/// </summary>
public enum FieldSceneReadiness
{
    /// <summary>No scene has been accepted yet for the current producer and boot.</summary>
    NotReady,

    /// <summary>A verified scene is current and the desktop is in an actionable state.</summary>
    Ready,

    /// <summary>Something changed. The previous scene must not be reused.</summary>
    Invalidated,
}

/// <summary>The lifecycle's whole observable state. Deliberately small and copyable.</summary>
public sealed record FieldSceneLifecycleState(
    FieldSceneReadiness Readiness,
    FieldReference Field,
    Guid BootId,
    int SessionId,
    string? SceneSha256,
    string? InvalidationReason,
    bool ProducerRunning,
    int? ProducerProcessId);

/// <summary>
/// Supervises one scene producer for one Field generation, one boot, and one interactive
/// session, and decides when the scene it publishes may be acted on.
///
/// The rule this type exists to enforce is that completing an action is not the same as
/// verifying its effect. A producer that is running proves nothing about whether the scene it
/// last published still describes the desktop. So readiness is derived from live conditions
/// and revoked on any change, rather than latched once at startup.
///
/// Invalidation is one-way until a *fresh* scene arrives. A previously verified scene is never
/// re-promoted, because the reason it was invalidated — a restart, a reboot, a lock, a dead
/// producer — is exactly the reason its contents can no longer be trusted.
///
/// This is the decision layer only. It performs no I/O, launches nothing, and signs nothing,
/// so every failure path below is reachable in a test without a live guest. The wiring that
/// drives it owns the Windows calls.
/// </summary>
public sealed class FieldSceneLifecycle
{
    private readonly FieldSceneProducerLaunchPolicy launchPolicy;
    private FieldSceneLifecycleState state;
    private bool tornDown;

    public FieldSceneLifecycle(
        FieldReference field,
        Guid bootId,
        FieldSceneProducerLaunchPolicy launchPolicy)
    {
        ArgumentNullException.ThrowIfNull(field);
        ArgumentNullException.ThrowIfNull(launchPolicy);
        field.Validate();
        if (bootId == Guid.Empty)
            throw new InvalidOperationException("Scene lifecycle requires an exact boot identity.");

        this.launchPolicy = launchPolicy;
        state = new FieldSceneLifecycleState(
            FieldSceneReadiness.NotReady, field, bootId, launchPolicy.ExpectedSessionId,
            SceneSha256: null, InvalidationReason: null, ProducerRunning: false, ProducerProcessId: null);
    }

    public FieldSceneLifecycleState State => state;

    /// <summary>A scene may be acted on only in <see cref="FieldSceneReadiness.Ready"/>.</summary>
    public bool IsActionable => state.Readiness == FieldSceneReadiness.Ready;

    /// <summary>
    /// Records a producer launch. The launch itself is validated by
    /// <see cref="FieldSceneProducerLauncher"/>; this re-checks the resulting facts because a
    /// supervisor that trusts a reported launch cannot detect one that landed in the wrong
    /// place.
    /// </summary>
    public void OnProducerLaunched(FieldSceneProducerLaunchResult result)
    {
        ArgumentNullException.ThrowIfNull(result);
        RequireLive();

        if (result.SessionId <= 0 || result.SessionId != launchPolicy.ExpectedSessionId)
            throw new InvalidOperationException(
                "Scene producer launched into a session other than the approved interactive session.");
        if (!string.Equals(result.UserSid, launchPolicy.ExpectedInteractiveUserSid, StringComparison.Ordinal))
            throw new InvalidOperationException(
                "Scene producer launched as a user other than the approved interactive owner.");
        if (result.ProcessId <= 0)
            throw new InvalidOperationException("Scene producer launch reported no process.");

        // A launch alone is never readiness. A scene still has to arrive and verify.
        state = state with
        {
            ProducerRunning = true,
            ProducerProcessId = result.ProcessId,
            Readiness = FieldSceneReadiness.NotReady,
            SceneSha256 = null,
            InvalidationReason = null,
        };
    }

    /// <summary>
    /// The producer exited. Whatever scene it published describes a desktop nothing is
    /// observing any more, so readiness clears regardless of exit code — a clean exit invalidates
    /// exactly as firmly as a crash.
    /// </summary>
    public void OnProducerExited(int exitCode)
    {
        RequireLive();
        Invalidate($"scene producer exited with code {exitCode}");
        state = state with { ProducerRunning = false, ProducerProcessId = null };
    }

    /// <summary>
    /// A scene envelope was published and read back. Accepts only a scene bound to this exact
    /// Field generation, boot, and session, from a running producer, with a desktop in an
    /// actionable state.
    /// </summary>
    public void OnScenePublished(FieldChannelEnvelope envelope, Guid sceneBootId, int sceneSessionId, bool desktopActionable)
    {
        ArgumentNullException.ThrowIfNull(envelope);
        RequireLive();

        if (!state.ProducerRunning)
            throw new InvalidOperationException("A scene cannot be accepted while no producer is running.");
        if (envelope.MessageType != FieldChannelMessageType.SceneObservation)
            throw new InvalidOperationException("Only a scene observation envelope can establish scene readiness.");
        if (envelope.Field != state.Field)
            throw new InvalidOperationException("Scene is bound to a different Field generation and is rejected.");
        if (sceneBootId != state.BootId)
            throw new InvalidOperationException("Scene is bound to a different boot and is rejected.");
        if (sceneSessionId != state.SessionId)
            throw new InvalidOperationException("Scene is bound to a different interactive session and is rejected.");

        var digest = ComputeSceneDigest(envelope);
        if (!desktopActionable)
        {
            // The scene is authentic but the desktop is locked or on the Secure Desktop.
            // Recording it as current while refusing to act on it would invite a later
            // promotion of stale content, so it is not retained at all.
            Invalidate("desktop is not actionable, so no scene may be promoted");
            return;
        }

        state = state with
        {
            Readiness = FieldSceneReadiness.Ready,
            SceneSha256 = digest,
            InvalidationReason = null,
        };
    }

    /// <summary>
    /// Lock or Secure Desktop transition. The producer may legitimately still be running; what
    /// clears is the right to act on what it last reported.
    /// </summary>
    public void OnDesktopStateChanged(bool sessionLocked, bool secureDesktopActive)
    {
        RequireLive();
        if (sessionLocked)
        {
            Invalidate("interactive session locked");
            return;
        }
        if (secureDesktopActive)
        {
            Invalidate("Secure Desktop active");
            return;
        }

        // Returning to an unlocked desktop does not restore readiness. Only a fresh scene can,
        // because the desktop may have changed while it was not being observed.
    }

    /// <summary>
    /// The guest rebooted, so every prior scene belongs to a boot that no longer exists. The
    /// lifecycle does not follow the new boot; a new one must be constructed for it.
    /// </summary>
    public void OnBootIdChanged(Guid observedBootId)
    {
        RequireLive();
        if (observedBootId == state.BootId) return;
        Invalidate("boot identity changed; the previous scene belongs to a boot that has ended");
        state = state with { ProducerRunning = false, ProducerProcessId = null };
    }

    /// <summary>
    /// The host-side intake restarted. Anything it held is gone, and cached state on this side
    /// is not evidence that the current desktop still matches. A fresh scene is required.
    /// </summary>
    public void OnHostIntakeRestarted()
    {
        RequireLive();
        Invalidate("host intake restarted; cached scene state is not evidence");
    }

    /// <summary>
    /// The KVP scene value was absent, unreadable, or failed its integrity check. The previous
    /// scene is not reused as a fallback — a missing value is not a reason to trust an older
    /// one.
    /// </summary>
    public void OnSceneValueUnreadable(string reason)
    {
        RequireLive();
        Invalidate($"scene value unusable: {reason}");
    }

    /// <summary>
    /// Ends the lifecycle. The caller must terminate the exact producer process reported here;
    /// leaving it running would orphan a process holding a desktop observation channel for a
    /// Field generation that no longer exists.
    /// </summary>
    public FieldSceneTeardown Teardown(string reason)
    {
        RequireLive();
        var pid = state.ProducerProcessId;
        tornDown = true;
        state = state with
        {
            Readiness = FieldSceneReadiness.Invalidated,
            SceneSha256 = null,
            InvalidationReason = $"torn down: {reason}",
            ProducerRunning = false,
            ProducerProcessId = null,
        };
        return new FieldSceneTeardown(state.Field, state.BootId, state.SessionId, pid);
    }

    public bool IsTornDown => tornDown;

    private void Invalidate(string reason)
    {
        state = state with
        {
            Readiness = FieldSceneReadiness.Invalidated,
            SceneSha256 = null,
            InvalidationReason = reason,
        };
    }

    private void RequireLive()
    {
        if (tornDown)
            throw new InvalidOperationException("Scene lifecycle has been torn down and cannot be reused.");
    }

    private static string ComputeSceneDigest(FieldChannelEnvelope envelope) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(FieldKvpRuntime.SerializeEnvelope(envelope))))
            .ToLowerInvariant();
}

/// <summary>What the caller must actually stop, so a teardown cannot silently orphan a producer.</summary>
public sealed record FieldSceneTeardown(
    FieldReference Field,
    Guid BootId,
    int SessionId,
    int? ProducerProcessId);
