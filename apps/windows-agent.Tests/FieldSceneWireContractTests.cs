using System.Text.Json;

namespace Exosuit.Agent.Tests;

/// <summary>
/// The scene half of the cross-language wire contract.
///
/// `FieldChannelWireContractTests` already pins a signed **heartbeat** across both languages, so
/// the envelope machinery is bound. Nothing pinned a **scene observation**, which is the whole
/// point of this path: the structural scene representation is produced by
/// `FieldSceneProducerBoundary` in C# and consumed by `FieldSceneChannelReceiver` in TypeScript,
/// and those two agreed only because each was written from the same description.
///
/// This file asserts the C# side verifies the fixture; `tests/fieldSceneWireContract.test.ts`
/// asserts the TypeScript receiver accepts the same bytes. A drift in either fails one of them.
/// </summary>
public sealed class FieldSceneWireContractTests
{
    private static JsonDocument ReadFixture()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "field-scene-v1.json");
        Assert.True(File.Exists(path), $"Scene wire contract fixture is missing at {path}");
        return JsonDocument.Parse(File.ReadAllText(path));
    }

    private static FieldChannelEnvelope ReadEnvelope(JsonElement root)
    {
        var source = root.GetProperty("envelope");
        var field = source.GetProperty("field");
        var payload = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            source.GetProperty("payload").GetRawText(),
            new JsonSerializerOptions(JsonSerializerDefaults.Web))!;

        return new FieldChannelEnvelope(
            source.GetProperty("contractVersion").GetInt32(),
            source.GetProperty("messageId").GetGuid(),
            new FieldReference(field.GetProperty("fieldId").GetGuid(), field.GetProperty("fieldGeneration").GetInt32()),
            FieldChannelDirection.GuestToHost,
            source.GetProperty("sequence").GetInt64(),
            FieldChannelMessageType.SceneObservation,
            source.GetProperty("sentAt").GetDateTimeOffset(),
            source.GetProperty("expiresAt").GetDateTimeOffset(),
            source.GetProperty("nonce").GetString()!,
            source.GetProperty("keyId").GetString()!,
            source.GetProperty("payloadHash").GetString()!,
            payload,
            source.GetProperty("signature").GetString()!);
    }

    [Fact]
    public void VerifiesTheCanonicalSignedSceneEnvelope()
    {
        using var document = ReadFixture();
        var root = document.RootElement;

        var verified = FieldChannelAuthentication.Verify(
            ReadEnvelope(root),
            root.GetProperty("secret").GetString()!,
            ReadEnvelope(root).Field,
            FieldChannelDirection.GuestToHost,
            root.GetProperty("verifyAt").GetDateTimeOffset(),
            root.GetProperty("expectedKeyId").GetString());

        Assert.Equal(FieldChannelMessageType.SceneObservation, verified.MessageType);
        Assert.Equal(7, verified.Sequence);
    }

    [Fact]
    public void TheFixtureCarriesNoUiText()
    {
        using var document = ReadFixture();
        var json = document.RootElement.GetProperty("envelope").GetRawText();

        // The fixture was generated from a scene whose source observation contained a window
        // title, an element name, and a password value. If any of them survive into the wire
        // representation, the producer boundary has stopped sanitizing and this fixture is the
        // place it shows.
        Assert.DoesNotContain("private title", json, StringComparison.Ordinal);
        Assert.DoesNotContain("must-not-pass", json, StringComparison.Ordinal);
        Assert.DoesNotContain("screenshotBase64", json, StringComparison.Ordinal);
        Assert.DoesNotContain("screenshotMimeType", json, StringComparison.Ordinal);
    }

    [Fact]
    public void TheFixturePreservesStructureWithoutContent()
    {
        using var document = ReadFixture();
        var observation = document.RootElement
            .GetProperty("envelope").GetProperty("payload").GetProperty("observation");

        // Structure survives — that is what a scene is for. Only the text is gone.
        Assert.Equal("windows-ui-automation", observation.GetProperty("provider").GetString());
        Assert.Equal(1, observation.GetProperty("windows").GetArrayLength());
        Assert.Equal(2, observation.GetProperty("elements").GetArrayLength());
        Assert.Equal(string.Empty, observation.GetProperty("windows")[0].GetProperty("title").GetString());
        Assert.Equal("[SENSITIVE]", observation.GetProperty("elements")[1].GetProperty("name").GetString());
    }

    [Fact]
    public void RejectsTheFixtureUnderTheWrongKeyId()
    {
        using var document = ReadFixture();
        var root = document.RootElement;

        // A fixture that verified under any key would prove nothing about key binding.
        Assert.ThrowsAny<Exception>(() => FieldChannelAuthentication.Verify(
            ReadEnvelope(root),
            root.GetProperty("secret").GetString()!,
            ReadEnvelope(root).Field,
            FieldChannelDirection.GuestToHost,
            root.GetProperty("verifyAt").GetDateTimeOffset(),
            "some-other-key"));
    }

    [Fact]
    public void RejectsTheFixtureUnderTheWrongSecret()
    {
        using var document = ReadFixture();
        var root = document.RootElement;

        Assert.ThrowsAny<Exception>(() => FieldChannelAuthentication.Verify(
            ReadEnvelope(root),
            "a-different-secret-that-is-also-at-least-thirty-two-characters",
            ReadEnvelope(root).Field,
            FieldChannelDirection.GuestToHost,
            root.GetProperty("verifyAt").GetDateTimeOffset(),
            root.GetProperty("expectedKeyId").GetString()));
    }
}
