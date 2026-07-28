import { describe, expect, it } from "vitest";
import {
  BoundedSessionQueue,
  LatencyRecorder,
  ResourceAdmissionController,
} from "../src/resourceGovernance.js";

describe("resource governance", () => {
  it("allows work within quota and rejects each exceeded resource class", () => {
    const controller = new ResourceAdmissionController({
      maximumTrackedWindows: 2,
      maximumActiveWorkflows: 2,
      maximumRegisteredAgents: 2,
      maximumQueuedStepsPerSession: 2,
      maximumConcurrentObservations: 2,
      maximumAuditBytes: 2_048,
      maximumWorkflowSteps: 2,
    });
    const base = {
      trackedWindows: 2,
      activeWorkflows: 1,
      registeredAgents: 1,
      queuedStepsBySession: { "agent-a:session-a": 2 },
      concurrentObservations: 1,
      auditBytes: 1_024,
    };
    expect(controller.evaluate(base)).toEqual({ allowed: true, reason: "within_quota" });
    expect(controller.evaluate({ ...base, trackedWindows: 3 })).toMatchObject({
      allowed: false,
      reason: "tracked_window_quota_exceeded",
      retryable: false,
    });
    expect(controller.evaluate({ ...base, activeWorkflows: 3 })).toMatchObject({
      allowed: false,
      retryable: true,
    });
    expect(
      controller.evaluate({
        ...base,
        queuedStepsBySession: { "agent-a:session-a": 3 },
      }),
    ).toMatchObject({ allowed: false, reason: expect.stringContaining("session_queue") });
  });

  it("rejects invalid resource counts", () => {
    const controller = new ResourceAdmissionController();
    expect(() =>
      controller.evaluate({
        trackedWindows: -1,
        activeWorkflows: 0,
        registeredAgents: 0,
        queuedStepsBySession: {},
        concurrentObservations: 0,
        auditBytes: 0,
      }),
    ).toThrow(/nonnegative integer/);
  });

  it("reports bounded latency percentiles", () => {
    const recorder = new LatencyRecorder(10);
    for (const sample of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100]) {
      recorder.record("scheduler", sample);
    }
    expect(recorder.summarize("scheduler")).toEqual({
      metric: "scheduler",
      sampleCount: 10,
      minimumMs: 2,
      maximumMs: 100,
      p50Ms: 6,
      p95Ms: 100,
      p99Ms: 100,
    });
    expect(recorder.summarize("observation")).toBeUndefined();
    expect(() => recorder.record("scheduler", -1)).toThrow(/nonnegative/);
  });

  it("applies per-session backpressure and preserves FIFO order", () => {
    const queue = new BoundedSessionQueue<{ stepId: string }>(2);
    queue.enqueue("agent-a:session-a", { stepId: "a" });
    queue.enqueue("agent-a:session-a", { stepId: "b" });
    queue.enqueue("agent-b:session-b", { stepId: "c" });
    expect(() =>
      queue.enqueue("agent-a:session-a", { stepId: "overflow" }),
    ).toThrow(/backpressure/);
    expect(queue.dequeue("agent-a:session-a")?.payload.stepId).toBe("a");
    expect(queue.dequeue("agent-a:session-a")?.payload.stepId).toBe("b");
    expect(queue.size()).toBe(1);
    expect(queue.clear("agent-b:session-b")).toBe(1);
    expect(queue.size()).toBe(0);
  });
});
