using System.Buffers.Binary;
using System.IO.Pipes;
using System.Text;

namespace Exosuit.Agent;

/// <summary>
/// The producer side of the one-way scene intake: the unprivileged half that connects, writes
/// exactly one bounded frame, and disconnects.
///
/// It is the exact counterpart of <see cref="FieldSceneRelayPipeServer"/> and is deliberately
/// tiny. The producer holds no authority: it cannot sign, cannot read from the privileged side,
/// and cannot keep the connection open. Everything it sends is re-derived and re-validated by
/// the relay boundary against facts Windows reports about this process, so nothing here is
/// trusted on the strength of having been sent.
///
/// The frame bound is enforced *before* connecting. A producer that has built an oversized
/// scene should fail in its own process rather than opening a connection it cannot legally
/// complete — the intake would reject it anyway, and spending the server's one-connection budget
/// on a frame that is already known to be invalid would turn a producer bug into a denial of the
/// scene channel.
/// </summary>
public static class FieldSceneProducerClient
{
    private const int FrameHeaderBytes = 4;

    /// <summary>Serializes a structural payload to the exact bytes the relay expects.</summary>
    public static byte[] SerializeFrameBody(StructuralFieldScenePayload payload)
    {
        ArgumentNullException.ThrowIfNull(payload);
        var body = Encoding.UTF8.GetBytes(
            CanonicalJson.Serialize(FieldSceneProducerBoundary.ToChannelPayload(payload)));
        if (body.Length is 0 or > FieldSceneRelayPipeServer.MaximumFrameBytes)
            throw new InvalidOperationException(
                $"Scene frame is {body.Length} bytes, outside the 1..{FieldSceneRelayPipeServer.MaximumFrameBytes} bound.");
        return body;
    }

    /// <summary>
    /// Connects to the exact-generation intake for this boot, writes one length-prefixed frame,
    /// and closes. Closing is part of the protocol: the intake requires the stream to end after
    /// the declared payload, so leaving the connection open would fail the frame.
    /// </summary>
    public static async Task SendSceneAsync(
        FieldReference field,
        Guid bootId,
        StructuralFieldScenePayload payload,
        int connectTimeoutMilliseconds = 5_000,
        int identityResolutionHoldMilliseconds = 0,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(field);
        field.Validate();
        if (bootId == Guid.Empty)
            throw new InvalidOperationException("Scene producer requires an exact boot identity.");
        if (identityResolutionHoldMilliseconds is < 0 or > 30_000)
            throw new ArgumentOutOfRangeException(nameof(identityResolutionHoldMilliseconds));

        // Bound first, connect second.
        var body = SerializeFrameBody(payload);

        await SendFrameAsync(
            FieldSceneRelayPipeServer.BuildPipeName(field, bootId),
            body,
            connectTimeoutMilliseconds,
            cancellationToken).ConfigureAwait(false);

        if (identityResolutionHoldMilliseconds > 0)
            await Task.Delay(identityResolutionHoldMilliseconds, cancellationToken).ConfigureAwait(false);
    }

    internal static async Task SendFrameAsync(
        string pipeName,
        byte[] body,
        int connectTimeoutMilliseconds,
        CancellationToken cancellationToken)
    {
        await using var client = new NamedPipeClientStream(
            ".", pipeName, PipeDirection.Out, PipeOptions.Asynchronous);

        await client.ConnectAsync(connectTimeoutMilliseconds, cancellationToken).ConfigureAwait(false);

        var header = new byte[FrameHeaderBytes];
        BinaryPrimitives.WriteUInt32BigEndian(header, (uint)body.Length);
        await client.WriteAsync(header, cancellationToken).ConfigureAwait(false);
        await client.WriteAsync(body, cancellationToken).ConfigureAwait(false);
        await client.FlushAsync(cancellationToken).ConfigureAwait(false);
    }
}
