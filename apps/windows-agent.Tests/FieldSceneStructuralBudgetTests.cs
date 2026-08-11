namespace Exosuit.Agent.Tests;

/// <summary>
/// What actually fits in the 12 KiB structural budget.
///
/// These numbers were measured, not assumed, and they are pinned here because they are the
/// difference between a scene path that works on a real desktop and one that cannot produce a
/// single scene. The declared collection limits — 32 windows, 128 elements — are **unreachable**:
/// the byte budget binds first, always, and by a wide margin.
///
/// See `docs/qa/OPEN_DEFECT_2026-08-11_SCENE_STRUCTURAL_BUDGET.md`.
/// </summary>
public sealed class FieldSceneStructuralBudgetTests
{
    private static readonly FieldReference Field = new(Guid.Parse("4401b702-334f-475e-b867-b7d06798443d"), 3);
    private static readonly Guid BootId = Guid.Parse("29a19dbc-5021-4dc3-8979-0026660fad17");
    private static readonly DateTimeOffset At = DateTimeOffset.Parse("2026-08-11T12:00:00.000Z");
    private const string UserSid = "S-1-5-21-1000-1000-1000-1001";

    /// <summary>A scene of the given shape, with field widths a real desktop would produce.</summary>
    private static bool Fits(int windows, int elements)
    {
        var identity = new FieldSceneProducerIdentity(
            Field, BootId, "glove-agent", 2,
            new FieldDisplayContract(1, 1920, 1080, 100, 100, "en-US", false));

        var windowList = Enumerable.Range(0, windows).Select(index =>
            new WindowInfo($"window-{index}", "some real window title here", "explorer", 1000 + index,
                index == 0, false, new Bounds(0, 0, 1920, 1080))).ToArray();
        var elementList = Enumerable.Range(0, elements).Select(index =>
            new UiElement($"element-{index}", "window-0", "Some Control Name", "Button",
                $"automation-id-{index}", "value text", true, index == 0, false, false,
                new Bounds(10, 10, 120, 32), ElementSource.Accessibility, [ActionType.InvokeElement])).ToArray();

        var observation = new DesktopObservation(
            "observation-1", At, ControlMode.Observe, "windows-ui-automation",
            windowList[0], windowList, elementList, null, null, []);

        try
        {
            FieldSceneProducerBoundary.Create(
                identity, observation, new FieldSceneCursor(0, 0, false), new FieldSceneModal(false),
                UserSid, 2, At);
            return true;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }

    [Theory]
    [InlineData(1, 39)]
    [InlineData(3, 38)]
    [InlineData(5, 37)]
    [InlineData(10, 34)]
    public void TheMeasuredElementCeilingHoldsAtEachWindowCount(int windows, int ceiling)
    {
        // Pinned so a change to the payload shape, the field set, or the budget shows up as a
        // number rather than as a live session that produces nothing.
        Assert.True(Fits(windows, ceiling), $"{windows} windows / {ceiling} elements should fit");
        Assert.False(Fits(windows, ceiling + 1), $"{windows} windows / {ceiling + 1} elements should not fit");
    }

    [Fact]
    public void TheDeclaredCollectionLimitsAreUnreachable()
    {
        // MaximumElements is 128 and MaximumWindows is 32, and neither can ever be reached: the
        // byte budget rejects first. A reader of those constants would reasonably believe a
        // 128-element scene is supported. It is not, by roughly a factor of three.
        Assert.False(Fits(1, FieldSceneProducerBoundary.MaximumElements));
        Assert.False(Fits(FieldSceneProducerBoundary.MaximumWindows, 34));
    }

    [Fact]
    public void ARealisticDesktopDoesNotFit()
    {
        // A single application window commonly exposes well over a hundred automation elements.
        // This is the case the live session will hit on its first observation.
        Assert.False(Fits(3, 60));
    }

    [Fact]
    public void TheBoundaryRejectsRatherThanTruncating()
    {
        // Deliberate, and correct: a silently truncated scene is a partial view of the desktop
        // that looks complete, and acting on one could target the wrong thing. The consequence is
        // that oversize means *no scene*, not a smaller scene.
        var failure = Assert.Throws<InvalidOperationException>(() =>
        {
            var identity = new FieldSceneProducerIdentity(
                Field, BootId, "glove-agent", 2,
                new FieldDisplayContract(1, 1920, 1080, 100, 100, "en-US", false));
            var window = new WindowInfo("window-0", "title", "explorer", 1, true, false, new Bounds(0, 0, 1920, 1080));
            var elements = Enumerable.Range(0, 60).Select(index =>
                new UiElement($"element-{index}", "window-0", "Some Control Name", "Button",
                    $"automation-id-{index}", "value text", true, false, false, false,
                    new Bounds(10, 10, 120, 32), ElementSource.Accessibility, [ActionType.InvokeElement])).ToArray();
            FieldSceneProducerBoundary.Create(
                identity,
                new DesktopObservation("observation-1", At, ControlMode.Observe, "windows-ui-automation",
                    window, [window], elements, null, null, []),
                new FieldSceneCursor(0, 0, false), new FieldSceneModal(false), UserSid, 2, At);
        });

        Assert.Contains("12 KiB", failure.Message, StringComparison.Ordinal);
    }
}
