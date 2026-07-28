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
    // Both agents are stopped. `agent-b` was offline, which means contact was lost, not
    // that it halted, so it is stopped and reported as unconfirmed rather than skipped.
    expect(result.stopped.map((item) => item.agentId).sort()).toEqual(["agent-a", "agent-b"]);
    expect(result.unreachable).toEqual(["agent-b"]);
    expect(registry.get("agent-a")?.healthState).toBe("stopped");
    expect(registry.get("agent-b")?.healthState).toBe("stopped");
    expect(() => registry.heartbeat({ agentId: "agent-a" })).toThrow(
      /must be restarted/,
    );
  });

  // Regression for the 2026-07-28 security review. `stopAll` previously skipped offline
  // agents, leaving them `offline` rather than `stopped`. A partitioned agent that
  // reconnected would heartbeat back to `online` and become selectable for new work,
  // despite a global stop having been issued.
  it("keeps a partitioned agent stopped after a global stop, even once it reconnects", () => {
    const registry = new AgentRegistry();
    registry.register(
      agent({ lastHeartbeatAt: new Date(Date.now() - 60_000).toISOString() }),
    );

    // Contact is lost. The agent may still be running and driving a desktop.
    registry.expireStale({ staleAfterMs: 30_000 });
    expect(registry.get("agent-a")?.healthState).toBe("offline");

    const result = registry.stopAll();
    expect(result.unreachable).toEqual(["agent-a"]);
    expect(registry.get("agent-a")?.healthState).toBe("stopped");

    // The partition heals. The agent must not be able to rejoin on its own.
    expect(() => registry.heartbeat({ agentId: "agent-a" })).toThrow(/must be restarted/);
    expect(() =>
      registry.select({ requiredCapabilities: ["motor"], contractVersion: 1 }),
    ).toThrow(/No healthy compatible agent/);
  });
});
