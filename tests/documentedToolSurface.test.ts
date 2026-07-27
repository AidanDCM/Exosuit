import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { FakeDesktopAgent } from "../src/agent.js";
import { ApplicationMapStore } from "../src/applicationMap.js";
import { ExosuitOrchestrator } from "../src/orchestrator.js";
import { createExosuitMcpServer } from "../src/server.js";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * Documents that publish the reviewed MCP surface. Local acceptance treats an
 * undocumented discovered tool as a stop condition, so a stale list here
 * produces a false positive that halts Phase 1 for no real safety reason.
 */
const surfaceDocuments = [
  { path: "README.md", heading: "## Current MCP surface" },
  { path: "docs/SECURE_MCP_TUNNEL_RUNBOOK.md", heading: "## Exact expected tool allowlist" },
] as const;

/** Collects `- \`desktop_x\`` bullets between a heading and the next heading of the same or higher level. */
async function readDocumentedTools(documentPath: string, heading: string): Promise<string[]> {
  const contents = await readFile(join(repositoryRoot, documentPath), "utf8");
  const lines = contents.split(/\r?\n/);
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error(`${documentPath} no longer contains the heading ${heading}.`);

  const level = heading.replace(/[^#].*$/, "").length;
  const tools: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const nextHeading = /^(#+)\s/.exec(line);
    if (nextHeading && nextHeading[1]!.length <= level) break;
    const bullet = /^-\s+`(desktop_[a-z_]+)`\s*$/.exec(line);
    if (bullet) tools.push(bullet[1]!);
  }
  return tools;
}

describe("documented MCP tool surface", () => {
  let registeredTools: string[];

  beforeAll(async () => {
    const orchestrator = new ExosuitOrchestrator({
      agent: new FakeDesktopAgent(),
      applicationMaps: new ApplicationMapStore(),
    });
    const server = createExosuitMcpServer(orchestrator);
    const client = new Client({ name: "exosuit-surface-test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      registeredTools = (await client.listTools()).tools.map((tool) => tool.name).sort();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it.each(surfaceDocuments)("$path publishes exactly the registered tools", async ({ path, heading }) => {
    const documented = await readDocumentedTools(path, heading);
    expect(documented.length, `${path} lists no tools under ${heading}.`).toBeGreaterThan(0);
    expect(new Set(documented).size, `${path} lists a tool more than once.`).toBe(documented.length);
    expect(documented.slice().sort(), `${path} is out of sync with src/server.ts.`).toEqual(registeredTools);
  });

  it("keeps every execution tool on the single authoritative execution path", () => {
    const executionTools = registeredTools.filter((name) => name.includes("execute"));
    expect(executionTools).toEqual(["desktop_execute_physical_proposal", "desktop_execute_proposal"]);
  });

  it("registers the coordinator surface unconditionally, so the tunnel allowlist must cover it", () => {
    // src/server.ts calls registerCoordinatorMcpTools in composeServer with no feature flag.
    // A tunnel session therefore cannot present the desktop core alone; Phase 10 must expect all of it.
    expect(registeredTools).toContain("desktop_create_workflow");
    expect(registeredTools).toContain("desktop_list_agents");
  });
});
