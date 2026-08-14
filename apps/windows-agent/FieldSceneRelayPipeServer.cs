using System.Buffers.Binary;
using System.ComponentModel;
using System.IO.Pipes;
using System.Runtime.InteropServices;
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
    private const uint LabelSecurityInformation = 0x00000010;
    private const int SeKernelObject = 6;
    private const byte AclRevision = 2;
    private const byte SystemMandatoryLabelAceType = 0x11;
    private const uint SystemMandatoryLabelNoWriteUp = 0x1;

    /// <summary>
    /// The minimal set that lets one non-owner Windows client open a generic-write handle: write
    /// plus FILE_READ_ATTRIBUTES plus SYNCHRONIZE. Determined by probing, not assumed —
    /// FILE_WRITE_DATA alone is denied at CreateFile. READ_CONTROL is also required by the
    /// generic-write mapping; creator-owned local tests can mask its absence.
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
        | PipeAccessRights.ReadPermissions
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
        string? relayCallerSid,
        bool applyMandatoryIntegrityLabel = true)
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
        if (applyMandatoryIntegrityLabel) ApplyMediumIntegrityNoWriteUp(server);
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

        // A pipe created by the LocalSystem service otherwise inherits the service token's
        // mandatory integrity label. Windows evaluates that label in addition to this DACL,
        // and a normal medium-integrity interactive process is denied before the relay can
        // derive and verify its PID/session/SID/image facts. Label this one-way intake medium
        // with no-write-up: the approved medium producer can connect, low-integrity callers
        // still cannot write, and the DACL continues to name only the exact approved SID.
        return security;
    }

    /// <summary>
    /// Applies a mandatory label through LABEL_SECURITY_INFORMATION. The managed PipeSecurity
    /// SACL surface accepts the SDDL text but drops SYSTEM_MANDATORY_LABEL_ACE, so using it here
    /// would look correct in source while leaving the live kernel object at SYSTEM integrity.
    /// </summary>
    internal static void ApplyMediumIntegrityNoWriteUp(NamedPipeServerStream pipe)
    {
        ArgumentNullException.ThrowIfNull(pipe);
        var acl = BuildMediumIntegrityNoWriteUpAcl();
        var memory = Marshal.AllocHGlobal(acl.Length);
        try
        {
            Marshal.Copy(acl, 0, memory, acl.Length);
            var error = SetSecurityInfo(
                pipe.SafePipeHandle.DangerousGetHandle(),
                SeKernelObject,
                LabelSecurityInformation,
                IntPtr.Zero,
                IntPtr.Zero,
                IntPtr.Zero,
                memory);
            if (error != 0) throw new Win32Exception(checked((int)error));
        }
        finally
        {
            Marshal.FreeHGlobal(memory);
        }
    }

    internal static byte[] BuildMediumIntegrityNoWriteUpAcl()
    {
        // SID S-1-16-8192 (medium mandatory level): revision, sub-authority count,
        // SECURITY_MANDATORY_LABEL_AUTHORITY, then one little-endian sub-authority.
        var sid = new byte[] { 1, 1, 0, 0, 0, 0, 0, 16, 0, 32, 0, 0 };
        var aceSize = checked((ushort)(8 + sid.Length));
        var aclSize = checked((ushort)(8 + aceSize));
        var acl = new byte[aclSize];
        acl[0] = AclRevision;
        BinaryPrimitives.WriteUInt16LittleEndian(acl.AsSpan(2), aclSize);
        BinaryPrimitives.WriteUInt16LittleEndian(acl.AsSpan(4), 1);
        acl[8] = SystemMandatoryLabelAceType;
        BinaryPrimitives.WriteUInt16LittleEndian(acl.AsSpan(10), aceSize);
        BinaryPrimitives.WriteUInt32LittleEndian(acl.AsSpan(12), SystemMandatoryLabelNoWriteUp);
        sid.CopyTo(acl, 16);
        return acl;
    }

    [DllImport("advapi32.dll", SetLastError = false)]
    private static extern uint SetSecurityInfo(
        IntPtr handle,
        int objectType,
        uint securityInfo,
        IntPtr owner,
        IntPtr group,
        IntPtr dacl,
        IntPtr sacl);

    /// <summary>
    /// Accepts the one permitted connection, resolves the connected client from Windows
    /// rather than from anything the client asserts, reads exactly one bounded frame, and
    /// requires the client to close. Returns the raw UTF-8 payload together with the derived
    /// client facts; signing remains the relay boundary's decision, not this transport's.
    /// </summary>
    public async Task<FieldSceneRelayIntakeFrame> AcceptSingleFrameAsync(
        CancellationToken cancellationToken = default,
        Action<string>? recordStage = null)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (connectionSpent)
            throw new InvalidOperationException("Field scene relay intake accepts one connection per boot instance.");

        // Spend the budget before awaiting, so a cancelled or failed accept cannot be
        // retried on the same instance. A second frame requires a new, re-authorised server.
        connectionSpent = true;

        recordStage?.Invoke("pipe_waiting_for_client");
        await server.WaitForConnectionAsync(cancellationToken).ConfigureAwait(false);
        recordStage?.Invoke("pipe_client_connected");

        var client = FieldSceneRelayWindowsClientResolver.ResolveConnectedClient(
            server, relayCallerSid, recordStage);
        recordStage?.Invoke("client_identity_resolved");
        var payload = await ReadBoundedFrameAsync(server, cancellationToken).ConfigureAwait(false);
        recordStage?.Invoke("frame_read_complete");
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
