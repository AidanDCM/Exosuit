import {
  actionProposalSchema,
  actionResultSchema,
  agentStatusSchema,
  auditEventSchema,
  desktopActionSchema,
  observationRequestSchema,
  observationSchema,
  type ActionProposal,
  type ActionResult,
  type AgentStatus,
  type AuditEvent,
  type ControlMode,
  type DesktopAction,
  type DesktopAgent,
  type DesktopObservation,
  type ObservationRequest,
  type UiElement,
  type VerificationExpectation,
  type WindowInfo,
} from "./contracts.js";
import { HashChainLedger } from "./audit.js";
import { evaluateAction } from "./safety.js";

export class AgentRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AgentRequestError";
  }
}

export class HttpDesktopAgent implements DesktopAgent {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;

  constructor(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#token = options.token;
    this.#fetch = options.fetchImpl ?? fetch;
    if (!this.#baseUrl.startsWith("http://127.0.0.1:") && !this.#baseUrl.startsWith("http://localhost:")) {
      throw new Error("The initial Exosuit agent client only permits loopback HTTP URLs.");
    }
    if (this.#token.length < 32) throw new Error("EXOSUIT_AGENT_TOKEN must be at least 32 characters.");
  }

  async #request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-exosuit-token": this.#token,
        ...init.headers,
      },
    });
    const text = await response.text();
    let data: unknown = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new AgentRequestError("The local agent returned invalid JSON.", response.status);
      }
    }
    if (!response.ok) {
      const body = data as { error?: string; code?: string };
      throw new AgentRequestError(body.error ?? `Local agent request failed with ${response.status}.`, response.status, body.code);
    }
    return data;
  }

  async getStatus(): Promise<AgentStatus> {
    return agentStatusSchema.parse(await this.#request("/v1/status"));
  }

  async observe(request: ObservationRequest): Promise<DesktopObservation> {
    const input = observationRequestSchema.parse(request);
    return observationSchema.parse(
      await this.#request("/v1/observe", { method: "POST", body: JSON.stringify(input) }),
    );
  }

  async propose(action: DesktopAction): Promise<ActionProposal> {
    return actionProposalSchema.parse(
      await this.#request("/v1/actions/propose", {
        method: "POST",
        body: JSON.stringify(desktopActionSchema.parse(action)),
      }),
    );
  }

  async execute(proposalId: string, approvalToken?: string): Promise<ActionResult> {
    return actionResultSchema.parse(
      await this.#request(`/v1/actions/${encodeURIComponent(proposalId)}/execute`, {
        method: "POST",
        body: JSON.stringify({ approvalToken }),
      }),
    );
  }

  async emergencyStop(reason: string): Promise<{ stopped: boolean; summary: string }> {
    return (await this.#request("/v1/emergency-stop", {
      method: "POST",
      body: JSON.stringify({ reason }),
    })) as { stopped: boolean; summary: string };
  }

  async getAuditTail(limit: number): Promise<AuditEvent[]> {
    const data = (await this.#request(`/v1/audit?limit=${Math.max(1, Math.min(limit, 1_000))}`)) as unknown[];
    return data.map((event) => auditEventSchema.parse(event));
  }
}

interface FakeState {
  activeWindowId: string;
  editorText: string;
  savedText: string;
  selectedElementId?: string;
  invokedElementIds: Set<string>;
}

export class FakeDesktopAgent implements DesktopAgent {
  readonly #startedAt = new Date().toISOString();
  readonly #ledger = new HashChainLedger();
  readonly #proposals = new Map<string, ActionProposal>();
  readonly #windows: WindowInfo[];
  readonly #elements: UiElement[];
  readonly #state: FakeState;
  #mode: ControlMode;
  #emergencyStopped = false;

  constructor(options: { mode?: ControlMode } = {}) {
    this.#mode = options.mode ?? "sandbox";
    this.#windows = [
      {
        id: "win-notepad",
        title: "Exosuit Test Notepad",
        processName: "exosuit-fake-notepad",
        processId: 101,
        isActive: true,
        isMinimized: false,
        bounds: { x: 100, y: 100, width: 800, height: 600 },
      },
      {
        id: "win-calculator",
        title: "Exosuit Test Calculator",
        processName: "exosuit-fake-calculator",
        processId: 102,
        isActive: false,
        isMinimized: false,
        bounds: { x: 950, y: 100, width: 400, height: 600 },
      },
    ];
    this.#elements = [
      {
        id: "el-editor",
        windowId: "win-notepad",
        name: "Document text",
        controlType: "Edit",
        automationId: "editor",
        value: "",
        enabled: true,
        focused: true,
        offscreen: false,
        isSensitive: false,
        bounds: { x: 120, y: 160, width: 740, height: 450 },
        source: "fake",
        supportedActions: ["set_element_value"],
      },
      {
        id: "el-save",
        windowId: "win-notepad",
        name: "Save test document",
        controlType: "Button",
        automationId: "save",
        enabled: true,
        focused: false,
        offscreen: false,
        isSensitive: false,
        bounds: { x: 760, y: 115, width: 100, height: 32 },
        source: "fake",
        supportedActions: ["invoke_element"],
      },
      {
        id: "el-seven",
        windowId: "win-calculator",
        name: "Seven",
        controlType: "Button",
        automationId: "num7",
        enabled: true,
        focused: false,
        offscreen: false,
        isSensitive: false,
        bounds: { x: 980, y: 300, width: 80, height: 60 },
        source: "fake",
        supportedActions: ["invoke_element"],
      },
    ];
    this.#state = {
      activeWindowId: "win-notepad",
      editorText: "",
      savedText: "",
      invokedElementIds: new Set<string>(),
    };
  }

  async getStatus(): Promise<AgentStatus> {
    return agentStatusSchema.parse({
      version: "0.1.0-fake",
      provider: "fake-sandbox",
      mode: this.#mode,
      emergencyStopped: this.#emergencyStopped,
      physicalInputEnabled: false,
      screenshotCaptureEnabled: false,
      pendingProposalCount: [...this.#proposals.values()].filter((proposal) => proposal.status === "pending_review").length,
      startedAt: this.#startedAt,
    });
  }

  async observe(request: ObservationRequest): Promise<DesktopObservation> {
    const parsed = observationRequestSchema.parse(request);
    const windows = this.#windows.map((window) => ({ ...window, isActive: window.id === this.#state.activeWindowId }));
    const activeWindow = windows.find((window) => window.isActive);
    const elements = parsed.includeElements
      ? this.#elements
          .filter((element) => !parsed.windowId || element.windowId === parsed.windowId)
          .slice(0, parsed.maxElements)
          .map((element) => ({
            ...element,
            value: element.id === "el-editor" ? this.#state.editorText : element.value,
            focused: element.id === this.#state.selectedElementId || element.focused,
          }))
      : [];
    const warnings = parsed.includeScreenshot ? ["The fake provider does not return screenshot bytes."] : [];
    await this.#ledger.append({
      eventType: "desktop_observed",
      actor: "fake-agent",
      payload: { windowId: parsed.windowId, elementCount: elements.length, includeScreenshot: parsed.includeScreenshot },
    });
    return observationSchema.parse({
      observationId: `obs-${crypto.randomUUID()}`,
      capturedAt: new Date().toISOString(),
      mode: this.#mode,
      provider: "fake-sandbox",
      activeWindow,
      windows,
      elements,
      warnings,
    });
  }

  async propose(action: DesktopAction): Promise<ActionProposal> {
    const parsed = desktopActionSchema.parse(action);
    const targetWindow = this.#windows.find((window) => window.id === parsed.targetWindowId);
    const targetElement = this.#elements.find((element) => element.id === parsed.targetElementId);
    const activeWindow = this.#windows.find((window) => window.id === this.#state.activeWindowId);
    const decision = evaluateAction(parsed, {
      mode: this.#mode,
      emergencyStopped: this.#emergencyStopped,
      provider: "fake-sandbox",
      physicalInputEnabled: false,
      localFullControlEnabled: false,
      allowedProcessNames: ["exosuit-fake-notepad", "exosuit-fake-calculator"],
      activeWindow,
      targetWindow,
      targetElement,
    });
    const now = Date.now();
    const proposal = actionProposalSchema.parse({
      proposalId: `proposal-${crypto.randomUUID()}`,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
      action: parsed,
      decision,
      activeWindowId: activeWindow?.id,
      status: decision.status === "allow" ? "allowed" : decision.status === "review_required" ? "pending_review" : "blocked",
    });
    this.#proposals.set(proposal.proposalId, proposal);
    await this.#ledger.append({
      eventType: "action_proposed",
      actor: parsed.requestedBy,
      payload: { proposalId: proposal.proposalId, action: parsed, decision },
    });
    return proposal;
  }

  async execute(proposalId: string, approvalToken?: string): Promise<ActionResult> {
    const proposal = this.#proposals.get(proposalId);
    if (!proposal) return this.#result(proposalId, "unknown", "blocked", "not_checked", "Proposal was not found.");
    if (new Date(proposal.expiresAt).getTime() <= Date.now()) {
      proposal.status = "expired";
      return this.#result(proposalId, proposal.action.id, "blocked", "not_checked", "Proposal expired.");
    }
    if (this.#emergencyStopped || proposal.status === "blocked" || proposal.status === "denied") {
      return this.#result(proposalId, proposal.action.id, "blocked", "not_checked", "Local policy blocks this proposal.");
    }
    if (proposal.status === "pending_review") {
      if (approvalToken !== "local-test-approval") {
        return this.#result(proposalId, proposal.action.id, "pending_review", "not_checked", "Local approval is still required.");
      }
      proposal.status = "approved";
    }

    const action = proposal.action;
    const element = this.#elements.find((candidate) => candidate.id === action.targetElementId);
    try {
      switch (action.actionType) {
        case "focus_window":
          if (!action.targetWindowId || !this.#windows.some((window) => window.id === action.targetWindowId)) throw new Error("Window not found.");
          this.#state.activeWindowId = action.targetWindowId;
          break;
        case "set_element_value":
          if (element?.id !== "el-editor") throw new Error("The fake element does not support value setting.");
          this.#state.editorText = action.text ?? "";
          this.#state.selectedElementId = element.id;
          break;
        case "invoke_element":
          if (!element) throw new Error("Element not found.");
          this.#state.invokedElementIds.add(element.id);
          if (element.id === "el-save") this.#state.savedText = this.#state.editorText;
          break;
        case "select_element":
          if (!element) throw new Error("Element not found.");
          this.#state.selectedElementId = element.id;
          break;
        case "scroll_element":
        case "wait":
          break;
        default:
          throw new Error("The fake provider only executes semantic sandbox actions.");
      }
      const verification = this.#verify(action.expected);
      proposal.status = "executed";
      const result = this.#result(
        proposalId,
        action.id,
        verification.passed ? "succeeded" : "failed",
        verification.passed ? "passed" : "failed",
        verification.summary,
        verification.evidence,
      );
      await this.#ledger.append({
        eventType: "action_executed",
        actor: "fake-agent",
        payload: { proposalId, actionId: action.id, result },
      });
      return result;
    } catch (error) {
      const result = this.#result(
        proposalId,
        action.id,
        "failed",
        "failed",
        error instanceof Error ? error.message : "Unknown fake provider failure.",
      );
      await this.#ledger.append({ eventType: "action_failed", actor: "fake-agent", payload: { proposalId, result } });
      return result;
    }
  }

  async emergencyStop(reason: string): Promise<{ stopped: boolean; summary: string }> {
    this.#emergencyStopped = true;
    for (const proposal of this.#proposals.values()) {
      if (!["executed", "denied", "blocked", "expired"].includes(proposal.status)) proposal.status = "denied";
    }
    await this.#ledger.append({ eventType: "emergency_stop", actor: "local-user", payload: { reason } });
    return { stopped: true, summary: "Fake desktop agent stopped and pending proposals were denied." };
  }

  async getAuditTail(limit: number): Promise<AuditEvent[]> {
    return this.#ledger.tail(limit);
  }

  #verify(expectation: VerificationExpectation): { passed: boolean; summary: string; evidence: Record<string, unknown> } {
    switch (expectation.kind) {
      case "element_value": {
        const actual = expectation.elementId === "el-editor" ? this.#state.editorText : undefined;
        return {
          passed: actual === expectation.equals,
          summary: actual === expectation.equals ? "Expected element value is present." : "Element value did not match expectation.",
          evidence: { actual, expected: expectation.equals },
        };
      }
      case "element_state": {
        const passed =
          expectation.state === "invoked"
            ? this.#state.invokedElementIds.has(expectation.elementId)
            : expectation.state === "focused" || expectation.state === "selected"
              ? this.#state.selectedElementId === expectation.elementId
              : true;
        return { passed, summary: passed ? "Expected element state was observed." : "Expected element state was not observed.", evidence: { state: expectation.state } };
      }
      case "window_active": {
        const passed = this.#state.activeWindowId === expectation.windowId;
        return { passed, summary: passed ? "Expected window is active." : "Expected window is not active.", evidence: { activeWindowId: this.#state.activeWindowId } };
      }
      case "provider_evidence": {
        const actual = expectation.key === "savedText" ? this.#state.savedText : undefined;
        const passed = actual === expectation.equals;
        return { passed, summary: passed ? "Provider evidence matched." : "Provider evidence did not match.", evidence: { key: expectation.key, actual } };
      }
      case "none":
        return { passed: false, summary: `No verifiable expectation was supplied: ${expectation.reason}`, evidence: {} };
    }
  }

  #result(
    proposalId: string,
    actionId: string,
    status: ActionResult["status"],
    verificationStatus: ActionResult["verificationStatus"],
    summary: string,
    evidence: Record<string, unknown> = {},
  ): ActionResult {
    return actionResultSchema.parse({ proposalId, actionId, status, verificationStatus, summary, evidence, warnings: [] });
  }
}
