import { z } from "zod";

export const metricNameSchema = z.enum([
  "observation_latency_ms",
  "semantic_proposal_latency_ms",
  "focus_switch_latency_ms",
  "motor_start_latency_ms",
  "emergency_stop_latency_ms",
  "workflow_scheduler_latency_ms",
  "tracked_window_count",
  "active_workflow_count",
  "connected_agent_count",
  "audit_storage_bytes",
  "process_memory_bytes",
  "idle_cpu_percent",
]);
export type MetricName = z.infer<typeof metricNameSchema>;

export const metricSampleSchema = z.object({
  metric: metricNameSchema,
  value: z.number().finite().nonnegative(),
  observedAt: z.string().datetime(),
  profile: z.string().min(1).max(200),
});
export type MetricSample = z.infer<typeof metricSampleSchema>;

export const resourceLimitsSchema = z.object({
  maximumTrackedWindows: z.number().int().min(1).max(100_000),
  maximumActiveWorkflows: z.number().int().min(1).max(100_000),
  maximumConnectedAgents: z.number().int().min(1).max(10_000),
  maximumAuditStorageBytes: z.number().int().min(1_024),
  maximumProcessMemoryBytes: z.number().int().min(1_024),
  maximumIdleCpuPercent: z.number().min(0).max(100),
});
export type ResourceLimits = z.infer<typeof resourceLimitsSchema>;

export const performanceThresholdSchema = z.object({
  metric: metricNameSchema,
  percentile: z.enum(["p50", "p95", "p99", "max"]),
  maximum: z.number().finite().nonnegative(),
  minimumSamples: z.number().int().min(1).max(1_000_000),
});
export type PerformanceThreshold = z.infer<typeof performanceThresholdSchema>;

export type MetricSummary = {
  metric: MetricName;
  count: number;
  minimum: number;
  p50: number;
  p95: number;
  p99: number;
  maximum: number;
  average: number;
};

export type AdmissionDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "tracked_window_limit"
        | "active_workflow_limit"
        | "connected_agent_limit"
        | "audit_storage_limit"
        | "memory_limit"
        | "idle_cpu_limit";
    };

export class PerformanceLedger {
  readonly #samples = new Map<MetricName, MetricSample[]>();
  readonly #maximumSamplesPerMetric: number;

  constructor(maximumSamplesPerMetric = 10_000) {
    if (!Number.isInteger(maximumSamplesPerMetric) || maximumSamplesPerMetric < 10 || maximumSamplesPerMetric > 1_000_000) {
      throw new Error("maximumSamplesPerMetric must be between 10 and 1000000.");
    }
    this.#maximumSamplesPerMetric = maximumSamplesPerMetric;
  }

  record(input: MetricSample): MetricSample {
    const sample = metricSampleSchema.parse(input);
    const existing = this.#samples.get(sample.metric) ?? [];
    existing.push(sample);
    if (existing.length > this.#maximumSamplesPerMetric) {
      existing.splice(0, existing.length - this.#maximumSamplesPerMetric);
    }
    this.#samples.set(sample.metric, existing);
    return structuredClone(sample);
  }

  summary(metric: MetricName, profile?: string): MetricSummary | undefined {
    const values = (this.#samples.get(metric) ?? [])
      .filter((sample) => !profile || sample.profile === profile)
      .map((sample) => sample.value)
      .sort((left, right) => left - right);
    if (values.length === 0) return undefined;
    return {
      metric,
      count: values.length,
      minimum: values[0]!,
      p50: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      p99: percentile(values, 0.99),
      maximum: values[values.length - 1]!,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
    };
  }

  evaluate(thresholds: PerformanceThreshold[], profile?: string): Array<{
    threshold: PerformanceThreshold;
    passed: boolean;
    actual?: number;
    reason?: string;
  }> {
    return thresholds.map((input) => {
      const threshold = performanceThresholdSchema.parse(input);
      const summary = this.summary(threshold.metric, profile);
      if (!summary || summary.count < threshold.minimumSamples) {
        return {
          threshold,
          passed: false,
          reason: `Insufficient samples: ${summary?.count ?? 0}/${threshold.minimumSamples}.`,
        };
      }
      const actual = threshold.percentile === "max" ? summary.maximum : summary[threshold.percentile];
      return { threshold, passed: actual <= threshold.maximum, actual };
    });
  }
}

export class ResourceGovernor {
  readonly #limits: ResourceLimits;

  constructor(limits: ResourceLimits) {
    this.#limits = resourceLimitsSchema.parse(limits);
  }

  admit(input: {
    trackedWindows: number;
    activeWorkflows: number;
    connectedAgents: number;
    auditStorageBytes: number;
    processMemoryBytes: number;
    idleCpuPercent: number;
  }): AdmissionDecision {
    const values = z
      .object({
        trackedWindows: z.number().int().nonnegative(),
        activeWorkflows: z.number().int().nonnegative(),
        connectedAgents: z.number().int().nonnegative(),
        auditStorageBytes: z.number().int().nonnegative(),
        processMemoryBytes: z.number().int().nonnegative(),
        idleCpuPercent: z.number().min(0).max(100),
      })
      .parse(input);
    if (values.trackedWindows >= this.#limits.maximumTrackedWindows) {
      return { allowed: false, reason: "tracked_window_limit" };
    }
    if (values.activeWorkflows >= this.#limits.maximumActiveWorkflows) {
      return { allowed: false, reason: "active_workflow_limit" };
    }
    if (values.connectedAgents >= this.#limits.maximumConnectedAgents) {
      return { allowed: false, reason: "connected_agent_limit" };
    }
    if (values.auditStorageBytes >= this.#limits.maximumAuditStorageBytes) {
      return { allowed: false, reason: "audit_storage_limit" };
    }
    if (values.processMemoryBytes >= this.#limits.maximumProcessMemoryBytes) {
      return { allowed: false, reason: "memory_limit" };
    }
    if (values.idleCpuPercent >= this.#limits.maximumIdleCpuPercent) {
      return { allowed: false, reason: "idle_cpu_limit" };
    }
    return { allowed: true };
  }
}

export class ConcurrencyGate {
  readonly #limit: number;
  #active = 0;
  readonly #waiters: Array<() => void> = [];

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100_000) {
      throw new Error("Concurrency limit must be between 1 and 100000.");
    }
    this.#limit = limit;
  }

  get active(): number {
    return this.#active;
  }

  get queued(): number {
    return this.#waiters.length;
  }

  async run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.#acquire(signal);
    try {
      return await operation();
    } finally {
      this.#release();
    }
  }

  async #acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason ?? new Error("Concurrency wait cancelled.");
    if (this.#active < this.#limit) {
      this.#active += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const wake = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", abort);
        this.#active += 1;
        resolve();
      };
      const abort = () => {
        if (settled) return;
        settled = true;
        const index = this.#waiters.indexOf(wake);
        if (index >= 0) this.#waiters.splice(index, 1);
        reject(signal?.reason ?? new Error("Concurrency wait cancelled."));
      };
      this.#waiters.push(wake);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }

  #release(): void {
    if (this.#active <= 0) throw new Error("Concurrency gate release underflow.");
    this.#active -= 1;
    const next = this.#waiters.shift();
    if (next) next();
  }
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 1) return values[0]!;
  const index = Math.ceil(fraction * values.length) - 1;
  return values[Math.max(0, Math.min(values.length - 1, index))]!;
}
