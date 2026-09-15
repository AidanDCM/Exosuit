namespace Exosuit.Agent.Tests;

public sealed class FieldSceneKvpPublishTests
{
    private static readonly FieldReference Field = new(Guid.Parse("4401b702-334f-475e-b867-b7d06798443d"), 3);

    private static FieldKvpRuntimeConfiguration Configuration(FieldReference? field = null) =>
        new(1, field ?? Field, "agent-1", "key-1", "secret.bin", "bootstrap.json", 1_000);

    private static FieldChannelEnvelope Envelope(
        FieldChannelMessageType messageType = FieldChannelMessageType.SceneObservation,
        FieldReference? field = null) =>
        new(
            ContractVersion: 1,
            MessageId: Guid.NewGuid(),
            Field: field ?? Field,
            Direction: FieldChannelDirection.GuestToHost,
            Sequence: 1,
            MessageType: messageType,
            SentAt: DateTimeOffset.UtcNow,
            ExpiresAt: DateTimeOffset.UtcNow.AddMinutes(1),
            Nonce: "nonce",
            KeyId: "key-1",
            PayloadHash: new string('a', 64),
            Payload: new Dictionary<string, object?> { ["contractVersion"] = 1 },
            Signature: "signature");

    [Fact]
    public void RejectsNonSystemCaller()
    {
        if (!OperatingSystem.IsWindows()) return;
        Assert.Throws<InvalidOperationException>(() =>
            FieldKvpRuntime.PublishScene(Configuration(), Envelope(), "S-1-5-21-1000-1000-1000-1001"));
    }

    [Theory]
    [InlineData(FieldChannelMessageType.Heartbeat)]
    [InlineData(FieldChannelMessageType.Handshake)]
    [InlineData(FieldChannelMessageType.BootstrapStatus)]
    public void RefusesToPublishAnythingButASceneOnTheSceneValue(FieldChannelMessageType messageType)
    {
        if (!OperatingSystem.IsWindows()) return;
        // A writer that publishes whatever it is handed is a second signing path in all but
        // name, so the message type is checked here as well as at the relay boundary.
        Assert.Throws<InvalidOperationException>(() =>
            FieldKvpRuntime.PublishScene(
                Configuration(), Envelope(messageType), FieldGuestServiceHost.SystemSid));
    }

    [Fact]
    public void RefusesASceneBoundToADifferentGeneration()
    {
        if (!OperatingSystem.IsWindows()) return;
        var otherGeneration = Field with { FieldGeneration = 4 };
        Assert.Throws<InvalidOperationException>(() =>
            FieldKvpRuntime.PublishScene(
                Configuration(), Envelope(field: otherGeneration), FieldGuestServiceHost.SystemSid));
    }

    [Fact]
    public void RefusesASceneBoundToADifferentField()
    {
        if (!OperatingSystem.IsWindows()) return;
        var otherField = new FieldReference(Guid.NewGuid(), Field.FieldGeneration);
        Assert.Throws<InvalidOperationException>(() =>
            FieldKvpRuntime.PublishScene(
                Configuration(), Envelope(field: otherField), FieldGuestServiceHost.SystemSid));
    }

    [Fact]
    public void SceneValueNameIsDistinctFromTheControlChannelValues()
    {
        Assert.NotEqual(FieldKvpRuntime.SceneValueName, FieldKvpRuntime.HeartbeatValueName);
        Assert.NotEqual(FieldKvpRuntime.SceneValueName, FieldKvpRuntime.HandshakeValueName);
        Assert.NotEqual(FieldKvpRuntime.SceneValueName, FieldKvpRuntime.BootstrapValueName);
    }
}
