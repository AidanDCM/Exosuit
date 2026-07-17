import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpServer } from "./mcp.js";
import { registerMotorMcpTools } from "./motorMcp.js";
import type { ExosuitOrchestrator } from "./orchestrator.js";

export function createExosuitMcpServer(orchestrator: ExosuitOrchestrator): McpServer {
  const server = createMcpServer(orchestrator);
  registerMotorMcpTools(server, orchestrator);
  return server;
}
