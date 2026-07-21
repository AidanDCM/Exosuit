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

export type ExosuitServerStartupReport = {
  workflowPersistenceMode: WorkflowPersistenceMode;
  hydratedWorkflows: number;
  hydratedAgents: number;
};

export function createExosuitMcpServer(orchestrator: ExosuitOrchestrator): McpServer {
  const { runtime } = createWorkflowRuntimeFromEnvironment();
  return composeServer(orchestrator, runtime, new AgentRegistry());
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

  return {
    server: composeServer(orchestrator, workflowBundle.runtime, agents),
    startup: {
      workflowPersistenceMode: workflowBundle.persistenceMode,
      hydratedWorkflows,
      hydratedAgents,
    },
  };
}

function composeServer(
  orchestrator: ExosuitOrchestrator,
  runtime: WorkflowRuntime,
  agents: AgentRegistry,
): McpServer {
  const server = createMcpServer(orchestrator);
  registerMotorMcpTools(server, orchestrator);
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
