import { randomUUID } from "node:crypto";
import { z } from "zod";

export const windowReferenceSchema = z.object({
  agentId: z.string().min(1),
  windowsSessionId: z.string().min(1),
  windowId: z.string().min(1),
  windowGeneration: z.number().int().positive(),
});
export type WindowReference = z.infer<typeof windowReferenceSchema>;

export const workspaceWindowSchema = windowReferenceSchema.extend({
  processId: z.number().int().nonnegative(),
  processName: z.string().min(1),
  fingerprint: z.string().min(1),
  virtualDesktopId: z.string().min(1).nullable().default(null),
  isActive: z.boolean(),
  isVisible: z.boolean(),
  isMinimized: z.boolean(),
});
export type WorkspaceWindow = z.infer<typeof workspaceWindowSchema>;

export const workspaceSnapshotSchema = z.object({
  contractVersion: z.literal(1),
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  windowsSessionId: z.string().min(1),
  currentVirtualDesktopId: z.string().min(1).nullable().default(null),
  windowRegistryVersion: z.number().int().nonnegative(),
  capturedAt: z.string().datetime(),
  unexpectedDialogWindowId: z.string().min(1).nullable().default(null),
  windows: z.array(workspaceWindowSchema),
});
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;

export const workflowStepSchema = z.object({
  stepId: z.string().min(1),
  dependsOn: z.array(z.string().min(1)).default([]),
  workspaceId: z.string().min(1),
  targetWindow: windowReferenceSchema.optional(),
  resourceMode: z.enum(["read", "write", "physical"]),
  actionIntent: z.string().min(1).max(2_000),
  expectedResult: z.string().min(1).max(2_000),
  timeoutMs: z.number().int().min(100).max(300_000),
});
export type WorkflowStep = z.infer<typeof workflowStepSchema>;

export const workflowDefinitionSchema = z.object({
  contractVersion: z.literal(1),
  workflowId: z.string().min(1),
  requestedBy: z.string().min(1),
  riskCeiling: z.enum(["info", "low", "medium", "high", "critical"]),
  steps: z.array(workflowStepSchema).min(1).max(1_000),
});
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

export type LockMode = "read" | "write";

export type ResourceLease = {
  leaseId: string;
  ownerId: string;
  resourceKey: string;
  mode: LockMode;
  expiresAt: string;
};

export type FocusLease = {
  leaseId: string;
  ownerId: string;
  sessionKey: string;
  expiresAt: string;
};

function resourceKey(reference: WindowReference): string {
  return [reference.agentId, reference.windowsSessionId, reference.windowId, reference.windowGeneration].join(":");
}

function sessionKey(reference: Pick<WindowReference, "agentId" | "windowsSessionId">): string {
  return `${reference.agentId}:${reference.windowsSessionId}`;
}

export class WorkspaceRegistry {
  readonly #snapshots = new Map<string, WorkspaceSnapshot>();

  update(input: WorkspaceSnapshot): WorkspaceSnapshot {
    const snapshot = workspaceSnapshotSchema.parse(input);
    const prior = this.#snapshots.get(snapshot.workspaceId);
    if (prior) {
      if (prior.agentId !== snapshot.agentId || prior.windowsSessionId !== snapshot.windowsSessionId) {
        throw new Error("A workspace cannot change agent or Windows session identity.");
      }
      if (snapshot.windowRegistryVersion <= prior.windowRegistryVersion) {
        throw new Error("Workspace registry versions must increase monotonically.");
      }
      const priorById = new Map(prior.windows.map((window) => [window.windowId, window]));
      for (const window of snapshot.windows) {
        const oldWindow = priorById.get(window.windowId);
        if (!oldWindow) continue;
        if (window.windowGeneration < oldWindow.windowGeneration) {
          throw new Error(`Window ${window.windowId} generation moved backwards.`);
        }
        if (window.fingerprint !== oldWindow.fingerprint && window.windowGeneration <= oldWindow.windowGeneration) {
          throw new Error(`Window ${window.windowId} changed identity without a new generation.`);
        }
      }
    }
    this.#snapshots.set(snapshot.workspaceId, snapshot);
    return snapshot;
  }

  get(workspaceId: string): WorkspaceSnapshot | undefined {
    return this.#snapshots.get(workspaceId);
  }

  requireFresh(reference: WindowReference): WorkspaceWindow {
    const snapshot = [...this.#snapshots.values()].find(
      (candidate) =>
        candidate.agentId === reference.agentId && candidate.windowsSessionId === reference.windowsSessionId,
    );
    const window = snapshot?.windows.find(
      (candidate) =>
        candidate.windowId === reference.windowId && candidate.windowGeneration === reference.windowGeneration,
    );
    if (!window) throw new Error("The target window generation is stale or unavailable.");
    if (!window.isVisible || window.isMinimized) throw new Error("The target window is not presently available.");
    if (snapshot?.unexpectedDialogWindowId && snapshot.unexpectedDialogWindowId !== reference.windowId) {
      throw new Error("An unexpected dialog blocks workflow execution.");
    }
    return window;
  }
}

export class WorkflowCatalog {
  readonly #workflows = new Map<string, WorkflowDefinition>();

  create(input: WorkflowDefinition): WorkflowDefinition {
    const workflow = workflowDefinitionSchema.parse(input);
    if (this.#workflows.has(workflow.workflowId)) throw new Error("Workflow IDs must be unique.");
    validateWorkflowGraph(workflow);
    this.#workflows.set(workflow.workflowId, workflow);
    return workflow;
  }

  get(workflowId: string): WorkflowDefinition | undefined {
    return this.#workflows.get(workflowId);
  }
}

export class CoordinatorLeaseManager {
  readonly #resourceLeases = new Map<string, ResourceLease[]>();
  readonly #focusLeases = new Map<string, FocusLease>();

  acquireWindow(input: {
    ownerId: string;
    window: WindowReference;
    mode: LockMode;
    ttlMs: number;
    now?: Date;
  }): ResourceLease {
    const now = input.now ?? new Date();
    this.expire(now);
    const key = resourceKey(windowReferenceSchema.parse(input.window));
    const existing = this.#resourceLeases.get(key) ?? [];
    const conflict = existing.some(
      (lease) => lease.ownerId !== input.ownerId && (lease.mode === "write" || input.mode === "write"),
    );
    if (conflict) throw new Error("The target window already has a conflicting lease.");
    const lease: ResourceLease = {
      leaseId: `window-lease-${randomUUID()}`,
      ownerId: input.ownerId,
      resourceKey: key,
      mode: input.mode,
      expiresAt: expiry(now, input.ttlMs),
    };
    this.#resourceLeases.set(key, [...existing.filter((item) => item.ownerId !== input.ownerId), lease]);
    return lease;
  }

  acquireFocus(input: {
    ownerId: string;
    session: Pick<WindowReference, "agentId" | "windowsSessionId">;
    ttlMs: number;
    now?: Date;
  }): FocusLease {
    const now = input.now ?? new Date();
    this.expire(now);
    const key = sessionKey(input.session);
    const existing = this.#focusLeases.get(key);
    if (existing && existing.ownerId !== input.ownerId) {
      throw new Error("The Windows session already has an exclusive focus lease.");
    }
    const lease: FocusLease = {
      leaseId: `focus-lease-${randomUUID()}`,
      ownerId: input.ownerId,
      sessionKey: key,
      expiresAt: expiry(now, input.ttlMs),
    };
    this.#focusLeases.set(key, lease);
    return lease;
  }

  releaseOwner(ownerId: string): void {
    for (const [key, leases] of this.#resourceLeases) {
      const remaining = leases.filter((lease) => lease.ownerId !== ownerId);
      if (remaining.length === 0) this.#resourceLeases.delete(key);
      else this.#resourceLeases.set(key, remaining);
    }
    for (const [key, lease] of this.#focusLeases) {
      if (lease.ownerId === ownerId) this.#focusLeases.delete(key);
    }
  }

  emergencyStopSession(agentId: string, windowsSessionId: string): void {
    const prefix = `${agentId}:${windowsSessionId}:`;
    for (const key of this.#resourceLeases.keys()) {
      if (key.startsWith(prefix)) this.#resourceLeases.delete(key);
    }
    this.#focusLeases.delete(`${agentId}:${windowsSessionId}`);
  }

  expire(now = new Date()): void {
    const nowMs = now.getTime();
    for (const [key, leases] of this.#resourceLeases) {
      const active = leases.filter((lease) => Date.parse(lease.expiresAt) > nowMs);
      if (active.length === 0) this.#resourceLeases.delete(key);
      else this.#resourceLeases.set(key, active);
    }
    for (const [key, lease] of this.#focusLeases) {
      if (Date.parse(lease.expiresAt) <= nowMs) this.#focusLeases.delete(key);
    }
  }

  snapshot(): { resourceLeases: ResourceLease[]; focusLeases: FocusLease[] } {
    return {
      resourceLeases: [...this.#resourceLeases.values()].flat(),
      focusLeases: [...this.#focusLeases.values()],
    };
  }
}

export function validateWorkflowGraph(workflow: WorkflowDefinition): void {
  const stepIds = new Set<string>();
  for (const step of workflow.steps) {
    if (stepIds.has(step.stepId)) throw new Error(`Duplicate workflow step ${step.stepId}.`);
    stepIds.add(step.stepId);
  }
  for (const step of workflow.steps) {
    if (step.dependsOn.includes(step.stepId)) throw new Error(`Workflow step ${step.stepId} depends on itself.`);
    for (const dependency of step.dependsOn) {
      if (!stepIds.has(dependency)) throw new Error(`Workflow step ${step.stepId} has unknown dependency ${dependency}.`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(workflow.steps.map((step) => [step.stepId, step]));
  const visit = (stepId: string): void => {
    if (visiting.has(stepId)) throw new Error("Workflow graph contains a cycle.");
    if (visited.has(stepId)) return;
    visiting.add(stepId);
    for (const dependency of byId.get(stepId)?.dependsOn ?? []) visit(dependency);
    visiting.delete(stepId);
    visited.add(stepId);
  };
  for (const stepId of stepIds) visit(stepId);
}

function expiry(now: Date, ttlMs: number): string {
  if (!Number.isInteger(ttlMs) || ttlMs < 100 || ttlMs > 300_000) {
    throw new Error("Lease TTL must be an integer between 100 and 300000 milliseconds.");
  }
  return new Date(now.getTime() + ttlMs).toISOString();
}
