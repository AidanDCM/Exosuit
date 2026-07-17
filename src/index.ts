import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FakeDesktopAgent, HttpDesktopAgent } from "./agent.js";
import { HashChainLedger } from "./audit.js";
import { createMcpServer } from "./mcp.js";
import { ExosuitOrchestrator } from "./orchestrator.js";

function buildAgent() {
  const mode = (process.env.EXOSUIT_AGENT_MODE ?? "fake").toLowerCase();
  if (mode === "fake") return new FakeDesktopAgent({ mode: "sandbox" });
  if (mode !== "http") throw new Error("EXOSUIT_AGENT_MODE must be fake or http.");

  const token = process.env.EXOSUIT_AGENT_TOKEN ?? "";
  const baseUrl = process.env.EXOSUIT_AGENT_URL ?? "http://127.0.0.1:43117";
  return new HttpDesktopAgent({ baseUrl, token });
}

async function main(): Promise<void> {
  const agent = buildAgent();
  const ledger = new HashChainLedger(process.env.EXOSUIT_GATEWAY_LEDGER);
  await ledger.hydrate();
  const orchestrator = new ExosuitOrchestrator({ agent, ledger });
  const server = createMcpServer(orchestrator);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Exosuit MCP server connected over stdio.\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup failure.";
  process.stderr.write(`Exosuit startup failed: ${message}\n`);
  process.exitCode = 1;
});
