using System.Text;
using System.Text.Json;

namespace Exosuit.Agent.Tests;

public sealed class FieldSceneRelayBoundaryTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-08-10T21:00:01.000Z");
    private static readonly FieldReference Field = new(Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), 5);
    private static readonly Guid BootId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly FieldDisplayContract Display = new(1, 1920, 1080, 100, 100, "en-US", false);
    private const string UserSid = "S-1-5-21-1000-1000-1000-1001";
    private const string Digest = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private const string Secret = "field-scene-relay-secret-that-is-at-least-thirty-two-characters";
    private const string AgentPath = @"C:\Exosuit\Agent\Exosuit.Agent.exe";

    [Fact]
    public void SystemRelayRevalidatesAndSignsExactPolicyBoundStructuralPayload()
    {
        var envelope = Accept(PayloadBytes(), Policy(), Client());

        Assert.Equal(FieldChannelMessageType.SceneObservation, envelope.MessageType);
        Assert.Equal(Field, envelope.Field);
        Assert.Equal(BootId, envelope.Payload["bootId"] is JsonElement boot ? boot.GetGuid() : Guid.Empty);
        Assert.Equal(Now.AddSeconds(10), envelope.ExpiresAt);
        Assert.DoesNotContain("private", FieldKvpRuntime.SerializeEnvelope(envelope), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void RejectsWrongRelayClientSessionUserPathDigestAndPayloadIdentity()
    {
        Assert.Throws<InvalidOperationException>(() => Accept(PayloadBytes(), Policy(), Client(), relaySid: UserSid));
        Assert.Throws<InvalidOperationException>(() => Accept(PayloadBytes(), Policy(), Client() with { WindowsSessionId = 3 }));
        Assert.Throws<InvalidOperationException>(() => Accept(PayloadBytes(), Policy(), Client() with { UserSid = "S-1-5-21-9-9-9-9" }));
        Assert.Throws<InvalidOperationException>(() => Accept(PayloadBytes(), Policy(), Client() with { ExecutablePath = @"C:\Temp\agent.exe" }));
        Assert.Throws<InvalidOperationException>(() => Accept(PayloadBytes(), Policy(), Client() with { ExecutableSha256 = new string('b', 64) }));
        Assert.Throws<InvalidOperationException>(() => Accept(PayloadBytes(BootId.ToString(), Guid.NewGuid().ToString()), Policy(), Client()));
    }

    [Fact]
    public void RejectsDuplicateUnknownNoncanonicalPrivateAndOversizedPayloadBeforeSigning()
    {
        var valid = Encoding.UTF8.GetString(PayloadBytes());
        Assert.Throws<InvalidOperationException>(() => Accept(Encoding.UTF8.GetBytes(valid.Insert(1, "\"contractVersion\":1,")), Policy(), Client()));
        Assert.Throws<JsonException>(() => Accept(Encoding.UTF8.GetBytes(valid.Insert(valid.Length - 1, ",\"unknown\":true")), Policy(), Client()));
        Assert.Throws<InvalidOperationException>(() => Accept(
            Encoding.UTF8.GetBytes(valid.Replace(
                "UI text and provider warning text were removed before structural Field scene transport.",
                "private provider warning", StringComparison.Ordinal)), Policy(), Client()));
        Assert.Throws<InvalidOperationException>(() => Accept(new byte[FieldSceneProducerBoundary.MaximumStructuralPayloadBytes + 1], Policy(), Client()));
    }

    private static FieldChannelEnvelope Accept(
        byte[] bytes,
        FieldSceneRelayPolicy policy,
        FieldSceneRelayClientFacts client,
        string relaySid = FieldGuestServiceHost.SystemSid) =>
        FieldSceneRelayBoundary.AcceptAndSign(policy, client, Channel(), Secret, 42, bytes, relaySid, Now);

    private static FieldSceneRelayPolicy Policy() => new(
        Field, BootId, "glove-agent", 2, UserSid, Display, AgentPath, Digest);

    private static FieldSceneRelayClientFacts Client() => new(123, 2, UserSid, AgentPath, Digest);

    private static FieldKvpRuntimeConfiguration Channel() => new(
        1, Field, "glove-agent", "scene-key-1", @"C:\Exosuit\Config\channel-secret.txt",
        @"C:\Exosuit\Logs\bootstrap-report.json", 1_000);

    private static byte[] PayloadBytes(string? oldBoot = null, string? newBoot = null)
    {
        var window = new WindowInfo("window-1", "private title", "notepad", 10, true, false, new Bounds(0, 0, 800, 600));
        var observation = new DesktopObservation(
            "observation-1", Now.AddSeconds(-1), ControlMode.Observe, "windows-ui-automation", window, [window],
            [new UiElement("element-1", "window-1", "private name", "Button", "save", "private value", true, true, false, false,
                new Bounds(10, 10, 100, 30), ElementSource.Accessibility, [ActionType.InvokeElement])], null, null, []);
        var payload = FieldSceneProducerBoundary.Create(
            new FieldSceneProducerIdentity(Field, BootId, "glove-agent", 2, Display), observation,
            new FieldSceneCursor(100, 100, true), new FieldSceneModal(false), UserSid, 2, Now);
        var json = JsonSerializer.Serialize(FieldSceneProducerBoundary.ToChannelPayload(payload));
        if (oldBoot is not null && newBoot is not null) json = json.Replace(oldBoot, newBoot, StringComparison.Ordinal);
        return Encoding.UTF8.GetBytes(json);
    }
}
