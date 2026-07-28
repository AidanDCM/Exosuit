import { describe, expect, it } from "vitest";
import type { ActionProposal, ActionResult, DesktopAction } from "../src/contracts.js";
import { ExosuitOrchestrator } from "../src/orchestrator.js";
import { OrchestratorWorkflowExecutor } from "../src/orchestratorWorkflowExecutor.js";
import type { WorkflowExecutionContext } from "../src/workflowRuntime.js";

class FakeOrchestrator extends ExosuitOrchestrator {
  proposals: DesktopAction[] = [];
  executeCalls: string[] = [];
  nextProposal: ActionProposal;
  nextResult: ActionResult;

  constructor() {
    super({ agent: {} as never });
    this.nextProposal = {
      proposalId: "proposal-1",
      createdAt: "2026-07-21T15:00:00.000Z",
      expiresAt: "2026-07-21T15:01:00.000Z",
      status: "pending_review",
      decision: {
        status: "review_required",
        riskLevel: "medium",
        approvalType: "local_click",
        reason: "Local review required.",
        policyRule: "test-review",
      },
      action: action(),
    };
    this.nextResult = {
      proposalId: "proposal-1",
      actionId: "action-1",
      status: "succeeded",
      verificationStatus: "passed",
      summary: "Verified.",
      evidence: {},
      warnings: [],
    };
  }

  override async proposeAction(input: DesktopAction): Promise<ActionProposal> {
    this.proposals.push(input);
    return this.nextProposal;
  }

  override async executeProposal(proposalId: string): Promise<ActionResult> {
    this.executeCalls.push(proposalId);
    return this.nextResult;
  }
}

function action(): DesktopAction {
  return {
    id: "action-1",
    actionType: "set_element_value",
    route: "os_accessibility",
    targetWindowId: "window-a",
    targetElementId: "field-a",
    text: "hello",
    rationale: "Test.",
    expected: {
      kind: "element_value",
      elementId: "field-a",
      equals: "hello",
    },
    requestedBy: "test",
  };
}

function context(
  overrides: Partial<WorkflowExecutionContext> = {},
): WorkflowExecutionContext {
  return {
    workflow: {
      definition: {
        contractVersion: 1,
        workflowId: "workflow-a",
        requestedBy: "test",
        riskCeiling: "medium",
        steps: [],
      },
      status: "running",
      createdAt: "2026-07-21T14:00:00.000Z",
      updatedAt: "2026-07-21T14:00:00.000Z",
      checkpointVersion: 1,
      steps: {},
      completedIdempotencyKeys: [],
    },
    step: {
      stepId: "step-a",
      dependsOn: [],
      workspaceId: "workspace-a",
      resourceMode: "write",
      actionIntent: "Set value.",
      expectedResult: "Value set.",
      timeoutMs: 5_000,
      inputArtifactNames: [],
      outputArtifactNames: [],
      externalEffect: "reversible",
      desktopAction: action(),
    },
    inputs: {},
    attempt: 1,
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("orchestrator workflow executor", () => {
  it("creates a normal proposal and pauses for local approval", async () => {
    const orchestrator = new FakeOrchestrator();
    const executor = new OrchestratorWorkflowExecutor(orchestrator);
    const result = await executor.execute(context());
    expect(result).toMatchObject({
      status: "waiting_approval",
      proposalId: "proposal-1",
    });
    expect(orchestrator.proposals).toHaveLength(1);
    expect(orchestrator.executeCalls).toEqual([]);
  });

  it("continues only the existing locally reviewed proposal", async () => {
    const orchestrator = new FakeOrchestrator();
    const executor = new OrchestratorWorkflowExecutor(orchestrator);
    const result = await executor.execute(context({ proposalId: "proposal-1" }));
    expect(result).toMatchObject({
      status: "succeeded",
      verificationStatus: "passed",
    });
    expect(orchestrator.proposals).toEqual([]);
    expect(orchestrator.executeCalls).toEqual(["proposal-1"]);
  });

  it("maps blocked and cancelled results without inventing success", async () => {
    const orchestrator = new FakeOrchestrator();
    const executor = new OrchestratorWorkflowExecutor(orchestrator);
    orchestrator.nextProposal = {
      ...orchestrator.nextProposal,
      status: "blocked",
      decision: {
        ...orchestrator.nextProposal.decision,
        status: "block",
        reason: "Denied.",
      },
    };
    expect(await executor.execute(context())).toMatchObject({
      status: "blocked",
      verificationStatus: "not_checked",
    });
    orchestrator.nextResult = {
      ...orchestrator.nextResult,
      status: "cancelled",
      verificationStatus: "not_checked",
      summary: "Stopped.",
    };
    expect(
      await executor.execute(context({ proposalId: "proposal-1" })),
    ).toMatchObject({ status: "uncertain" });
  });

  it("fails closed when the workflow step lacks a desktop action", async () => {
    const orchestrator = new FakeOrchestrator();
    const executor = new OrchestratorWorkflowExecutor(orchestrator);
    const result = await executor.execute(
      context({ step: { ...context().step, desktopAction: undefined } }),
    );
    expect(result.status).toBe("failed");
    expect(orchestrator.proposals).toEqual([]);
  });
});
