import { describe, expect, it } from "vitest";
import { AgentChannelAuthenticator } from "../src/agentChannelAuth.js";
import { AuthenticatedAgentRegistrar } from "../src/agentRegistration.js";
import { AgentRegistry } from "../src/supervisor.js";

const secret = "0123456789abcdef0123456789abcdef";

describe("authenticated agent registration", () => {
  it("verifies the signed identity before registering a VM agent", () => {
    const authenticator = new AgentChannelAuthenticator({ secret });
    const registry = new AgentRegistry();
    const registrar = new AuthenticatedAgentRegistrar({ authenticator, registry });
    const signed = authenticator.sign(
      authenticator.createPayload({
        agentId: "agent-vm",
        machineId: "machine-vm",
        windowsSessionId: "session-vm",
        userSessionKind: "vm",
        issuedAt: "2026-07-21T15:00:00.000Z",
        nonce: "a".repeat(48),
        capabilities: ["uia", "motor"],
        softwareVersion: "0.1.0",
        minimumContractVersion: 1,
        maximumContractVersion: 1,
      }),
    );
    expect(
      registrar.register(signed, new Date("2026-07-21T15:00:01.000Z")),
    ).toMatchObject({
      agentId: "agent-vm",
      userSessionKind: "vm",
      healthState: "online",
    });
    expect(registry.get("agent-vm")?.capabilities).toEqual(["uia", "motor"]);
  });

  it("does not mutate the registry when verification fails", () => {
    const authenticator = new AgentChannelAuthenticator({ secret });
    const registry = new AgentRegistry();
    const registrar = new AuthenticatedAgentRegistrar({ authenticator, registry });
    const signed = authenticator.sign(
      authenticator.createPayload({
        agentId: "agent-a",
        machineId: "machine-a",
        windowsSessionId: "session-a",
        userSessionKind: "console",
        issuedAt: "2026-07-21T15:00:00.000Z",
        nonce: "b".repeat(48),
        capabilities: ["uia"],
        softwareVersion: "0.1.0",
        minimumContractVersion: 1,
        maximumContractVersion: 1,
      }),
    );
    expect(() =>
      registrar.register(
        {
          ...signed,
          payload: { ...signed.payload, machineId: "tampered" },
        },
        new Date("2026-07-21T15:00:01.000Z"),
      ),
    ).toThrow(/signature is invalid/);
    expect(registry.list()).toEqual([]);
  });
});

// Added by the 2026-07-28 security review. Heartbeats restate capabilities, and
// AgentRegistry.select routes work by capability, so an unauthenticated heartbeat let
// anything that could reach the endpoint enlarge an agent's capability set.
describe("authenticated agent heartbeat", () => {
  const at = "2026-07-21T15:00:00.000Z";
  const soonAfter = new Date("2026-07-21T15:00:01.000Z");

  function setup() {
    const authenticator = new AgentChannelAuthenticator({ secret });
    const registry = new AgentRegistry();
    const registrar = new AuthenticatedAgentRegistrar({ authenticator, registry });
    registrar.register(
      authenticator.sign(
        authenticator.createPayload({
          agentId: "agent-a",
          machineId: "machine-a",
          windowsSessionId: "session-a",
          userSessionKind: "vm",
          issuedAt: at,
          nonce: "1".repeat(48),
          capabilities: ["uia"],
          softwareVersion: "0.1.0",
          minimumContractVersion: 1,
          maximumContractVersion: 1,
        }),
      ),
      soonAfter,
    );
    return { authenticator, registry, registrar };
  }

  function heartbeat(
    authenticator: AgentChannelAuthenticator,
    overrides: Record<string, unknown> = {},
  ) {
    return authenticator.signHeartbeat(
      authenticator.createHeartbeatPayload({
        agentId: "agent-a",
        machineId: "machine-a",
        windowsSessionId: "session-a",
        issuedAt: at,
        nonce: "2".repeat(48),
        healthState: "online",
        capabilities: ["uia"],
        softwareVersion: "0.1.0",
        ...overrides,
      } as never),
    );
  }

  it("accepts a correctly signed heartbeat", () => {
    const { authenticator, registrar, registry } = setup();
    const result = registrar.heartbeat(heartbeat(authenticator), soonAfter);
    expect(result).toMatchObject({ agentId: "agent-a", healthState: "online" });
    expect(registry.get("agent-a")?.lastHeartbeatAt).toBe(at);
  });

  it("rejects a tampered heartbeat and leaves capabilities unchanged", () => {
    const { authenticator, registrar, registry } = setup();
    const signed = heartbeat(authenticator);
    // The attack this exists to stop: claim a capability you do not have, so that
    // select() routes physical-input work to you.
    expect(() =>
      registrar.heartbeat(
        { ...signed, payload: { ...signed.payload, capabilities: ["uia", "motor"] } },
        soonAfter,
      ),
    ).toThrow(/signature is invalid/);
    expect(registry.get("agent-a")?.capabilities).toEqual(["uia"]);
    expect(() =>
      registry.select({ requiredCapabilities: ["motor"], contractVersion: 1 }),
    ).toThrow(/No healthy compatible agent/);
  });

  it("rejects a replayed heartbeat nonce", () => {
    const { authenticator, registrar } = setup();
    const signed = heartbeat(authenticator);
    expect(registrar.heartbeat(signed, soonAfter)).toMatchObject({ agentId: "agent-a" });
    expect(() => registrar.heartbeat(signed, soonAfter)).toThrow(/nonce was already used/);
  });

  it("rejects a heartbeat whose identity does not match the registered agent", () => {
    const { authenticator, registrar } = setup();
    expect(() =>
      registrar.heartbeat(heartbeat(authenticator, { machineId: "machine-b" }), soonAfter),
    ).toThrow(/does not match the registered agent/);
  });

  it("rejects a heartbeat for an agent that was never registered", () => {
    const { authenticator, registrar } = setup();
    expect(() =>
      registrar.heartbeat(heartbeat(authenticator, { agentId: "agent-ghost" }), soonAfter),
    ).toThrow(/is not registered/);
  });

  it("rejects a heartbeat outside the clock-skew window", () => {
    const { authenticator, registrar } = setup();
    expect(() =>
      registrar.heartbeat(heartbeat(authenticator), new Date("2026-07-21T15:10:00.000Z")),
    ).toThrow(/clock-skew window/);
  });

  it("keeps a stopped agent stopped despite a valid heartbeat", () => {
    const { authenticator, registry, registrar } = setup();
    registry.stop("agent-a");
    expect(() => registrar.heartbeat(heartbeat(authenticator), soonAfter)).toThrow(
      /must be restarted/,
    );
  });
});
