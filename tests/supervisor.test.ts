import { describe, expect, it } from "vitest";
import { AgentRegistry, type SupervisorAgent } from "../src/supervisor.js";

function agent(overrides: Partial<SupervisorAgent> = {}): SupervisorAgent {
  return {
    contractVersion: 1,
    agentId: "agent-a",
    machineId: "machine-a",
    windowsSessionId: "session-a",
    userSessionKind: "console",
    capabilities: ["uia", "motor"],
    healthState: "online",
    lastHeartbeatAt: "2026-07-21T14:00:00.000Z",
    softwareVersion: "0.1.0",
    minimumContractVersion: 1,
    maximumContractVersion: 1,
    ...overrides,
  };
}

describe("agent supervisor foundation", () => {
  it("registers, heartbeats, and selects a compatible healthy agent", () => {
    const registry = new AgentRegistry();
    registry.register(agent());
    registry.register(
      agent({
        agentId: "agent-vm",
        machineId: "machine-vm",
        windowsSessionId: "session-vm",
        userSessionKind: "vm",
        capabilities: ["uia", "motor", "browser"],
      }),
    );
    registry.heartbeat({
      agentId: "agent-vm",
      at: "2026-07-21T14:00:01.000Z",
    });
    const selected = registry.select({
      requiredCapabilities: ["uia", "browser"],
      contractVersion: 1,
      preferredSessionKind: "vm",
    });
    expect(selected.agent.agentId).toBe("agent-vm");
  });

  it("rejects identity rebinding and version mismatch", () => {
    const registry = new AgentRegistry();
    registry.register(agent());
    expect(() => registry.register(agent({ machineId: "other" }))).toThrow(
      /cannot be rebound/,
    );
    expect(() =>
      registry.select({ requiredCapabilities: ["uia"], contractVersion: 2 }),
    ).toThrow(/No healthy compatible agent/);
  });

  it("marks stale agents offline and excludes them from routing", () => {
    const registry = new AgentRegistry();
    registry.register(agent());
    registry.expireStale({
      now: new Date("2026-07-21T14:00:10.000Z"),
      staleAfterMs: 5_000,
    });
    expect(registry.get("agent-a")?.healthState).toBe("offline");
    expect(() =>
      registry.select({ requiredCapabilities: ["uia"], contractVersion: 1 }),
    ).toThrow(/No healthy compatible agent/);
  });

  it("supports per-agent and global stop with unreachable reporting", () => {
    const registry = new AgentRegistry();
    registry.register(agent());
    registry.register(
      agent({
        agentId: "agent-b",
        machineId: "machine-b",
        windowsSessionId: "session-b",
        healthState: "offline",
      }),
    );
    const result = registry.stopAll();
    expect(result.stopped.map((item) => item.agentId)).toEqual(["agent-a"]);
    expect(result.alreadyUnavailable).toEqual(["agent-b"]);
    expect(registry.get("agent-a")?.healthState).toBe("stopped");
    expect(() => registry.heartbeat({ agentId: "agent-a" })).toThrow(
      /must be restarted/,
    );
  });
});
