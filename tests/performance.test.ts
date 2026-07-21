import { describe, expect, it } from "vitest";
import { ConcurrencyGate, PerformanceLedger, ResourceGovernor } from "../src/performance.js";

describe("performance and resource governance", () => {
  it("computes stable percentiles and enforces minimum sample evidence", () => {
    const ledger = new PerformanceLedger();
    for (let value = 1; value <= 100; value += 1) {
      ledger.record({
        metric: "observation_latency_ms",
        value,
        observedAt: new Date(Date.UTC(2026, 6, 21, 16, 0, value)).toISOString(),
        profile: "ci",
      });
    }
    expect(ledger.summary("observation_latency_ms", "ci")).toMatchObject({
      count: 100,
      minimum: 1,
      p50: 50,
      p95: 95,
      p99: 99,
      maximum: 100,
      average: 50.5,
    });
    expect(
      ledger.evaluate(
        [
          {
            metric: "observation_latency_ms",
            percentile: "p95",
            maximum: 95,
            minimumSamples: 100,
          },
          {
            metric: "motor_start_latency_ms",
            percentile: "p95",
            maximum: 100,
            minimumSamples: 10,
          },
        ],
        "ci",
      ),
    ).toEqual([
      {
        threshold: {
          metric: "observation_latency_ms",
          percentile: "p95",
          maximum: 95,
          minimumSamples: 100,
        },
        passed: true,
        actual: 95,
      },
      {
        threshold: {
          metric: "motor_start_latency_ms",
          percentile: "p95",
          maximum: 100,
          minimumSamples: 10,
        },
        passed: false,
        reason: "Insufficient samples: 0/10.",
      },
    ]);
  });

  it("rejects new work at each configured resource boundary", () => {
    const governor = new ResourceGovernor({
      maximumTrackedWindows: 10,
      maximumActiveWorkflows: 5,
      maximumConnectedAgents: 3,
      maximumAuditStorageBytes: 1_000_000,
      maximumProcessMemoryBytes: 100_000_000,
      maximumIdleCpuPercent: 20,
    });
    const baseline = {
      trackedWindows: 1,
      activeWorkflows: 1,
      connectedAgents: 1,
      auditStorageBytes: 1,
      processMemoryBytes: 1,
      idleCpuPercent: 1,
    };
    expect(governor.admit(baseline)).toEqual({ allowed: true });
    expect(governor.admit({ ...baseline, trackedWindows: 10 })).toEqual({
      allowed: false,
      reason: "tracked_window_limit",
    });
    expect(governor.admit({ ...baseline, activeWorkflows: 5 })).toEqual({
      allowed: false,
      reason: "active_workflow_limit",
    });
    expect(governor.admit({ ...baseline, connectedAgents: 3 })).toEqual({
      allowed: false,
      reason: "connected_agent_limit",
    });
    expect(governor.admit({ ...baseline, auditStorageBytes: 1_000_000 })).toEqual({
      allowed: false,
      reason: "audit_storage_limit",
    });
    expect(governor.admit({ ...baseline, processMemoryBytes: 100_000_000 })).toEqual({
      allowed: false,
      reason: "memory_limit",
    });
    expect(governor.admit({ ...baseline, idleCpuPercent: 20 })).toEqual({
      allowed: false,
      reason: "idle_cpu_limit",
    });
  });

  it("serializes excess work and removes cancelled waiters", async () => {
    const gate = new ConcurrencyGate(1);
    let releaseFirst!: () => void;
    const firstBlock = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const order: string[] = [];
    const first = gate.run(async () => {
      order.push("first-start");
      await firstBlock;
      order.push("first-end");
    });
    await Promise.resolve();
    const controller = new AbortController();
    const cancelled = gate.run(async () => undefined, controller.signal);
    const second = gate.run(async () => {
      order.push("second");
    });
    expect(gate.active).toBe(1);
    expect(gate.queued).toBe(2);
    controller.abort(new Error("operator cancelled queued work"));
    await expect(cancelled).rejects.toThrow(/operator cancelled/);
    expect(gate.queued).toBe(1);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
    expect(gate.active).toBe(0);
    expect(gate.queued).toBe(0);
  });
});
