import { z } from "zod";

export const controlModeSchema = z.enum([
  "observe",
  "guide",
  "sandbox",
  "scoped",
  "skill_autopilot",
  "full_control",
]);
export type ControlMode = z.infer<typeof controlModeSchema>;

export const riskLevelSchema = z.enum(["info", "low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const permissionStatusSchema = z.enum(["allow", "review_required", "block"]);
export type PermissionStatus = z.infer<typeof permissionStatusSchema>;

export const approvalTypeSchema = z.enum(["none", "local_click", "typed_confirmation", "local_only"]);
export type ApprovalType = z.infer<typeof approvalTypeSchema>;

export const routeSchema = z.enum([
  "api",
  "tool",
  "shell",
  "browser_dom",
  "os_accessibility",
  "desktop_selector",
  "visual_mouse_keyboard",
  "ask_user",
]);
export type ActionRoute = z.infer<typeof routeSchema>;

export const actionTypeSchema = z.enum([
  "observe",
  "focus_window",
  "invoke_element",
  "set_element_value",
  "select_element",
  "scroll_element",
  "wait",
  "move_pointer",
  "click_pointer",
  "type_text",
  "hotkey",
]);
export type ActionType = z.infer<typeof actionTypeSchema>;

export const boundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
});
export type Bounds = z.infer<typeof boundsSchema>;

export const windowInfoSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  processName: z.string(),
  processId: z.number().int().nonnegative(),
  isActive: z.boolean(),
  isMinimized: z.boolean().default(false),
  bounds: boundsSchema.optional(),
});
export type WindowInfo = z.infer<typeof windowInfoSchema>;

export const uiElementSchema = z.object({
  id: z.string().min(1),
  windowId: z.string().min(1),
  name: z.string(),
  controlType: z.string().min(1),
  automationId: z.string().optional(),
  value: z.string().optional(),
  enabled: z.boolean(),
  focused: z.boolean().default(false),
  offscreen: z.boolean().default(false),
  isSensitive: z.boolean().default(false),
  bounds: boundsSchema.optional(),
  source: z.enum(["accessibility", "selector", "vision", "fake"]),
  supportedActions: z.array(actionTypeSchema).default([]),
});
export type UiElement = z.infer<typeof uiElementSchema>;

export const observationRequestSchema = z.object({
  windowId: z.string().optional(),
  includeElements: z.boolean().default(true),
  includeScreenshot: z.boolean().default(false),
  maxElements: z.number().int().min(1).max(2_000).default(250),
});
export type ObservationRequest = z.infer<typeof observationRequestSchema>;

export const observationSchema = z.object({
  observationId: z.string().min(1),
  capturedAt: z.string().datetime(),
  mode: controlModeSchema,
  provider: z.string().min(1),
  activeWindow: windowInfoSchema.optional(),
  windows: z.array(windowInfoSchema),
  elements: z.array(uiElementSchema).default([]),
  screenshotBase64: z.string().optional(),
  screenshotMimeType: z.string().optional(),
  warnings: z.array(z.string()).default([]),
});
export type DesktopObservation = z.infer<typeof observationSchema>;

export const verificationExpectationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("element_value"),
    elementId: z.string().min(1),
    equals: z.string(),
  }),
  z.object({
    kind: z.literal("element_state"),
    elementId: z.string().min(1),
    state: z.enum(["enabled", "disabled", "focused", "selected", "invoked"]),
  }),
  z.object({
    kind: z.literal("window_active"),
    windowId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("provider_evidence"),
    key: z.string().min(1),
    equals: z.string(),
  }),
  z.object({
    kind: z.literal("none"),
    reason: z.string().min(1),
  }),
]);
export type VerificationExpectation = z.infer<typeof verificationExpectationSchema>;

export const desktopActionSchema = z.object({
  id: z.string().min(1),
  actionType: actionTypeSchema,
  route: routeSchema.default("os_accessibility"),
  targetWindowId: z.string().optional(),
  targetElementId: z.string().optional(),
  text: z.string().max(20_000).optional(),
  keys: z.array(z.string().min(1).max(40)).max(8).optional(),
  delta: z.number().int().min(-20).max(20).optional(),
  coordinates: z
    .object({ x: z.number().finite(), y: z.number().finite() })
    .optional(),
  rationale: z.string().min(1).max(2_000),
  expected: verificationExpectationSchema,
  requestedBy: z.enum(["chatgpt", "claude", "local_user", "test"]).default("chatgpt"),
});
export type DesktopAction = z.infer<typeof desktopActionSchema>;

export const permissionDecisionSchema = z.object({
  status: permissionStatusSchema,
  riskLevel: riskLevelSchema,
  approvalType: approvalTypeSchema,
  reason: z.string().min(1),
  policyRule: z.string().min(1),
});
export type PermissionDecision = z.infer<typeof permissionDecisionSchema>;

export const actionProposalSchema = z.object({
  proposalId: z.string().min(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  action: desktopActionSchema,
  decision: permissionDecisionSchema,
  activeWindowId: z.string().optional(),
  status: z.enum(["allowed", "pending_review", "approved", "denied", "blocked", "executed", "expired"]),
});
export type ActionProposal = z.infer<typeof actionProposalSchema>;

export const actionResultSchema = z.object({
  proposalId: z.string().min(1),
  actionId: z.string().min(1),
  status: z.enum(["succeeded", "failed", "blocked", "cancelled", "pending_review"]),
  verificationStatus: z.enum(["not_checked", "passed", "failed", "partial"]),
  summary: z.string(),
  evidence: z.record(z.string(), z.unknown()).default({}),
  warnings: z.array(z.string()).default([]),
});
export type ActionResult = z.infer<typeof actionResultSchema>;

export const agentStatusSchema = z.object({
  version: z.string(),
  provider: z.string(),
  mode: controlModeSchema,
  emergencyStopped: z.boolean(),
  physicalInputEnabled: z.boolean(),
  screenshotCaptureEnabled: z.boolean(),
  pendingProposalCount: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
});
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const auditEventSchema = z.object({
  sequence: z.number().int().nonnegative(),
  eventId: z.string().min(1),
  eventType: z.string().min(1),
  createdAt: z.string().datetime(),
  actor: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  previousHash: z.string(),
  hash: z.string().min(32),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export interface DesktopAgent {
  getStatus(): Promise<AgentStatus>;
  observe(request: ObservationRequest): Promise<DesktopObservation>;
  propose(action: DesktopAction): Promise<ActionProposal>;
  execute(proposalId: string, approvalToken?: string): Promise<ActionResult>;
  emergencyStop(reason: string): Promise<{ stopped: boolean; summary: string }>;
  getAuditTail(limit: number): Promise<AuditEvent[]>;
}

export const agentErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});
