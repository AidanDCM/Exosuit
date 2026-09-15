import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createFieldAttestation,
  fieldDisplayContractSchema,
  fieldIdentitySchema,
  fieldPolicySchema,
  sha256Canonical,
  verifyFieldAttestation,
} from "../src/fieldContracts.js";

const fieldId = randomUUID();
const policyId = randomUUID();
const secret = "a-local-field-attestation-secret-that-is-long-enough";

function identity() {
  return fieldIdentitySchema.parse({
    subsystem: "field",
    fieldId,
    fieldGeneration: 1,
    agentId: "field-agent-a",
    machineId: "vm-a",
    windowsSessionId: "session-a",
    baseImageDigest: "a".repeat(64),
    personalStateDiskId: "personal-state-a",
    personalStateGeneration: 1,
    taskDiskId: "task-disk-a",
    createdAt: "2026-07-21T18:00:00.000Z",
  });
}

function display() {
  return fieldDisplayContractSchema.parse({
    monitorCount: 1,
    width: 1920,
    height: 1080,
    scalePercent: 100,
    browserZoomPercent: 100,
    keyboardLayout: "en-US",
    dynamicResolutionAllowed: false,
  });
}

function policy() {
  return fieldPolicySchema.parse({
    contractVersion: 1,
    policyId,
    field: { fieldId, fieldGeneration: 1 },
    mode: "teach",
    allowedExecutables: [
      { processName: "chrome.exe", executableSha256: "c".repeat(64) },
      { processName: "notepad.exe", executableSha256: "d".repeat(64) },
    ],
    allowedCapabilities: ["observe_desktop", "record_demonstration", "file_workspace"],
    allowedOrigins: ["https://example.com"],
    maximumRuntimeSeconds: 3_600,
    maximumActions: 10_000,
    recordingConsent: "granted",
    allowHostDesktopAccess: false,
    allowHostDriveWrite: false,
    allowPrivilegeEscalation: false,
    allowSecurityControlChanges: false,
    issuedAt: "2026-07-21T18:00:00.000Z",
    expiresAt: "2026-07-21T19:00:00.000Z",
  });
}

describe("field contracts", () => {
  it("creates and verifies an attestation bound to one policy and field generation", () => {
    const attestation = createFieldAttestation({
      identity: identity(),
      display: display(),
      policy: policy(),
      issuerKeyId: "host-field-key-1",
      secret,
      issuedAt: "2026-07-21T18:00:00.000Z",
      ttlSeconds: 300,
    });
    expect(attestation.policyHash).toBe(sha256Canonical(policy()));
    expect(
      verifyFieldAttestation({
        attestation,
        policy: policy(),
        secret,
        now: new Date("2026-07-21T18:01:00.000Z"),
      }).identity.fieldId,
    ).toBe(fieldId);
  });

  it("rejects changed policy content and wrong field generations", () => {
    const original = policy();
    const attestation = createFieldAttestation({
      identity: identity(),
      display: display(),
      policy: original,
      issuerKeyId: "host-field-key-1",
      secret,
      issuedAt: "2026-07-21T18:00:00.000Z",
    });
    const changed = fieldPolicySchema.parse({ ...original, maximumActions: original.maximumActions + 1 });
    expect(() =>
      verifyFieldAttestation({ attestation, policy: changed, secret, now: new Date("2026-07-21T18:01:00.000Z") }),
    ).toThrow(/policy hash/);
    expect(() =>
      createFieldAttestation({
        identity: identity(),
        display: display(),
        policy: fieldPolicySchema.parse({ ...original, field: { fieldId, fieldGeneration: 2 } }),
        issuerKeyId: "host-field-key-1",
        secret,
      }),
    ).toThrow(/does not match/);
  });

  it("rejects expired attestations, bad signatures, duplicate permissions, and teach mode without consent", () => {
    const attestation = createFieldAttestation({
      identity: identity(),
      display: display(),
      policy: policy(),
      issuerKeyId: "host-field-key-1",
      secret,
      issuedAt: "2026-07-21T18:00:00.000Z",
      ttlSeconds: 60,
    });
    expect(() =>
      verifyFieldAttestation({ attestation, policy: policy(), secret, now: new Date("2026-07-21T18:01:00.000Z") }),
    ).toThrow(/expired/);
    expect(() =>
      verifyFieldAttestation({
        attestation,
        policy: policy(),
        secret: "a-different-field-attestation-secret-that-is-long-enough",
        now: new Date("2026-07-21T18:00:30.000Z"),
      }),
    ).toThrow(/signature/);
    expect(() => fieldPolicySchema.parse({ ...policy(), allowedExecutables: [policy().allowedExecutables[0], policy().allowedExecutables[0]] })).toThrow(/unique/);
    expect(() => fieldPolicySchema.parse({ ...policy(), allowedOrigins: ["https://example.com/path"] })).toThrow(/paths/);
    expect(fieldPolicySchema.parse({ ...policy(), allowedOrigins: ["https://EXAMPLE.com:443"] }).allowedOrigins).toEqual(["https://example.com"]);
    expect(() => fieldPolicySchema.parse({ ...policy(), recordingConsent: "not_applicable" })).toThrow(/consent/);
  });

  it("requires personal-state stable ID and generation as one identity", () => {
    expect(() => fieldIdentitySchema.parse({ ...identity(), personalStateGeneration: undefined })).toThrow(/present together/);
    expect(() => fieldIdentitySchema.parse({ ...identity(), personalStateDiskId: undefined })).toThrow(/present together/);
    expect(() => fieldIdentitySchema.parse({ ...identity(), personalStateGeneration: 0 })).toThrow();
  });
});
