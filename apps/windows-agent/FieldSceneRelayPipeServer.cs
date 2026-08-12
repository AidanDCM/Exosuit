using System.Buffers.Binary;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;

namespace Exosuit.Agent;

/// <summary>
/// The fixed one-way scene intake.
///
/// The Field service runs as SYSTEM and listens; the unprivileged interactive producer
/// connects, writes exactly one length-prefixed frame, and disconnects. The server never
/// writes, so the privileged side cannot be used to push anything into the producer, and
/// the producer cannot keep a channel open to stream unbounded input at the Field.
///
/// Every bound here is fixed at construction and fail-closed: an exact-generation pipe
/// name, an explicit ACL naming only SYSTEM and the one approved interactive user, a
/// single server instance, a single connection for the lifetime of the object, and a
/// frame that must declare its own length within the structural payload bound before any
/// byte of it is read.
/// </summary>
public sealed class FieldSceneRelayPipeServer : IAsyncDisposable
{
    /// <summary>A frame may never exceed the structural payload bound the producer signs.</summary>
    public const int MaximumFrameBytes = FieldSceneProducerBoundary.MaximumStructuralPayloadBytes;

    private const int FrameHeaderBytes = 4;
    private const int ServerInstances = 1;

    /// <summary>
    /// The empirically minimal set that lets one Windows client open a write handle: write
    /// plus FILE_READ_ATTRIBUTES plus SYNCHRONIZE. Determined by probing, not assumed —
    /// FILE_WRITE_DATA alone is denied at CreateFile, and FILE_READ_ATTRIBUTES is the only
    /// read-shaped right the connect actually needs.
    ///
    /// What stays absent is the point. No <see cref="PipeAccessRights.ReadData"/>, so the
    /// producer cannot read back from the privileged side. No
    /// <see cref="PipeAccessRights.CreateNewInstance"/>, so it cannot stand up a rival server
    /// instance on this name and squat the intake. No ChangePermissions or TakeOwnership, so
    /// it cannot widen this ACL. Nothing else is named at all, so every other principal —
    /// Everyone, Authenticated Users, Administrators, anonymous, any network principal — falls
    /// to the default deny.
    /// </summary>
    private const PipeAccessRights ProducerRights =
        PipeAccessRights.Write
        | PipeAccessRights.ReadAttributes
        | PipeAccessRights.Synchronize;

    private readonly string interactiveUserSid;
    private readonly string? relayCallerSid;
    private readonly NamedPipeServerStream server;
    private bool connectionSpent;
    private bool disposed;

    public FieldSceneRelayPipeServer(FieldReference field, Guid bootId, string interactiveUserSid)
        : this(field, bootId, interactiveUserSid, WindowsIdentity.GetCurrent().User?.Value)
    {
    }

    internal FieldSceneRelayPipeServer(
        FieldReference field,
        Guid bootId,
        string interactiveUserSid,
        string? relayCallerSid)
    {
        ArgumentNullException.ThrowIfNull(field);
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("Field scene relay intake requires Windows.");

        // The privileged listener is created before anything is accepted, so identity is
        // asserted first: a non-SYSTEM caller never gets as far as owning a pipe name.
        FieldGuestServiceHost.AssertSystemIdentity(relayCallerSid);
        field.Validate();
        if (bootId == Guid.Empty)
            throw new InvalidOperationException("Field scene relay intake requires an exact boot identity.");
        if (string.IsNullOrWhiteSpace(interactiveUserSid) ||
            !interactiveUserSid.StartsWith("S-1-5-21-", StringComparison.Ordinal))
            throw new InvalidOperationException("Field scene relay intake requires an exact local interactive-user SID.");

        Field = field;
        BootId = bootId;
        this.interactiveUserSid = interactiveUserSid;
        this.relayCallerSid = relayCallerSid;
        PipeName = BuildPipeName(field, bootId);
        server = NamedPipeServerStreamAcl.Create(
            PipeName,
            PipeDirection.In,
            ServerInstances,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous | PipeOptions.WriteThrough,
            inBufferSize: MaximumFrameBytes + FrameHeaderBytes,
            outBufferSize: 0,
            BuildSecurity(),
            HandleInheritability.None);
    }

    public FieldReference Field { get; }

    public Guid BootId { get; }

    /// <summary>
    /// Exact-generation, exact-boot pipe name. A producer from a previous generation or a
    /// previous boot cannot reach this intake by holding an old name.
    /// </summary>
    public string PipeName { get; }

    /// <summary>True once a connection has been accepted; the budget is one for the lifetime.</summary>
    public bool ConnectionSpent => connectionSpent;

    internal static string BuildPipeName(FieldReference field, Guid bootId) =>
        $"Exosuit.Field.Scene.{field.FieldId:N}.g{field.FieldGeneration}.{bootId:N}";

    /// <summary>
    /// Names only SYSTEM and the one approved interactive user. Everything else — including
    /// Everyone, Authenticated Users, Administrators, anonymous, and any network principal —
    /// is absent, so the default deny applies. The producer is granted write and the minimum
    /// needed to open a client handle; it is never granted read, so it cannot observe other
    /// producers' frames, and it can never take ownership or rewrite the ACL itself.
    /// </summary>
    internal PipeSecurity BuildSecurity()
    {
        var security = new PipeSecurity();
        var system = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
        var producer = new SecurityIdentifier(interactiveUserSid);

        // The creating process becomes the owner, which is SYSTEM in production. Setting an
        // owner explicitly would need SeRestorePrivilege and buys nothing here.
        security.AddAccessRule(new PipeAccessRule(system, PipeAccessRights.FullControl, AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(producer, ProducerRights, AccessControlType.Allow));
        return security;
    }

    /// <summary>
    /// Accepts the one permitted connection, resolves the connected client from Windows
    /// rather than from anything the client asserts, reads exactly one bounded frame, and
    /// requires the client to close. Returns the raw UTF-8 payload together with the derived
    /// client facts; signing remains the relay boundary's decision, not this transport's.
    /// </summary>
    public async Task<FieldSceneRelayIntakeFrame> AcceptSingleFrameAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (connectionSpent)
            throw new InvalidOperationException("Field scene relay intake accepts one connection per boot instance.");

        // Spend the budget before awaiting, so a cancelled or failed accept cannot be
        // retried on the same instance. A second frame requires a new, re-authorised server.
        connectionSpent = true;

        await server.WaitForConnectionAsync(cancellationToken).ConfigureAwait(false);

        var client = FieldSceneRelayWindowsClientResolver.ResolveConnectedClient(server, relayCallerSid);
        var payload = await ReadBoundedFrameAsync(server, cancellationToken).ConfigureAwait(false);
        return new FieldSceneRelayIntakeFrame(client, payload);
    }

    private static async Task<byte[]> ReadBoundedFrameAsync(
        NamedPipeServerStream server,
        CancellationToken cancellationToken)
    {
        var header = new byte[FrameHeaderBytes];
        await ReadExactlyOrThrowAsync(server, header, "frame header", cancellationToken).ConfigureAwait(false);

        // The declared length is checked before a single payload byte is read, so an
        // oversized or zero-length claim costs nothing to reject.
        var declared = BinaryPrimitives.ReadUInt32BigEndian(header);
        if (declared is 0 || declared > MaximumFrameBytes)
            throw new InvalidOperationException(
                $"Field scene relay frame declares {declared} bytes, outside the 1..{MaximumFrameBytes} bound.");

        var payload = new byte[declared];
        await ReadExactlyOrThrowAsync(server, payload, "frame payload", cancellationToken).ConfigureAwait(false);

        // Exactly one frame per connection. Anything after it is a protocol violation, not
        // a second message, and the whole connection is rejected rather than partly trusted.
        var trailing = new byte[1];
        var extra = await server.ReadAsync(trailing.AsMemory(), cancellationToken).ConfigureAwait(false);
        if (extra != 0)
            throw new InvalidOperationException("Field scene relay client sent more than one frame on one connection.");

        return payload;
    }

    private static async Task ReadExactlyOrThrowAsync(
        NamedPipeServerStream server,
        Memory<byte> destination,
        string what,
        CancellationToken cancellationToken)
    {
        var filled = 0;
        while (filled < destination.Length)
        {
            var read = await server.ReadAsync(destination[filled..], cancellationToken).ConfigureAwait(false);
            if (read == 0)
                throw new InvalidOperationException($"Field scene relay client closed before the {what} was complete.");
            filled += read;
        }
    }

    public ValueTask DisposeAsync()
    {
        disposed = true;
        return server.DisposeAsync();
    }
}

/// <summary>One accepted frame: the Windows-derived client facts and the raw payload bytes.</summary>
public sealed record FieldSceneRelayIntakeFrame(FieldSceneRelayClientFacts Client, byte[] PayloadUtf8);
