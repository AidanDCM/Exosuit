import { randomUUID } from "node:crypto";
import { z } from "zod";

export const resourceQuotaSchema = z.object({
  maximumTrackedWindows: z.number().int().min(1).max(100_000),
  maximumActiveWorkflows: z.number().int().min(1).max(10_000),
  maximumRegisteredAgents: z.number().int().min(1).max(10_000),
  maximumQueuedStepsPerSession: z.number().int().min(1).max(100_000),
  maximumConcurrentObservations: z.number().int().min(1).max(1_000),
  maximumAuditBytes: z.number().int().min(1_024).max(10 * 1024 * 1024 * 1024),
});
export type ResourceQuota = z.infer<typeof resourceQuotaSchema>;

export const DEFAULT_RESOURCE_QUOTA: ResourceQuota = {
  maximumTrackedWindows: 500,
  maximumActiveWorkflows: 100,
  maximumRegisteredAgents: 25,
  maximumQueuedStepsPerSession: 1_000,
  maximumConcurrentObservations: 8,
  maximumAuditBytes: 512 * 1024 * 1024,
};

export type ResourceSnapshot = {
  trackedWindows: number;
  activeWorkflows: number;
  registeredAgents: number;
  queuedStepsBySession: Record<string, number>;
  concurrentObservations: number;
  auditBytes: number;
};

export type AdmissionDecision =
  | { allowed: true; reason: "within_quota" }
  | { allowed: false; reason: string; retryable: boolean };

export class ResourceAdmissionController {
  readonly #quota: ResourceQuota;

  constructor(quota: ResourceQuota = DEFAULT_RESOURCE_QUOTA) {
    this.#quota = resourceQuotaSchema.parse(quota);
  }

  evaluate(snapshot: ResourceSnapshot): AdmissionDecision {
    validateCounts(snapshot);
    if (snapshot.trackedWindows > this.#quota.maximumTrackedWindows) {
      return denied("tracked_window_quota_exceeded", false);
    }
    if (snapshot.activeWorkflows > this.#quota.maximumActiveWorkflows) {
      return denied("active_workflow_quota_exceeded", true);
    }
    if (snapshot.registeredAgents > this.#quota.maximumRegisteredAgents) {
      return denied("registered_agent_quota_exceeded", false);
    }
    if (snapshot.concurrentObservations > this.#quota.maximumConcurrentObservations) {
      return denied("observation_concurrency_quota_exceeded", true);
    }
    if (snapshot.auditBytes > this.#quota.maximumAuditBytes) {
      return denied("audit_storage_quota_exceeded", false);
    }
    for (const [session, count] of Object.entries(snapshot.queuedStepsBySession)) {
      if (count > this.#quota.maximumQueuedStepsPerSession) {
        return denied(`session_queue_quota_exceeded:${session}`, true);
      }
    }
    return { allowed: true, reason: "within_quota" };
  }
}

export const latencyMetricSchema = z.enum([
  "observation",
  "proposal",
  "focus_switch",
  "motor_start",
  "emergency_stop",
  "scheduler",
]);
export type LatencyMetric = z.infer<typeof latencyMetricSchema>;

export type LatencySummary = {
  metric: LatencyMetric;
  sampleCount: number;
  minimumMs: number;
  maximumMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
};

export class LatencyRecorder {
  readonly #maximumSamplesPerMetric: number;
  readonly #samples = new Map<LatencyMetric, number[]>();

  constructor(maximumSamplesPerMetric = 10_000) {
    if (!Number.isInteger(maximumSamplesPerMetric) || maximumSamplesPerMetric < 10 || maximumSamplesPerMetric > 1_000_000) {
      throw new Error("maximumSamplesPerMetric must be between 10 and 1000000.");
    }
    this.#maximumSamplesPerMetric = maximumSamplesPerMetric;
  }

  record(metric: LatencyMetric, milliseconds: number): void {
    const parsedMetric = latencyMetricSchema.parse(metric);
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 86_400_000) {
      throw new Error("Latency must be a finite nonnegative value no greater than one day.");
    }
    const samples = this.#samples.get(parsedMetric) ?? [];
    samples.push(milliseconds);
    if (samples.length > this.#maximumSamplesPerMetric) samples.splice(0, samples.length - this.#maximumSamplesPerMetric);
    this.#samples.set(parsedMetric, samples);
  }

  summarize(metric: LatencyMetric): LatencySummary | undefined {
    const samples = this.#samples.get(latencyMetricSchema.parse(metric));
    if (!samples?.length) return undefined;
    const sorted = [...samples].sort((left, right) => left - right);
    return {
      metric,
      sampleCount: sorted.length,
      minimumMs: sorted[0]!,
      maximumMs: sorted.at(-1)!,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      p99Ms: percentile(sorted, 0.99),
    };
  }

  summaries(): LatencySummary[] {
    return latencyMetricSchema.options
      .map((metric) => this.summarize(metric))
      .filter((summary): summary is LatencySummary => Boolean(summary));
  }
}

export type QueueItem<T> = {
  queueItemId: string;
  sessionKey: string;
  enqueuedAt: string;
  payload: T;
};

export class BoundedSessionQueue<T> {
  readonly #maximumPerSession: number;
  readonly #queues = new Map<string, QueueItem<T>[]>();

  constructor(maximumPerSession = DEFAULT_RESOURCE_QUOTA.maximumQueuedStepsPerSession) {
    if (!Number.isInteger(maximumPerSession) || maximumPerSession < 1 || maximumPerSession > 100_000) {
      throw new Error("maximumPerSession must be between 1 and 100000.");
    }
    this.#maximumPerSession = maximumPerSession;
  }

  enqueue(sessionKey: string, payload: T): QueueItem<T> {
    if (!sessionKey.trim()) throw new Error("A session key is required.");
    const queue = this.#queues.get(sessionKey) ?? [];
    if (queue.length >= this.#maximumPerSession) {
      throw new Error("Session queue is at capacity; backpressure is active.");
    }
    const item = {
      queueItemId: randomUUID(),
      sessionKey,
      enqueuedAt: new Date().toISOString(),
      payload,
    };
    queue.push(item);
    this.#queues.set(sessionKey, queue);
    return structuredClone(item);
  }

  dequeue(sessionKey: string): QueueItem<T> | undefined {
    const queue = this.#queues.get(sessionKey);
    const item = queue?.shift();
    if (queue && queue.length === 0) this.#queues.delete(sessionKey);
    return item ? structuredClone(item) : undefined;
  }

  clear(sessionKey: string): number {
    const count = this.#queues.get(sessionKey)?.length ?? 0;
    this.#queues.delete(sessionKey);
    return count;
  }

  size(sessionKey?: string): number {
    if (sessionKey) return this.#queues.get(sessionKey)?.length ?? 0;
    return [...this.#queues.values()].reduce((total, queue) => total + queue.length, 0);
  }
}

function denied(reason: string, retryable: boolean): AdmissionDecision {
  return { allowed: false, reason, retryable };
}

function validateCounts(snapshot: ResourceSnapshot): void {
  const counts = [
    snapshot.trackedWindows,
    snapshot.activeWorkflows,
    snapshot.registeredAgents,
    snapshot.concurrentObservations,
    snapshot.auditBytes,
    ...Object.values(snapshot.queuedStepsBySession),
  ];
  if (counts.some((count) => !Number.isInteger(count) || count < 0)) {
    throw new Error("Resource snapshots require nonnegative integer counts.");
  }
}

function percentile(sorted: number[], fraction: number): number {
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index]!;
}
