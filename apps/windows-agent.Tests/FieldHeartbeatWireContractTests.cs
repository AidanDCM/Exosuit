using System.Text.Json;

namespace Exosuit.Agent.Tests;

/// <summary>
/// The heartbeat the host actually keys readiness off.
///
/// `field-channel-v1.json` pins a hand-authored heartbeat envelope, which proves the envelope
/// machinery agrees across languages. It does not prove that the payload the **guest runtime
/// builds** is the payload the host schema parses — that shape was inline in the runtime loop and
/// untestable until it was extracted.
///
/// This fixture is generated from `FieldKvpRuntime.BuildHeartbeatPayload`, the exact function the
/// guest publishes from. `tests/fieldHeartbeatWireContract.test.ts` parses the same file with the
/// host schema and drives the host monitor with it.
/// </summary>
public sealed class FieldHeartbeatWireContractTests
{
    private static JsonDocument ReadFixture()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "field-heartbeat-v1.json");
        Assert.True(File.Exists(path), $"Heartbeat wire contract fixture is missing at {path}");
        return JsonDocument.Parse(File.ReadAllText(path));
    }

    private static FieldChannelEnvelope ReadEnvelope(JsonElement source)
    {
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
            FieldChannelMessageType.Heartbeat,
            source.GetProperty("sentAt").GetDateTimeOffset(),
            source.GetProperty("expiresAt").GetDateTimeOffset(),
            source.GetProperty("nonce").GetString()!,
            source.GetProperty("keyId").GetString()!,
            source.GetProperty("payloadHash").GetString()!,
            payload,
            source.GetProperty("signature").GetString()!);
    }

    [Fact]
    public void EveryFixtureCaseVerifies()
    {
        using var document = ReadFixture();
        var root = document.RootElement;
        var cases = root.GetProperty("cases");
        Assert.Equal(3, cases.GetArrayLength());

        foreach (var testCase in cases.EnumerateArray())
        {
            var envelope = ReadEnvelope(testCase.GetProperty("envelope"));
            var verified = FieldChannelAuthentication.Verify(
                envelope,
                root.GetProperty("secret").GetString()!,
                envelope.Field,
                FieldChannelDirection.GuestToHost,
                root.GetProperty("verifyAt").GetDateTimeOffset(),
                root.GetProperty("expectedKeyId").GetString());

            Assert.Equal(FieldChannelMessageType.Heartbeat, verified.MessageType);
        }
    }

    [Fact]
    public void TheBuilderStillProducesTheFixturePayloads()
    {
        using var document = ReadFixture();
        var root = document.RootElement;
        var field = new FieldReference(
            root.GetProperty("field").GetProperty("fieldId").GetGuid(),
            root.GetProperty("field").GetProperty("fieldGeneration").GetInt32());
        var bootId = root.GetProperty("bootId").GetGuid();
        var configuration = new FieldKvpRuntimeConfiguration(1, field, "glove-agent", "hb-key-1", "s", "b", 1000);
        var observedAt = DateTimeOffset.Parse("2026-08-11T12:00:01.000Z");

        var expectations = new[] { (true, false, false), (false, true, false), (false, false, true) };
        var cases = root.GetProperty("cases").EnumerateArray().ToArray();

        for (var index = 0; index < cases.Length; index++)
        {
            var (ready, locked, secure) = expectations[index];
            var built = FieldKvpRuntime.BuildHeartbeatPayload(
                configuration, bootId, index, observedAt, ready, locked, secure, 123456789L);

            // Canonical form, so a reordering is not treated as a change but a value shift is.
            var fixturePayload = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                cases[index].GetProperty("envelope").GetProperty("payload").GetRawText(),
                new JsonSerializerOptions(JsonSerializerDefaults.Web))!;

            Assert.Equal(
                CanonicalJsonOf(fixturePayload),
                CanonicalJsonOf(built));
        }
    }

    [Fact]
    public void TimestampsAreCanonicalInEveryCase()
    {
        using var document = ReadFixture();
        foreach (var testCase in document.RootElement.GetProperty("cases").EnumerateArray())
        {
            var envelope = testCase.GetProperty("envelope");
            // The defect that blocked the scene path was a non-canonical timestamp. Pin it here
            // too, at both the envelope and payload level.
            Assert.EndsWith("Z", envelope.GetProperty("sentAt").GetString()!, StringComparison.Ordinal);
            Assert.EndsWith("Z", envelope.GetProperty("payload").GetProperty("observedAt").GetString()!, StringComparison.Ordinal);
            Assert.DoesNotContain("+", envelope.GetProperty("payload").GetProperty("observedAt").GetString()!, StringComparison.Ordinal);
        }
    }

    private static string CanonicalJsonOf(object value)
    {
        var type = typeof(FieldChannelEnvelope).Assembly.GetType("Exosuit.Agent.CanonicalJson")!;
        return (string)type.GetMethod("Serialize")!.Invoke(null, new[] { value })!;
    }
}
