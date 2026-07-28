import { z } from "zod";
import { fieldRefSchema, type FieldRef } from "./fieldContracts.js";

export const fieldHeartbeatSchema = z.object({
  contractVersion: z.literal(1),
  field: fieldRefSchema,
  agentId: z.string().min(1).max(200),
  bootId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  observedAt: z.string().datetime(),
  lifecycle: z.enum(["provisioning", "ready", "teaching", "shadowing", "piloting", "stopping", "faulted"]),
  desktopReady: z.boolean(),
  sessionLocked: z.boolean(),
  secureDesktopActive: z.boolean(),
  inputQueueDepth: z.number().int().nonnegative().max(100_000),
  pendingCommandCount: z.number().int().nonnegative().max(100_000),
  workingSetBytes: z.number().int().nonnegative(),
  lastErrorCode: z.string().min(1).max(300).optional(),
});
export type FieldHeartbeat = z.infer<typeof fieldHeartbeatSchema>;

export const fieldHealthStateSchema = z.enum(["unknown", "healthy", "degraded", "faulted"]);
export type FieldHealthState = z.infer<typeof fieldHealthStateSchema>;

export interface FieldHealthAssessment {
  state: FieldHealthState;
  ageMilliseconds?: number;
  reason: string;
  heartbeat?: FieldHeartbeat;
}

export class FieldHeartbeatMonitor {
  readonly #field: FieldRef;
  readonly #agentId: string;
  readonly #degradedAfterMs: number;
  readonly #faultAfterMs: number;
  readonly #maximumFutureSkewMs: number;
  #latest?: FieldHeartbeat;

  constructor(input: {
    field: FieldRef;
    agentId: string;
    degradedAfterMs?: number;
    faultAfterMs?: number;
    maximumFutureSkewMs?: number;
  }) {
    this.#field = fieldRefSchema.parse(input.field);
    if (!input.agentId.trim()) throw new Error("A Field heartbeat agent ID is required.");
    this.#agentId = input.agentId;
    this.#degradedAfterMs = input.degradedAfterMs ?? 5_000;
    this.#faultAfterMs = input.faultAfterMs ?? 15_000;
    this.#maximumFutureSkewMs = input.maximumFutureSkewMs ?? 2_000;
    if (
      !Number.isInteger(this.#degradedAfterMs) ||
      !Number.isInteger(this.#faultAfterMs) ||
      this.#degradedAfterMs < 1 ||
      this.#faultAfterMs <= this.#degradedAfterMs ||
      this.#faultAfterMs > 300_000
    ) {
      throw new Error("Heartbeat thresholds must be positive and faultAfterMs must be greater than degradedAfterMs.");
    }
    if (!Number.isInteger(this.#maximumFutureSkewMs) || this.#maximumFutureSkewMs < 0 || this.#maximumFutureSkewMs > 60_000) {
      throw new Error("maximumFutureSkewMs must be from 0 through 60,000.");
    }
  }

  accept(input: FieldHeartbeat, now = new Date()): FieldHeartbeat {
    const heartbeat = fieldHeartbeatSchema.parse(input);
    if (
      heartbeat.field.fieldId !== this.#field.fieldId ||
      heartbeat.field.fieldGeneration !== this.#field.fieldGeneration
    ) {
      throw new Error("Heartbeat cannot cross Field generations.");
    }
    if (heartbeat.agentId !== this.#agentId) throw new Error("Heartbeat agent identity is invalid.");
    const observedAt = new Date(heartbeat.observedAt).getTime();
    if (observedAt > now.getTime() + this.#maximumFutureSkewMs) throw new Error("Heartbeat timestamp is too far in the future.");
    if (this.#latest) {
      if (heartbeat.bootId !== this.#latest.bootId) throw new Error("Guest boot identity changed inside one Field generation.");
      if (heartbeat.sequence <= this.#latest.sequence) throw new Error("Heartbeat sequence must increase strictly.");
      if (observedAt < new Date(this.#latest.observedAt).getTime()) throw new Error("Heartbeat timestamps cannot move backwards.");
    }
    if ((heartbeat.sessionLocked || heartbeat.secureDesktopActive) && heartbeat.desktopReady) {
      throw new Error("A locked or secure Field session cannot report the desktop ready.");
    }
    this.#latest = structuredClone(heartbeat);
    return structuredClone(heartbeat);
  }

  assess(now = new Date()): FieldHealthAssessment {
    if (!this.#latest) return { state: "unknown", reason: "No guest heartbeat has been accepted." };
    const heartbeat = structuredClone(this.#latest);
    const ageMilliseconds = Math.max(0, now.getTime() - new Date(heartbeat.observedAt).getTime());
    if (heartbeat.lifecycle === "faulted" || heartbeat.lastErrorCode) {
      return {
        state: "faulted",
        ageMilliseconds,
        reason: heartbeat.lastErrorCode ?? "Guest reported a faulted lifecycle.",
        heartbeat,
      };
    }
    if (ageMilliseconds >= this.#faultAfterMs) {
      return { state: "faulted", ageMilliseconds, reason: "Guest heartbeat expired.", heartbeat };
    }
    if (ageMilliseconds >= this.#degradedAfterMs) {
      return { state: "degraded", ageMilliseconds, reason: "Guest heartbeat is stale.", heartbeat };
    }
    if (heartbeat.sessionLocked) {
      return { state: "degraded", ageMilliseconds, reason: "Guest session is locked.", heartbeat };
    }
    if (heartbeat.secureDesktopActive) {
      return { state: "degraded", ageMilliseconds, reason: "Guest secure desktop is active.", heartbeat };
    }
    return { state: "healthy", ageMilliseconds, reason: "Guest heartbeat is current.", heartbeat };
  }

  latest(): FieldHeartbeat | undefined {
    return this.#latest ? structuredClone(this.#latest) : undefined;
  }
}
