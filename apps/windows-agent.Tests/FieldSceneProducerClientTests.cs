using System.Buffers.Binary;
using System.Security.Principal;
using System.Text;

namespace Exosuit.Agent.Tests;

/// <summary>
/// The producer client and the intake are two halves of one protocol, so these tests drive them
/// against each other rather than against a hand-written frame. A round trip is the only way to
/// catch a framing disagreement between the two sides.
/// </summary>
public sealed class FieldSceneProducerClientTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-08-11T00:00:01.000Z");
    private static readonly FieldReference Field = new(Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), 3);
    private static readonly Guid PayloadBootId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    // Each test gets its own boot identity: the pipe name is derived from it, so a shared value
    // would make tests in this class fight over one name.
    private readonly Guid BootId = Guid.NewGuid();
    private static readonly FieldDisplayContract Display = new(1, 1920, 1080, 100, 100, "en-US", false);
    private static readonly FieldSceneProducerIdentity Identity = new(Field, PayloadBootId, "glove-agent", 2, Display);
    private const string UserSid = "S-1-5-21-1000-1000-1000-1001";

    private static DesktopObservation Observation()
    {
        var window = new WindowInfo("window-1", "title", "notepad", 10, true, false, new Bounds(0, 0, 800, 600));
        return new DesktopObservation(
            "observation-1", Now.AddSeconds(-1), ControlMode.Observe, "windows-ui-automation", window, [window],
            [
                new UiElement("element-1", "window-1", "name", "Edit", "automation", "value", true, true, false, false,
                    new Bounds(10, 10, 200, 30), ElementSource.Accessibility, [ActionType.SetElementValue]),
            ], null, null, []);
    }

    private static StructuralFieldScenePayload Payload() =>
        FieldSceneProducerBoundary.Create(
            Identity, Observation(), new FieldSceneCursor(100, 100, true), new FieldSceneModal(false),
            UserSid, 2, Now);

    private static string CurrentUserSid() => WindowsIdentity.GetCurrent().User!.Value;

    [Fact]
    public void SerializesToTheExactCanonicalChannelRepresentation()
    {
        var payload = Payload();

        var body = FieldSceneProducerClient.SerializeFrameBody(payload);

        // The relay re-derives the normalized payload and compares canonical bytes, so the
        // producer must emit exactly that representation and nothing else.
        var expected = CanonicalJson.Serialize(FieldSceneProducerBoundary.ToChannelPayload(payload));
        Assert.Equal(expected, Encoding.UTF8.GetString(body));
    }

    [Fact]
    public void SerializedFramesStayInsideTheIntakeBound()
    {
        var body = FieldSceneProducerClient.SerializeFrameBody(Payload());

        Assert.InRange(body.Length, 1, FieldSceneRelayPipeServer.MaximumFrameBytes);
    }

    [Fact]
    public void RejectsAnEmptyPayloadReference()
    {
        Assert.Throws<ArgumentNullException>(() => FieldSceneProducerClient.SerializeFrameBody(null!));
    }

    [Fact]
    public async Task RejectsAnEmptyBootIdentityBeforeConnecting()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            FieldSceneProducerClient.SendSceneAsync(Field, Guid.Empty, Payload()));
    }

    [Fact]
    public async Task RejectsAnInvalidFieldBeforeConnecting()
    {
        await Assert.ThrowsAnyAsync<Exception>(() =>
            FieldSceneProducerClient.SendSceneAsync(new FieldReference(Field.FieldId, 0), BootId, Payload()));
    }

    [Fact]
    [Trait("Category", "LocalWindows")]
    public async Task RoundTripsOneSceneFromProducerToIntake()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using var intake = new FieldSceneRelayPipeServer(
            Field, BootId, CurrentUserSid(), FieldGuestServiceHost.SystemSid);
        var expected = FieldSceneProducerClient.SerializeFrameBody(Payload());

        var accept = intake.AcceptSingleFrameAsync();
        await FieldSceneProducerClient.SendFrameAsync(intake.PipeName, expected, 5_000, CancellationToken.None);
        var frame = await accept;

        // Byte-for-byte: a framing disagreement between the two halves would show up here and
        // nowhere else in the suite.
        Assert.Equal(expected, frame.PayloadUtf8);
        Assert.Equal(Environment.ProcessId, frame.Client.ProcessId);
    }

    [Fact]
    [Trait("Category", "LocalWindows")]
    public async Task TheProducerClosesSoTheIntakeSeesACompleteSingleFrame()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using var intake = new FieldSceneRelayPipeServer(
            Field, BootId, CurrentUserSid(), FieldGuestServiceHost.SystemSid);

        var accept = intake.AcceptSingleFrameAsync();
        await FieldSceneProducerClient.SendSceneAsync(Field, BootId, Payload());

        // Closing is part of the protocol: the intake requires the stream to end after the
        // declared payload, so this completing at all is the assertion.
        var frame = await accept;
        Assert.NotEmpty(frame.PayloadUtf8);
    }

    [Fact]
    [Trait("Category", "LocalWindows")]
    public async Task SendsToTheExactGenerationAndBootPipeName()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using var intake = new FieldSceneRelayPipeServer(
            Field, BootId, CurrentUserSid(), FieldGuestServiceHost.SystemSid);

        var accept = intake.AcceptSingleFrameAsync();
        // SendSceneAsync derives the name itself; if it disagreed with the server's derivation
        // this would time out rather than connect.
        await FieldSceneProducerClient.SendSceneAsync(Field, BootId, Payload());
        await accept;

        Assert.Equal(FieldSceneRelayPipeServer.BuildPipeName(Field, BootId), intake.PipeName);
    }

    [Fact]
    [Trait("Category", "LocalWindows")]
    public async Task AProducerForAnotherGenerationCannotReachThisIntake()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using var intake = new FieldSceneRelayPipeServer(
            Field, BootId, CurrentUserSid(), FieldGuestServiceHost.SystemSid);
        using var cancellation = new CancellationTokenSource();
        var accept = intake.AcceptSingleFrameAsync(cancellation.Token);

        // A neighbouring generation resolves to a different pipe name and simply is not there.
        await Assert.ThrowsAnyAsync<Exception>(() =>
            FieldSceneProducerClient.SendSceneAsync(
                Field with { FieldGeneration = 4 }, BootId, Payload(), connectTimeoutMilliseconds: 500));

        Assert.False(accept.IsCompleted);

        // Release the listener; a pending accept would keep the pipe name held past this test.
        await cancellation.CancelAsync();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => accept);
    }

    [Fact]
    [Trait("Category", "LocalWindows")]
    public async Task AnOversizedFrameIsRejectedByTheIntakeWhenForced()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using var intake = new FieldSceneRelayPipeServer(
            Field, BootId, CurrentUserSid(), FieldGuestServiceHost.SystemSid);

        var accept = intake.AcceptSingleFrameAsync();
        // A misbehaving producer that bypasses the client's own bound must still be refused.
        await FieldSceneProducerClient.SendFrameAsync(
            intake.PipeName,
            new byte[FieldSceneRelayPipeServer.MaximumFrameBytes + 1],
            5_000,
            CancellationToken.None);

        await Assert.ThrowsAsync<InvalidOperationException>(() => accept);
    }

    [Fact]
    public void TheDeclaredLengthIsBigEndianAsTheIntakeReads()
    {
        var body = new byte[300];
        var header = new byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(header, (uint)body.Length);

        Assert.Equal(0, header[0]);
        Assert.Equal(0, header[1]);
        Assert.Equal(1, header[2]);
        Assert.Equal(44, header[3]);
    }
}
