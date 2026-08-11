using System.Reflection;
using System.Text.Json;

namespace Exosuit.Agent.Tests;

/// <summary>
/// The bootstrap status the host evaluates readiness from.
///
/// The mandatory check list exists twice — a C# array in `FieldKvpRuntime` and a Zod enum in
/// `src/fieldBootstrap.ts` — maintained by hand in two languages. If they drift, the guest reports
/// `ready` while the host still requires a check the guest never ran, or the host rejects a name
/// the guest emits. Neither fails loudly.
///
/// This fixture is generated from `ReadBootstrapStatus` and `BindBootstrapToBoot`, the exact
/// functions the guest publishes from, across all three readiness outcomes.
/// </summary>
public sealed class FieldBootstrapWireContractTests
{
    private static JsonDocument ReadFixture()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "field-bootstrap-v1.json");
        Assert.True(File.Exists(path), $"Bootstrap wire contract fixture is missing at {path}");
        return JsonDocument.Parse(File.ReadAllText(path));
    }

    private static string[] LiveMandatoryChecks() =>
        (string[])typeof(FieldKvpRuntime)
            .GetField("MandatoryBootstrapChecks", BindingFlags.NonPublic | BindingFlags.Static)!
            .GetValue(null)!;

    [Fact]
    public void TheFixtureRecordsTheLiveMandatoryCheckList()
    {
        using var document = ReadFixture();
        var recorded = document.RootElement.GetProperty("mandatoryChecks")
            .EnumerateArray().Select(entry => entry.GetString()!).ToArray();

        // Closes the loop: if the C# list changes, the fixture is stale and this fails, which
        // forces the TypeScript comparison to be re-run rather than silently diverging.
        Assert.Equal(LiveMandatoryChecks(), recorded);
    }

    [Fact]
    public void EveryCaseVerifiesAsASignedBootstrapStatus()
    {
        using var document = ReadFixture();
        var root = document.RootElement;
        var cases = root.GetProperty("cases");
        Assert.Equal(3, cases.GetArrayLength());

        foreach (var testCase in cases.EnumerateArray())
        {
            var source = testCase.GetProperty("envelope");
            var field = source.GetProperty("field");
            var payload = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                source.GetProperty("payload").GetRawText(),
                new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
            var envelope = new FieldChannelEnvelope(
                source.GetProperty("contractVersion").GetInt32(),
                source.GetProperty("messageId").GetGuid(),
                new FieldReference(field.GetProperty("fieldId").GetGuid(), field.GetProperty("fieldGeneration").GetInt32()),
                FieldChannelDirection.GuestToHost,
                source.GetProperty("sequence").GetInt64(),
                FieldChannelMessageType.BootstrapStatus,
                source.GetProperty("sentAt").GetDateTimeOffset(),
                source.GetProperty("expiresAt").GetDateTimeOffset(),
                source.GetProperty("nonce").GetString()!,
                source.GetProperty("keyId").GetString()!,
                source.GetProperty("payloadHash").GetString()!,
                payload,
                source.GetProperty("signature").GetString()!);

            var verified = FieldChannelAuthentication.Verify(
                envelope, root.GetProperty("secret").GetString()!, envelope.Field,
                FieldChannelDirection.GuestToHost,
                root.GetProperty("verifyAt").GetDateTimeOffset(),
                root.GetProperty("expectedKeyId").GetString());

            Assert.Equal(FieldChannelMessageType.BootstrapStatus, verified.MessageType);
        }
    }

    [Theory]
    [InlineData("all checks pass", "ready")]
    [InlineData("one check missing", "not_ready")]
    [InlineData("one check failed", "failed")]
    public void ReadinessIsDerivedFromTheReportRatherThanAsserted(string description, string expected)
    {
        using var document = ReadFixture();
        var testCase = document.RootElement.GetProperty("cases").EnumerateArray()
            .Single(entry => entry.GetProperty("description").GetString() == description);
        var payload = testCase.GetProperty("envelope").GetProperty("payload");

        Assert.Equal(expected, payload.GetProperty("status").GetString());

        // A missing check is not the same finding as a failed one, and the payload must keep them
        // apart: a host that conflated them could not tell an incomplete bootstrap from a broken
        // Field.
        if (expected == "failed")
        {
            Assert.Equal("display_contract", payload.GetProperty("failedChecks")[0].GetString());
        }
        else
        {
            Assert.Equal(0, payload.GetProperty("failedChecks").GetArrayLength());
        }
    }

    [Fact]
    public void EveryCaseIsBoundToTheBoot()
    {
        using var document = ReadFixture();
        var expected = document.RootElement.GetProperty("bootId").GetString();

        foreach (var testCase in document.RootElement.GetProperty("cases").EnumerateArray())
        {
            // BindBootstrapToBoot exists so a report cannot be replayed into a later boot.
            Assert.Equal(expected, testCase.GetProperty("envelope").GetProperty("payload")
                .GetProperty("bootId").GetString());
        }
    }
}
