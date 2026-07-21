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
