import { z } from "zod";

export const brainProviderSchema = z.enum(["chatgpt_mcp", "openai_api", "none"]);
export type BrainProvider = z.infer<typeof brainProviderSchema>;

export const brainRouteRequestSchema = z.object({
  interactiveOwnerPresent: z.boolean(),
  requiresUnattendedContinuation: z.boolean(),
  requiresWriteTools: z.boolean(),
  estimatedApiCostUsd: z.number().finite().nonnegative().max(1_000),
  preference: z.enum(["prefer_mcp", "prefer_api"]).default("prefer_mcp"),
  mcp: z.object({
    connected: z.boolean(),
    writeToolsAvailable: z.boolean(),
    sessionId: z.string().min(1).max(300).optional(),
  }).strict(),
  api: z.object({
    configured: z.boolean(),
    budgetRemainingUsd: z.number().finite().nonnegative().max(1_000_000),
    maximumTaskSpendUsd: z.number().finite().nonnegative().max(10_000),
  }).strict(),
}).strict();
export type BrainRouteRequest = z.infer<typeof brainRouteRequestSchema>;

export const brainRouteDecisionSchema = z.object({
  provider: brainProviderSchema,
  status: z.enum(["selected", "unavailable", "budget_exhausted", "capability_missing"]),
  reason: z.string().min(1).max(1_000),
  interactiveOnly: z.boolean(),
  mayContinueWithoutChatSession: z.boolean(),
  writeToolsAvailable: z.boolean(),
  authorizedApiSpendUsd: z.number().finite().nonnegative(),
  exposesCredentials: z.literal(false),
  grantsExecutionAuthority: z.literal(false),
}).strict();
export type BrainRouteDecision = z.infer<typeof brainRouteDecisionSchema>;

/**
 * Selects the conversational/reasoning route only.
 *
 * The returned route never grants desktop, credential, approval, or Field authority.
 * Those remain with the local Exosuit policy and execution layers.
 */
export function selectBrainRoute(raw: BrainRouteRequest): BrainRouteDecision {
  const input = brainRouteRequestSchema.parse(raw);

  if (input.requiresUnattendedContinuation) {
    return selectApiOrFailure(input, "Unattended continuation requires the API fallback; an MCP chat session is interactive only.");
  }

  if (input.preference === "prefer_api" && input.api.configured) {
    const api = selectApiOrFailure(input, "The caller explicitly preferred the configured API route.");
    if (api.provider === "openai_api") return api;
  }

  if (input.mcp.connected) {
    if (!input.requiresWriteTools || input.mcp.writeToolsAvailable) {
      return brainRouteDecisionSchema.parse({
        provider: "chatgpt_mcp",
        status: "selected",
        reason: "The interactive ChatGPT MCP route is connected and has the required tool capability.",
        interactiveOnly: true,
        mayContinueWithoutChatSession: false,
        writeToolsAvailable: input.mcp.writeToolsAvailable,
        authorizedApiSpendUsd: 0,
        exposesCredentials: false,
        grantsExecutionAuthority: false,
      });
    }

    const fallback = selectApiOrFailure(
      input,
      "The connected MCP route is read-only for this task, so the configured API fallback is required.",
    );
    if (fallback.provider !== "none") return fallback;
    return brainRouteDecisionSchema.parse({
      ...fallback,
      status: "capability_missing",
      reason: "The connected MCP route lacks write tools and no usable API fallback is available.",
    });
  }

  return selectApiOrFailure(input, "The ChatGPT MCP route is unavailable, so the API fallback is required.");
}

function selectApiOrFailure(input: BrainRouteRequest, successReason: string): BrainRouteDecision {
  if (!input.api.configured) {
    return brainRouteDecisionSchema.parse({
      provider: "none",
      status: "unavailable",
      reason: "No configured brain route can satisfy this task.",
      interactiveOnly: false,
      mayContinueWithoutChatSession: false,
      writeToolsAvailable: false,
      authorizedApiSpendUsd: 0,
      exposesCredentials: false,
      grantsExecutionAuthority: false,
    });
  }

  const authorized = Math.min(input.api.budgetRemainingUsd, input.api.maximumTaskSpendUsd);
  if (input.estimatedApiCostUsd > authorized) {
    return brainRouteDecisionSchema.parse({
      provider: "none",
      status: "budget_exhausted",
      reason: `Estimated API cost ${input.estimatedApiCostUsd.toFixed(4)} exceeds the authorized task budget ${authorized.toFixed(4)}.`,
      interactiveOnly: false,
      mayContinueWithoutChatSession: false,
      writeToolsAvailable: false,
      authorizedApiSpendUsd: 0,
      exposesCredentials: false,
      grantsExecutionAuthority: false,
    });
  }

  return brainRouteDecisionSchema.parse({
    provider: "openai_api",
    status: "selected",
    reason: successReason,
    interactiveOnly: false,
    mayContinueWithoutChatSession: true,
    writeToolsAvailable: true,
    authorizedApiSpendUsd: input.estimatedApiCostUsd,
    exposesCredentials: false,
    grantsExecutionAuthority: false,
  });
}
