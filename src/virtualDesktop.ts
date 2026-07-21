import { randomUUID } from "node:crypto";
import { z } from "zod";
import { windowReferenceSchema, type WindowReference } from "./coordinator.js";

export const virtualDesktopAssignmentSchema = z.object({
  window: windowReferenceSchema,
  virtualDesktopId: z.string().min(1).nullable(),
});
export type VirtualDesktopAssignment = z.infer<typeof virtualDesktopAssignmentSchema>;

export const virtualDesktopSnapshotSchema = z.object({
  contractVersion: z.literal(1),
  agentId: z.string().min(1),
  windowsSessionId: z.string().min(1),
  version: z.number().int().nonnegative(),
  capturedAt: z.string().datetime(),
  currentVirtualDesktopId: z.string().min(1).nullable(),
  knownVirtualDesktopIds: z.array(z.string().min(1)).max(256),
  assignments: z.array(virtualDesktopAssignmentSchema).max(10_000),
});
export type VirtualDesktopSnapshot = z.infer<typeof virtualDesktopSnapshotSchema>;

export const virtualDesktopTransitionSchema = z.object({
  transitionId: z.string().uuid(),
  agentId: z.string().min(1),
  windowsSessionId: z.string().min(1),
  observedAt: z.string().datetime(),
  previousVirtualDesktopId: z.string().min(1).nullable(),
  currentVirtualDesktopId: z.string().min(1).nullable(),
  invalidatesFocusLease: z.literal(true),
});
export type VirtualDesktopTransition = z.infer<typeof virtualDesktopTransitionSchema>;

export type VirtualDesktopAvailability =
  | { state: "current"; virtualDesktopId: string }
  | { state: "other_desktop"; virtualDesktopId: string }
  | { state: "unassigned"; virtualDesktopId: null }
  | { state: "stale"; virtualDesktopId: null };

export const virtualDesktopSwitchIntentSchema = z.object({
  intentId: z.string().uuid(),
  agentId: z.string().min(1),
  windowsSessionId: z.string().min(1),
  createdAt: z.string().datetime(),
  fromVirtualDesktopId: z.string().min(1).nullable(),
  targetVirtualDesktopId: z.string().min(1),
  reason: z.string().min(1).max(2_000),
  requiresLocalApproval: z.literal(true),
  automaticExecutionAllowed: z.literal(false),
});
export type VirtualDesktopSwitchIntent = z.infer<typeof virtualDesktopSwitchIntentSchema>;

export class VirtualDesktopRegistry {
  readonly #snapshots = new Map<string, VirtualDesktopSnapshot>();
  readonly #transitions: VirtualDesktopTransition[] = [];

  update(input: VirtualDesktopSnapshot): {
    snapshot: VirtualDesktopSnapshot;
    transition?: VirtualDesktopTransition;
  } {
    const snapshot = virtualDesktopSnapshotSchema.parse(input);
    validateSnapshot(snapshot);
    const key = sessionKey(snapshot.agentId, snapshot.windowsSessionId);
    const prior = this.#snapshots.get(key);
    if (prior && snapshot.version <= prior.version) {
      throw new Error("Virtual-desktop snapshot versions must increase monotonically.");
    }
    let transition: VirtualDesktopTransition | undefined;
    if (prior && prior.currentVirtualDesktopId !== snapshot.currentVirtualDesktopId) {
      transition = virtualDesktopTransitionSchema.parse({
        transitionId: randomUUID(),
        agentId: snapshot.agentId,
        windowsSessionId: snapshot.windowsSessionId,
        observedAt: snapshot.capturedAt,
        previousVirtualDesktopId: prior.currentVirtualDesktopId,
        currentVirtualDesktopId: snapshot.currentVirtualDesktopId,
        invalidatesFocusLease: true,
      });
      this.#transitions.push(transition);
    }
    this.#snapshots.set(key, snapshot);
    return {
      snapshot: structuredClone(snapshot),
      ...(transition ? { transition: structuredClone(transition) } : {}),
    };
  }

  get(agentId: string, windowsSessionId: string): VirtualDesktopSnapshot | undefined {
    const snapshot = this.#snapshots.get(sessionKey(agentId, windowsSessionId));
    return snapshot ? structuredClone(snapshot) : undefined;
  }

  transitions(agentId?: string, windowsSessionId?: string): VirtualDesktopTransition[] {
    return this.#transitions
      .filter(
        (transition) =>
          (!agentId || transition.agentId === agentId) &&
          (!windowsSessionId || transition.windowsSessionId === windowsSessionId),
      )
      .map((transition) => structuredClone(transition));
  }

  availability(reference: WindowReference): VirtualDesktopAvailability {
    const snapshot = this.#snapshots.get(sessionKey(reference.agentId, reference.windowsSessionId));
    if (!snapshot) return { state: "stale", virtualDesktopId: null };
    const assignment = snapshot.assignments.find(
      (candidate) =>
        candidate.window.windowId === reference.windowId &&
        candidate.window.windowGeneration === reference.windowGeneration,
    );
    if (!assignment) return { state: "stale", virtualDesktopId: null };
    if (!assignment.virtualDesktopId) return { state: "unassigned", virtualDesktopId: null };
    if (assignment.virtualDesktopId === snapshot.currentVirtualDesktopId) {
      return { state: "current", virtualDesktopId: assignment.virtualDesktopId };
    }
    return { state: "other_desktop", virtualDesktopId: assignment.virtualDesktopId };
  }

  createSwitchIntent(input: {
    agentId: string;
    windowsSessionId: string;
    targetVirtualDesktopId: string;
    reason: string;
  }): VirtualDesktopSwitchIntent {
    const snapshot = this.#snapshots.get(sessionKey(input.agentId, input.windowsSessionId));
    if (!snapshot) throw new Error("A fresh virtual-desktop snapshot is required.");
    if (!snapshot.knownVirtualDesktopIds.includes(input.targetVirtualDesktopId)) {
      throw new Error("The requested virtual desktop is not present in the fresh snapshot.");
    }
    if (snapshot.currentVirtualDesktopId === input.targetVirtualDesktopId) {
      throw new Error("The requested virtual desktop is already current.");
    }
    return virtualDesktopSwitchIntentSchema.parse({
      intentId: randomUUID(),
      agentId: input.agentId,
      windowsSessionId: input.windowsSessionId,
      createdAt: new Date().toISOString(),
      fromVirtualDesktopId: snapshot.currentVirtualDesktopId,
      targetVirtualDesktopId: input.targetVirtualDesktopId,
      reason: input.reason,
      requiresLocalApproval: true,
      automaticExecutionAllowed: false,
    });
  }
}

function validateSnapshot(snapshot: VirtualDesktopSnapshot): void {
  const known = new Set(snapshot.knownVirtualDesktopIds);
  if (known.size !== snapshot.knownVirtualDesktopIds.length) {
    throw new Error("Virtual-desktop identifiers must be unique.");
  }
  if (snapshot.currentVirtualDesktopId && !known.has(snapshot.currentVirtualDesktopId)) {
    throw new Error("The current virtual desktop must be included in knownVirtualDesktopIds.");
  }
  const assignments = new Set<string>();
  for (const assignment of snapshot.assignments) {
    if (
      assignment.window.agentId !== snapshot.agentId ||
      assignment.window.windowsSessionId !== snapshot.windowsSessionId
    ) {
      throw new Error("Window assignments cannot cross an agent or Windows session boundary.");
    }
    if (assignment.virtualDesktopId && !known.has(assignment.virtualDesktopId)) {
      throw new Error("A window assignment references an unknown virtual desktop.");
    }
    const key = `${assignment.window.windowId}:${assignment.window.windowGeneration}`;
    if (assignments.has(key)) throw new Error("A window generation may have only one desktop assignment.");
    assignments.add(key);
  }
}

function sessionKey(agentId: string, windowsSessionId: string): string {
  return `${agentId}:${windowsSessionId}`;
}
