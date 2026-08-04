import { randomUUID } from "node:crypto";
import { z } from "zod";
import { brainProviderSchema } from "./brainRouting.js";
import { sha256Canonical } from "./fieldContracts.js";
import { productApprovalClassSchema, productTaskSessionSchema, type ProductTaskSession } from "./personalTaskControl.js";

export const cockpitFieldStatusSchema = z.enum([
  "unknown",
  "offline",
  "starting",
  "ready",
  "busy",
  "locked",
  "secure_desktop",
  "degraded",
  "stopping",
  "error",
]);
export type CockpitFieldStatus = z.infer<typeof cockpitFieldStatusSchema>;

export const cockpitConnectionStatusSchema = z.enum(["disabled", "offline", "connecting", "ready", "degraded", "error"]);

export const cockpitTaskSummarySchema = z.object({
  taskId: z.string().uuid(),
  recipeId: z.string().min(1).max(200),
  recipeVersion: z.number().int().positive(),
  status: productTaskSessionSchema.shape.status,
  currentStepIndex: z.number().int().nonnegative(),
  totalSteps: z.number().int().positive(),
  verifiedSteps: z.number().int().nonnegative(),
  progressPercent: z.number().int().min(0).max(100),
  currentStepKey: z.string().min(1).max(200).optional(),
  currentApprovalClass: productApprovalClassSchema.optional(),
  checkpointVersion: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
}).strict();
export type CockpitTaskSummary = z.infer<typeof cockpitTaskSummarySchema>;

export const cockpitStateSchema = z.object({
  contractVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  field: z.object({
    status: cockpitFieldStatusSchema,
    ready: z.boolean(),
    generation: z.number().int().positive().optional(),
    reasonCode: z.string().min(1).max(200).optional(),
  }).strict(),
  brain: z.object({
    preferredProvider: brainProviderSchema,
    mcpStatus: cockpitConnectionStatusSchema,
    apiStatus: cockpitConnectionStatusSchema,
    apiFallbackEnabled: z.boolean(),
    authorizedTaskSpendUsd: z.number().finite().nonnegative(),
  }).strict(),
  task: z.object({
    active: cockpitTaskSummarySchema.optional(),
    recent: z.array(cockpitTaskSummarySchema).max(20),
    pendingApproval: z.object({
      taskId: z.string().uuid(),
      stepKey: z.string().min(1).max(200),
      approvalClass: productApprovalClassSchema,
      reasonCode: z.string().min(1).max(200),
    }).strict().optional(),
  }).strict(),
  recording: z.object({
    mode: z.enum(["off", "teach", "correction"]),
    consentActive: z.boolean(),
    independentStopAvailable: z.literal(true),
  }).strict(),
  persona: z.object({
    profileIdHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    version: z.number().int().positive().optional(),
    status: z.enum(["none", "draft", "evaluating", "approved", "retired", "revoked"]),
  }).strict(),
  controls: z.object({
    canPause: z.boolean(),
    canResume: z.boolean(),
    canCancel: z.boolean(),
    canResetField: z.boolean(),
    emergencyStopAvailable: z.literal(true),
  }).strict(),
  privacy: z.object({
    rawScreenshotIncluded: z.literal(false),
    rawCredentialsIncluded: z.literal(false),
    rawTaskGoalIncluded: z.literal(false),
    rawTaskVariablesIncluded: z.literal(false),
    rawPersonaTextIncluded: z.literal(false),
  }).strict(),
  stateHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type CockpitState = z.infer<typeof cockpitStateSchema>;

export function createCockpitState(input: {
  generatedAt?: string;
  field: { status: CockpitFieldStatus; ready: boolean; generation?: number; reasonCode?: string };
  brain: {
    preferredProvider: "chatgpt_mcp" | "openai_api" | "none";
    mcpStatus: z.infer<typeof cockpitConnectionStatusSchema>;
    apiStatus: z.infer<typeof cockpitConnectionStatusSchema>;
    apiFallbackEnabled: boolean;
    authorizedTaskSpendUsd?: number;
  };
  tasks: ProductTaskSession[];
  recording?: { mode: "off" | "teach" | "correction"; consentActive: boolean };
  persona?: { profileIdHash?: string; version?: number; status: "none" | "draft" | "evaluating" | "approved" | "retired" | "revoked" };
}): CockpitState {
  const tasks = input.tasks.map((task) => productTaskSessionSchema.parse(structuredClone(task)));
  const summaries = tasks
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(summarizeTask);
  const active = summaries.find((task) => !["completed", "failed", "cancelled"].includes(task.status));
  const activeSource = active ? tasks.find((task) => task.taskId === active.taskId) : undefined;
  const currentRecord = activeSource?.steps[activeSource.currentStepIndex];
  const pendingApproval = activeSource && currentRecord && (
    activeSource.status === "waiting_approval" || currentRecord.status === "waiting_approval"
  )
    ? {
        taskId: activeSource.taskId,
        stepKey: currentRecord.step.stepKey,
        approvalClass: currentRecord.approvalClass,
        reasonCode: approvalReasonCode(currentRecord.approvalClass),
      }
    : undefined;
  const recording = input.recording ?? { mode: "off" as const, consentActive: false };
  if (recording.mode !== "off" && !recording.consentActive) {
    throw new Error("Cockpit recording state cannot show active recording without active consent.");
  }
  const core = {
    contractVersion: 1 as const,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    field: input.field,
    brain: {
      ...input.brain,
      authorizedTaskSpendUsd: input.brain.authorizedTaskSpendUsd ?? 0,
    },
    task: {
      active,
      recent: summaries.slice(0, 20),
      pendingApproval,
    },
    recording: {
      ...recording,
      independentStopAvailable: true as const,
    },
    persona: input.persona ?? { status: "none" as const },
    controls: deriveControls(activeSource, input.field.ready),
    privacy: {
      rawScreenshotIncluded: false as const,
      rawCredentialsIncluded: false as const,
      rawTaskGoalIncluded: false as const,
      rawTaskVariablesIncluded: false as const,
      rawPersonaTextIncluded: false as const,
    },
  };
  return cockpitStateSchema.parse({ ...core, stateHash: sha256Canonical(core) });
}

export function verifyCockpitState(raw: CockpitState): boolean {
  const state = cockpitStateSchema.parse(structuredClone(raw));
  const { stateHash, ...core } = state;
  return sha256Canonical(core) === stateHash;
}

function summarizeTask(task: ProductTaskSession): CockpitTaskSummary {
  const verifiedSteps = task.steps.filter((step) => step.status === "verified").length;
  const current = task.steps[task.currentStepIndex];
  return cockpitTaskSummarySchema.parse({
    taskId: task.taskId,
    recipeId: task.recipeId,
    recipeVersion: task.recipeVersion,
    status: task.status,
    currentStepIndex: task.currentStepIndex,
    totalSteps: task.steps.length,
    verifiedSteps,
    progressPercent: Math.round((verifiedSteps / task.steps.length) * 100),
    currentStepKey: current?.step.stepKey,
    currentApprovalClass: current?.approvalClass,
    checkpointVersion: task.checkpointVersion,
    updatedAt: task.updatedAt,
  });
}

function deriveControls(task: ProductTaskSession | undefined, fieldReady: boolean) {
  const terminal = !task || ["completed", "failed", "cancelled"].includes(task.status);
  return {
    canPause: Boolean(task) && !terminal && !["paused", "waiting_approval"].includes(task!.status),
    canResume: Boolean(task) && fieldReady && ["paused", "recovery_required"].includes(task!.status),
    canCancel: Boolean(task) && !terminal,
    canResetField: !task || terminal || ["paused", "recovery_required", "failed", "cancelled"].includes(task.status),
    emergencyStopAvailable: true as const,
  };
}

function approvalReasonCode(approvalClass: "automatic" | "grouped" | "immediate"): string {
  if (approvalClass === "immediate") return "consequential_or_sensitive_action";
  if (approvalClass === "grouped") return "reversible_action_group";
  return "unexpected_automatic_step_hold";
}

export const cockpitEventTypeSchema = z.enum([
  "field_status_changed",
  "brain_status_changed",
  "task_created",
  "task_status_changed",
  "approval_required",
  "checkpoint_created",
  "recovery_required",
  "recording_status_changed",
  "emergency_stop",
]);

export const cockpitEventSchema = z.object({
  contractVersion: z.literal(1),
  eventId: z.string().uuid(),
  sequence: z.number().int().positive(),
  previousEventHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  eventType: cockpitEventTypeSchema,
  taskId: z.string().uuid().optional(),
  reasonCode: z.string().min(1).max(200),
  occurredAt: z.string().datetime(),
  containsSensitiveContent: z.literal(false),
  eventHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type CockpitEvent = z.infer<typeof cockpitEventSchema>;

export class CockpitEventJournal {
  readonly #events: CockpitEvent[] = [];

  append(input: {
    eventType: z.infer<typeof cockpitEventTypeSchema>;
    taskId?: string;
    reasonCode: string;
    occurredAt?: string;
  }): CockpitEvent {
    const core = {
      contractVersion: 1 as const,
      eventId: randomUUID(),
      sequence: this.#events.length + 1,
      previousEventHash: this.#events.at(-1)?.eventHash,
      eventType: input.eventType,
      taskId: input.taskId,
      reasonCode: input.reasonCode,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      containsSensitiveContent: false as const,
    };
    const event = cockpitEventSchema.parse({ ...core, eventHash: sha256Canonical(core) });
    this.#events.push(event);
    return structuredClone(event);
  }

  list(): CockpitEvent[] {
    return this.#events.map((event) => structuredClone(event));
  }

  verify(): boolean {
    let previous: string | undefined;
    for (const event of this.#events) {
      const parsed = cockpitEventSchema.parse(event);
      const { eventHash, ...core } = parsed;
      if (parsed.previousEventHash !== previous || sha256Canonical(core) !== eventHash) return false;
      previous = eventHash;
    }
    return true;
  }
}
