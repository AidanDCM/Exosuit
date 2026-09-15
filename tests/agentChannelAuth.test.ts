import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AgentChannelAuthenticator,
  type AgentRegistrationPayload,
} from "../src/agentChannelAuth.js";

const secret = "0123456789abcdef0123456789abcdef";

/**
 * An independent reimplementation of the production canonicalizer.
 *
 * Deliberately not imported from src: this pins the signing wire format from the outside,
 * so a change to canonicalization has to be made twice and noticed once.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

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

  it("authenticates before revealing timestamp or contract-range diagnostics", () => {
    const authenticator = new AgentChannelAuthenticator({
      secret,
      maximumClockSkewMs: 5_000,
      nonceRetentionMs: 10_000,
    });
    const stale = authenticator.sign(payload(authenticator));
    expect(() =>
      authenticator.verify(
        { ...stale, signature: "0".repeat(64) },
        new Date("2026-07-21T15:00:06.000Z"),
      ),
    ).toThrow(/signature is invalid/);

    const invalidRange = authenticator.sign(payload(authenticator, {
      issuedAt: "2026-07-21T15:00:00.000Z",
      nonce: "7".repeat(48),
      minimumContractVersion: 2,
      maximumContractVersion: 1,
    }));
    expect(() =>
      authenticator.verify(
        { ...invalidRange, signature: "0".repeat(64) },
        new Date("2026-07-21T15:00:01.000Z"),
      ),
    ).toThrow(/signature is invalid/);
  });

  it("does not consume a nonce when authenticated semantic validation fails", () => {
    const authenticator = new AgentChannelAuthenticator({ secret });
    const nonce = "8".repeat(48);
    const invalid = authenticator.sign(payload(authenticator, {
      nonce,
      minimumContractVersion: 2,
      maximumContractVersion: 1,
    }));
    expect(() =>
      authenticator.verify(invalid, new Date("2026-07-21T15:00:01.000Z")),
    ).toThrow(/contract range is invalid/);

    const repaired = authenticator.sign(payload(authenticator, { nonce }));
    expect(authenticator.verify(repaired, new Date("2026-07-21T15:00:02.000Z"))).toMatchObject({
      agentId: "agent-a",
    });
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

  // Registration and heartbeat are signed with the same secret, so a domain tag is what
  // keeps a signature minted for one from being presented as the other. Without it the
  // guarantee would rest on the two schemas never canonicalizing alike, which nothing
  // checks. These tests fail if the domain separator is ever dropped.
  describe("domain separation between message types", () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const issuedAt = "2026-07-21T15:00:00.000Z";
    const now = new Date("2026-07-21T15:00:01.000Z");

    it("will not accept a registration signature as a heartbeat", () => {
      const authenticator = new AgentChannelAuthenticator({ secret });
      const registration = authenticator.sign(
        authenticator.createPayload({
          agentId: "agent-a",
          machineId: "machine-a",
          windowsSessionId: "session-a",
          userSessionKind: "vm",
          issuedAt,
          nonce: "c".repeat(48),
          capabilities: ["uia", "motor"],
          softwareVersion: "0.1.0",
          minimumContractVersion: 1,
          maximumContractVersion: 1,
        }),
      );
      // Reuse the registration signature over a heartbeat-shaped payload.
      expect(() =>
        authenticator.verifyHeartbeat(
          {
            payload: {
              contractVersion: 1,
              agentId: "agent-a",
              machineId: "machine-a",
              windowsSessionId: "session-a",
              issuedAt,
              nonce: "c".repeat(48),
              healthState: "online",
              capabilities: ["uia", "motor"],
              softwareVersion: "0.1.0",
            },
            signature: registration.signature,
          },
          now,
        ),
      ).toThrow(/signature is invalid/);
    });

    it("gives the two message types different signatures over the same fields", () => {
      const authenticator = new AgentChannelAuthenticator({ secret });
      const heartbeat = authenticator.signHeartbeat(
        authenticator.createHeartbeatPayload({
          agentId: "agent-a",
          machineId: "machine-a",
          windowsSessionId: "session-a",
          issuedAt,
          nonce: "d".repeat(48),
          healthState: "online",
          capabilities: ["uia"],
          softwareVersion: "0.1.0",
        }),
      );
      expect(authenticator.verifyHeartbeat(heartbeat, now)).toMatchObject({
        agentId: "agent-a",
        healthState: "online",
      });
      // A heartbeat is not a registration, so its signature must not verify as one.
      expect(() =>
        authenticator.verify(
          {
            payload: {
              contractVersion: 1,
              agentId: "agent-a",
              machineId: "machine-a",
              windowsSessionId: "session-a",
              userSessionKind: "vm",
              issuedAt,
              nonce: "d".repeat(48),
              capabilities: ["uia"],
              softwareVersion: "0.1.0",
              minimumContractVersion: 1,
              maximumContractVersion: 1,
            },
            signature: heartbeat.signature,
          },
          now,
        ),
      ).toThrow(/signature is invalid/);
    });

    // The two tests above pass even with the domain separator removed, because the
    // registration and heartbeat schemas differ structurally and never canonicalize alike.
    // That is precisely the accident this separator must not depend on, so the wire format
    // is pinned directly: the signature must be HMAC over "<domain>\n<canonical payload>",
    // not over the payload alone. Verified by mutation.
    it("binds the domain into the signature bytes, not just the payload shape", () => {
      const authenticator = new AgentChannelAuthenticator({ secret });
      const payload = authenticator.createHeartbeatPayload({
        agentId: "agent-a",
        machineId: "machine-a",
        windowsSessionId: "session-a",
        issuedAt,
        nonce: "f".repeat(48),
        healthState: "online",
        capabilities: ["uia"],
        softwareVersion: "0.1.0",
      });
      const canonical = canonicalize(payload);
      const withDomain = createHmac("sha256", secret)
        .update(`exosuit.agent-heartbeat.v1\n${canonical}`)
        .digest("hex");
      const withoutDomain = createHmac("sha256", secret).update(canonical).digest("hex");

      expect(authenticator.signHeartbeat(payload).signature).toBe(withDomain);
      expect(authenticator.signHeartbeat(payload).signature).not.toBe(withoutDomain);
    });

    it("scopes the replay cache per domain, so a nonce is not burned across types", () => {
      const authenticator = new AgentChannelAuthenticator({ secret });
      const nonce = "e".repeat(48);
      const registration = authenticator.sign(
        authenticator.createPayload({
          agentId: "agent-a",
          machineId: "machine-a",
          windowsSessionId: "session-a",
          userSessionKind: "vm",
          issuedAt,
          nonce,
          capabilities: ["uia"],
          softwareVersion: "0.1.0",
          minimumContractVersion: 1,
          maximumContractVersion: 1,
        }),
      );
      expect(authenticator.verify(registration, now)).toMatchObject({ agentId: "agent-a" });
      // Same nonce, different message type: legitimate, because the signatures differ and
      // neither can substitute for the other.
      const heartbeat = authenticator.signHeartbeat(
        authenticator.createHeartbeatPayload({
          agentId: "agent-a",
          machineId: "machine-a",
          windowsSessionId: "session-a",
          issuedAt,
          nonce,
          healthState: "online",
          capabilities: ["uia"],
          softwareVersion: "0.1.0",
        }),
      );
      expect(authenticator.verifyHeartbeat(heartbeat, now)).toMatchObject({ agentId: "agent-a" });
      // But replaying either within its own domain is still refused.
      expect(() => authenticator.verifyHeartbeat(heartbeat, now)).toThrow(/nonce was already used/);
    });
  });
});
