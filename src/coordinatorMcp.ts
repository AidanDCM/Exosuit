import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { workspaceSnapshotSchema } from "./coordinator.js";
import { supervisorAgentSchema, type AgentRegistry } from "./supervisor.js";
import {
  runtimeWorkflowDefinitionSchema,
  runtimeWorkflowRecordSchema,
  workflowArtifactSchema,
  type WorkflowRuntime,
  type WorkflowStepExecutor,
} from "./workflowRuntime.js";
import type { WorkspaceSynchronizer } from "./workspaceSync.js";

export type CoordinatorMcpServices = {
  runtime: WorkflowRuntime;
  executor: WorkflowStepExecutor;
  synchronizer: WorkspaceSynchronizer;
  agents: AgentRegistry;
};

function response<T extends Record<string, unknown>>(structuredContent: T, summary?: string) {
  return {
    structuredContent,
    content: [{ type: "text" as const, text: summary ?? JSON.stringify(structuredContent) }],
  };
}

export function registerCoordinatorMcpTools(
  server: McpServer,
  services: CoordinatorMcpServices,
): void {
  server.registerTool(
    "desktop_refresh_workspace",
    {
      title: "Refresh the local workspace",
      description:
        "Perform a fresh desktop observation and update Exosuit's privacy-preserving multi-window registry. Window titles are fingerprinted rather than retained in the workspace model.",
      inputSchema: {},
      outputSchema: { workspace: workspaceSnapshotSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      const workspace = await services.synchronizer.refresh();
      return response(
        { workspace },
        `Refreshed ${workspace.windows.length} window(s) in ${workspace.workspaceId}.`,
      );
    },
  );

  server.registerTool(
    "desktop_get_workspace",
    {
      title: "Get a tracked workspace",
      description:
        "Read a current coordinator workspace snapshot. Refresh first when desktop state may have changed.",
      inputSchema: { workspaceId: z.string().min(1).optional() },
      outputSchema: { workspace: workspaceSnapshotSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ workspaceId }) => {
      const workspaces = services.runtime.listWorkspaces();
      const workspace = workspaceId
        ? workspaces.find((item) => item.workspaceId === workspaceId)
        : workspaces[0];
      if (!workspace) {
        throw new Error("No tracked workspace is available. Call desktop_refresh_workspace first.");
      }
      return response({ workspace });
    },
  );

  server.registerTool(
    "desktop_list_windows",
    {
      title: "List coordinated windows",
      description:
        "List privacy-preserving window identities and generations from a fresh tracked workspace.",
      inputSchema: { workspaceId: z.string().min(1).optional() },
      outputSchema: {
        workspaceId: z.string(),
        windows: workspaceSnapshotSchema.shape.windows,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ workspaceId }) => {
      const workspaces = services.runtime.listWorkspaces();
      const workspace = workspaceId
        ? workspaces.find((item) => item.workspaceId === workspaceId)
        : workspaces[0];
      if (!workspace) {
        throw new Error("No tracked workspace is available. Call desktop_refresh_workspace first.");
      }
      return response({ workspaceId: workspace.workspaceId, windows: workspace.windows });
    },
  );

  server.registerTool(
    "desktop_create_workflow",
    {
      title: "Create a bounded multi-window workflow",
      description:
        "Create a validated dependency graph. This does not execute actions, approve proposals, or bypass local policy. Each executable step must carry a normal bounded desktop action.",
      inputSchema: { workflow: runtimeWorkflowDefinitionSchema },
      outputSchema: { workflow: runtimeWorkflowRecordSchema },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ workflow }) => {
      const created = services.runtime.create(workflow);
      return response(
        { workflow: created },
        `Created workflow ${created.definition.workflowId} with ${created.definition.steps.length} step(s).`,
      );
    },
  );

  server.registerTool(
    "desktop_list_workflows",
    {
      title: "List workflows",
      description: "List coordinator workflow state without executing anything.",
      inputSchema: {},
      outputSchema: { workflows: z.array(runtimeWorkflowRecordSchema) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => response({ workflows: services.runtime.list() }),
  );

  server.registerTool(
    "desktop_get_workflow",
    {
      title: "Get one workflow",
      description: "Read one workflow, including step lifecycle and recovery state.",
      inputSchema: { workflowId: z.string().min(1) },
      outputSchema: { workflow: runtimeWorkflowRecordSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ workflowId }) => response({ workflow: services.runtime.get(workflowId) }),
  );

  server.registerTool(
    "desktop_run_next_workflow_step",
    {
      title: "Run the next ready workflow step",
      description:
        "Run one dependency-ready step through the ordinary Exosuit proposal, local policy, approval, fresh observation, execution, and verification path. It stops when local approval or recovery is required.",
      inputSchema: { workflowId: z.string().min(1) },
      outputSchema: { workflow: runtimeWorkflowRecordSchema },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
        idempotentHint: false,
      },
    },
    async ({ workflowId }) => {
      const workflow = await services.runtime.runNext(workflowId, services.executor);
      return response({ workflow }, `Workflow ${workflowId} is ${workflow.status}.`);
    },
  );

  server.registerTool(
    "desktop_continue_approved_workflow_step",
    {
      title: "Continue a locally approved workflow step",
      description:
        "Continue only a step already waiting on an existing local Exosuit proposal. This tool accepts no approval token and cannot approve its own work.",
      inputSchema: {
        workflowId: z.string().min(1),
        stepId: z.string().min(1),
      },
      outputSchema: { workflow: runtimeWorkflowRecordSchema },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
        idempotentHint: false,
      },
    },
    async ({ workflowId, stepId }) => {
      const workflow = await services.runtime.continueWaitingStep(
        workflowId,
        stepId,
        services.executor,
      );
      return response({ workflow }, `Workflow ${workflowId} is ${workflow.status}.`);
    },
  );

  server.registerTool(
    "desktop_pause_workflow",
    {
      title: "Pause a workflow",
      description: "Pause queued workflow work and release coordinator leases.",
      inputSchema: {
        workflowId: z.string().min(1),
        reason: z.string().min(1).max(2_000),
      },
      outputSchema: { workflow: runtimeWorkflowRecordSchema },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ workflowId, reason }) =>
      response({ workflow: services.runtime.pause(workflowId, reason) }),
  );

  server.registerTool(
    "desktop_resume_workflow",
    {
      title: "Resume a reconciled workflow",
      description: "Resume a paused workflow only when no uncertain step remains.",
      inputSchema: { workflowId: z.string().min(1) },
      outputSchema: { workflow: runtimeWorkflowRecordSchema },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ workflowId }) =>
      response({ workflow: services.runtime.resume(workflowId) }),
  );

  server.registerTool(
    "desktop_cancel_workflow",
    {
      title: "Cancel a workflow",
      description:
        "Cancel queued and running workflow work, release leases, and retain audit evidence.",
      inputSchema: {
        workflowId: z.string().min(1),
        reason: z.string().min(1).max(2_000),
      },
      outputSchema: { workflow: runtimeWorkflowRecordSchema },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ workflowId, reason }) =>
      response({ workflow: services.runtime.cancel(workflowId, reason) }),
  );

  server.registerTool(
    "desktop_list_workflow_artifacts",
    {
      title: "List structured workflow artifacts",
      description:
        "List integrity-checked cross-window artifacts with provenance. Clipboard contents are not used.",
      inputSchema: { workflowId: z.string().min(1) },
      outputSchema: { artifacts: z.array(workflowArtifactSchema) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ workflowId }) =>
      response({ artifacts: services.runtime.listArtifacts(workflowId) }),
  );

  server.registerTool(
    "desktop_get_workflow_audit",
    {
      title: "Get workflow audit timeline",
      description: "Read the coordinator's tamper-evident workflow timeline.",
      inputSchema: { workflowId: z.string().min(1).optional() },
      outputSchema: {
        events: z.array(z.record(z.string(), z.unknown())),
        valid: z.boolean(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ workflowId }) =>
      response({
        events: services.runtime.getAudit(workflowId),
        valid: services.runtime.verifyAudit().valid,
      }),
  );

  server.registerTool(
    "desktop_list_agents",
    {
      title: "List registered Exosuit agents",
      description:
        "Read multi-agent supervisor health and capability state. Registration occurs through authenticated agent channels, not this MCP tool.",
      inputSchema: {},
      outputSchema: { agents: z.array(supervisorAgentSchema) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => response({ agents: services.agents.list() }),
  );
}
