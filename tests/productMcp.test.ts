import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PersonalTaskController, productTaskChunkSchema, productTaskSessionSchema } from "../src/personalTaskControl.js";
import { registerProductMcpTools } from "../src/productMcp.js";

describe("product MCP boundary", () => {
  it("exposes task-level planning without an execution-success tool", async () => {
    const tasks = new PersonalTaskController();
    const server = new McpServer({ name: "product-test", version: "1.0.0" });
    registerProductMcpTools(server, { tasks, fieldReady: () => true });
    const client = new Client({ name: "test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name);
      expect(names).toContain("exosuit_route_brain");
      expect(names).toContain("exosuit_create_task");
      expect(names).toContain("exosuit_plan_next_chunk");
      expect(names.some((name) => name.includes("record") || name.includes("complete"))).toBe(false);

      const created = await client.callTool({
        name: "exosuit_create_task",
        arguments: {
          recipeId: "gather-approved-information",
          requestedBy: "owner",
          goal: "Gather approved information and prepare a local summary.",
          variables: { query: "example" },
          brainRequest: {
            interactiveOwnerPresent: true,
            requiresUnattendedContinuation: false,
            requiresWriteTools: true,
            estimatedApiCostUsd: 0.1,
            preference: "prefer_mcp",
            mcp: { connected: true, writeToolsAvailable: true, sessionId: "session" },
            api: { configured: true, budgetRemainingUsd: 5, maximumTaskSpendUsd: 1 },
          },
        },
      });
      const task = z.object({ task: productTaskSessionSchema }).parse(created.structuredContent).task;
      expect(task.status).toBe("created");
      expect(task.executionAllowed).toBe(false);

      const started = await client.callTool({
        name: "exosuit_start_task",
        arguments: { taskId: task.taskId },
      });
      expect(z.object({ task: productTaskSessionSchema }).parse(started.structuredContent).task.status).toBe("running");

      const planned = await client.callTool({
        name: "exosuit_plan_next_chunk",
        arguments: { taskId: task.taskId },
      });
      const chunk = z.object({ chunk: productTaskChunkSchema }).parse(planned.structuredContent).chunk;
      expect(chunk.steps).toHaveLength(3);
      expect(chunk.actionAuthority).toBe("none");
      expect(chunk.executionAllowed).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  }, 30_000);

  it("uses trusted local Field readiness rather than a model argument", async () => {
    const tasks = new PersonalTaskController();
    const server = new McpServer({ name: "product-readiness-test", version: "1.0.0" });
    registerProductMcpTools(server, { tasks, fieldReady: () => false });
    const client = new Client({ name: "test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const created = await client.callTool({
        name: "exosuit_create_task",
        arguments: {
          recipeId: "gather-approved-information",
          requestedBy: "owner",
          goal: "Gather information.",
          brainRequest: {
            interactiveOwnerPresent: true,
            requiresUnattendedContinuation: false,
            requiresWriteTools: false,
            estimatedApiCostUsd: 0,
            preference: "prefer_mcp",
            mcp: { connected: true, writeToolsAvailable: false },
            api: { configured: false, budgetRemainingUsd: 0, maximumTaskSpendUsd: 0 },
          },
        },
      });
      const task = z.object({ task: productTaskSessionSchema }).parse(created.structuredContent).task;
      const start = await client.callTool({ name: "exosuit_start_task", arguments: { taskId: task.taskId } });
      expect(start.isError).toBe(true);
      expect(tasks.get(task.taskId).status).toBe("created");
    } finally {
      await client.close();
      await server.close();
    }
  }, 30_000);
});
