namespace Exosuit.Agent;

/// <summary>
/// Joins the one-way intake to the signing boundary.
///
/// This is deliberately thin. The transport decides nothing about trust: it produces bytes
/// and Windows-derived client facts, and <see cref="FieldSceneRelayBoundary"/> remains the
/// only place that decides whether those facts satisfy the exact-generation policy and
/// whether an envelope is signed. Keeping the split visible means a transport change can
/// never silently widen what gets signed.
/// </summary>
public static class FieldSceneRelayIntakeService
{
    /// <summary>
    /// Accepts the one permitted producer connection for this boot, then signs the frame
    /// only if the connected client matches the policy. Any transport, identity, or policy
    /// failure denies before an envelope exists.
    /// </summary>
    public static async Task<FieldChannelEnvelope> AcceptAndSignSingleSceneAsync(
        FieldSceneRelayPipeServer intake,
        FieldSceneRelayPolicy policy,
        FieldKvpRuntimeConfiguration channel,
        string channelSecret,
        long sequence,
        string? relayCallerSid,
        DateTimeOffset? now = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(intake);
        ArgumentNullException.ThrowIfNull(policy);
        FieldGuestServiceHost.AssertSystemIdentity(relayCallerSid);

        // The intake is bound to one Field generation and boot; a policy describing a
        // different one must never be signed from these bytes.
        if (intake.Field != policy.Field || intake.BootId != policy.BootId)
            throw new InvalidOperationException(
                "Field scene relay intake is bound to a different Field generation or boot than the policy.");

        var frame = await intake.AcceptSingleFrameAsync(cancellationToken).ConfigureAwait(false);

        return FieldSceneRelayBoundary.AcceptAndSign(
            policy,
            frame.Client,
            channel,
            channelSecret,
            sequence,
            frame.PayloadUtf8,
            relayCallerSid,
            now);
    }
}
