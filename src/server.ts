import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpServer } from "./mcp.js";
import { registerMotorMcpTools } from "./motorMcp.js";
import { registerCoordinatorMcpTools } from "./coordinatorMcp.js";
import { OrchestratorWorkflowExecutor } from "./orchestratorWorkflowExecutor.js";
import type { ExosuitOrchestrator } from "./orchestrator.js";
import { createWorkflowRuntimeFromEnvironment } from "./runtimeFactory.js";
import { AgentRegistry } from "./supervisor.js";
import { WorkspaceSynchronizer } from "./workspaceSync.js";

export function createExosuitMcpServer(orchestrator: ExosuitOrchestrator): McpServer {
  const server = createMcpServer(orchestrator);
  registerMotorMcpTools(server, orchestrator);

  const { runtime } = createWorkflowRuntimeFromEnvironment();
  const synchronizer = new WorkspaceSynchronizer({ orchestrator, runtime });
  const executor = new OrchestratorWorkflowExecutor(orchestrator);
  const agents = new AgentRegistry();

  registerCoordinatorMcpTools(server, {
    runtime,
    synchronizer,
    executor,
    agents,
  });

  return server;
}
