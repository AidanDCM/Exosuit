import type {
  ControlMode,
  DesktopAction,
  PermissionDecision,
  UiElement,
  WindowInfo,
} from "./contracts.js";

export interface SafetyContext {
  mode: ControlMode;
  emergencyStopped: boolean;
  provider: string;
  physicalInputEnabled: boolean;
  localFullControlEnabled: boolean;
  allowedProcessNames: readonly string[];
  activeWindow?: WindowInfo;
  targetWindow?: WindowInfo;
  targetElement?: UiElement;
}

const CREDENTIAL_PATTERN = /password|passcode|secret|api\s*key|access\s*token|private\s*key|seed\s*phrase|recovery\s*code|one[- ]?time\s*code|cvv|social security/i;
const DESTRUCTIVE_PATTERN = /delete|remove|erase|destroy|format|factory reset|drop database|uninstall|terminate account|close account/i;
const EXTERNAL_EFFECT_PATTERN = /send|submit|publish|post|upload|deploy|purchase|buy|pay|transfer|trade|place order|confirm booking|change password|security settings/i;
const AUTH_PATTERN = /login|log in|sign in|authenticate|account recovery|two[- ]?factor|2fa|mfa/i;
const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  // The qualifier is optional on purpose. Requiring all/any/the/your missed the bare
  // "ignore previous instructions", which is the most common phrasing of this attack.
  /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+|the\s+|your\s+)?(?:previous|prior|earlier|above|preceding)\s+(?:instructions?|prompts?|rules?|directions?)/i,
  /reveal (the )?(system prompt|secret|token|password|credentials)/i,
  /send (the )?(data|files|secrets|credentials) to/i,
  /run (this|the following) command/i,
  /disable (security|antivirus|firewall|safety)/i,
  /you are now (the )?(administrator|system|developer)/i,
  /do not tell (the )?user/i,
];

function decision(
  status: PermissionDecision["status"],
  riskLevel: PermissionDecision["riskLevel"],
  approvalType: PermissionDecision["approvalType"],
  reason: string,
  policyRule: string,
): PermissionDecision {
  return { status, riskLevel, approvalType, reason, policyRule };
}

function targetText(context: SafetyContext): string {
  const element = context.targetElement;
  return [
    context.targetWindow?.title,
    context.targetWindow?.processName,
    element?.name,
    element?.controlType,
    element?.automationId,
  ]
    .filter(Boolean)
    .join(" ");
}

function processIsAllowed(context: SafetyContext): boolean {
  if (context.provider.toLowerCase().includes("fake")) return true;
  const processName = context.targetWindow?.processName.toLowerCase();
  if (!processName) return false;
  return context.allowedProcessNames.some((allowed) => allowed.toLowerCase() === processName);
}

export function evaluateAction(action: DesktopAction, context: SafetyContext): PermissionDecision {
  if (context.emergencyStopped) {
    return decision("block", "critical", "local_only", "Emergency stop is active.", "emergency-stop-lock");
  }

  if (action.actionType === "observe") {
    return decision("allow", "info", "none", "Observation does not change desktop state.", "observe-allowed");
  }

  if (action.actionType === "wait") {
    return decision("allow", "low", "none", "Bounded waiting does not change external state.", "bounded-wait");
  }

  if (context.mode === "observe" || context.mode === "guide") {
    return decision(
      "block",
      "high",
      "local_only",
      `Control mode ${context.mode} does not permit desktop mutation.`,
      "mode-read-only",
    );
  }

  if (context.targetElement?.isSensitive || CREDENTIAL_PATTERN.test(targetText(context))) {
    return decision(
      "block",
      "critical",
      "local_only",
      "Credential and secret-bearing controls are never remotely operated or returned.",
      "credential-hard-deny",
    );
  }

  if (DESTRUCTIVE_PATTERN.test(targetText(context))) {
    return decision(
      "block",
      "critical",
      "typed_confirmation",
      "Destructive desktop targets are blocked in the current release.",
      "destructive-hard-deny",
    );
  }

  const rawInput = ["move_pointer", "click_pointer", "type_text", "hotkey"].includes(action.actionType);
  if (rawInput) {
    if (!context.localFullControlEnabled || context.mode !== "full_control") {
      return decision(
        "block",
        "critical",
        "local_only",
        "Raw input requires a locally enabled full-control session; MCP cannot enable it.",
        "raw-input-local-only",
      );
    }
    if (!context.physicalInputEnabled) {
      return decision(
        "block",
        "critical",
        "local_only",
        "Physical input is disabled by local configuration.",
        "physical-input-disabled",
      );
    }
    return decision(
      "review_required",
      "critical",
      "typed_confirmation",
      "Raw physical input requires a fresh local typed confirmation.",
      "raw-input-confirmation",
    );
  }

  if (!context.targetWindow || !context.targetElement) {
    return decision(
      "block",
      "high",
      "local_only",
      "Semantic actions require a currently resolved window and element.",
      "target-resolution-required",
    );
  }

  if (!context.targetElement.enabled || context.targetElement.offscreen) {
    return decision(
      "block",
      "medium",
      "none",
      "The target is disabled or offscreen and must be resolved again.",
      "target-not-actionable",
    );
  }

  if (context.activeWindow && action.targetWindowId && context.activeWindow.id !== action.targetWindowId) {
    return decision(
      "block",
      "high",
      "local_only",
      "The active window changed after the action was prepared.",
      "wrong-window-deny",
    );
  }

  const target = targetText(context);
  if (EXTERNAL_EFFECT_PATTERN.test(target) || AUTH_PATTERN.test(target)) {
    return decision(
      "review_required",
      "critical",
      "typed_confirmation",
      "The target may create an external, account, authentication, financial, or irreversible effect.",
      "consequential-target-review",
    );
  }

  if (context.mode === "sandbox") {
    if (!context.provider.toLowerCase().includes("fake") && !context.provider.toLowerCase().includes("sandbox")) {
      return decision(
        "block",
        "high",
        "local_only",
        "Sandbox mode can only use a provider explicitly identified as fake or sandboxed.",
        "sandbox-provider-required",
      );
    }
    return decision("allow", "medium", "none", "Bounded semantic action is allowed in the sandbox.", "sandbox-semantic-action");
  }

  if (context.mode === "scoped") {
    if (!processIsAllowed(context)) {
      return decision(
        "block",
        "high",
        "local_only",
        "The target process is outside the local allowlist.",
        "process-scope-deny",
      );
    }
    return decision(
      "review_required",
      "high",
      "local_click",
      "A semantic action against a real scoped application requires local review.",
      "scoped-action-review",
    );
  }

  if (context.mode === "skill_autopilot") {
    return decision(
      "review_required",
      "high",
      "local_click",
      "Skill autopilot requires a locally approved skill manifest, which is not present in this proposal.",
      "skill-manifest-required",
    );
  }

  return decision(
    "block",
    "critical",
    "local_only",
    "No policy rule authorizes this action.",
    "deny-by-default",
  );
}

export interface InjectionFinding {
  matched: string;
  sample: string;
}

export function scanVisibleTextForPromptInjection(texts: readonly string[]): InjectionFinding[] {
  const findings: InjectionFinding[] = [];
  for (const text of texts) {
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        findings.push({ matched: pattern.source, sample: text.slice(0, 240) });
      }
    }
  }
  return findings;
}

export interface LoopState {
  stepCount: number;
  repeatedSignatureCount: number;
  stopped: boolean;
  reason?: string;
}

export class LoopDetector {
  readonly #maxSteps: number;
  readonly #maxRepeats: number;
  #stepCount = 0;
  #lastSignature = "";
  #repeatCount = 0;
  #stoppedReason: string | undefined;

  constructor(options: { maxSteps?: number; maxRepeats?: number } = {}) {
    this.#maxSteps = options.maxSteps ?? 40;
    this.#maxRepeats = options.maxRepeats ?? 2;
  }

  record(signature: string): LoopState {
    if (this.#stoppedReason) return this.state();
    this.#stepCount += 1;
    if (signature === this.#lastSignature) this.#repeatCount += 1;
    else {
      this.#lastSignature = signature;
      this.#repeatCount = 1;
    }

    if (this.#stepCount > this.#maxSteps) this.#stoppedReason = "Task exceeded its step budget.";
    else if (this.#repeatCount > this.#maxRepeats) this.#stoppedReason = "The same action repeated without sufficient progress.";
    return this.state();
  }

  reset(): void {
    this.#stepCount = 0;
    this.#lastSignature = "";
    this.#repeatCount = 0;
    this.#stoppedReason = undefined;
  }

  state(): LoopState {
    return {
      stepCount: this.#stepCount,
      repeatedSignatureCount: this.#repeatCount,
      stopped: Boolean(this.#stoppedReason),
      reason: this.#stoppedReason,
    };
  }
}
