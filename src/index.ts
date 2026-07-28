import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FakeDesktopAgent, HttpDesktopAgent } from "./agent.js";
import { ApplicationMapStore } from "./applicationMap.js";
import { HashChainLedger } from "./audit.js";
import { ExosuitOrchestrator } from "./orchestrator.js";
import { createExosuitMcpServerWithState } from "./server.js";
import { createTimeoutFetch, parseGatewayRequestTimeout } from "./timeoutFetch.js";

function buildAgent() {
  const mode = (process.env.EXOSUIT_AGENT_MODE ?? "fake").toLowerCase();
  if (mode === "fake") return new FakeDesktopAgent({ mode: "sandbox" });
  if (mode !== "http") throw new Error("EXOSUIT_AGENT_MODE must be fake or http.");

  const token = process.env.EXOSUIT_AGENT_TOKEN ?? "";
  const baseUrl = process.env.EXOSUIT_AGENT_URL ?? "http://127.0.0.1:43117";
  const timeoutMs = parseGatewayRequestTimeout(process.env.EXOSUIT_GATEWAY_REQUEST_TIMEOUT_MS);
  return new HttpDesktopAgent({
    baseUrl,
    token,
    fetchImpl: createTimeoutFetch(timeoutMs),
  });
}

async function main(): Promise<void> {
  const agent = buildAgent();
  const ledger = new HashChainLedger(process.env.EXOSUIT_GATEWAY_LEDGER);
  await ledger.hydrate();
  const applicationMaps = new ApplicationMapStore({ directory: process.env.EXOSUIT_APPLICATION_MAP_DIR });
  const mapHydration = await applicationMaps.hydrate();
  const orchestrator = new ExosuitOrchestrator({ agent, ledger, applicationMaps });
  const { server, startup } = await createExosuitMcpServerWithState(orchestrator);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    [
      "Exosuit MCP server connected over stdio.",
      `MCP surface: ${startup.mcpSurface}${
        startup.mcpSurface === "core"
          ? " (desktop core only; coordinator tools are not exposed)."
          : " (desktop core plus the unvalidated coordinator surface)."
      }`,
      `Loaded ${mapHydration.loaded} application map(s); skipped ${mapHydration.skipped}.`,
      `Workflow persistence: ${startup.workflowPersistenceMode}; hydrated ${startup.hydratedWorkflows}.`,
      `Hydrated ${startup.hydratedAgents} supervisor agent record(s).`,
    ].join(" ") + "\n",
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup failure.";
  process.stderr.write(`Exosuit startup failed: ${message}\n`);
  process.exitCode = 1;
});
