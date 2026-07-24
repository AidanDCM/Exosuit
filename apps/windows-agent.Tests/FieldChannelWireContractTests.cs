using System.Text.Json;

namespace Exosuit.Agent.Tests;

public sealed class FieldChannelWireContractTests
{
    [Fact]
    public void TypeScript_and_dotnet_verify_the_same_signed_channel_envelope()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "field-channel-v1.json");
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        var source = root.GetProperty("envelope");
        var field = source.GetProperty("field");
        var payload = JsonSerializer.Deserialize<Dictionary<string, object?>>(source.GetProperty("payload").GetRawText(), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        var envelope = new FieldChannelEnvelope(
            source.GetProperty("contractVersion").GetInt32(),
            source.GetProperty("messageId").GetGuid(),
            new FieldReference(field.GetProperty("fieldId").GetGuid(), field.GetProperty("fieldGeneration").GetInt32()),
            source.GetProperty("direction").GetString() == "guest_to_host" ? FieldChannelDirection.GuestToHost : FieldChannelDirection.HostToGuest,
            source.GetProperty("sequence").GetInt64(),
            FieldChannelMessageType.Heartbeat,
            FieldChannelAuthentication.ParseWireTimestamp(source.GetProperty("sentAt").GetString()!),
            FieldChannelAuthentication.ParseWireTimestamp(source.GetProperty("expiresAt").GetString()!),
            source.GetProperty("nonce").GetString()!,
            source.GetProperty("keyId").GetString()!,
            source.GetProperty("payloadHash").GetString()!,
            payload,
            source.GetProperty("signature").GetString()!);

        var verified = FieldChannelAuthentication.Verify(
            envelope,
            root.GetProperty("secret").GetString()!,
            envelope.Field,
            FieldChannelDirection.GuestToHost,
            FieldChannelAuthentication.ParseWireTimestamp(root.GetProperty("verifyAt").GetString()!),
            root.GetProperty("expectedKeyId").GetString());

        Assert.Equal(7, verified.Sequence);
        Assert.Equal("1b5130072c4824e9ff4bbed304a0cec7825e64cdd49bddc0b25db0dadc5d2471", verified.PayloadHash);
    }
}
