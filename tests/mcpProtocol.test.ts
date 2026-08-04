import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FakeDesktopAgent } from "../src/agent.js";
import {
  applicationMapMatchResultSchema,
  applicationMapSchema,
  ApplicationMapStore,
} from "../src/applicationMap.js";
import { actionProposalSchema, actionResultSchema, agentStatusSchema, observationSchema } from "../src/contracts.js";
import { ExosuitOrchestrator } from "../src/orchestrator.js";
import { createExosuitMcpServer } from "../src/server.js";

const expectedTools = [
  "desktop_build_application_map",
  "desktop_cancel_workflow",
  "desktop_continue_approved_workflow_step",
  "desktop_create_workflow",
  "desktop_emergency_stop",
  "desktop_execute_physical_proposal",
  "desktop_execute_proposal",
  "desktop_find_elements",
  "desktop_get_application_map",
  "desktop_get_audit_log",
  "desktop_get_status",
  "desktop_get_workflow",
  "desktop_get_workflow_audit",
  "desktop_get_workspace",
  "desktop_list_agents",
  "desktop_list_application_maps",
  "desktop_list_windows",
  "desktop_list_workflow_artifacts",
  "desktop_list_workflows",
  "desktop_match_application_map",
  "desktop_observe",
  "desktop_pause_workflow",
  "desktop_propose_action",
  "desktop_propose_physical_input",
  "desktop_refresh_workspace",
  "desktop_resume_workflow",
  "desktop_run_next_workflow_step",
  "exosuit_cancel_task",
  "exosuit_create_task",
  "exosuit_get_task",
  "exosuit_list_recipes",
  "exosuit_list_tasks",
  "exosuit_pause_task",
  "exosuit_plan_next_chunk",
  "exosuit_resume_task",
  "exosuit_route_brain",
  "exosuit_start_task",
].sort();

describe("MCP protocol boundary", () => {
  it("discovers and invokes the Exosuit tool surface over linked transports", async () => {
    const orchestrator = new ExosuitOrchestrator({
      agent: new FakeDesktopAgent(),
      applicationMaps: new ApplicationMapStore(),
    });
    // This test asserts the complete surface, so it opts into product and coordinator tools explicitly.
    // The default composition is `core`; see tests/documentedToolSurface.test.ts.
    const server = createExosuitMcpServer(orchestrator, { EXOSUIT_MCP_SURFACE: "full" });
    const client = new Client({ name: "exosuit-test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual(expectedTools);
      const executeTool = tools.tools.find((tool) => tool.name === "desktop_execute_proposal");
      expect(executeTool?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      });
      const physicalTool = tools.tools.find((tool) => tool.name === "desktop_propose_physical_input");
      expect(physicalTool?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      });
      const workflowTool = tools.tools.find((tool) => tool.name === "desktop_run_next_workflow_step");
      expect(workflowTool?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      });
      const taskChunkTool = tools.tools.find((tool) => tool.name === "exosuit_plan_next_chunk");
      expect(taskChunkTool?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });

      const statusResult = await client.callTool({ name: "desktop_get_status", arguments: {} });
      expect(statusResult.isError).not.toBe(true);
      const status = z.object({ status: agentStatusSchema }).parse(statusResult.structuredContent);
      expect(status.status).toMatchObject({ provider: "fake-sandbox", mode: "sandbox" });

      const observationResult = await client.callTool({
        name: "desktop_observe",
        arguments: { windowId: "win-notepad", includeElements: true, includeScreenshot: false, maxElements: 100 },
      });
      const observed = z.object({ observation: observationSchema }).parse(observationResult.structuredContent);
      expect(observed.observation.elements.map((element) => element.id).sort()).toEqual(["el-editor", "el-save"]);

      const workspaceResult = await client.callTool({
        name: "desktop_refresh_workspace",
        arguments: {},
      });
      expect(workspaceResult.isError).not.toBe(true);
      expect(workspaceResult.structuredContent).toMatchObject({
        workspace: { workspaceId: "local-workspace" },
      });

      const recipeResult = await client.callTool({ name: "exosuit_list_recipes", arguments: {} });
      expect(recipeResult.isError).not.toBe(true);
      expect(recipeResult.structuredContent).toMatchObject({ recipes: expect.any(Array) });

      const mapResult = await client.callTool({
        name: "desktop_build_application_map",
        arguments: { windowId: "win-notepad", maxElements: 100 },
      });
      const { map } = z.object({ map: applicationMapSchema }).parse(mapResult.structuredContent);
      expect(map.controls).toHaveLength(2);
      expect(JSON.stringify(map)).not.toContain("Hello from Exosuit");

      const matchResult = await client.callTool({
        name: "desktop_match_application_map",
        arguments: { mapId: map.mapId, windowId: "win-notepad" },
      });
      const matched = z.object({ result: applicationMapMatchResultSchema }).parse(matchResult.structuredContent);
      expect(matched.result.matches.map((item) => item.element.id).sort()).toEqual(["el-editor", "el-save"]);

      const physicalProposalResult = await client.callTool({
        name: "desktop_propose_physical_input",
        arguments: {
          id: "protocol-pointer-test",
          actionType: "click_pointer",
          targetWindowId: "win-notepad",
          coordinates: { x: 400, y: 300 },
          rationale: "Confirm that sandbox mode cannot authorize physical input.",
          expected: { kind: "window_active", windowId: "win-notepad" },
        },
      });
      const physical = z.object({ proposal: actionProposalSchema }).parse(physicalProposalResult.structuredContent);
      expect(physical.proposal).toMatchObject({
        status: "blocked",
        decision: { policyRule: "raw-input-local-only", riskLevel: "critical" },
      });

      const proposalResult = await client.callTool({
        name: "desktop_propose_action",
        arguments: {
          id: "protocol-set-text",
          actionType: "set_element_value",
          route: "os_accessibility",
          targetWindowId: "win-notepad",
          targetElementId: "el-editor",
          text: "Protocol validation successful",
          rationale: "Validate the real MCP discovery and call boundary.",
          expected: { kind: "element_value", elementId: "el-editor", equals: "Protocol validation successful" },
        },
      });
      const { proposal } = z.object({ proposal: actionProposalSchema }).parse(proposalResult.structuredContent);
      expect(proposal.status).toBe("allowed");

      const executeResult = await client.callTool({
        name: "desktop_execute_proposal",
        arguments: { proposalId: proposal.proposalId },
      });
      const { result } = z.object({ result: actionResultSchema }).parse(executeResult.structuredContent);
      expect(result).toMatchObject({ status: "succeeded", verificationStatus: "passed" });

      const stopResult = await client.callTool({
        name: "desktop_emergency_stop",
        arguments: { reason: "End MCP protocol integration test." },
      });
      expect(stopResult.structuredContent).toMatchObject({ stopped: true });
    } finally {
      await client.close();
      await server.close();
    }
  }, 30_000);
});
