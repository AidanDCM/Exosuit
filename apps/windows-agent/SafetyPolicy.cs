using System.Collections.Concurrent;
using System.Text.RegularExpressions;

namespace Exosuit.Agent;

public sealed class AgentRuntimeState
{
    private readonly object _sync = new();
    private ControlMode _mode;
    private bool _emergencyStopped;

    public AgentRuntimeState(
        ControlMode mode,
        bool physicalInputEnabled,
        bool screenshotCaptureEnabled,
        bool localFullControlEnabled,
        IReadOnlySet<string> allowedProcessNames)
    {
        _mode = mode;
        PhysicalInputEnabled = physicalInputEnabled;
        ScreenshotCaptureEnabled = screenshotCaptureEnabled;
        LocalFullControlEnabled = localFullControlEnabled;
        AllowedProcessNames = allowedProcessNames;
        StartedAt = DateTimeOffset.UtcNow;
    }

    public DateTimeOffset StartedAt { get; }
    public bool PhysicalInputEnabled { get; }
    public bool ScreenshotCaptureEnabled { get; }
    public bool LocalFullControlEnabled { get; }
    public IReadOnlySet<string> AllowedProcessNames { get; }
    public ConcurrentDictionary<string, ActionProposal> Proposals { get; } = new(StringComparer.Ordinal);

    public ControlMode Mode
    {
        get { lock (_sync) return _mode; }
    }

    public bool EmergencyStopped
    {
        get { lock (_sync) return _emergencyStopped; }
    }

    public void SetMode(ControlMode mode)
    {
        lock (_sync) _mode = mode;
    }

    public void ActivateEmergencyStop()
    {
        lock (_sync) _emergencyStopped = true;
    }

    public int PendingProposalCount => Proposals.Values.Count(static proposal => proposal.Status == ProposalStatus.PendingReview);
}

public sealed class SafetyPolicy
{
    private static readonly Regex CredentialPattern = new(
        "password|passcode|secret|api\\s*key|access\\s*token|private\\s*key|seed\\s*phrase|recovery\\s*code|one[- ]?time\\s*code|cvv|social security",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex DestructivePattern = new(
        "delete|remove|erase|destroy|format|factory reset|drop database|uninstall|terminate account|close account",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex ExternalEffectPattern = new(
        "send|submit|publish|post|upload|deploy|purchase|buy|pay|transfer|trade|place order|confirm booking|change password|security settings",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex AuthenticationPattern = new(
        "login|log in|sign in|authenticate|account recovery|two[- ]?factor|2fa|mfa",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static PermissionDecision Decision(
        PermissionStatus status,
        RiskLevel riskLevel,
        ApprovalType approvalType,
        string reason,
        string policyRule) => new(status, riskLevel, approvalType, reason, policyRule);

    public PermissionDecision Evaluate(
        DesktopAction action,
        AgentRuntimeState state,
        string providerName,
        WindowInfo? activeWindow,
        WindowInfo? targetWindow,
        UiElement? targetElement)
    {
        if (state.EmergencyStopped)
            return Decision(PermissionStatus.Block, RiskLevel.Critical, ApprovalType.LocalOnly,
                "Emergency stop is active.", "emergency-stop-lock");

        if (action.ActionType == ActionType.Observe)
            return Decision(PermissionStatus.Allow, RiskLevel.Info, ApprovalType.None,
                "Observation does not change desktop state.", "observe-allowed");

        if (action.ActionType == ActionType.Wait)
            return Decision(PermissionStatus.Allow, RiskLevel.Low, ApprovalType.None,
                "Bounded waiting does not change external state.", "bounded-wait");

        if (state.Mode is ControlMode.Observe or ControlMode.Guide)
            return Decision(PermissionStatus.Block, RiskLevel.High, ApprovalType.LocalOnly,
                $"Control mode {ToWireName(state.Mode)} does not permit desktop mutation.", "mode-read-only");

        var targetText = string.Join(' ', new[]
        {
            targetWindow?.Title,
            targetWindow?.ProcessName,
            targetElement?.Name,
            targetElement?.ControlType,
            targetElement?.AutomationId
        }.Where(static value => !string.IsNullOrWhiteSpace(value)));

        if (targetElement?.IsSensitive == true || CredentialPattern.IsMatch(targetText))
            return Decision(PermissionStatus.Block, RiskLevel.Critical, ApprovalType.LocalOnly,
                "Credential and secret-bearing controls are never remotely operated or returned.", "credential-hard-deny");

        if (DestructivePattern.IsMatch(targetText))
            return Decision(PermissionStatus.Block, RiskLevel.Critical, ApprovalType.TypedConfirmation,
                "Destructive desktop targets are blocked in the current release.", "destructive-hard-deny");

        var rawInput = action.ActionType is ActionType.MovePointer or ActionType.ClickPointer or ActionType.TypeText or ActionType.Hotkey;
        if (rawInput)
        {
            if (!state.LocalFullControlEnabled || state.Mode != ControlMode.FullControl)
                return Decision(PermissionStatus.Block, RiskLevel.Critical, ApprovalType.LocalOnly,
                    "Raw input requires a locally enabled full-control session; MCP cannot enable it.", "raw-input-local-only");
            if (!state.PhysicalInputEnabled)
                return Decision(PermissionStatus.Block, RiskLevel.Critical, ApprovalType.LocalOnly,
                    "Physical input is disabled by local configuration.", "physical-input-disabled");
            return Decision(PermissionStatus.ReviewRequired, RiskLevel.Critical, ApprovalType.TypedConfirmation,
                "Raw physical input requires a fresh local typed confirmation.", "raw-input-confirmation");
        }

        if (targetWindow is null || targetElement is null)
            return Decision(PermissionStatus.Block, RiskLevel.High, ApprovalType.LocalOnly,
                "Semantic actions require a currently resolved window and element.", "target-resolution-required");

        if (!targetElement.Enabled || targetElement.Offscreen)
            return Decision(PermissionStatus.Block, RiskLevel.Medium, ApprovalType.None,
                "The target is disabled or offscreen and must be resolved again.", "target-not-actionable");

        if (activeWindow is not null && action.TargetWindowId is not null &&
            !string.Equals(activeWindow.Id, action.TargetWindowId, StringComparison.Ordinal))
            return Decision(PermissionStatus.Block, RiskLevel.High, ApprovalType.LocalOnly,
                "The active window changed after the action was prepared.", "wrong-window-deny");

        if (ExternalEffectPattern.IsMatch(targetText) || AuthenticationPattern.IsMatch(targetText))
            return Decision(PermissionStatus.ReviewRequired, RiskLevel.Critical, ApprovalType.TypedConfirmation,
                "The target may create an external, account, authentication, financial, or irreversible effect.",
                "consequential-target-review");

        if (state.Mode == ControlMode.Sandbox)
        {
            if (!providerName.Contains("fake", StringComparison.OrdinalIgnoreCase) &&
                !providerName.Contains("sandbox", StringComparison.OrdinalIgnoreCase))
                return Decision(PermissionStatus.Block, RiskLevel.High, ApprovalType.LocalOnly,
                    "Sandbox mode can only use a provider explicitly identified as fake or sandboxed.",
                    "sandbox-provider-required");

            return Decision(PermissionStatus.Allow, RiskLevel.Medium, ApprovalType.None,
                "Bounded semantic action is allowed in the sandbox.", "sandbox-semantic-action");
        }

        if (state.Mode == ControlMode.Scoped)
        {
            if (!state.AllowedProcessNames.Contains(targetWindow.ProcessName))
                return Decision(PermissionStatus.Block, RiskLevel.High, ApprovalType.LocalOnly,
                    "The target process is outside the local allowlist.", "process-scope-deny");

            return Decision(PermissionStatus.ReviewRequired, RiskLevel.High, ApprovalType.LocalClick,
                "A semantic action against a real scoped application requires local review.",
                "scoped-action-review");
        }

        if (state.Mode == ControlMode.SkillAutopilot)
            return Decision(PermissionStatus.ReviewRequired, RiskLevel.High, ApprovalType.LocalClick,
                "Skill autopilot requires a locally approved skill manifest, which is not present in this proposal.",
                "skill-manifest-required");

        return Decision(PermissionStatus.Block, RiskLevel.Critical, ApprovalType.LocalOnly,
            "No policy rule authorizes this action.", "deny-by-default");
    }

    private static string ToWireName(ControlMode mode) => mode switch
    {
        ControlMode.SkillAutopilot => "skill_autopilot",
        ControlMode.FullControl => "full_control",
        _ => mode.ToString().ToLowerInvariant()
    };
}
