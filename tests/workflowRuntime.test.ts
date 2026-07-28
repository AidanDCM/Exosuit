import { describe, expect, it } from "vitest";
import type {
  WorkflowExecutionContext,
  WorkflowExecutionResult,
  WorkflowStepExecutor,
} from "../src/workflowRuntime.js";
import {
  CoordinatorAuditTimeline,
  InMemoryWorkflowCheckpointStore,
  WorkflowArtifactStore,
  WorkflowRuntime,
  type RuntimeWorkflowDefinition,
} from "../src/workflowRuntime.js";
import type { WorkspaceSnapshot } from "../src/coordinator.js";

function workspace(
  currentVirtualDesktopId: string | null = "desktop-a",
): WorkspaceSnapshot {
  return {
    contractVersion: 1,
    workspaceId: "workspace-a",
    agentId: "agent-a",
    windowsSessionId: "session-a",
    currentVirtualDesktopId,
    windowRegistryVersion: 1,
    capturedAt: "2026-07-21T14:00:00.000Z",
    unexpectedDialogWindowId: null,
    windows: [
      {
        agentId: "agent-a",
        windowsSessionId: "session-a",
        windowId: "window-a",
        windowGeneration: 1,
        processId: 10,
        processName: "notepad",
        fingerprint: "notepad:window-a:v1",
        virtualDesktopId: "desktop-a",
        isActive: true,
        isVisible: true,
        isMinimized: false,
      },
      {
        agentId: "agent-a",
        windowsSessionId: "session-a",
        windowId: "window-b",
        windowGeneration: 1,
        processId: 11,
        processName: "calculator",
        fingerprint: "calculator:window-b:v1",
        virtualDesktopId: "desktop-a",
        isActive: false,
        isVisible: true,
        isMinimized: false,
      },
      {
        agentId: "agent-a",
        windowsSessionId: "session-a",
        windowId: "window-c",
        windowGeneration: 1,
        processId: 12,
        processName: "browser",
        fingerprint: "browser:window-c:v1",
        virtualDesktopId: "desktop-b",
        isActive: false,
        isVisible: true,
        isMinimized: false,
      },
    ],
  };
}

function definition(): RuntimeWorkflowDefinition {
  const ref = (windowId: string) => ({
    agentId: "agent-a",
    windowsSessionId: "session-a",
    windowId,
    windowGeneration: 1,
  });
  return {
    contractVersion: 1,
    workflowId: "workflow-a",
    requestedBy: "test",
    riskCeiling: "medium",
    steps: [
      {
        stepId: "read-a",
        dependsOn: [],
        workspaceId: "workspace-a",
        targetWindow: ref("window-a"),
        resourceMode: "read",
        actionIntent: "Read order number.",
        expectedResult: "Order number captured.",
        timeoutMs: 5_000,
        inputArtifactNames: [],
        outputArtifactNames: ["orderNumber"],
        externalEffect: "none",
      },
      {
        stepId: "calculate-b",
        dependsOn: ["read-a"],
        workspaceId: "workspace-a",
        targetWindow: ref("window-b"),
        resourceMode: "write",
        actionIntent: "Calculate total.",
        expectedResult: "Total calculated.",
        timeoutMs: 5_000,
        inputArtifactNames: ["orderNumber"],
        outputArtifactNames: ["total"],
        idempotencyKey: "calculate:order-42",
        externalEffect: "reversible",
      },
      {
        stepId: "write-a",
        dependsOn: ["calculate-b"],
        workspaceId: "workspace-a",
        targetWindow: ref("window-a"),
        resourceMode: "physical",
        actionIntent: "Write total.",
        expectedResult: "Total entered.",
        timeoutMs: 5_000,
        inputArtifactNames: ["total"],
        outputArtifactNames: [],
        idempotencyKey: "write:order-42",
        externalEffect: "irreversible",
      },
    ],
  };
}

class FixtureExecutor implements WorkflowStepExecutor {
  readonly calls: string[] = [];

  async execute(
    context: WorkflowExecutionContext,
  ): Promise<WorkflowExecutionResult> {
    this.calls.push(context.step.stepId);
    if (context.step.stepId === "read-a") {
      return {
        status: "succeeded",
        summary: "Read order 42.",
        verificationStatus: "passed",
        outputs: [{ name: "orderNumber", value: "42" }],
      };
    }
    if (context.step.stepId === "calculate-b") {
      expect(context.inputs.orderNumber?.value).toBe("42");
      return {
        status: "succeeded",
        summary: "Calculated 84.",
        verificationStatus: "passed",
        outputs: [{ name: "total", value: 84 }],
      };
    }
    expect(context.inputs.total?.value).toBe(84);
    return {
      status: "succeeded",
      summary: "Entered 84.",
      verificationStatus: "passed",
    };
  }
}

describe("workflow runtime", () => {
  it("executes A to B to C with structured artifact provenance and no clipboard", async () => {
    const runtime = new WorkflowRuntime();
    runtime.updateWorkspace(workspace());
    runtime.create(definition());
    const executor = new FixtureExecutor();
    const result = await runtime.runUntilBlocked("workflow-a", executor);
    expect(result.status).toBe("completed");
    expect(executor.calls).toEqual(["read-a", "calculate-b", "write-a"]);
    const artifacts = runtime.listArtifacts("workflow-a");
    expect(artifacts.map((artifact) => artifact.name)).toEqual([
      "orderNumber",
      "total",
    ]);
    expect(artifacts[1]).toMatchObject({
      sourceStepId: "calculate-b",
      value: 84,
    });
    expect(artifacts[1]?.integrityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(runtime.verifyAudit()).toEqual({ valid: true });
  });

  it("rejects undeclared, duplicate, and nondependency artifacts", () => {
    const runtime = new WorkflowRuntime();
    const base = definition();
    expect(() =>
      runtime.create({
        ...base,
        workflowId: "duplicate-output",
        steps: base.steps.map((step) => ({
          ...step,
          outputArtifactNames:
            step.stepId === "calculate-b"
              ? ["orderNumber"]
              : step.outputArtifactNames,
        })),
      }),
    ).toThrow(/declared by both/);
    expect(() =>
      runtime.create({
        ...base,
        workflowId: "missing-producer",
        steps: base.steps.map((step) =>
          step.stepId === "calculate-b"
            ? { ...step, inputArtifactNames: ["unknown"] }
            : step,
        ),
      }),
    ).toThrow(/no declared producer/);
    expect(() =>
      runtime.create({
        ...base,
        workflowId: "not-a-dependency",
        steps: [
          base.steps[0]!,
          {
            ...base.steps[1]!,
            dependsOn: [],
            inputArtifactNames: ["orderNumber"],
          },
        ],
      }),
    ).toThrow(/not produced by a dependency/);
  });

  it("pauses on another virtual desktop before the executor is called", async () => {
    const runtime = new WorkflowRuntime();
    runtime.updateWorkspace(workspace("desktop-a"));
    const base = definition();
    runtime.create({
      ...base,
      workflowId: "desktop-workflow",
      steps: [
        {
          ...base.steps[0]!,
          stepId: "other-desktop",
          targetWindow: {
            ...base.steps[0]!.targetWindow!,
            windowId: "window-c",
          },
          outputArtifactNames: [],
        },
      ],
    });
    const executor = new FixtureExecutor();
    const result = await runtime.runNext("desktop-workflow", executor);
    expect(result.status).toBe("blocked");
    expect(result.pauseReason).toBe("virtual_desktop_unavailable");
    expect(executor.calls).toEqual([]);
  });

  it("requires passed verification for a succeeded step", async () => {
    const runtime = new WorkflowRuntime();
    runtime.updateWorkspace(workspace());
    const base = definition();
    runtime.create({
      ...base,
      workflowId: "bad-verification",
      steps: [base.steps[0]!],
    });
    const result = await runtime.runNext("bad-verification", {
      async execute() {
        return {
          status: "succeeded",
          summary: "Unverified",
          verificationStatus: "partial",
        };
      },
    });
    expect(result.status).toBe("failed");
    expect(result.steps["read-a"]?.error).toMatch(/passed verification/);
  });

  // Master roadmap Phase 2 GitHub test: "failed verification blocks dependent steps",
  // and Execution invariant 4: "Failed or partial verification halts dependent work."
  // The test above runs a single step, so it proves a step fails without passed
  // verification but never that its dependents are halted.
  it("blocks dependent steps when an upstream step fails verification", async () => {
    const runtime = new WorkflowRuntime();
    runtime.updateWorkspace(workspace());
    runtime.create({ ...definition(), workflowId: "verification-halts" });

    const attempted: string[] = [];
    const result = await runtime.runUntilBlocked("verification-halts", {
      async execute(context) {
        attempted.push(context.step.stepId);
        if (context.step.stepId === "read-a") {
          return {
            status: "succeeded",
            summary: "Read order 42.",
            verificationStatus: "passed",
            outputs: [{ name: "orderNumber", value: "42" }],
          };
        }
        // calculate-b claims success but cannot prove it.
        return {
          status: "succeeded",
          summary: "Claimed a total without evidence.",
          verificationStatus: "partial",
        };
      },
    });

    // The unverified step must not be recorded as succeeded.
    expect(result.steps["calculate-b"]?.status).toBe("failed");
    expect(result.steps["calculate-b"]?.error).toMatch(/passed verification/);

    // Its dependent must never run, and must be blocked rather than left pending.
    expect(attempted).toEqual(["read-a", "calculate-b"]);
    expect(attempted).not.toContain("write-a");
    expect(result.steps["write-a"]?.status).toBe("blocked");

    // The failed step produced no artifact, so nothing downstream can consume it.
    expect(runtime.listArtifacts("verification-halts").map((a) => a.name)).toEqual([
      "orderNumber",
    ]);
    expect(runtime.verifyAudit()).toEqual({ valid: true });
  });

  // Master roadmap Phase 2 GitHub test: "crash/restart resume from last verified
  // checkpoint". The uncertain-external-effect path is covered above; this covers the
  // clean case, where a verified checkpoint is resumed after a restart.
  it("resumes from the last verified checkpoint after a restart", async () => {
    const checkpoints = new InMemoryWorkflowCheckpointStore();
    const first = new WorkflowRuntime({ checkpoints });
    first.updateWorkspace(workspace());
    first.create({ ...definition(), workflowId: "resume-clean" });

    // Run only the first step, then stop as if the process were about to exit.
    const afterFirstStep = await first.runNext("resume-clean", new FixtureExecutor());
    expect(afterFirstStep.steps["read-a"]?.status).toBe("succeeded");
    first.pause("resume-clean", "Simulated shutdown after a verified step.");

    // A fresh runtime, as after a restart, sharing only the durable checkpoint store.
    const restarted = new WorkflowRuntime({ checkpoints });
    restarted.updateWorkspace(workspace());
    const hydrated = await restarted.hydrate("resume-clean");

    // The verified step stays done and is not re-executed; no step is uncertain.
    expect(hydrated.steps["read-a"]?.status).toBe("succeeded");
    expect(
      Object.values(hydrated.steps).some((record) => record.status === "uncertain"),
    ).toBe(false);
    expect(restarted.listArtifacts("resume-clean").map((a) => a.name)).toEqual([
      "orderNumber",
    ]);

    restarted.resume("resume-clean");
    const executor = new FixtureExecutor();
    const completed = await restarted.runUntilBlocked("resume-clean", executor);

    // Only the remaining steps run, and the recovered artifact feeds them.
    expect(executor.calls).toEqual(["calculate-b", "write-a"]);
    expect(completed.status).toBe("completed");
    expect(restarted.listArtifacts("resume-clean").map((a) => a.name)).toEqual([
      "orderNumber",
      "total",
    ]);
    expect(restarted.verifyAudit()).toEqual({ valid: true });
  });

  it("hydrates an interrupted external-effect step as uncertain and requires reconciliation", async () => {
    const checkpoints = new InMemoryWorkflowCheckpointStore();
    const runtime = new WorkflowRuntime({ checkpoints });
    runtime.updateWorkspace(workspace());
    const base = definition();
    const created = runtime.create({
      ...base,
      workflowId: "recover",
      steps: [
        {
          ...base.steps[2]!,
          dependsOn: [],
          inputArtifactNames: [],
        },
      ],
    });
    created.status = "running";
    created.steps["write-a"]!.status = "running";
    await checkpoints.save(created, []);

    const restored = new WorkflowRuntime({ checkpoints });
    const hydrated = await restored.hydrate("recover");
    expect(hydrated.status).toBe("recovery_required");
    expect(hydrated.steps["write-a"]?.status).toBe("uncertain");
    expect(() => restored.resume("recover")).toThrow(/must be reconciled/);
    const reconciled = restored.reconcileUncertainStep({
      workflowId: "recover",
      stepId: "write-a",
      observedOutcome: "not_applied",
      evidence: "Fresh observation showed the value was not written.",
    });
    expect(reconciled.steps["write-a"]?.status).toBe("pending");
    expect(reconciled.status).toBe("paused");
  });

  it("marks a timed-out external effect uncertain instead of retrying blindly", async () => {
    const runtime = new WorkflowRuntime();
    runtime.updateWorkspace(workspace());
    const base = definition();
    runtime.create({
      ...base,
      workflowId: "timeout",
      steps: [
        {
          ...base.steps[2]!,
          dependsOn: [],
          inputArtifactNames: [],
          timeoutMs: 100,
        },
      ],
    });
    const result = await runtime.runNext("timeout", {
      async execute(context) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 5_000);
          context.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(context.signal.reason);
          });
        });
        return {
          status: "succeeded",
          summary: "late",
          verificationStatus: "passed",
        };
      },
    });
    expect(result.status).toBe("recovery_required");
    expect(result.steps["write-a"]?.status).toBe("uncertain");
  });

  it("stops affected workflow queues on session emergency stop", () => {
    const runtime = new WorkflowRuntime();
    runtime.updateWorkspace(workspace());
    runtime.create(definition());
    const affected = runtime.emergencyStopSession(
      "agent-a",
      "session-a",
      "local stop",
    );
    expect(affected).toHaveLength(1);
    expect(affected[0]?.status).toBe("paused");
    expect(affected[0]?.pauseReason).toMatch(/emergency_stop/);
  });
});

describe("artifact and audit safeguards", () => {
  it("rejects persistent sensitive artifacts and detects mutation", () => {
    const store = new WorkflowArtifactStore();
    expect(() =>
      store.put({
        workflowId: "w",
        name: "secret",
        value: "private",
        sourceStepId: "s",
        classification: "sensitive",
        retention: "persistent",
      }),
    ).toThrow(/cannot use persistent/);
    const artifact = store.put({
      workflowId: "w",
      name: "safe",
      value: { total: 10 },
      sourceStepId: "s",
      classification: "internal",
      retention: "workflow",
    });
    expect(() => store.verify({ ...artifact, value: { total: 11 } })).toThrow(
      /integrity verification/,
    );
  });

  it("redacts secret-shaped audit keys and verifies its chain", () => {
    const audit = new CoordinatorAuditTimeline();
    audit.append({
      workflowId: "w",
      eventType: "test",
      details: { token: "should-not-remain", safe: "ok" },
    });
    expect(audit.list()[0]?.details).toEqual({
      token: "[REDACTED]",
      safe: "ok",
    });
    expect(audit.verify()).toEqual({ valid: true });
  });
});
