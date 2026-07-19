import { describe, expect, it } from "vitest";
import {
  CoordinatorLeaseManager,
  WorkflowCatalog,
  WorkspaceRegistry,
  type WindowReference,
  type WorkflowDefinition,
  type WorkspaceSnapshot,
} from "../src/coordinator.js";

const reference: WindowReference = {
  agentId: "agent-a",
  windowsSessionId: "session-1",
  windowId: "window-a",
  windowGeneration: 1,
};

function snapshot(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    contractVersion: 1,
    workspaceId: "workspace-a",
    agentId: "agent-a",
    windowsSessionId: "session-1",
    currentVirtualDesktopId: null,
    windowRegistryVersion: 1,
    capturedAt: "2026-07-19T16:00:00.000Z",
    unexpectedDialogWindowId: null,
    windows: [
      {
        ...reference,
        processId: 42,
        processName: "fixture",
        fingerprint: "fixture:window-a:v1",
        virtualDesktopId: null,
        isActive: true,
        isVisible: true,
        isMinimized: false,
      },
    ],
    ...overrides,
  };
}

function workflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
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
        targetWindow: reference,
        resourceMode: "read",
        actionIntent: "Read the fixture.",
        expectedResult: "Fixture state captured.",
        timeoutMs: 5_000,
      },
      {
        stepId: "write-a",
        dependsOn: ["read-a"],
        workspaceId: "workspace-a",
        targetWindow: reference,
        resourceMode: "write",
        actionIntent: "Update the fixture.",
        expectedResult: "Fixture state updated.",
        timeoutMs: 5_000,
      },
    ],
    ...overrides,
  };
}

describe("workspace generation registry", () => {
  it("requires registry versions to advance", () => {
    const registry = new WorkspaceRegistry();
    registry.update(snapshot());
    expect(() => registry.update(snapshot())).toThrow(/versions must increase/);
  });

  it("rejects changed identity without a new generation", () => {
    const registry = new WorkspaceRegistry();
    registry.update(snapshot());
    expect(() =>
      registry.update(
        snapshot({
          windowRegistryVersion: 2,
          windows: [{ ...snapshot().windows[0]!, fingerprint: "different-process:same-window" }],
        }),
      ),
    ).toThrow(/without a new generation/);
  });

  it("fails closed for stale generations and unexpected dialogs", () => {
    const registry = new WorkspaceRegistry();
    registry.update(snapshot());
    expect(() => registry.requireFresh({ ...reference, windowGeneration: 2 })).toThrow(/stale or unavailable/);
    registry.update(
      snapshot({
        windowRegistryVersion: 2,
        unexpectedDialogWindowId: "dialog-1",
      }),
    );
    expect(() => registry.requireFresh(reference)).toThrow(/unexpected dialog/);
  });
});

describe("workflow graph contracts", () => {
  it("accepts an ordered dependency graph", () => {
    const catalog = new WorkflowCatalog();
    expect(catalog.create(workflow()).steps).toHaveLength(2);
  });

  it("rejects missing dependencies, duplicates, and cycles", () => {
    const catalog = new WorkflowCatalog();
    expect(() =>
      catalog.create(
        workflow({
          workflowId: "missing",
          steps: [{ ...workflow().steps[0]!, dependsOn: ["unknown"] }],
        }),
      ),
    ).toThrow(/unknown dependency/);
    expect(() =>
      catalog.create(workflow({ workflowId: "duplicate", steps: [workflow().steps[0]!, workflow().steps[0]!] })),
    ).toThrow(/Duplicate workflow step/);
    expect(() =>
      catalog.create(
        workflow({
          workflowId: "cycle",
          steps: [
            { ...workflow().steps[0]!, stepId: "a", dependsOn: ["b"] },
            { ...workflow().steps[1]!, stepId: "b", dependsOn: ["a"] },
          ],
        }),
      ),
    ).toThrow(/cycle/);
  });
});

describe("coordinator leases", () => {
  it("allows parallel readers but denies a conflicting writer", () => {
    const leases = new CoordinatorLeaseManager();
    leases.acquireWindow({ ownerId: "reader-a", window: reference, mode: "read", ttlMs: 1_000 });
    leases.acquireWindow({ ownerId: "reader-b", window: reference, mode: "read", ttlMs: 1_000 });
    expect(() =>
      leases.acquireWindow({ ownerId: "writer", window: reference, mode: "write", ttlMs: 1_000 }),
    ).toThrow(/conflicting lease/);
  });

  it("serializes focus ownership per Windows session", () => {
    const leases = new CoordinatorLeaseManager();
    leases.acquireFocus({ ownerId: "physical-a", session: reference, ttlMs: 1_000 });
    expect(() =>
      leases.acquireFocus({ ownerId: "physical-b", session: reference, ttlMs: 1_000 }),
    ).toThrow(/exclusive focus lease/);
  });

  it("expires leases and permits recovery", () => {
    const leases = new CoordinatorLeaseManager();
    const now = new Date("2026-07-19T16:00:00.000Z");
    leases.acquireFocus({ ownerId: "physical-a", session: reference, ttlMs: 100, now });
    leases.expire(new Date(now.getTime() + 101));
    expect(
      leases.acquireFocus({ ownerId: "physical-b", session: reference, ttlMs: 100, now: new Date(now.getTime() + 101) }),
    ).toMatchObject({ ownerId: "physical-b" });
  });

  it("invalidates window and focus leases on emergency stop", () => {
    const leases = new CoordinatorLeaseManager();
    leases.acquireWindow({ ownerId: "worker", window: reference, mode: "write", ttlMs: 1_000 });
    leases.acquireFocus({ ownerId: "worker", session: reference, ttlMs: 1_000 });
    leases.emergencyStopSession(reference.agentId, reference.windowsSessionId);
    expect(leases.snapshot()).toEqual({ resourceLeases: [], focusLeases: [] });
  });
});
