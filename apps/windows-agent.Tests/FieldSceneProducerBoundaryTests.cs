using System.Text.Json;

namespace Exosuit.Agent.Tests;

public sealed class FieldSceneProducerBoundaryTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-08-10T20:00:01.000Z");
    private static readonly FieldReference Field = new(Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), 3);
    private static readonly FieldDisplayContract Display = new(1, 1920, 1080, 100, 100, "en-US", false);
    private static readonly FieldSceneProducerIdentity Identity = new(Field, Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), "glove-agent", 2, Display);
    private const string UserSid = "S-1-5-21-1000-1000-1000-1001";

    [Fact]
    public void CreatesBoundedStructuralOnlyPayloadForTheExactInteractiveSession()
    {
        var payload = FieldSceneProducerBoundary.Create(
            Identity, Observation() with { Warnings = ["private warning content"] },
            new FieldSceneCursor(100, 100, true), new FieldSceneModal(false), UserSid, 2, Now);
        var channel = FieldSceneProducerBoundary.ToChannelPayload(payload);
        var json = JsonSerializer.Serialize(channel);

        Assert.Equal(Field, Identity.Field);
        Assert.Equal("2", payload.WindowsSessionId);
        Assert.Equal(string.Empty, payload.Observation.Windows[0].Title);
        Assert.Equal(string.Empty, payload.Observation.Elements[0].Name);
        Assert.Null(payload.Observation.Elements[0].Value);
        Assert.Equal("[SENSITIVE]", payload.Observation.Elements[1].Name);
        Assert.Null(payload.Observation.Elements[1].AutomationId);
        Assert.Empty(payload.Observation.Elements[1].SupportedActions);
        Assert.DoesNotContain("private title", json, StringComparison.Ordinal);
        Assert.DoesNotContain("private value", json, StringComparison.Ordinal);
        Assert.DoesNotContain("must-not-pass", json, StringComparison.Ordinal);
        Assert.DoesNotContain("private warning content", json, StringComparison.Ordinal);
        Assert.DoesNotContain("screenshotBase64", json, StringComparison.Ordinal);
        Assert.DoesNotContain("screenshotMimeType", json, StringComparison.Ordinal);
        Assert.True(System.Text.Encoding.UTF8.GetByteCount(json) <= FieldSceneProducerBoundary.MaximumStructuralPayloadBytes);
    }

    [Fact]
    public void RejectsSystemWrongSessionWrongProviderMutationModeScreenshotsAndStaleObservation()
    {
        var cursor = new FieldSceneCursor(1, 1, true);
        var modal = new FieldSceneModal(false);
        Assert.Throws<InvalidOperationException>(() => FieldSceneProducerBoundary.Create(Identity, Observation(), cursor, modal, FieldGuestServiceHost.SystemSid, 2, Now));
        Assert.Throws<InvalidOperationException>(() => FieldSceneProducerBoundary.Create(Identity, Observation(), cursor, modal, UserSid, 1, Now));
        Assert.Throws<InvalidOperationException>(() => FieldSceneProducerBoundary.Create(Identity, Observation() with { Provider = "fake" }, cursor, modal, UserSid, 2, Now));
        Assert.Throws<InvalidOperationException>(() => FieldSceneProducerBoundary.Create(Identity, Observation() with { Mode = ControlMode.Scoped }, cursor, modal, UserSid, 2, Now));
        Assert.Throws<InvalidOperationException>(() => FieldSceneProducerBoundary.Create(Identity, Observation() with { ScreenshotBase64 = "abc" }, cursor, modal, UserSid, 2, Now));
        Assert.Throws<InvalidOperationException>(() => FieldSceneProducerBoundary.Create(Identity, Observation() with { CapturedAt = Now.AddMinutes(-1) }, cursor, modal, UserSid, 2, Now));
    }

    [Fact]
    public void RejectsCollectionByteIdentityCursorModalAndGraphOverflowWithoutTruncation()
    {
        var cursor = new FieldSceneCursor(1, 1, true);
        Assert.Throws<InvalidOperationException>(() => FieldSceneProducerBoundary.Create(
            Identity, Observation() with { Elements = Enumerable.Repeat(Observation().Elements[0], FieldSceneProducerBoundary.MaximumElements + 1).ToArray() },
            cursor, new FieldSceneModal(false), UserSid, 2, Now));
        Assert.Throws<InvalidOperationException>(() => FieldSceneProducerBoundary.Create(
            Identity, Observation() with { Elements = Enumerable.Range(0, FieldSceneProducerBoundary.MaximumElements)
                .Select(index => Observation().Elements[0] with { Id = $"element-{index}", AutomationId = new string('a', 300) }).ToArray() },
            cursor, new FieldSceneModal(false), UserSid, 2, Now));
        Assert.Throws<InvalidOperationException>(() => FieldSceneProducerBoundary.Create(
            Identity, Observation(), new FieldSceneCursor(1920, 1, true), new FieldSceneModal(false), UserSid, 2, Now));
        Assert.Throws<InvalidOperationException>(() => FieldSceneProducerBoundary.Create(
            Identity, Observation(), cursor, new FieldSceneModal(true, "missing"), UserSid, 2, Now));
        Assert.Throws<InvalidOperationException>(() => FieldSceneProducerBoundary.Create(
            Identity, Observation() with { Elements = [Observation().Elements[0] with { WindowId = "missing" }] },
            cursor, new FieldSceneModal(false), UserSid, 2, Now));
        Assert.Throws<InvalidOperationException>(() => FieldSceneProducerBoundary.Create(
            Identity, Observation() with { ActiveWindow = Observation().ActiveWindow! with { ProcessId = 99 } },
            cursor, new FieldSceneModal(false), UserSid, 2, Now));
    }

    private static DesktopObservation Observation()
    {
        var window = new WindowInfo("window-1", "private title", "notepad", 10, true, false, new Bounds(0, 0, 800, 600));
        return new DesktopObservation(
            "observation-1", Now.AddSeconds(-1), ControlMode.Observe, "windows-ui-automation", window, [window],
            [
                new UiElement("element-1", "window-1", "customer name", "Edit", "customer", "private value", true, true, false, false,
                    new Bounds(10, 10, 200, 30), ElementSource.Accessibility, [ActionType.SetElementValue]),
                new UiElement("element-2", "window-1", "password", "Edit", "password", "must-not-pass", true, false, false, true,
                    new Bounds(10, 50, 200, 30), ElementSource.Accessibility, [ActionType.SetElementValue]),
            ], null, null, []);
    }
}
