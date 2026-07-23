import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { REQUIRED_FIELD_DIRECTORIES, fieldBootstrapCheckNameSchema, fieldBootstrapManifestSchema } from "../src/fieldBootstrap.js";
import { createFieldAttestation, fieldPolicySchema, sha256Canonical } from "../src/fieldContracts.js";
import { evaluateFieldLiveReadiness } from "../src/fieldLiveReadiness.js";

const secret = "field-live-readiness-attestation-secret-long-enough";
const fieldId = randomUUID();
const identity = {
  subsystem: "field" as const,
  fieldId,
  fieldGeneration: 1,
  agentId: "field-agent-live",
  machineId: "field-vm-live",
  windowsSessionId: "session-live",
  baseImageDigest: "a".repeat(64),
  taskDiskId: "task-live",
  createdAt: "2026-07-23T15:00:00.000Z",
};
const display = { monitorCount: 1 as const, width: 1920, height: 1080, scalePercent: 100, browserZoomPercent: 100, keyboardLayout: "en-US", dynamicResolutionAllowed: false as const };
const policy = fieldPolicySchema.parse({
  contractVersion: 1,
  policyId: randomUUID(),
  field: { fieldId, fieldGeneration: 1 },
  mode: "shadow",
  allowedExecutables: [],
  allowedCapabilities: ["observe_desktop"],
  allowedOrigins: [],
  maximumRuntimeSeconds: 600,
  maximumActions: 1,
  recordingConsent: "not_applicable",
  allowHostDesktopAccess: false,
  allowHostDriveWrite: false,
  allowPrivilegeEscalation: false,
  allowSecurityControlChanges: false,
  issuedAt: "2026-07-23T15:00:00.000Z",
  expiresAt: "2026-07-23T16:00:00.000Z",
});
const attestation = createFieldAttestation({ identity, display, policy, issuerKeyId: "issuer-live", secret, issuedAt: "2026-07-23T15:00:00.000Z", ttlSeconds: 3600 });
const manifest = fieldBootstrapManifestSchema.parse({
  contractVersion: 1,
  identity,
  display,
  policyHash: sha256Canonical(policy),
  agentBinaryDigest: "b".repeat(64),
  channelKeyId: "channel-live",
  requiredDirectories: [...REQUIRED_FIELD_DIRECTORIES],
  createdAt: "2026-07-23T15:00:00.000Z",
  expiresAt: "2026-07-23T16:00:00.000Z",
});
const manifestDigest = sha256Canonical(manifest);
const bootstrapReport = {
  contractVersion: 1 as const,
  identity,
  manifestDigest,
  reportedAt: "2026-07-23T15:00:01.000Z",
  checks: fieldBootstrapCheckNameSchema.options.slice(0, -2).map((name) => ({
    name,
    passed: true,
    observedAt: "2026-07-23T15:00:01.000Z",
    summary: `${name} passed`,
    evidence: {},
  })),
};
const heartbeat = {
  contractVersion: 1 as const,
  field: { fieldId, fieldGeneration: 1 },
  agentId: identity.agentId,
  bootId: randomUUID(),
  sequence: 2,
  observedAt: "2026-07-23T15:00:02.000Z",
  lifecycle: "ready" as const,
  desktopReady: true,
  sessionLocked: false,
  secureDesktopActive: false,
  inputQueueDepth: 0,
  pendingCommandCount: 0,
  workingSetBytes: 100_000_000,
};

describe("Field live readiness", () => {
  it("promotes only when bootstrap heartbeat policy and attestation agree", () => {
    expect(evaluateFieldLiveReadiness({
      manifest, manifestDigest, bootstrapReport, heartbeat, policy, attestation, attestationSecret: secret,
      now: new Date("2026-07-23T15:00:02.100Z"),
    })).toMatchObject({ status: "ready", fieldId, bootId: heartbeat.bootId });
  });

  it("fails closed for locked desktop stale generation and policy substitution", () => {
    expect(evaluateFieldLiveReadiness({
      manifest, manifestDigest, bootstrapReport,
      heartbeat: { ...heartbeat, desktopReady: false, sessionLocked: true },
      policy, attestation, attestationSecret: secret, now: new Date("2026-07-23T15:00:02.100Z"),
    })).toMatchObject({ status: "not_ready" });
    expect(() => evaluateFieldLiveReadiness({
      manifest, manifestDigest, bootstrapReport,
      heartbeat: { ...heartbeat, field: { fieldId, fieldGeneration: 2 } },
      policy, attestation, attestationSecret: secret, now: new Date("2026-07-23T15:00:02.100Z"),
    })).toThrow(/cross Field generations/);
    expect(() => evaluateFieldLiveReadiness({
      manifest, manifestDigest, bootstrapReport, heartbeat,
      policy: { ...policy, maximumActions: 2 },
      attestation, attestationSecret: secret, now: new Date("2026-07-23T15:00:02.100Z"),
    })).toThrow(/policy hash/);
  });
});
