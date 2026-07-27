import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { FakeDesktopAgent } from "../src/agent.js";
import { ApplicationMapStore } from "../src/applicationMap.js";
import { ExosuitOrchestrator } from "../src/orchestrator.js";
import { createExosuitMcpServer, resolveMcpSurface } from "../src/server.js";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * Documents that publish the reviewed MCP surface. Local acceptance treats an
 * undocumented discovered tool as a stop condition, so a stale list here
 * produces a false positive that halts Phase 1 for no real safety reason.
 *
 * The runbook governs what a tunnel session may discover, and Phase 1 runs the
 * default `core` surface, so it is checked against the core tools. The README
 * documents both groups, so it is checked against the full surface.
 */
const surfaceDocuments = [
  { path: "README.md", heading: "## Current MCP surface", surface: "full" as const },
  {
    path: "docs/SECURE_MCP_TUNNEL_RUNBOOK.md",
    heading: "## Exact expected tool allowlist",
    surface: "core" as const,
  },
];

const COORDINATOR_TOOLS = [
  "desktop_refresh_workspace",
  "desktop_get_workspace",
  "desktop_list_windows",
  "desktop_create_workflow",
  "desktop_list_workflows",
  "desktop_get_workflow",
  "desktop_run_next_workflow_step",
  "desktop_continue_approved_workflow_step",
  "desktop_pause_workflow",
  "desktop_resume_workflow",
  "desktop_cancel_workflow",
  "desktop_list_workflow_artifacts",
  "desktop_get_workflow_audit",
  "desktop_list_agents",
];

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

async function registeredTools(environment: Record<string, string | undefined>): Promise<string[]> {
  const orchestrator = new ExosuitOrchestrator({
    agent: new FakeDesktopAgent(),
    applicationMaps: new ApplicationMapStore(),
  });
  const server = createExosuitMcpServer(orchestrator, environment);
  const client = new Client({ name: "exosuit-surface-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return (await client.listTools()).tools.map((tool) => tool.name).sort();
  } finally {
    await client.close();
    await server.close();
  }
}

describe("documented MCP tool surface", () => {
  let core: string[];
  let full: string[];

  beforeAll(async () => {
    core = await registeredTools({ EXOSUIT_MCP_SURFACE: "core" });
    full = await registeredTools({ EXOSUIT_MCP_SURFACE: "full" });
  });

  it.each(surfaceDocuments)(
    "$path publishes exactly the $surface tools",
    async ({ path, heading, surface }) => {
      const documented = await readDocumentedTools(path, heading);
      const expected = surface === "core" ? core : full;
      expect(documented.length, `${path} lists no tools under ${heading}.`).toBeGreaterThan(0);
      expect(new Set(documented).size, `${path} lists a tool more than once.`).toBe(documented.length);
      expect(documented.slice().sort(), `${path} is out of sync with src/server.ts.`).toEqual(expected);
    },
  );

  it("keeps every execution tool on the single authoritative execution path", () => {
    expect(full.filter((name) => name.includes("execute"))).toEqual([
      "desktop_execute_physical_proposal",
      "desktop_execute_proposal",
    ]);
  });
});

describe("MCP surface composition flag", () => {
  it("defaults to the core surface so unvalidated tools are opt-in", () => {
    expect(resolveMcpSurface({})).toBe("core");
    expect(resolveMcpSurface({ EXOSUIT_MCP_SURFACE: undefined })).toBe("core");
    expect(resolveMcpSurface({ EXOSUIT_MCP_SURFACE: "  " })).toBe("core");
  });

  it("accepts either mode case-insensitively", () => {
    expect(resolveMcpSurface({ EXOSUIT_MCP_SURFACE: "core" })).toBe("core");
    expect(resolveMcpSurface({ EXOSUIT_MCP_SURFACE: "FULL" })).toBe("full");
    expect(resolveMcpSurface({ EXOSUIT_MCP_SURFACE: " Full " })).toBe("full");
  });

  it("fails closed on an unrecognized value rather than guessing", () => {
    for (const value of ["all", "coordinator", "true", "1", "cor", "core,full"]) {
      expect(() => resolveMcpSurface({ EXOSUIT_MCP_SURFACE: value })).toThrow(
        /must be "core" or "full"/,
      );
    }
  });

  it("excludes every coordinator tool from the core surface", async () => {
    const coreTools = await registeredTools({ EXOSUIT_MCP_SURFACE: "core" });
    for (const tool of COORDINATOR_TOOLS) {
      expect(coreTools, `${tool} must not be reachable on the core surface.`).not.toContain(tool);
    }
  });

  it("exposes the coordinator only when explicitly opted in", async () => {
    const fullTools = await registeredTools({ EXOSUIT_MCP_SURFACE: "full" });
    for (const tool of COORDINATOR_TOOLS) expect(fullTools).toContain(tool);
  });

  it("treats full as a strict superset of core", async () => {
    const coreTools = await registeredTools({ EXOSUIT_MCP_SURFACE: "core" });
    const fullTools = await registeredTools({ EXOSUIT_MCP_SURFACE: "full" });
    // Enabling the coordinator may add tools; it must never remove or rename a core one.
    for (const tool of coreTools) expect(fullTools).toContain(tool);
    expect(coreTools).toHaveLength(13);
    expect(fullTools).toHaveLength(27);
  });
});
