import { describe, expect, it } from "vitest";
import {
  AgentChannelAuthenticator,
  type AgentRegistrationPayload,
} from "../src/agentChannelAuth.js";

const secret = "0123456789abcdef0123456789abcdef";

function payload(
  authenticator: AgentChannelAuthenticator,
  overrides: Partial<AgentRegistrationPayload> = {},
): AgentRegistrationPayload {
  return authenticator.createPayload({
    agentId: "agent-a",
    machineId: "machine-a",
    windowsSessionId: "session-a",
    userSessionKind: "vm",
    issuedAt: "2026-07-21T15:00:00.000Z",
    nonce: "a".repeat(48),
    capabilities: ["uia", "motor"],
    softwareVersion: "0.1.0",
    minimumContractVersion: 1,
    maximumContractVersion: 1,
    ...overrides,
  });
}

describe("agent channel authentication", () => {
  it("signs and verifies a fresh registration", () => {
    const authenticator = new AgentChannelAuthenticator({ secret });
    const signed = authenticator.sign(payload(authenticator));
    expect(
      authenticator.verify(signed, new Date("2026-07-21T15:00:01.000Z")),
    ).toMatchObject({
      agentId: "agent-a",
      userSessionKind: "vm",
      capabilities: ["uia", "motor"],
    });
  });

  it("rejects tampering and a different secret", () => {
    const signer = new AgentChannelAuthenticator({ secret });
    const verifier = new AgentChannelAuthenticator({
      secret: "abcdef0123456789abcdef0123456789",
    });
    const signed = signer.sign(payload(signer));
    expect(() =>
      signer.verify(
        {
          ...signed,
          payload: { ...signed.payload, capabilities: ["uia", "shell"] },
        },
        new Date("2026-07-21T15:00:01.000Z"),
      ),
    ).toThrow(/signature is invalid/);
    expect(() =>
      signer.verify(
        {
          ...signed,
          payload: { ...signed.payload, userSessionKind: "cloud" },
        },
        new Date("2026-07-21T15:00:01.000Z"),
      ),
    ).toThrow(/signature is invalid/);
    expect(() =>
      verifier.verify(signed, new Date("2026-07-21T15:00:01.000Z")),
    ).toThrow(/signature is invalid/);
  });

  it("rejects stale and future registrations", () => {
    const authenticator = new AgentChannelAuthenticator({
      secret,
      maximumClockSkewMs: 5_000,
      nonceRetentionMs: 10_000,
    });
    expect(() =>
      authenticator.verify(
        authenticator.sign(payload(authenticator)),
        new Date("2026-07-21T15:00:06.000Z"),
      ),
    ).toThrow(/clock-skew window/);
    const future = payload(authenticator, {
      issuedAt: "2026-07-21T15:00:10.000Z",
      nonce: "b".repeat(48),
    });
    expect(() =>
      authenticator.verify(
        authenticator.sign(future),
        new Date("2026-07-21T15:00:00.000Z"),
      ),
    ).toThrow(/clock-skew window/);
  });

  it("rejects nonce replay after a valid verification", () => {
    const authenticator = new AgentChannelAuthenticator({ secret });
    const signed = authenticator.sign(payload(authenticator));
    authenticator.verify(signed, new Date("2026-07-21T15:00:01.000Z"));
    expect(() =>
      authenticator.verify(signed, new Date("2026-07-21T15:00:02.000Z")),
    ).toThrow(/already used/);
  });

  it("rejects weak secrets and invalid contract ranges", () => {
    expect(() => new AgentChannelAuthenticator({ secret: "too-short" })).toThrow(
      /at least 32 secret bytes/,
    );
    const authenticator = new AgentChannelAuthenticator({ secret });
    const invalid = payload(authenticator, {
      minimumContractVersion: 2,
      maximumContractVersion: 1,
    });
    expect(() =>
      authenticator.verify(
        authenticator.sign(invalid),
        new Date("2026-07-21T15:00:01.000Z"),
      ),
    ).toThrow(/contract range is invalid/);
  });
});
