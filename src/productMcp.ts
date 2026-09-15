import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { brainRouteDecisionSchema, brainRouteRequestSchema, selectBrainRoute } from "./brainRouting.js";
import {
  productTaskChunkSchema,
  productTaskRecipeSchema,
  productTaskSessionSchema,
  type PersonalTaskController,
} from "./personalTaskControl.js";

export type ProductMcpServices = {
  tasks: PersonalTaskController;
  fieldReady: () => boolean | Promise<boolean>;
};

function response<T extends Record<string, unknown>>(structuredContent: T, summary?: string) {
  return {
    structuredContent,
    content: [{ type: "text" as const, text: summary ?? JSON.stringify(structuredContent) }],
  };
}

/**
 * Registers the task-level product surface.
 *
 * This surface plans and governs work but cannot report execution success. A separate
 * trusted local adapter must call `recordTrustedOutcome` directly after ordinary policy,
 * fresh observation, execution, and verification have completed.
 */
export function registerProductMcpTools(server: McpServer, services: ProductMcpServices): void {
  server.registerTool(
    "exosuit_route_brain",
    {
      title: "Select the Exosuit brain route",
      description: "Choose interactive ChatGPT MCP or the configured API fallback using capability, continuity, and spend limits. This grants no execution or credential authority.",
      inputSchema: brainRouteRequestSchema.shape,
      outputSchema: { route: brainRouteDecisionSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (input) => response({ route: selectBrainRoute(brainRouteRequestSchema.parse(input)) }),
  );

  server.registerTool(
    "exosuit_list_recipes",
    {
      title: "List reviewed Exosuit task recipes",
      description: "List bounded personal-use recipes. Recipes are planning contracts and do not grant desktop execution authority.",
      inputSchema: {},
      outputSchema: { recipes: z.array(productTaskRecipeSchema) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => response({ recipes: services.tasks.listRecipes() }),
  );

  server.registerTool(
    "exosuit_create_task",
    {
      title: "Create a resumable Exosuit task",
      description: "Create an integrity-bound task from a reviewed recipe and select its brain route. Creation does not start the Field or execute desktop actions.",
      inputSchema: {
        recipeId: z.string().min(1).max(200),
        requestedBy: z.string().min(1).max(300),
        goal: z.string().min(1).max(4_000),
        variables: z.record(z.string(), z.string().max(4_000)).optional(),
        brainRequest: brainRouteRequestSchema,
      },
      outputSchema: { task: productTaskSessionSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    },
    async ({ recipeId, requestedBy, goal, variables, brainRequest }) => {
      const route = selectBrainRoute(brainRouteRequestSchema.parse(brainRequest));
      const task = await services.tasks.create({ recipeId, requestedBy, goal, variables, brain: route });
      return response({ task }, `Created task ${task.taskId} from recipe ${task.recipeId}.`);
    },
  );

  server.registerTool(
    "exosuit_list_tasks",
    {
      title: "List Exosuit tasks",
      description: "List task lifecycle and checkpoint state without executing anything.",
      inputSchema: {},
      outputSchema: { tasks: z.array(productTaskSessionSchema) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => response({ tasks: services.tasks.list() }),
  );

  server.registerTool(
    "exosuit_get_task",
    {
      title: "Get an Exosuit task",
      description: "Read one integrity-verified task and its step, approval, recovery, and checkpoint state.",
      inputSchema: { taskId: z.string().uuid() },
      outputSchema: { task: productTaskSessionSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ taskId }) => response({ task: services.tasks.get(taskId) }),
  );

  server.registerTool(
    "exosuit_start_task",
    {
      title: "Start a ready Exosuit task",
      description: "Start a task only when the trusted local readiness provider reports the Field ready. The model cannot assert readiness through tool arguments.",
      inputSchema: { taskId: z.string().uuid() },
      outputSchema: { task: productTaskSessionSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    },
    async ({ taskId }) => {
      const ready = await services.fieldReady();
      const task = await services.tasks.start(taskId, ready);
      return response({ task }, `Task ${taskId} is ${task.status}.`);
    },
  );

  server.registerTool(
    "exosuit_plan_next_chunk",
    {
      title: "Plan the next safe task chunk",
      description: "Create a short-lived, non-executable chunk grouped by approval class. A trusted local adapter must re-observe, apply ordinary policy, execute, verify, and record the outcome.",
      inputSchema: { taskId: z.string().uuid(), maximumSteps: z.number().int().min(1).max(10).optional() },
      outputSchema: { chunk: productTaskChunkSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ taskId, maximumSteps }) => {
      const chunk = services.tasks.planNextChunk(taskId, { maximumSteps });
      return response({ chunk }, `Planned ${chunk.steps.length} ${chunk.approvalClass} step(s) for task ${taskId}.`);
    },
  );

  server.registerTool(
    "exosuit_pause_task",
    {
      title: "Pause an Exosuit task",
      description: "Checkpoint and pause task-level work without approving or executing actions.",
      inputSchema: { taskId: z.string().uuid(), reason: z.string().min(1).max(2_000) },
      outputSchema: { task: productTaskSessionSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    },
    async ({ taskId, reason }) => response({ task: await services.tasks.pause(taskId, reason) }),
  );

  server.registerTool(
    "exosuit_resume_task",
    {
      title: "Resume an Exosuit task",
      description: "Resume a reconciled task only when the trusted local readiness provider reports the Field ready.",
      inputSchema: { taskId: z.string().uuid() },
      outputSchema: { task: productTaskSessionSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    },
    async ({ taskId }) => {
      const ready = await services.fieldReady();
      return response({ task: await services.tasks.resume(taskId, ready) });
    },
  );

  server.registerTool(
    "exosuit_cancel_task",
    {
      title: "Cancel an Exosuit task",
      description: "Cancel remaining task work. This does not delete task evidence or roll back external effects.",
      inputSchema: { taskId: z.string().uuid(), reason: z.string().min(1).max(2_000) },
      outputSchema: { task: productTaskSessionSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ taskId, reason }) => response({ task: await services.tasks.cancel(taskId, reason) }),
  );
}
