using System.Text.Json.Serialization;

namespace Exosuit.Agent;

public enum ControlMode { Observe, Guide, Sandbox, Scoped, SkillAutopilot, FullControl }
public enum RiskLevel { Info, Low, Medium, High, Critical }
public enum PermissionStatus { Allow, ReviewRequired, Block }
public enum ApprovalType { None, LocalClick, TypedConfirmation, LocalOnly }
public enum ActionType
{
    Observe,
    FocusWindow,
    InvokeElement,
    SetElementValue,
    SelectElement,
    ScrollElement,
    Wait,
    MovePointer,
    ClickPointer,
    TypeText,
    Hotkey
}
public enum ActionRoute { Api, Tool, Shell, BrowserDom, OsAccessibility, DesktopSelector, VisualMouseKeyboard, AskUser }
public enum ProposalStatus { Allowed, PendingReview, Approved, Denied, Blocked, Executed, Expired }
public enum ResultStatus { Succeeded, Failed, Blocked, Cancelled, PendingReview }
public enum VerificationStatus { NotChecked, Passed, Failed, Partial }
public enum ElementSource { Accessibility, Selector, Vision, Fake }

public sealed record Bounds(double X, double Y, double Width, double Height);
public sealed record Point(double X, double Y);

public sealed record WindowInfo(
    string Id,
    string Title,
    string ProcessName,
    int ProcessId,
    bool IsActive,
    bool IsMinimized,
    Bounds? Bounds = null);

public sealed record UiElement(
    string Id,
    string WindowId,
    string Name,
    string ControlType,
    string? AutomationId,
    string? Value,
    bool Enabled,
    bool Focused,
    bool Offscreen,
    bool IsSensitive,
    Bounds? Bounds,
    ElementSource Source,
    IReadOnlyList<ActionType> SupportedActions);

public sealed record ObservationRequest(
    string? WindowId = null,
    bool IncludeElements = true,
    bool IncludeScreenshot = false,
    int MaxElements = 250);

public sealed record DesktopObservation(
    string ObservationId,
    DateTimeOffset CapturedAt,
    ControlMode Mode,
    string Provider,
    WindowInfo? ActiveWindow,
    IReadOnlyList<WindowInfo> Windows,
    IReadOnlyList<UiElement> Elements,
    string? ScreenshotBase64,
    string? ScreenshotMimeType,
    IReadOnlyList<string> Warnings);

public sealed class VerificationExpectation
{
    [JsonConstructor]
    public VerificationExpectation(
        string kind,
        string? elementId = null,
        string? expectedValue = null,
        string? state = null,
        string? windowId = null,
        string? key = null,
        string? reason = null)
    {
        Kind = kind;
        ElementId = elementId;
        ExpectedValue = expectedValue;
        State = state;
        WindowId = windowId;
        Key = key;
        Reason = reason;
    }

    public string Kind { get; }
    public string? ElementId { get; }

    [JsonPropertyName("equals")]
    public string? ExpectedValue { get; }

    public string? State { get; }
    public string? WindowId { get; }
    public string? Key { get; }
    public string? Reason { get; }

    [JsonIgnore]
    public new string? Equals => ExpectedValue;
}

public sealed record DesktopAction(
    string Id,
    ActionType ActionType,
    ActionRoute Route,
    string? TargetWindowId,
    string? TargetElementId,
    string? Text,
    IReadOnlyList<string>? Keys,
    int? Delta,
    Point? Coordinates,
    string Rationale,
    VerificationExpectation Expected,
    string RequestedBy);

public sealed record PermissionDecision(
    PermissionStatus Status,
    RiskLevel RiskLevel,
    ApprovalType ApprovalType,
    string Reason,
    string PolicyRule);

public sealed record ActionProposal(
    string ProposalId,
    DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt,
    DesktopAction Action,
    PermissionDecision Decision,
    string? ActiveWindowId,
    ProposalStatus Status);

public sealed record ActionResult(
    string ProposalId,
    string ActionId,
    ResultStatus Status,
    VerificationStatus VerificationStatus,
    string Summary,
    IReadOnlyDictionary<string, object?> Evidence,
    IReadOnlyList<string> Warnings);

public sealed record AgentStatus(
    string Version,
    string Provider,
    ControlMode Mode,
    bool EmergencyStopped,
    bool PhysicalInputEnabled,
    bool ScreenshotCaptureEnabled,
    int PendingProposalCount,
    DateTimeOffset StartedAt);

public sealed record AuditEvent(
    long Sequence,
    string EventId,
    string EventType,
    DateTimeOffset CreatedAt,
    string Actor,
    IReadOnlyDictionary<string, object?> Payload,
    string PreviousHash,
    string Hash);

public sealed record ExecuteProposalRequest(string? ApprovalToken = null);
public sealed record EmergencyStopRequest(string Reason);
public sealed record ModeRequest(ControlMode Mode, string? Confirmation = null);
public sealed record ApprovalRequest(string? Confirmation = null);

public sealed record ProviderExecution(
    bool Succeeded,
    string Summary,
    IReadOnlyDictionary<string, object?> Evidence,
    IReadOnlyList<string> Warnings);
