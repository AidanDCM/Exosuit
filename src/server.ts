import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCoordinatorMcpTools } from "./coordinatorMcp.js";
import { createMcpServer } from "./mcp.js";
import { registerMotorMcpTools } from "./motorMcp.js";
import type { ExosuitOrchestrator } from "./orchestrator.js";
import { OrchestratorWorkflowExecutor } from "./orchestratorWorkflowExecutor.js";
import { FileProductTaskStore, PersonalTaskController } from "./personalTaskControl.js";
import { registerProductMcpTools } from "./productMcp.js";
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
 * `core` is the reviewed desktop core only.
 * `product` adds the high-level, non-executing personal task surface while keeping the
 * low-level coordinator hidden.
 * `full` additionally exposes the multi-window coordinator surface.
 */
export type McpSurfaceMode = "core" | "product" | "full";

export const DEFAULT_MCP_SURFACE: McpSurfaceMode = "core";

/**
 * Resolves the tool surface from the environment.
 *
 * Defaults to `core`. Product and coordinator tools remain opt-in until live acceptance.
 * An unrecognized value fails closed.
 */
export function resolveMcpSurface(
  environment: Record<string, string | undefined> = process.env,
): McpSurfaceMode {
  const raw = environment.EXOSUIT_MCP_SURFACE?.trim().toLowerCase();
  if (raw === undefined || raw === "") return DEFAULT_MCP_SURFACE;
  if (raw === "core" || raw === "product" || raw === "full") return raw;
  throw new Error('EXOSUIT_MCP_SURFACE must be "core", "product", or "full".');
}

export type ExosuitServerStartupReport = {
  workflowPersistenceMode: WorkflowPersistenceMode;
  hydratedWorkflows: number;
  hydratedAgents: number;
  hydratedProductTasks: number;
  mcpSurface: McpSurfaceMode;
};

export function createExosuitMcpServer(
  orchestrator: ExosuitOrchestrator,
  environment: Record<string, string | undefined> = process.env,
): McpServer {
  const { runtime } = createWorkflowRuntimeFromEnvironment(environment);
  const tasks = new PersonalTaskController();
  return composeServer(
    orchestrator,
    runtime,
    new AgentRegistry(),
    tasks,
    resolveProductFieldReadiness(environment),
    resolveMcpSurface(environment),
  );
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

  const productTaskDirectory = environment.EXOSUIT_PRODUCT_TASK_DIR?.trim();
  const tasks = new PersonalTaskController({
    store: productTaskDirectory
      ? new FileProductTaskStore({ directory: productTaskDirectory })
      : undefined,
  });
  const hydratedProductTasks = await tasks.hydrate();

  const mcpSurface = resolveMcpSurface(environment);
  return {
    server: composeServer(
      orchestrator,
      workflowBundle.runtime,
      agents,
      tasks,
      resolveProductFieldReadiness(environment),
      mcpSurface,
    ),
    startup: {
      workflowPersistenceMode: workflowBundle.persistenceMode,
      hydratedWorkflows,
      hydratedAgents,
      hydratedProductTasks,
      mcpSurface,
    },
  };
}

function composeServer(
  orchestrator: ExosuitOrchestrator,
  runtime: WorkflowRuntime,
  agents: AgentRegistry,
  tasks: PersonalTaskController,
  fieldReady: () => boolean,
  surface: McpSurfaceMode,
): McpServer {
  const server = createMcpServer(orchestrator);
  registerMotorMcpTools(server, orchestrator);
  if (surface === "core") return server;

  registerProductMcpTools(server, { tasks, fieldReady });
  if (surface === "product") return server;

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

/**
 * No model-provided argument can assert Field readiness.
 *
 * Until the product surface is wired to the real authenticated Field readiness service,
 * only an explicitly enabled fake-agent development process may report ready. Real/http
 * agent modes remain false and therefore cannot start or resume product tasks through MCP.
 */
function resolveProductFieldReadiness(
  environment: Record<string, string | undefined>,
): () => boolean {
  const developmentFakeReady =
    environment.EXOSUIT_PRODUCT_FIELD_READINESS?.trim().toLowerCase() === "development_fake";
  const fakeAgent = (environment.EXOSUIT_AGENT_MODE ?? "fake").trim().toLowerCase() === "fake";
  return () => developmentFakeReady && fakeAgent;
}
