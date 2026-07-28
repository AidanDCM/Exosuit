import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  actionProposalSchema,
  actionResultSchema,
  desktopActionSchema,
  verificationExpectationSchema,
} from "./contracts.js";
import type { ExosuitOrchestrator } from "./orchestrator.js";

const physicalActionTypeSchema = z.enum(["move_pointer", "click_pointer", "type_text", "hotkey"]);

function response<T extends Record<string, unknown>>(structuredContent: T, summary: string) {
  return {
    structuredContent,
    content: [{ type: "text" as const, text: summary }],
  };
}

export function registerMotorMcpTools(server: McpServer, orchestrator: ExosuitOrchestrator): void {
  server.registerTool(
    "desktop_propose_physical_input",
    {
      title: "Propose locally gated physical input",
      description:
        "Use this only when semantic UI Automation cannot perform an authorized task and the local user has deliberately restarted Exosuit in full_control mode. It creates a proposal only. Every physical action requires a fresh active allowlisted target window and exact local typed approval before desktop_execute_proposal can run it. Never use it for credentials, destructive targets, evasion, anti-cheat, or hidden automation.",
      inputSchema: {
        id: z.string().min(1).max(200),
        actionType: physicalActionTypeSchema,
        targetWindowId: z.string().min(1).describe("Fresh window ID returned by desktop_observe or a fresh application-map match."),
        targetElementId: z.string().optional().describe("Required for type_text so local policy can verify a fresh enabled visible field."),
        coordinates: z
          .object({ x: z.number().finite(), y: z.number().finite() })
          .optional()
          .describe("Required for move_pointer and click_pointer; screen coordinates must be inside the fresh target window."),
        text: z.string().max(2_000).optional().describe("Required only for type_text."),
        keys: z.array(z.string().min(1).max(40)).min(1).max(8).optional().describe("Required only for hotkey; the local driver accepts a small documented allowlist."),
        rationale: z.string().min(1).max(2_000),
        expected: verificationExpectationSchema,
      },
      outputSchema: { proposal: actionProposalSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    },
    async (input) => {
      const parsed = desktopActionSchema.parse({
        ...input,
        route: "visual_mouse_keyboard",
        requestedBy: "chatgpt",
      });
      if (parsed.actionType === "move_pointer" || parsed.actionType === "click_pointer") {
        if (!parsed.coordinates) throw new Error(`${parsed.actionType} requires coordinates.`);
      }
      if (parsed.actionType === "type_text" && (!parsed.text || !parsed.targetElementId)) {
        throw new Error("type_text requires both text and a fresh targetElementId.");
      }
      if (parsed.actionType === "hotkey" && !parsed.keys?.length) {
        throw new Error("hotkey requires one through eight keys.");
      }
      const proposal = await orchestrator.proposeAction(parsed);
      return response(
        { proposal },
        `Physical-input proposal ${proposal.proposalId} is ${proposal.status}: ${proposal.decision.reason}`,
      );
    },
  );

  server.registerTool(
    "desktop_execute_physical_proposal",
    {
      title: "Execute a locally approved physical-input proposal",
      description:
        "Use this only for a proposal returned by desktop_propose_physical_input after the user approved the exact proposal in the local Exosuit panel. The local agent re-observes the active allowlisted window, verifies the approval fingerprint, executes one standard Windows input action, verifies the expected result, and consumes the approval.",
      inputSchema: { proposalId: z.string().min(1) },
      outputSchema: { result: actionResultSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: false },
    },
    async ({ proposalId }) => {
      const result = await orchestrator.executeProposal(proposalId);
      return response({ result }, result.summary);
    },
  );
}
