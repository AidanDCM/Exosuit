import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { desktopActionSchema } from "./contracts.js";
import {
  CoordinatorLeaseManager,
  WorkspaceRegistry,
  validateWorkflowGraph,
  windowReferenceSchema,
  workflowDefinitionSchema,
  workflowStepSchema,
  type WorkflowDefinition,
  type WorkspaceSnapshot,
} from "./coordinator.js";

export const workflowStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "blocked",
  "completed",
  "failed",
  "cancelled",
  "recovery_required",
]);
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;

export const workflowStepStatusSchema = z.enum([
  "pending",
  "ready",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "blocked",
  "cancelled",
  "uncertain",
]);
export type WorkflowStepStatus = z.infer<typeof workflowStepStatusSchema>;

export const artifactClassificationSchema = z.enum(["public", "internal", "sensitive"]);
export type ArtifactClassification = z.infer<typeof artifactClassificationSchema>;

export const artifactRetentionSchema = z.enum(["workflow", "session", "persistent"]);
export type ArtifactRetention = z.infer<typeof artifactRetentionSchema>;

export const workflowArtifactSchema = z.object({
  artifactId: z.string().uuid(),
  workflowId: z.string().min(1),
  name: z.string().min(1).max(200),
  value: z.unknown(),
  sourceStepId: z.string().min(1),
  sourceWindow: windowReferenceSchema.optional(),
  capturedAt: z.string().datetime(),
  classification: artifactClassificationSchema,
  retention: artifactRetentionSchema,
  integrityHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WorkflowArtifact = z.infer<typeof workflowArtifactSchema>;

export const runtimeWorkflowStepSchema = workflowStepSchema.extend({
  inputArtifactNames: z.array(z.string().min(1).max(200)).max(100).default([]),
  outputArtifactNames: z.array(z.string().min(1).max(200)).max(100).default([]),
  idempotencyKey: z.string().min(1).max(300).optional(),
  externalEffect: z.enum(["none", "reversible", "irreversible"]).default("none"),
  desktopAction: desktopActionSchema.optional(),
});
export type RuntimeWorkflowStep = z.infer<typeof runtimeWorkflowStepSchema>;

export const runtimeWorkflowDefinitionSchema = workflowDefinitionSchema.omit({ steps: true }).extend({
  steps: z.array(runtimeWorkflowStepSchema).min(1).max(1_000),
});
export type RuntimeWorkflowDefinition = z.infer<typeof runtimeWorkflowDefinitionSchema>;

export const workflowStepRecordSchema = z.object({
  step: runtimeWorkflowStepSchema,
  status: workflowStepStatusSchema,
  attempts: z.number().int().nonnegative(),
  proposalId: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
  verificationStatus: z.enum(["not_checked", "passed", "failed", "partial"]).default("not_checked"),
});
export type WorkflowStepRecord = z.infer<typeof workflowStepRecordSchema>;

export const runtimeWorkflowRecordSchema = z.object({
  definition: runtimeWorkflowDefinitionSchema,
  status: workflowStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  pauseReason: z.string().optional(),
  checkpointVersion: z.number().int().nonnegative(),
  steps: z.record(z.string(), workflowStepRecordSchema),
  completedIdempotencyKeys: z.array(z.string()),
});
export type RuntimeWorkflowRecord = z.infer<typeof runtimeWorkflowRecordSchema>;

export type ArtifactOutput = {
  name: string;
  value: unknown;
  classification?: ArtifactClassification;
  retention?: ArtifactRetention;
};

export type WorkflowExecutionContext = {
  workflow: RuntimeWorkflowRecord;
  step: RuntimeWorkflowStep;
  inputs: Record<string, WorkflowArtifact>;
  attempt: number;
  signal: AbortSignal;
  proposalId?: string;
};

export type WorkflowExecutionResult = {
  status: "succeeded" | "failed" | "blocked" | "waiting_approval" | "uncertain";
  summary: string;
  verificationStatus: "not_checked" | "passed" | "failed" | "partial";
  proposalId?: string;
  outputs?: ArtifactOutput[];
};

export interface WorkflowStepExecutor {
  execute(context: WorkflowExecutionContext): Promise<WorkflowExecutionResult>;
}

export interface WorkflowCheckpointStore {
  save(workflow: RuntimeWorkflowRecord, artifacts: WorkflowArtifact[]): Promise<void>;
  load(workflowId: string): Promise<{ workflow: RuntimeWorkflowRecord; artifacts: WorkflowArtifact[] } | undefined>;
  list(): Promise<string[]>;
  delete(workflowId: string): Promise<void>;
}

export class InMemoryWorkflowCheckpointStore implements WorkflowCheckpointStore {
  readonly #items = new Map<string, string>();

  async save(workflow: RuntimeWorkflowRecord, artifacts: WorkflowArtifact[]): Promise<void> {
    const parsed = runtimeWorkflowRecordSchema.parse(workflow);
    const checkedArtifacts = z.array(workflowArtifactSchema).parse(artifacts);
    this.#items.set(parsed.definition.workflowId, JSON.stringify({ workflow: parsed, artifacts: checkedArtifacts }));
  }

  async load(
    workflowId: string,
  ): Promise<{ workflow: RuntimeWorkflowRecord; artifacts: WorkflowArtifact[] } | undefined> {
    const serialized = this.#items.get(workflowId);
    if (!serialized) return undefined;
    const parsed: unknown = JSON.parse(serialized);
    const object = z
      .object({ workflow: runtimeWorkflowRecordSchema, artifacts: z.array(workflowArtifactSchema) })
      .parse(parsed);
    return structuredClone(object);
  }

  async list(): Promise<string[]> {
    return [...this.#items.keys()].sort();
  }

  async delete(workflowId: string): Promise<void> {
    this.#items.delete(workflowId);
  }
}

export class WorkflowArtifactStore {
  readonly #byWorkflow = new Map<string, Map<string, WorkflowArtifact>>();

  put(
    input: Omit<WorkflowArtifact, "artifactId" | "capturedAt" | "integrityHash"> & {
      capturedAt?: string;
    },
  ): WorkflowArtifact {
    if (input.classification === "sensitive" && input.retention === "persistent") {
      throw new Error("Sensitive workflow artifacts cannot use persistent retention.");
    }
    const capturedAt = input.capturedAt ?? new Date().toISOString();
    const unsigned = {
      workflowId: input.workflowId,
      name: input.name,
      value: input.value,
      sourceStepId: input.sourceStepId,
      sourceWindow: input.sourceWindow,
      capturedAt,
      classification: input.classification,
      retention: input.retention,
    };
    const artifact = workflowArtifactSchema.parse({
      ...unsigned,
      artifactId: randomUUID(),
      integrityHash: sha256(stableStringify(unsigned)),
    });
    const workflowArtifacts =
      this.#byWorkflow.get(artifact.workflowId) ?? new Map<string, WorkflowArtifact>();
    workflowArtifacts.set(artifact.name, artifact);
    this.#byWorkflow.set(artifact.workflowId, workflowArtifacts);
    return artifact;
  }

  get(workflowId: string, name: string): WorkflowArtifact | undefined {
    const artifact = this.#byWorkflow.get(workflowId)?.get(name);
    if (!artifact) return undefined;
    this.verify(artifact);
    return structuredClone(artifact);
  }

  require(workflowId: string, names: string[]): Record<string, WorkflowArtifact> {
    const result: Record<string, WorkflowArtifact> = {};
    for (const name of names) {
      const artifact = this.get(workflowId, name);
      if (!artifact) throw new Error(`Required workflow artifact ${name} is missing.`);
      result[name] = artifact;
    }
    return result;
  }

  list(workflowId: string): WorkflowArtifact[] {
    return [...(this.#byWorkflow.get(workflowId)?.values() ?? [])].map((artifact) => {
      this.verify(artifact);
      return structuredClone(artifact);
    });
  }

  hydrate(workflowId: string, artifacts: WorkflowArtifact[]): void {
    const map = new Map<string, WorkflowArtifact>();
    for (const raw of artifacts) {
      const artifact = workflowArtifactSchema.parse(raw);
      if (artifact.workflowId !== workflowId) {
        throw new Error("Artifact workflow identity does not match the checkpoint.");
      }
      this.verify(artifact);
      map.set(artifact.name, artifact);
    }
    this.#byWorkflow.set(workflowId, map);
  }

  clearWorkflow(workflowId: string): void {
    this.#byWorkflow.delete(workflowId);
  }

  verify(artifact: WorkflowArtifact): void {
    const { artifactId: _artifactId, integrityHash, ...unsigned } = artifact;
    const expected = sha256(stableStringify(unsigned));
    if (integrityHash !== expected) {
      throw new Error(`Workflow artifact ${artifact.name} failed integrity verification.`);
    }
  }
}

export type CoordinatorAuditEvent = {
  sequence: number;
  eventId: string;
  createdAt: string;
  workflowId: string;
  stepId?: string;
  eventType: string;
  details: Record<string, unknown>;
  previousHash: string;
  hash: string;
};

export class CoordinatorAuditTimeline {
  readonly #events: CoordinatorAuditEvent[] = [];

  append(
    input: Omit<
      CoordinatorAuditEvent,
      "sequence" | "eventId" | "createdAt" | "previousHash" | "hash"
    >,
  ): CoordinatorAuditEvent {
    const previousHash = this.#events.at(-1)?.hash ?? "GENESIS";
    const base = {
      sequence: this.#events.length,
      eventId: randomUUID(),
      createdAt: new Date().toISOString(),
      workflowId: input.workflowId,
      stepId: input.stepId,
      eventType: input.eventType,
      details: redactDetails(input.details),
      previousHash,
    };
    const event: CoordinatorAuditEvent = {
      ...base,
      hash: sha256(stableStringify(base)),
    };
    this.#events.push(event);
    return structuredClone(event);
  }

  list(workflowId?: string): CoordinatorAuditEvent[] {
    return this.#events
      .filter((event) => !workflowId || event.workflowId === workflowId)
      .map((event) => structuredClone(event));
  }

  verify(): { valid: boolean; invalidSequence?: number } {
    let previousHash = "GENESIS";
    for (const event of this.#events) {
      const { hash, ...base } = event;
      if (base.previousHash !== previousHash || hash !== sha256(stableStringify(base))) {
        return { valid: false, invalidSequence: event.sequence };
      }
      previousHash = hash;
    }
    return { valid: true };
  }
}

export class WorkflowRuntime {
  readonly #workflows = new Map<string, RuntimeWorkflowRecord>();
  readonly #workspaceRegistry: WorkspaceRegistry;
  readonly #leases: CoordinatorLeaseManager;
  readonly #artifacts: WorkflowArtifactStore;
  readonly #checkpoints: WorkflowCheckpointStore;
  readonly #audit: CoordinatorAuditTimeline;
  readonly #controllers = new Map<string, AbortController>();

  constructor(
    options: {
      workspaceRegistry?: WorkspaceRegistry;
      leases?: CoordinatorLeaseManager;
      artifacts?: WorkflowArtifactStore;
      checkpoints?: WorkflowCheckpointStore;
      audit?: CoordinatorAuditTimeline;
    } = {},
  ) {
    this.#workspaceRegistry = options.workspaceRegistry ?? new WorkspaceRegistry();
    this.#leases = options.leases ?? new CoordinatorLeaseManager();
    this.#artifacts = options.artifacts ?? new WorkflowArtifactStore();
    this.#checkpoints = options.checkpoints ?? new InMemoryWorkflowCheckpointStore();
    this.#audit = options.audit ?? new CoordinatorAuditTimeline();
  }

  updateWorkspace(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
    return this.#workspaceRegistry.update(snapshot);
  }

  listWorkspaces(): WorkspaceSnapshot[] {
    return this.#workspaceRegistry.list().map((snapshot) => structuredClone(snapshot));
  }

  create(input: RuntimeWorkflowDefinition): RuntimeWorkflowRecord {
    const definition = runtimeWorkflowDefinitionSchema.parse(input);
    validateWorkflowGraph(definition as WorkflowDefinition);
    this.#validateStepMetadata(definition);
    if (this.#workflows.has(definition.workflowId)) {
      throw new Error("Workflow IDs must be unique.");
    }
    const now = new Date().toISOString();
    const record: RuntimeWorkflowRecord = runtimeWorkflowRecordSchema.parse({
      definition,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      checkpointVersion: 0,
      completedIdempotencyKeys: [],
      steps: Object.fromEntries(
        definition.steps.map((step) => [
          step.stepId,
          {
            step,
            status: "pending",
            attempts: 0,
            verificationStatus: "not_checked",
          },
        ]),
      ),
    });
    this.#workflows.set(definition.workflowId, record);
    this.#audit.append({
      workflowId: definition.workflowId,
      eventType: "workflow_created",
      details: { stepCount: definition.steps.length },
    });
    void this.#saveCheckpoint(record);
    return structuredClone(record);
  }

  get(workflowId: string): RuntimeWorkflowRecord {
    const workflow = this.#workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} was not found.`);
    return structuredClone(workflow);
  }

  list(): RuntimeWorkflowRecord[] {
    return [...this.#workflows.values()].map((workflow) => structuredClone(workflow));
  }

  listArtifacts(workflowId: string): WorkflowArtifact[] {
    this.get(workflowId);
    return this.#artifacts.list(workflowId);
  }

  getAudit(workflowId?: string): CoordinatorAuditEvent[] {
    return this.#audit.list(workflowId);
  }

  verifyAudit(): { valid: boolean; invalidSequence?: number } {
    return this.#audit.verify();
  }

  pause(workflowId: string, reason: string): RuntimeWorkflowRecord {
    const workflow = this.#requireMutable(workflowId);
    workflow.status = "paused";
    workflow.pauseReason = reason;
    workflow.updatedAt = new Date().toISOString();
    this.#controllers.get(workflowId)?.abort(new Error(reason));
    this.#leases.releaseOwner(workflowId);
    this.#audit.append({
      workflowId,
      eventType: "workflow_paused",
      details: { reason },
    });
    void this.#saveCheckpoint(workflow);
    return structuredClone(workflow);
  }

  resume(workflowId: string): RuntimeWorkflowRecord {
    const workflow = this.#workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} was not found.`);
    if (!["paused", "blocked", "recovery_required"].includes(workflow.status)) {
      throw new Error(`Workflow ${workflowId} is not resumable from ${workflow.status}.`);
    }
    if (Object.values(workflow.steps).some((record) => record.status === "uncertain")) {
      throw new Error("Uncertain workflow steps must be reconciled before resume.");
    }
    workflow.status = "running";
    delete workflow.pauseReason;
    workflow.updatedAt = new Date().toISOString();
    this.#audit.append({ workflowId, eventType: "workflow_resumed", details: {} });
    void this.#saveCheckpoint(workflow);
    return structuredClone(workflow);
  }

  cancel(workflowId: string, reason: string): RuntimeWorkflowRecord {
    const workflow = this.#requireMutable(workflowId);
    this.#controllers.get(workflowId)?.abort(new Error(reason));
    this.#leases.releaseOwner(workflowId);
    for (const record of Object.values(workflow.steps)) {
      if (["pending", "ready", "running", "waiting_approval"].includes(record.status)) {
        record.status = "cancelled";
      }
    }
    workflow.status = "cancelled";
    workflow.pauseReason = reason;
    workflow.updatedAt = new Date().toISOString();
    this.#audit.append({
      workflowId,
      eventType: "workflow_cancelled",
      details: { reason },
    });
    void this.#saveCheckpoint(workflow);
    return structuredClone(workflow);
  }

  emergencyStopSession(
    agentId: string,
    windowsSessionId: string,
    reason: string,
  ): RuntimeWorkflowRecord[] {
    this.#leases.emergencyStopSession(agentId, windowsSessionId);
    const affected: RuntimeWorkflowRecord[] = [];
    for (const workflow of this.#workflows.values()) {
      const targetsSession = workflow.definition.steps.some(
        (step) =>
          step.targetWindow?.agentId === agentId &&
          step.targetWindow.windowsSessionId === windowsSessionId,
      );
      if (!targetsSession || ["completed", "failed", "cancelled"].includes(workflow.status)) {
        continue;
      }
      this.#controllers
        .get(workflow.definition.workflowId)
        ?.abort(new Error(reason));
      workflow.status = "paused";
      workflow.pauseReason = `emergency_stop:${reason}`;
      workflow.updatedAt = new Date().toISOString();
      this.#audit.append({
        workflowId: workflow.definition.workflowId,
        eventType: "workflow_emergency_stopped",
        details: { agentId, windowsSessionId, reason },
      });
      void this.#saveCheckpoint(workflow);
      affected.push(structuredClone(workflow));
    }
    return affected;
  }

  readySteps(workflowId: string): RuntimeWorkflowStep[] {
    const workflow = this.#workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} was not found.`);
    this.#refreshDependencyStates(workflow);
    return Object.values(workflow.steps)
      .filter((record) => record.status === "ready")
      .map((record) => structuredClone(record.step));
  }

  async runNext(
    workflowId: string,
    executor: WorkflowStepExecutor,
  ): Promise<RuntimeWorkflowRecord> {
    const workflow = this.#workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} was not found.`);
    if (["completed", "failed", "cancelled"].includes(workflow.status)) {
      return structuredClone(workflow);
    }
    if (["paused", "blocked", "recovery_required"].includes(workflow.status)) {
      throw new Error(`Workflow ${workflowId} cannot run while ${workflow.status}.`);
    }
    workflow.status = "running";
    this.#refreshDependencyStates(workflow);
    const next = Object.values(workflow.steps).find((record) => record.status === "ready");
    if (!next) {
      this.#finalizeWorkflowStatus(workflow);
      await this.#saveCheckpoint(workflow);
      return structuredClone(workflow);
    }
    await this.#executeRecord(workflow, next, executor);
    this.#refreshDependencyStates(workflow);
    this.#finalizeWorkflowStatus(workflow);
    await this.#saveCheckpoint(workflow);
    return structuredClone(workflow);
  }

  async runUntilBlocked(
    workflowId: string,
    executor: WorkflowStepExecutor,
    maxSteps = 1_000,
  ): Promise<RuntimeWorkflowRecord> {
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 10_000) {
      throw new Error("maxSteps must be between 1 and 10000.");
    }
    let previousTerminalCount = -1;
    for (let index = 0; index < maxSteps; index += 1) {
      const before = this.get(workflowId);
      const terminalCount = Object.values(before.steps).filter((record) =>
        ["succeeded", "failed", "blocked", "cancelled", "uncertain"].includes(
          record.status,
        ),
      ).length;
      if (
        [
          "completed",
          "failed",
          "cancelled",
          "paused",
          "blocked",
          "recovery_required",
        ].includes(before.status)
      ) {
        return before;
      }
      if (
        terminalCount === previousTerminalCount &&
        this.readySteps(workflowId).length === 0
      ) {
        return before;
      }
      previousTerminalCount = terminalCount;
      await this.runNext(workflowId, executor);
    }
    return this.pause(workflowId, "step_budget_exhausted");
  }

  async hydrate(workflowId: string): Promise<RuntimeWorkflowRecord> {
    const checkpoint = await this.#checkpoints.load(workflowId);
    if (!checkpoint) throw new Error(`Checkpoint ${workflowId} was not found.`);
    const workflow = runtimeWorkflowRecordSchema.parse(checkpoint.workflow);
    for (const record of Object.values(workflow.steps)) {
      if (record.status === "running") {
        record.status = "uncertain";
        record.error =
          "The process stopped while the step was running; external effects must be reconciled.";
      }
    }
    if (Object.values(workflow.steps).some((record) => record.status === "uncertain")) {
      workflow.status = "recovery_required";
      workflow.pauseReason = "uncertain_external_effect";
    }
    workflow.updatedAt = new Date().toISOString();
    this.#artifacts.hydrate(workflowId, checkpoint.artifacts);
    this.#workflows.set(workflowId, workflow);
    this.#audit.append({
      workflowId,
      eventType: "workflow_hydrated",
      details: {
        checkpointVersion: workflow.checkpointVersion,
        status: workflow.status,
      },
    });
    return structuredClone(workflow);
  }

  reconcileUncertainStep(input: {
    workflowId: string;
    stepId: string;
    observedOutcome: "succeeded" | "failed" | "not_applied";
    evidence: string;
  }): RuntimeWorkflowRecord {
    if (!input.evidence.trim()) throw new Error("Recovery evidence is required.");
    const workflow = this.#workflows.get(input.workflowId);
    if (!workflow) throw new Error(`Workflow ${input.workflowId} was not found.`);
    const record = workflow.steps[input.stepId];
    if (!record || record.status !== "uncertain") {
      throw new Error("Only uncertain workflow steps may be reconciled.");
    }
    if (input.observedOutcome === "succeeded") {
      record.status = "succeeded";
      record.verificationStatus = "passed";
      record.summary = input.evidence;
      record.completedAt = new Date().toISOString();
      if (
        record.step.idempotencyKey &&
        !workflow.completedIdempotencyKeys.includes(record.step.idempotencyKey)
      ) {
        workflow.completedIdempotencyKeys.push(record.step.idempotencyKey);
      }
    } else if (input.observedOutcome === "failed") {
      record.status = "failed";
      record.verificationStatus = "failed";
      record.error = input.evidence;
      record.completedAt = new Date().toISOString();
    } else {
      record.status = "pending";
      record.verificationStatus = "not_checked";
      record.error = undefined;
      record.summary = `Retry permitted after observation: ${input.evidence}`;
      record.startedAt = undefined;
      record.completedAt = undefined;
    }
    workflow.status = input.observedOutcome === "failed" ? "failed" : "paused";
    workflow.pauseReason =
      input.observedOutcome === "not_applied"
        ? "reconciled_not_applied"
        : "reconciled_review_required";
    workflow.updatedAt = new Date().toISOString();
    this.#audit.append({
      workflowId: input.workflowId,
      stepId: input.stepId,
      eventType: "uncertain_step_reconciled",
      details: {
        observedOutcome: input.observedOutcome,
        evidence: input.evidence,
      },
    });
    void this.#saveCheckpoint(workflow);
    return structuredClone(workflow);
  }

  async continueWaitingStep(
    workflowId: string,
    stepId: string,
    executor: WorkflowStepExecutor,
  ): Promise<RuntimeWorkflowRecord> {
    const workflow = this.#workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} was not found.`);
    const record = workflow.steps[stepId];
    if (!record || record.status !== "waiting_approval" || !record.proposalId) {
      throw new Error("Only a step waiting for local approval may be continued.");
    }
    workflow.status = "running";
    delete workflow.pauseReason;
    record.status = "ready";
    await this.#executeRecord(workflow, record, executor);
    this.#refreshDependencyStates(workflow);
    this.#finalizeWorkflowStatus(workflow);
    await this.#saveCheckpoint(workflow);
    return structuredClone(workflow);
  }

  async delete(workflowId: string): Promise<void> {
    const workflow = this.#workflows.get(workflowId);
    if (workflow && !["completed", "failed", "cancelled"].includes(workflow.status)) {
      throw new Error("Only terminal workflows may be deleted.");
    }
    this.#workflows.delete(workflowId);
    this.#artifacts.clearWorkflow(workflowId);
    await this.#checkpoints.delete(workflowId);
  }

  async #executeRecord(
    workflow: RuntimeWorkflowRecord,
    record: WorkflowStepRecord,
    executor: WorkflowStepExecutor,
  ): Promise<void> {
    const step = record.step;
    const workflowId = workflow.definition.workflowId;
    const ownerId = `${workflowId}:${step.stepId}`;
    const controller = new AbortController();
    this.#controllers.set(workflowId, controller);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (
        step.idempotencyKey &&
        workflow.completedIdempotencyKeys.includes(step.idempotencyKey)
      ) {
        record.status = "succeeded";
        record.summary =
          "The step was skipped because its idempotency key is already recorded as completed.";
        record.verificationStatus = "passed";
        record.completedAt = new Date().toISOString();
        this.#audit.append({
          workflowId,
          stepId: step.stepId,
          eventType: "step_idempotency_hit",
          details: { idempotencyKey: step.idempotencyKey },
        });
        return;
      }
      if (step.targetWindow) {
        const window = this.#workspaceRegistry.requireFresh(step.targetWindow);
        const workspace = this.#workspaceRegistry.get(step.workspaceId);
        if (!workspace) throw new Error(`Workspace ${step.workspaceId} was not found.`);
        if (
          window.virtualDesktopId &&
          workspace.currentVirtualDesktopId !== window.virtualDesktopId
        ) {
          workflow.status = "paused";
          workflow.pauseReason = "virtual_desktop_unavailable";
          record.status = "blocked";
          record.error = "The target window is not on the current virtual desktop.";
          this.#audit.append({
            workflowId,
            stepId: step.stepId,
            eventType: "step_virtual_desktop_blocked",
            details: {
              targetVirtualDesktopId: window.virtualDesktopId,
              currentVirtualDesktopId: workspace.currentVirtualDesktopId,
            },
          });
          return;
        }
        this.#leases.acquireWindow({
          ownerId,
          window: step.targetWindow,
          mode: step.resourceMode === "read" ? "read" : "write",
          ttlMs: step.timeoutMs,
        });
        if (step.resourceMode === "physical") {
          this.#leases.acquireFocus({
            ownerId,
            session: step.targetWindow,
            ttlMs: step.timeoutMs,
          });
        }
      }
      const inputs = this.#artifacts.require(workflowId, step.inputArtifactNames);
      record.status = "running";
      record.attempts += 1;
      record.startedAt = new Date().toISOString();
      workflow.updatedAt = record.startedAt;
      this.#audit.append({
        workflowId,
        stepId: step.stepId,
        eventType: "step_started",
        details: { attempt: record.attempts, resourceMode: step.resourceMode },
      });
      timeout = setTimeout(
        () => controller.abort(new Error("Workflow step deadline exceeded.")),
        step.timeoutMs,
      );
      const result = await executor.execute({
        workflow: structuredClone(workflow),
        step,
        inputs,
        attempt: record.attempts,
        signal: controller.signal,
        proposalId: record.proposalId,
      });
      if (result.status === "waiting_approval") {
        record.status = "waiting_approval";
        record.proposalId = result.proposalId;
        record.summary = result.summary;
        record.verificationStatus = result.verificationStatus;
        workflow.status = "paused";
        workflow.pauseReason = "local_approval_required";
      } else if (result.status === "succeeded") {
        if (result.verificationStatus !== "passed") {
          record.status = "failed";
          record.error = "A succeeded step must include passed verification.";
          record.verificationStatus = result.verificationStatus;
          workflow.status = "failed";
        } else {
          record.status = "succeeded";
          record.summary = result.summary;
          record.verificationStatus = result.verificationStatus;
          record.completedAt = new Date().toISOString();
          if (
            step.idempotencyKey &&
            !workflow.completedIdempotencyKeys.includes(step.idempotencyKey)
          ) {
            workflow.completedIdempotencyKeys.push(step.idempotencyKey);
          }
          for (const output of result.outputs ?? []) {
            if (!step.outputArtifactNames.includes(output.name)) {
              throw new Error(`Executor emitted undeclared workflow artifact ${output.name}.`);
            }
            this.#artifacts.put({
              workflowId,
              name: output.name,
              value: output.value,
              sourceStepId: step.stepId,
              sourceWindow: step.targetWindow,
              classification: output.classification ?? "internal",
              retention: output.retention ?? "workflow",
            });
          }
        }
      } else if (result.status === "uncertain") {
        record.status = "uncertain";
        record.summary = result.summary;
        record.verificationStatus = result.verificationStatus;
        workflow.status = "recovery_required";
        workflow.pauseReason = "uncertain_external_effect";
      } else {
        record.status = result.status;
        record.summary = result.summary;
        record.error = result.summary;
        record.verificationStatus = result.verificationStatus;
        workflow.status = result.status === "blocked" ? "blocked" : "failed";
        workflow.pauseReason =
          result.status === "blocked" ? "step_blocked" : undefined;
      }
      this.#audit.append({
        workflowId,
        stepId: step.stepId,
        eventType: `step_${record.status}`,
        details: {
          summary: result.summary,
          verificationStatus: result.verificationStatus,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (controller.signal.aborted) {
        record.status = step.externalEffect === "none" ? "failed" : "uncertain";
        workflow.status =
          step.externalEffect === "none" ? "failed" : "recovery_required";
        workflow.pauseReason =
          step.externalEffect === "none" ? undefined : "uncertain_external_effect";
      } else {
        record.status = "failed";
        workflow.status = "failed";
      }
      record.error = message;
      record.verificationStatus = "not_checked";
      record.completedAt = new Date().toISOString();
      this.#audit.append({
        workflowId,
        stepId: step.stepId,
        eventType: "step_exception",
        details: { message, status: record.status },
      });
    } finally {
      if (timeout) clearTimeout(timeout);
      this.#controllers.delete(workflowId);
      this.#leases.releaseOwner(ownerId);
      workflow.updatedAt = new Date().toISOString();
    }
  }

  #refreshDependencyStates(workflow: RuntimeWorkflowRecord): void {
    const byId = workflow.steps;
    for (const record of Object.values(byId)) {
      if (!["pending", "ready"].includes(record.status)) continue;
      const dependencies = record.step.dependsOn.map((id) => byId[id]);
      if (dependencies.some((dependency) => !dependency)) {
        record.status = "blocked";
        record.error = "A workflow dependency is missing.";
        continue;
      }
      if (
        dependencies.some(
          (dependency) =>
            dependency &&
            ["failed", "blocked", "cancelled", "uncertain"].includes(
              dependency.status,
            ),
        )
      ) {
        record.status = "blocked";
        record.error = "A required dependency did not complete successfully.";
      } else if (
        dependencies.every((dependency) => dependency?.status === "succeeded")
      ) {
        record.status = "ready";
      }
    }
  }

  #finalizeWorkflowStatus(workflow: RuntimeWorkflowRecord): void {
    const records = Object.values(workflow.steps);
    if (records.every((record) => record.status === "succeeded")) {
      workflow.status = "completed";
      delete workflow.pauseReason;
      this.#audit.append({
        workflowId: workflow.definition.workflowId,
        eventType: "workflow_completed",
        details: {},
      });
      return;
    }
    if (records.some((record) => record.status === "uncertain")) {
      workflow.status = "recovery_required";
      workflow.pauseReason = "uncertain_external_effect";
      return;
    }
    if (records.some((record) => record.status === "failed")) {
      workflow.status = "failed";
      return;
    }
    if (records.some((record) => record.status === "waiting_approval")) {
      workflow.status = "paused";
      workflow.pauseReason = "local_approval_required";
      return;
    }
    if (records.some((record) => record.status === "blocked")) {
      workflow.status = "blocked";
      workflow.pauseReason ??= "step_blocked";
    }
  }

  #validateStepMetadata(definition: RuntimeWorkflowDefinition): void {
    const outputOwners = new Map<string, string>();
    const idempotencyKeys = new Set<string>();
    for (const step of definition.steps) {
      for (const output of step.outputArtifactNames) {
        const prior = outputOwners.get(output);
        if (prior) {
          throw new Error(
            `Workflow artifact ${output} is declared by both ${prior} and ${step.stepId}.`,
          );
        }
        outputOwners.set(output, step.stepId);
      }
      if (
        step.desktopAction?.targetWindowId &&
        step.targetWindow &&
        step.desktopAction.targetWindowId !== step.targetWindow.windowId
      ) {
        throw new Error(
          `Desktop action target ${step.desktopAction.targetWindowId} does not match workflow window ${step.targetWindow.windowId}.`,
        );
      }
      if (step.idempotencyKey) {
        if (idempotencyKeys.has(step.idempotencyKey)) {
          throw new Error(`Duplicate idempotency key ${step.idempotencyKey}.`);
        }
        idempotencyKeys.add(step.idempotencyKey);
      }
    }
    const ancestors = new Map<string, Set<string>>();
    const byId = new Map(definition.steps.map((step) => [step.stepId, step]));
    const collect = (stepId: string): Set<string> => {
      const existing = ancestors.get(stepId);
      if (existing) return existing;
      const result = new Set<string>();
      for (const dependency of byId.get(stepId)?.dependsOn ?? []) {
        result.add(dependency);
        for (const ancestor of collect(dependency)) result.add(ancestor);
      }
      ancestors.set(stepId, result);
      return result;
    };
    for (const step of definition.steps) {
      const availableAncestors = collect(step.stepId);
      for (const input of step.inputArtifactNames) {
        const owner = outputOwners.get(input);
        if (!owner) throw new Error(`Input artifact ${input} has no declared producer.`);
        if (!availableAncestors.has(owner)) {
          throw new Error(
            `Input artifact ${input} is not produced by a dependency of ${step.stepId}.`,
          );
        }
      }
    }
  }

  #requireMutable(workflowId: string): RuntimeWorkflowRecord {
    const workflow = this.#workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} was not found.`);
    if (["completed", "failed", "cancelled"].includes(workflow.status)) {
      throw new Error(`Workflow ${workflowId} is terminal and cannot be modified.`);
    }
    return workflow;
  }

  async #saveCheckpoint(workflow: RuntimeWorkflowRecord): Promise<void> {
    workflow.checkpointVersion += 1;
    workflow.updatedAt = new Date().toISOString();
    await this.#checkpoints.save(
      structuredClone(workflow),
      this.#artifacts.list(workflow.definition.workflowId),
    );
  }
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function redactDetails(details: Record<string, unknown>): Record<string, unknown> {
  const forbidden = /(token|password|secret|cookie|authorization|private.?key)/i;
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      forbidden.test(key) ? "[REDACTED]" : value,
    ]),
  );
}
