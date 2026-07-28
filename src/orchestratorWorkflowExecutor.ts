import type { ExosuitOrchestrator } from "./orchestrator.js";
import type { WorkflowExecutionContext, WorkflowExecutionResult, WorkflowStepExecutor } from "./workflowRuntime.js";

export class OrchestratorWorkflowExecutor implements WorkflowStepExecutor {
  readonly #orchestrator: ExosuitOrchestrator;

  constructor(orchestrator: ExosuitOrchestrator) {
    this.#orchestrator = orchestrator;
  }

  async execute(context: WorkflowExecutionContext): Promise<WorkflowExecutionResult> {
    if (context.proposalId) {
      return mapResult(await this.#orchestrator.executeProposal(context.proposalId));
    }
    const action = context.step.desktopAction;
    if (!action) {
      return {
        status: "failed",
        summary: "This workflow step has no validated desktop action payload.",
        verificationStatus: "not_checked",
      };
    }
    const proposal = await this.#orchestrator.proposeAction({
      ...action,
      id:
        action.id ||
        context.step.idempotencyKey ||
        `${context.workflow.definition.workflowId}:${context.step.stepId}:${context.attempt}`,
    });
    if (proposal.status === "pending_review" || proposal.status === "approved") {
      if (proposal.status === "pending_review") {
        return {
          status: "waiting_approval",
          summary: proposal.decision.reason,
          verificationStatus: "not_checked",
          proposalId: proposal.proposalId,
        };
      }
      return mapResult(await this.#orchestrator.executeProposal(proposal.proposalId));
    }
    if (proposal.status === "allowed") {
      return mapResult(await this.#orchestrator.executeProposal(proposal.proposalId));
    }
    return {
      status: "blocked",
      summary: proposal.decision.reason,
      verificationStatus: "not_checked",
      proposalId: proposal.proposalId,
    };
  }
}

function mapResult(
  result: Awaited<ReturnType<ExosuitOrchestrator["executeProposal"]>>,
): WorkflowExecutionResult {
  if (result.status === "pending_review") {
    return {
      status: "waiting_approval",
      summary: result.summary,
      verificationStatus: result.verificationStatus,
      proposalId: result.proposalId,
    };
  }
  if (result.status === "succeeded") {
    return {
      status: "succeeded",
      summary: result.summary,
      verificationStatus: result.verificationStatus,
    };
  }
  if (result.status === "blocked") {
    return {
      status: "blocked",
      summary: result.summary,
      verificationStatus: result.verificationStatus,
    };
  }
  if (result.status === "cancelled") {
    return {
      status: "uncertain",
      summary: result.summary,
      verificationStatus: result.verificationStatus,
    };
  }
  return {
    status: "failed",
    summary: result.summary,
    verificationStatus: result.verificationStatus,
  };
}
