import { describe, expect, it } from "vitest";
import { selectBrainRoute } from "../src/brainRouting.js";

const base = {
  interactiveOwnerPresent: true,
  requiresUnattendedContinuation: false,
  requiresWriteTools: true,
  estimatedApiCostUsd: 0.25,
  preference: "prefer_mcp" as const,
  mcp: { connected: true, writeToolsAvailable: true, sessionId: "session-1" },
  api: { configured: true, budgetRemainingUsd: 10, maximumTaskSpendUsd: 2 },
};

describe("brain routing", () => {
  it("prefers an interactive write-capable MCP route without API spend", () => {
    const route = selectBrainRoute(base);
    expect(route.provider).toBe("chatgpt_mcp");
    expect(route.mayContinueWithoutChatSession).toBe(false);
    expect(route.authorizedApiSpendUsd).toBe(0);
    expect(route.grantsExecutionAuthority).toBe(false);
    expect(route.exposesCredentials).toBe(false);
  });

  it("requires the API route for unattended continuation", () => {
    const route = selectBrainRoute({ ...base, requiresUnattendedContinuation: true });
    expect(route.provider).toBe("openai_api");
    expect(route.mayContinueWithoutChatSession).toBe(true);
    expect(route.authorizedApiSpendUsd).toBe(0.25);
  });

  it("falls back to the API when MCP lacks required write tools", () => {
    const route = selectBrainRoute({
      ...base,
      mcp: { connected: true, writeToolsAvailable: false, sessionId: "session-1" },
    });
    expect(route.provider).toBe("openai_api");
    expect(route.status).toBe("selected");
  });

  it("fails closed when the estimated API cost exceeds the authorized budget", () => {
    const route = selectBrainRoute({
      ...base,
      requiresUnattendedContinuation: true,
      estimatedApiCostUsd: 3,
      api: { configured: true, budgetRemainingUsd: 10, maximumTaskSpendUsd: 2 },
    });
    expect(route.provider).toBe("none");
    expect(route.status).toBe("budget_exhausted");
    expect(route.authorizedApiSpendUsd).toBe(0);
  });

  it("reports a missing capability rather than treating read-only MCP as write-capable", () => {
    const route = selectBrainRoute({
      ...base,
      mcp: { connected: true, writeToolsAvailable: false },
      api: { configured: false, budgetRemainingUsd: 0, maximumTaskSpendUsd: 0 },
    });
    expect(route.provider).toBe("none");
    expect(route.status).toBe("capability_missing");
    expect(route.writeToolsAvailable).toBe(false);
  });
});
