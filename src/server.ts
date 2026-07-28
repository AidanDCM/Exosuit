import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCoordinatorMcpTools } from "./coordinatorMcp.js";
import { createMcpServer } from "./mcp.js";
import { registerMotorMcpTools } from "./motorMcp.js";
import type { ExosuitOrchestrator } from "./orchestrator.js";
import { OrchestratorWorkflowExecutor } from "./orchestratorWorkflowExecutor.js";
import {
  createWorkflowRuntimeFromEnvironment,
  type WorkflowPersistenceMode,
} from "./runtimeFactory.js";
import { AgentRegistry } from "./supervisor.js";
import { FileAgentRegistryStore } from "./supervisorStore.js";
import type { WorkflowRuntime } from "./workflowRuntime.js";
import { WorkspaceSynchronizer } from "./workspaceSync.js";

/**
 * Which MCP tools a composed server exposes.
 *
 * `core` is the desktop core only: the tools reviewed for Phase 1 local acceptance.
 * `full` additionally exposes the multi-window coordinator surface.
 */
export type McpSurfaceMode = "core" | "full";

export const DEFAULT_MCP_SURFACE: McpSurfaceMode = "core";

/**
 * Resolves the tool surface from the environment.
 *
 * Defaults to `core`. The coordinator is `in_progress` in the master roadmap with no
 * hosted CI and no interactive evidence, and `docs/CODEX_HANDOFF.md` requires that a
 * tunnel session discover only reviewed tools, so an unvalidated surface must be opted
 * into deliberately rather than reached by default. An unrecognized value fails closed.
 */
export function resolveMcpSurface(
  environment: Record<string, string | undefined> = process.env,
): McpSurfaceMode {
  const raw = environment.EXOSUIT_MCP_SURFACE?.trim().toLowerCase();
  if (raw === undefined || raw === "") return DEFAULT_MCP_SURFACE;
  if (raw === "core" || raw === "full") return raw;
  throw new Error('EXOSUIT_MCP_SURFACE must be "core" or "full".');
}

export type ExosuitServerStartupReport = {
  workflowPersistenceMode: WorkflowPersistenceMode;
  hydratedWorkflows: number;
  hydratedAgents: number;
  mcpSurface: McpSurfaceMode;
};

export function createExosuitMcpServer(
  orchestrator: ExosuitOrchestrator,
  environment: Record<string, string | undefined> = process.env,
): McpServer {
  const { runtime } = createWorkflowRuntimeFromEnvironment(environment);
  return composeServer(orchestrator, runtime, new AgentRegistry(), resolveMcpSurface(environment));
}

export async function createExosuitMcpServerWithState(
  orchestrator: ExosuitOrchestrator,
  environment: Record<string, string | undefined> = process.env,
): Promise<{ server: McpServer; startup: ExosuitServerStartupReport }> {
  const workflowBundle = createWorkflowRuntimeFromEnvironment(environment);
  let hydratedWorkflows = 0;
  if (workflowBundle.checkpointStore) {
    const workflowIds = await workflowBundle.checkpointStore.list();
    for (const workflowId of workflowIds) {
      await workflowBundle.runtime.hydrate(workflowId);
      hydratedWorkflows += 1;
    }
  }

  const agents = new AgentRegistry();
  let hydratedAgents = 0;
  const agentRegistryPath = environment.EXOSUIT_AGENT_REGISTRY_PATH?.trim();
  if (agentRegistryPath) {
    const store = new FileAgentRegistryStore({ path: agentRegistryPath });
    const loaded = await store.load();
    for (const agent of loaded) agents.register(agent);
    hydratedAgents = loaded.length;
  }

  const mcpSurface = resolveMcpSurface(environment);
  return {
    server: composeServer(orchestrator, workflowBundle.runtime, agents, mcpSurface),
    startup: {
      workflowPersistenceMode: workflowBundle.persistenceMode,
      hydratedWorkflows,
      hydratedAgents,
      mcpSurface,
    },
  };
}

function composeServer(
  orchestrator: ExosuitOrchestrator,
  runtime: WorkflowRuntime,
  agents: AgentRegistry,
  surface: McpSurfaceMode,
): McpServer {
  const server = createMcpServer(orchestrator);
  registerMotorMcpTools(server, orchestrator);
  if (surface === "core") return server;

  const synchronizer = new WorkspaceSynchronizer({ orchestrator, runtime });
  const executor = new OrchestratorWorkflowExecutor(orchestrator);
  registerCoordinatorMcpTools(server, {
    runtime,
    synchronizer,
    executor,
    agents,
  });
  return server;
}
