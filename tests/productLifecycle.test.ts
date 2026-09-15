import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createLifecyclePlan,
  createManifestHash,
  hashReleaseComponent,
  redactDiagnosticValue,
  unsignedReleaseManifestSchema,
  verifyLifecyclePlan,
  verifyReleaseManifest,
  type InstalledProductState,
  type SignedReleaseManifest,
  type UnsignedReleaseManifest,
} from "../src/productLifecycle.js";

function unsignedManifest(version = "1.1.0", rollbackCompatibleFrom = ["1.0.0"]): UnsignedReleaseManifest {
  return unsignedReleaseManifestSchema.parse({
    contractVersion: 1,
    product: "exosuit",
    releaseId: "11111111-1111-4111-8111-111111111111",
    version,
    channel: "stable",
    createdAt: "2026-08-04T18:00:00.000Z",
    sourceCommit: "a".repeat(64),
    supportedArchitecture: "x64",
    minimumWindowsBuild: 22_000,
    minimumNodeMajor: 22,
    minimumDotnetMajor: 8,
    components: [
      { componentId: "gateway", kind: "gateway", relativePath: "bin/exosuit-gateway.exe", sha256: "1".repeat(64), sizeBytes: 100, required: true, executable: true, signedArtifact: true },
      { componentId: "windows-agent", kind: "windows_agent", relativePath: "bin/exosuit-agent.exe", sha256: "2".repeat(64), sizeBytes: 200, required: true, executable: true, signedArtifact: true },
      { componentId: "cockpit", kind: "cockpit", relativePath: "bin/exosuit-cockpit.exe", sha256: "3".repeat(64), sizeBytes: 300, required: true, executable: true, signedArtifact: true },
      { componentId: "field-image", kind: "field_image", relativePath: "field/base.vhdx", sha256: "4".repeat(64), sizeBytes: 1_000, required: true, executable: false, signedArtifact: true },
    ],
    npmSbomSha256: "5".repeat(64),
    dotnetSbomSha256: "6".repeat(64),
    provenanceSha256: "7".repeat(64),
    rollbackCompatibleFrom,
    requiredServices: ["gateway", "windows_agent", "cockpit", "field_manager"],
    signingKeyId: "release-key-1",
  });
}

function signedManifest(version = "1.1.0", rollbackCompatibleFrom = ["1.0.0"]) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const unsigned = unsignedManifest(version, rollbackCompatibleFrom);
  const manifestHash = createManifestHash(unsigned);
  const manifest: SignedReleaseManifest = {
    ...unsigned,
    manifestHash,
    signatureAlgorithm: "ed25519",
    signature: sign(null, Buffer.from(manifestHash, "hex"), privateKey).toString("base64url"),
  };
  return {
    manifest,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function installed(version = "1.0.0"): InstalledProductState {
  return {
    contractVersion: 1,
    installedVersion: version,
    installedReleaseId: "22222222-2222-4222-8222-222222222222",
    components: [
      { componentId: "gateway", relativePath: "bin/exosuit-gateway.exe", sha256: "8".repeat(64), sizeBytes: 90 },
      { componentId: "windows-agent", relativePath: "bin/exosuit-agent.exe", sha256: "9".repeat(64), sizeBytes: 190 },
      { componentId: "cockpit", relativePath: "bin/exosuit-cockpit.exe", sha256: "a".repeat(64), sizeBytes: 290 },
    ],
    serviceStates: { gateway: "running", windows_agent: "running", cockpit: "running", field_manager: "running" },
    personalDataPresent: true,
    fieldPresent: true,
    lastKnownGoodVersion: version,
  };
}

describe("release manifest verification", () => {
  it("accepts a correctly signed manifest from a trusted key", () => {
    const { manifest, publicKeyPem } = signedManifest();
    const verification = verifyReleaseManifest({ manifest, trustedPublicKeys: { "release-key-1": publicKeyPem } });
    expect(verification).toEqual({
      manifestValid: true,
      signatureValid: true,
      trustedKey: true,
      componentSetValid: true,
      releaseEligible: true,
      reasons: [],
      executionAllowed: false,
    });
  });

  it("rejects a changed manifest, invalid signature, or untrusted key", () => {
    const { manifest, publicKeyPem } = signedManifest();
    const changed = { ...manifest, version: "1.2.0" };
    const changedResult = verifyReleaseManifest({ manifest: changed, trustedPublicKeys: { "release-key-1": publicKeyPem } });
    expect(changedResult.releaseEligible).toBe(false);
    expect(changedResult.reasons).toContain("manifest_hash_invalid");

    const untrusted = verifyReleaseManifest({ manifest, trustedPublicKeys: {} });
    expect(untrusted.releaseEligible).toBe(false);
    expect(untrusted.reasons).toEqual(expect.arrayContaining(["signing_key_untrusted", "manifest_signature_invalid"]));
  });

  it("rejects unconfined paths and unsigned stable executables", () => {
    expect(() => unsignedReleaseManifestSchema.parse({
      ...unsignedManifest(),
      components: [
        ...unsignedManifest().components.slice(0, 3),
        { componentId: "bad", kind: "configuration", relativePath: "../outside.json", sha256: "b".repeat(64), sizeBytes: 1, required: false, executable: false, signedArtifact: false },
      ],
    })).toThrow("normalized and confined");

    const components = unsignedManifest().components.map((component) => component.componentId === "gateway" ? { ...component, signedArtifact: false } : component);
    expect(() => unsignedReleaseManifestSchema.parse({ ...unsignedManifest(), components })).toThrow("Stable executable components must be signed");
  });
});

describe("release lifecycle planning", () => {
  it("creates a non-executing, integrity-bound update plan from a verified newer release", () => {
    const { manifest, publicKeyPem } = signedManifest("1.1.0");
    const verification = verifyReleaseManifest({ manifest, trustedPublicKeys: { "release-key-1": publicKeyPem } });
    const plan = createLifecyclePlan({
      planId: "33333333-3333-4333-8333-333333333333",
      operation: "update",
      installed: installed("1.0.0"),
      targetManifest: manifest,
      verification,
    });
    expect(verifyLifecyclePlan(plan)).toBe(true);
    expect(plan).toMatchObject({ operation: "update", currentVersion: "1.0.0", targetVersion: "1.1.0", executionAllowed: false, requiresAdministrator: true });
    expect(plan.steps.map((step) => step.operation)).toEqual(expect.arrayContaining(["backup", "stage", "replace", "migrate", "start_service", "health_check"]));
  });

  it("enforces update, repair, and rollback version direction", () => {
    const currentRelease = signedManifest("1.0.0");
    const currentVerification = verifyReleaseManifest({ manifest: currentRelease.manifest, trustedPublicKeys: { "release-key-1": currentRelease.publicKeyPem } });
    expect(() => createLifecyclePlan({
      planId: "44444444-4444-4444-8444-444444444444",
      operation: "update",
      installed: installed("1.0.0"),
      targetManifest: currentRelease.manifest,
      verification: currentVerification,
    })).toThrow("newer");

    const newer = signedManifest("1.1.0");
    const newerVerification = verifyReleaseManifest({ manifest: newer.manifest, trustedPublicKeys: { "release-key-1": newer.publicKeyPem } });
    expect(() => createLifecyclePlan({
      planId: "55555555-5555-4555-8555-555555555555",
      operation: "repair",
      installed: installed("1.0.0"),
      targetManifest: newer.manifest,
      verification: newerVerification,
    })).toThrow("match");

    const old = signedManifest("0.9.0", []);
    const oldVerification = verifyReleaseManifest({ manifest: old.manifest, trustedPublicKeys: { "release-key-1": old.publicKeyPem } });
    expect(() => createLifecyclePlan({
      planId: "66666666-6666-4666-8666-666666666666",
      operation: "rollback",
      installed: installed("1.0.0"),
      targetManifest: old.manifest,
      verification: oldVerification,
    })).toThrow("does not declare compatibility");
  });

  it("requires explicit confirmation to remove owner data during uninstall", () => {
    const plan = createLifecyclePlan({
      planId: "77777777-7777-4777-8777-777777777777",
      operation: "uninstall",
      installed: installed(),
      preservePersonalData: false,
    });
    expect(plan.requiresOwnerConfirmation).toBe(true);
    expect(plan.steps.at(-1)).toMatchObject({ operation: "delete_owner_data", ownerConfirmationRequired: true, reversible: false });
    expect(plan.executionAllowed).toBe(false);
  });
});

describe("diagnostic safety", () => {
  it("redacts sensitive fields, bounds arrays and text, and preserves ordinary health data", () => {
    const redacted = redactDiagnosticValue({
      status: "ready",
      apiToken: "do-not-log",
      nested: { screenshot: "pixels", taskGoal: "private goal", count: 3 },
      longText: "x".repeat(700),
      values: Array.from({ length: 150 }, (_, index) => index),
    }) as Record<string, unknown>;
    expect(redacted.status).toBe("ready");
    expect(redacted.apiToken).toBe("[redacted]");
    expect(redacted.nested).toEqual({ screenshot: "[redacted]", taskGoal: "[redacted]", count: 3 });
    expect(String(redacted.longText)).toContain("[truncated]");
    expect((redacted.values as unknown[])).toHaveLength(100);
  });

  it("hashes release bytes with SHA-256", () => {
    expect(hashReleaseComponent(Buffer.from("exosuit"))).toMatch(/^[a-f0-9]{64}$/);
  });
});
