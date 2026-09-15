using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Exosuit.Agent;

public sealed record FieldSceneCursor(double X, double Y, bool Visible);
public sealed record FieldSceneModal(bool Present, string? WindowId = null, string? Kind = null);

public sealed record FieldSceneProducerIdentity(
    FieldReference Field,
    Guid BootId,
    string AgentId,
    int WindowsSessionId,
    FieldDisplayContract Display);

public sealed record StructuralFieldScenePayload(
    int ContractVersion,
    Guid BootId,
    string AgentId,
    string WindowsSessionId,
    DesktopObservation Observation,
    FieldSceneCursor Cursor,
    FieldSceneModal Modal);

public static class FieldSceneProducerBoundary
{
    public const int MaximumStructuralPayloadBytes = 12 * 1024;
    public const int MaximumWindows = 32;
    public const int MaximumElements = 128;
    public const int MaximumWarnings = 20;
    private static readonly JsonSerializerOptions WireJson = CreateWireJson();

    public static StructuralFieldScenePayload Create(
        FieldSceneProducerIdentity identity,
        DesktopObservation observation,
        FieldSceneCursor cursor,
        FieldSceneModal modal,
        string? callerSid,
        int processSessionId,
        DateTimeOffset? now = null,
        TimeSpan? maximumAge = null)
    {
        identity.Field.Validate();
        identity.Display.Validate();
        if (identity.BootId == Guid.Empty) throw new InvalidOperationException("Scene producer boot ID cannot be empty.");
        RequireText(identity.AgentId, 200, "Scene producer agent ID");
        if (identity.WindowsSessionId <= 0) throw new InvalidOperationException("Scene producer Windows session ID must be positive.");
        if (string.IsNullOrWhiteSpace(callerSid)) throw new InvalidOperationException("Scene producer caller SID is required.");
        if (string.Equals(callerSid, FieldGuestServiceHost.SystemSid, StringComparison.Ordinal))
            throw new InvalidOperationException("The LocalSystem Field runtime cannot produce an interactive desktop scene.");
        _ = new SecurityIdentifier(callerSid);
        if (processSessionId != identity.WindowsSessionId)
            throw new InvalidOperationException("Scene producer process is not running in the configured interactive Windows session.");
        if (!string.Equals(observation.Provider, "windows-ui-automation", StringComparison.Ordinal))
            throw new InvalidOperationException("Structural Field scenes require the Windows UI Automation provider.");
        if (observation.Mode != ControlMode.Observe)
            throw new InvalidOperationException("The initial structural scene producer is observe-only.");
        if (observation.ScreenshotBase64 is not null || observation.ScreenshotMimeType is not null)
            throw new InvalidOperationException("Structural Field scene transport forbids screenshots.");
        if (observation.Windows.Count > MaximumWindows || observation.Elements.Count > MaximumElements ||
            observation.Warnings.Count > MaximumWarnings)
            throw new InvalidOperationException("Structural Field scene collection exceeds its transport bound.");

        var observedAt = observation.CapturedAt;
        var current = now ?? DateTimeOffset.UtcNow;
        var allowedAge = maximumAge ?? TimeSpan.FromSeconds(5);
        if (allowedAge < TimeSpan.FromMilliseconds(100) || allowedAge > TimeSpan.FromMinutes(1))
            throw new ArgumentOutOfRangeException(nameof(maximumAge), "Scene observation age must be from 100 milliseconds through one minute.");
        if (observedAt > current.AddSeconds(2) || current - observedAt > allowedAge)
            throw new InvalidOperationException("Scene producer observation is stale or too far in the future.");

        RequireText(observation.ObservationId, 300, "Scene observation ID");
        var windows = observation.Windows.Select(window => SanitizeWindow(window, identity.Display)).ToArray();
        var windowIds = windows.Select(static window => window.Id).ToHashSet(StringComparer.Ordinal);
        if (windowIds.Count != windows.Length) throw new InvalidOperationException("Structural scene window IDs must be unique.");
        if (observation.ActiveWindow is not null && !windowIds.Contains(observation.ActiveWindow.Id))
            throw new InvalidOperationException("Structural scene active window must be present in the window collection.");
        var sanitizedActiveWindow = observation.ActiveWindow is null ? null : SanitizeWindow(observation.ActiveWindow, identity.Display);
        if (sanitizedActiveWindow is not null && !windows.Contains(sanitizedActiveWindow))
            throw new InvalidOperationException("Structural scene active-window facts must match its listed window.");
        var activeCount = windows.Count(static window => window.IsActive);
        if (activeCount > 1 || (observation.ActiveWindow is null) != (activeCount == 0) ||
            (observation.ActiveWindow is not null && !windows.Any(window => window.IsActive && window.Id == observation.ActiveWindow.Id)))
            throw new InvalidOperationException("Structural scene active-window identity is inconsistent.");

        var elements = observation.Elements.Select(element => SanitizeElement(element, windowIds, identity.Display)).ToArray();
        if (elements.Select(static element => element.Id).Distinct(StringComparer.Ordinal).Count() != elements.Length)
            throw new InvalidOperationException("Structural scene element IDs must be unique.");
        ValidateCursor(cursor, identity.Display);
        ValidateModal(modal, windowIds);

        var sanitizedObservation = observation with
        {
            ActiveWindow = sanitizedActiveWindow,
            Windows = windows,
            Elements = elements,
            ScreenshotBase64 = null,
            ScreenshotMimeType = null,
            Warnings = ["UI text and provider warning text were removed before structural Field scene transport."],
        };
        var payload = new StructuralFieldScenePayload(
            1, identity.BootId, identity.AgentId, identity.WindowsSessionId.ToString(
                System.Globalization.CultureInfo.InvariantCulture), sanitizedObservation, cursor, modal);
        if (Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(payload, WireJson)) > MaximumStructuralPayloadBytes)
            throw new InvalidOperationException("Structural Field scene payload exceeds the 12 KiB transport budget.");
        return payload;
    }

    public static IReadOnlyDictionary<string, object?> ToChannelPayload(StructuralFieldScenePayload payload)
    {
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(payload, WireJson));
        return document.RootElement.EnumerateObject().ToDictionary(
            static property => property.Name,
            static property => (object?)property.Value.Clone(),
            StringComparer.Ordinal);
    }

    private static WindowInfo SanitizeWindow(WindowInfo window, FieldDisplayContract display)
    {
        RequireText(window.Id, 300, "Scene window ID");
        RequireText(window.ProcessName, 200, "Scene process name");
        if (window.ProcessId < 0) throw new InvalidOperationException("Scene process ID cannot be negative.");
        ValidateBounds(window.Bounds, "window", display);
        return window with { Title = string.Empty };
    }

    private static UiElement SanitizeElement(UiElement element, IReadOnlySet<string> windowIds, FieldDisplayContract display)
    {
        RequireText(element.Id, 300, "Scene element ID");
        RequireText(element.WindowId, 300, "Scene element window ID");
        RequireText(element.ControlType, 200, "Scene control type");
        if (!windowIds.Contains(element.WindowId)) throw new InvalidOperationException("Every structural scene element must belong to a listed window.");
        if (element.AutomationId is { } automationId) RequireText(automationId, 300, "Scene automation ID");
        ValidateBounds(element.Bounds, "element", display);
        return element.IsSensitive
            ? element with { Name = "[SENSITIVE]", AutomationId = null, Value = null, SupportedActions = Array.Empty<ActionType>() }
            : element with { Name = string.Empty, Value = null };
    }

    private static void ValidateCursor(FieldSceneCursor cursor, FieldDisplayContract display)
    {
        if (!double.IsFinite(cursor.X) || !double.IsFinite(cursor.Y) || cursor.X < 0 || cursor.Y < 0 ||
            cursor.X >= display.Width || cursor.Y >= display.Height)
            throw new InvalidOperationException("Scene cursor must remain inside the configured display.");
    }

    private static void ValidateModal(FieldSceneModal modal, IReadOnlySet<string> windowIds)
    {
        if (modal.Present && (string.IsNullOrWhiteSpace(modal.WindowId) || !windowIds.Contains(modal.WindowId)))
            throw new InvalidOperationException("A present scene modal must bind a listed window.");
        if (!modal.Present && (modal.WindowId is not null || modal.Kind is not null))
            throw new InvalidOperationException("An absent scene modal cannot carry identity or kind.");
        if (modal.Kind is { } kind) RequireText(kind, 200, "Scene modal kind");
    }

    private static void ValidateBounds(Bounds? bounds, string kind, FieldDisplayContract display)
    {
        if (bounds is null) return;
        if (!double.IsFinite(bounds.X) || !double.IsFinite(bounds.Y) || !double.IsFinite(bounds.Width) ||
            !double.IsFinite(bounds.Height) || bounds.Width < 0 || bounds.Height < 0)
            throw new InvalidOperationException($"Scene {kind} bounds are invalid.");
        if (bounds.X < 0 || bounds.Y < 0 || bounds.X + bounds.Width > display.Width || bounds.Y + bounds.Height > display.Height)
            throw new InvalidOperationException($"Scene {kind} bounds exceed the configured display.");
    }

    private static void RequireText(string value, int maximumLength, string name)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > maximumLength || value.Any(char.IsControl))
            throw new InvalidOperationException($"{name} must contain bounded non-control text.");
    }

    private static JsonSerializerOptions CreateWireJson()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };
        // A scene timestamp is a wire timestamp and must be written like every other one. Without
        // this, `capturedAt` was serialised in offset form while `sentAt` used canonical
        // milliseconds — two formats in one message, and the only one carrying a '+' for the
        // encoder to escape.
        options.Converters.Add(new CanonicalUtcDateTimeOffsetConverter());
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
        return options;
    }
}
