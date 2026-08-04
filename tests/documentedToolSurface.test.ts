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
 * produces a false positive that halts acceptance for no real safety reason.
 *
 * The tunnel runbook governs the default Phase 1 core surface. The README
 * documents every opt-in group and is checked against the complete full surface.
 */
const surfaceDocuments = [
  { path: "README.md", heading: "## Current MCP surface", surface: "full" as const },
  {
    path: "docs/SECURE_MCP_TUNNEL_RUNBOOK.md",
    heading: "## Exact expected tool allowlist",
    surface: "core" as const,
  },
];

const PRODUCT_TOOLS = [
  "exosuit_route_brain",
  "exosuit_list_recipes",
  "exosuit_create_task",
  "exosuit_list_tasks",
  "exosuit_get_task",
  "exosuit_start_task",
  "exosuit_plan_next_chunk",
  "exosuit_pause_task",
  "exosuit_resume_task",
  "exosuit_cancel_task",
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

/** Collects MCP tool bullets between a heading and the next heading of the same or higher level. */
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
    const bullet = /^-\s+`((?:desktop|exosuit)_[a-z_]+)`\s*$/.exec(line);
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

  it("accepts all three modes case-insensitively", () => {
    expect(resolveMcpSurface({ EXOSUIT_MCP_SURFACE: "core" })).toBe("core");
    expect(resolveMcpSurface({ EXOSUIT_MCP_SURFACE: "PRODUCT" })).toBe("product");
    expect(resolveMcpSurface({ EXOSUIT_MCP_SURFACE: " Product " })).toBe("product");
    expect(resolveMcpSurface({ EXOSUIT_MCP_SURFACE: "FULL" })).toBe("full");
    expect(resolveMcpSurface({ EXOSUIT_MCP_SURFACE: " Full " })).toBe("full");
  });

  it("fails closed on an unrecognized value rather than guessing", () => {
    for (const value of ["all", "coordinator", "true", "1", "cor", "core,full"]) {
      expect(() => resolveMcpSurface({ EXOSUIT_MCP_SURFACE: value })).toThrow(
        /must be "core", "product", or "full"/,
      );
    }
  });

  it("keeps product and coordinator tools outside the default core surface", async () => {
    const coreTools = await registeredTools({ EXOSUIT_MCP_SURFACE: "core" });
    for (const tool of [...PRODUCT_TOOLS, ...COORDINATOR_TOOLS]) {
      expect(coreTools, `${tool} must not be reachable on the core surface.`).not.toContain(tool);
    }
  });

  it("exposes only the high-level product tools on the product surface", async () => {
    const productTools = await registeredTools({ EXOSUIT_MCP_SURFACE: "product" });
    for (const tool of PRODUCT_TOOLS) expect(productTools).toContain(tool);
    for (const tool of COORDINATOR_TOOLS) expect(productTools).not.toContain(tool);
  });

  it("exposes the coordinator only on the full surface", async () => {
    const fullTools = await registeredTools({ EXOSUIT_MCP_SURFACE: "full" });
    for (const tool of [...PRODUCT_TOOLS, ...COORDINATOR_TOOLS]) expect(fullTools).toContain(tool);
  });

  it("treats product and full as strict supersets without removing lower-level tools", async () => {
    const coreTools = await registeredTools({ EXOSUIT_MCP_SURFACE: "core" });
    const productTools = await registeredTools({ EXOSUIT_MCP_SURFACE: "product" });
    const fullTools = await registeredTools({ EXOSUIT_MCP_SURFACE: "full" });
    for (const tool of coreTools) {
      expect(productTools).toContain(tool);
      expect(fullTools).toContain(tool);
    }
    for (const tool of productTools) expect(fullTools).toContain(tool);
    expect(coreTools).toHaveLength(13);
    expect(productTools).toHaveLength(23);
    expect(fullTools).toHaveLength(37);
  });
});
