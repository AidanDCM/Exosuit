import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { registerCoordinatorMcpTools } from "../src/coordinatorMcp.js";
import { AgentRegistry } from "../src/supervisor.js";
import {
  runtimeWorkflowRecordSchema,
  WorkflowRuntime,
  type WorkflowStepExecutor,
} from "../src/workflowRuntime.js";
import type { WorkspaceSynchronizer } from "../src/workspaceSync.js";

const workspace = {
  contractVersion: 1 as const,
  workspaceId: "workspace-a",
  agentId: "agent-a",
  windowsSessionId: "session-a",
  currentVirtualDesktopId: null,
  windowRegistryVersion: 1,
  capturedAt: "2026-07-21T15:00:00.000Z",
  unexpectedDialogWindowId: null,
  windows: [],
};

const executor: WorkflowStepExecutor = {
  async execute() {
    return {
      status: "succeeded",
      summary: "Verified no-op.",
      verificationStatus: "passed",
    };
  },
};

describe("coordinator MCP boundary", () => {
  it("discovers workflow tools and runs one verified bounded step", async () => {
    const runtime = new WorkflowRuntime();
    const synchronizer = {
      async refresh() {
        return runtime.updateWorkspace(workspace);
      },
    } as WorkspaceSynchronizer;
    const server = new McpServer({ name: "coordinator-test", version: "1.0.0" });
    registerCoordinatorMcpTools(server, {
      runtime,
      executor,
      synchronizer,
      agents: new AgentRegistry(),
    });
    const client = new Client({ name: "test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name);
      expect(names).toContain("desktop_create_workflow");
      expect(names).toContain("desktop_run_next_workflow_step");
      expect(names).toContain("desktop_list_agents");
      expect(
        tools.tools.find((tool) => tool.name === "desktop_run_next_workflow_step")?.annotations,
      ).toMatchObject({ destructiveHint: true });

      const refresh = await client.callTool({
        name: "desktop_refresh_workspace",
        arguments: {},
      });
      expect(refresh.isError).not.toBe(true);

      const create = await client.callTool({
        name: "desktop_create_workflow",
        arguments: {
          workflow: {
            contractVersion: 1,
            workflowId: "workflow-mcp",
            requestedBy: "test",
            riskCeiling: "low",
            steps: [
              {
                stepId: "step-a",
                dependsOn: [],
                workspaceId: "workspace-a",
                resourceMode: "read",
                actionIntent: "Perform a bounded verified no-op.",
                expectedResult: "No-op verified.",
                timeoutMs: 5_000,
                inputArtifactNames: [],
                outputArtifactNames: [],
                externalEffect: "none",
              },
            ],
          },
        },
      });
      expect(
        z.object({ workflow: runtimeWorkflowRecordSchema }).parse(create.structuredContent).workflow.status,
      ).toBe("pending");

      const run = await client.callTool({
        name: "desktop_run_next_workflow_step",
        arguments: { workflowId: "workflow-mcp" },
      });
      const result = z
        .object({ workflow: runtimeWorkflowRecordSchema })
        .parse(run.structuredContent);
      expect(result.workflow.status).toBe("completed");

      const audit = await client.callTool({
        name: "desktop_get_workflow_audit",
        arguments: { workflowId: "workflow-mcp" },
      });
      expect(audit.structuredContent).toMatchObject({ valid: true });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
