import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SkillManifestSigner,
  SkillRegistry,
  comparePermissions,
  type SkillManifestUnsigned,
} from "../src/skills.js";

function keys() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function manifest(overrides: Partial<SkillManifestUnsigned> = {}): SkillManifestUnsigned {
  return {
    schemaVersion: 1,
    skillId: "example.safe-skill",
    version: "1.0.0",
    displayName: "Example safe skill",
    allowedAgents: ["agent-a"],
    allowedApplications: ["notepad"],
    allowedOrigins: ["https://example.test"],
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    maximumSteps: 10,
    maximumDurationMs: 30_000,
    riskCeiling: "medium",
    requiredApprovals: ["local_click"],
    verificationPlan: ["Verify the expected field value."],
    recoveryPlan: ["Observe again and stop on uncertainty."],
    retentionPolicy: "workflow",
    issuedAt: "2026-07-21T15:00:00.000Z",
    keyId: "owner-key-1",
    ...overrides,
  };
}

describe("signed skill manifests", () => {
  it("signs, verifies, installs disabled, and enables an in-scope skill", () => {
    const key = keys();
    const signer = new SkillManifestSigner({
      privateKeyPem: key.privatePem,
      publicKeys: { "owner-key-1": key.publicPem },
    });
    const signed = signer.sign(manifest());
    expect(signer.verify(signed).skillId).toBe("example.safe-skill");
    const registry = new SkillRegistry(signer);
    const installed = registry.install(signed).installed;
    expect(installed.enabled).toBe(false);
    registry.enable("example.safe-skill");
    expect(
      registry.assertInvocation({
        skillId: "example.safe-skill",
        agentId: "agent-a",
        application: "notepad",
        origin: "https://example.test",
        requestedRisk: "low",
        requestedSteps: 5,
        requestedDurationMs: 10_000,
      }).enabled,
    ).toBe(true);
  });

  it("rejects signature tampering and untrusted keys", () => {
    const key = keys();
    const other = keys();
    const signer = new SkillManifestSigner({
      privateKeyPem: key.privatePem,
      publicKeys: { "owner-key-1": key.publicPem },
    });
    const signed = signer.sign(manifest());
    expect(() => signer.verify({ ...signed, maximumSteps: 999 })).toThrow(/signature is invalid/);
    const verifier = new SkillManifestSigner({
      publicKeys: { "owner-key-1": other.publicPem },
    });
    expect(() => verifier.verify(signed)).toThrow(/signature is invalid/);
  });

  it("requires explicit approval for expanded upgrade permissions", () => {
    const key = keys();
    const signer = new SkillManifestSigner({
      privateKeyPem: key.privatePem,
      publicKeys: { "owner-key-1": key.publicPem },
    });
    const registry = new SkillRegistry(signer);
    const first = signer.sign(manifest());
    registry.install(first);
    const expanded = signer.sign(
      manifest({
        version: "1.1.0",
        allowedApplications: ["notepad", "calculator"],
        riskCeiling: "high",
        maximumSteps: 20,
        requiredApprovals: [],
      }),
    );
    expect(comparePermissions(first, expanded)).toMatchObject({ expandsPermissions: true });
    expect(() => registry.install(expanded)).toThrow(/expands permissions/);
    const result = registry.install(expanded, { approveExpansion: true });
    expect(result.permissionDiff.changes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/application scope added/),
        expect.stringMatching(/risk ceiling increased/),
        expect.stringMatching(/required approvals removed/),
      ]),
    );
    expect(result.installed.enabled).toBe(false);
  });

  it("rejects downgrade, scope escape, budget overflow, and revoked execution", () => {
    const key = keys();
    const signer = new SkillManifestSigner({
      privateKeyPem: key.privatePem,
      publicKeys: { "owner-key-1": key.publicPem },
    });
    const registry = new SkillRegistry(signer);
    registry.install(signer.sign(manifest()));
    expect(() => registry.install(signer.sign(manifest()))).toThrow(/strictly newer/);
    registry.enable("example.safe-skill");
    expect(() =>
      registry.assertInvocation({
        skillId: "example.safe-skill",
        agentId: "other-agent",
        application: "notepad",
        requestedRisk: "low",
        requestedSteps: 1,
        requestedDurationMs: 1_000,
      }),
    ).toThrow(/agent is outside/);
    expect(() =>
      registry.assertInvocation({
        skillId: "example.safe-skill",
        agentId: "agent-a",
        application: "notepad",
        requestedRisk: "critical",
        requestedSteps: 1,
        requestedDurationMs: 1_000,
      }),
    ).toThrow(/risk exceeds/);
    expect(() =>
      registry.assertInvocation({
        skillId: "example.safe-skill",
        agentId: "agent-a",
        application: "notepad",
        requestedRisk: "low",
        requestedSteps: 11,
        requestedDurationMs: 1_000,
      }),
    ).toThrow(/step budget/);
    registry.revoke("example.safe-skill");
    expect(() => registry.enable("example.safe-skill")).toThrow(/revoked/);
  });
});
