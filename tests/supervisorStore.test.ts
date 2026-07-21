import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileAgentRegistryStore, PersistentAgentRegistry } from "../src/supervisorStore.js";
import type { SupervisorAgent } from "../src/supervisor.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "exosuit-agent-registry-"));
  roots.push(root);
  return { root, path: join(root, "agents.json") };
}

function agent(overrides: Partial<SupervisorAgent> = {}): SupervisorAgent {
  return {
    contractVersion: 1,
    agentId: "agent-a",
    machineId: "machine-a",
    windowsSessionId: "session-a",
    userSessionKind: "console",
    capabilities: ["uia", "motor"],
    healthState: "online",
    lastHeartbeatAt: "2026-07-21T16:00:00.000Z",
    softwareVersion: "0.1.0",
    minimumContractVersion: 1,
    maximumContractVersion: 1,
    ...overrides,
  };
}

describe("durable supervisor registry", () => {
  it("persists registration and health changes across process restarts", async () => {
    const { path } = await fixture();
    const store = new FileAgentRegistryStore({ path });
    const first = await PersistentAgentRegistry.open(store);
    await first.register(agent());
    await first.heartbeat({
      agentId: "agent-a",
      at: "2026-07-21T16:00:01.000Z",
      healthState: "degraded",
    });

    const second = await PersistentAgentRegistry.open(store);
    expect(second.registry.get("agent-a")).toMatchObject({
      agentId: "agent-a",
      healthState: "degraded",
      lastHeartbeatAt: "2026-07-21T16:00:01.000Z",
    });
    await second.stop("agent-a");

    const third = await PersistentAgentRegistry.open(store);
    expect(third.registry.get("agent-a")?.healthState).toBe("stopped");
  });

  it("detects tampering and refuses duplicate identities", async () => {
    const { path } = await fixture();
    const store = new FileAgentRegistryStore({ path });
    await store.save([agent()]);
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      payload: { agents: Array<{ machineId: string }> };
    };
    parsed.payload.agents[0]!.machineId = "attacker-machine";
    await writeFile(path, JSON.stringify(parsed), "utf8");
    await expect(store.load()).rejects.toThrow(/integrity verification/);

    await expect(
      store.save([
        agent(),
        agent({ machineId: "different-machine" }),
      ]),
    ).resolves.toBeUndefined();
    await expect(store.load()).rejects.toThrow(/duplicate agent/);
  });

  it("marks stale agents offline and persists global-stop state", async () => {
    const { path } = await fixture();
    const durable = await PersistentAgentRegistry.open(new FileAgentRegistryStore({ path }));
    await durable.register(agent());
    await durable.register(
      agent({
        agentId: "agent-b",
        machineId: "machine-b",
        windowsSessionId: "session-b",
      }),
    );
    const expired = await durable.expireStale({
      now: new Date("2026-07-21T16:01:00.000Z"),
      staleAfterMs: 5_000,
    });
    expect(expired.map((item) => item.agentId)).toEqual(["agent-a", "agent-b"]);
    const result = await durable.stopAll();
    expect(result.alreadyUnavailable).toEqual(["agent-a", "agent-b"]);

    const reopened = await PersistentAgentRegistry.open(new FileAgentRegistryStore({ path }));
    expect(reopened.registry.list().every((item) => item.healthState === "offline")).toBe(true);
  });
});
