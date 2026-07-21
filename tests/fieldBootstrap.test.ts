import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  FieldBootstrapEvaluator,
  REQUIRED_FIELD_DIRECTORIES,
  fieldBootstrapCheckNameSchema,
  fieldBootstrapManifestSchema,
  fieldBootstrapReportSchema,
} from "../src/fieldBootstrap.js";
import { sha256Canonical } from "../src/fieldContracts.js";

const fieldId = randomUUID();
const identity = {
  subsystem: "field" as const,
  fieldId,
  fieldGeneration: 1,
  agentId: "field-agent-a",
  machineId: "vm-a",
  windowsSessionId: "session-a",
  baseImageDigest: "a".repeat(64),
  personalStateDigest: "b".repeat(64),
  taskDiskId: "task-disk-a",
  createdAt: "2026-07-21T18:00:00.000Z",
};

function manifest() {
  return fieldBootstrapManifestSchema.parse({
    contractVersion: 1,
    identity,
    display: {
      monitorCount: 1,
      width: 1920,
      height: 1080,
      scalePercent: 100,
      browserZoomPercent: 100,
      keyboardLayout: "en-US",
      dynamicResolutionAllowed: false,
    },
    policyHash: "c".repeat(64),
    agentBinaryDigest: "d".repeat(64),
    channelKeyId: "field-channel-key-1",
    requiredDirectories: [...REQUIRED_FIELD_DIRECTORIES],
    createdAt: "2026-07-21T18:00:00.000Z",
    expiresAt: "2026-07-21T18:10:00.000Z",
  });
}

function report(checks = fieldBootstrapCheckNameSchema.options.map((name) => ({
  name,
  passed: true,
  observedAt: "2026-07-21T18:00:01.000Z",
  summary: `${name} passed`,
  evidence: {},
}))) {
  const value = manifest();
  return fieldBootstrapReportSchema.parse({
    contractVersion: 1,
    identity,
    manifestDigest: sha256Canonical(value),
    reportedAt: "2026-07-21T18:00:02.000Z",
    checks,
  });
}

describe("Field guest bootstrap", () => {
  it("becomes ready only after every mandatory check passes", () => {
    const value = manifest();
    const evaluator = new FieldBootstrapEvaluator({ manifest: value, manifestDigest: sha256Canonical(value) });
    expect(evaluator.evaluate(report(), new Date("2026-07-21T18:00:03.000Z"))).toMatchObject({
      status: "ready",
      identity: { fieldId, fieldGeneration: 1 },
      display: { width: 1920, height: 1080 },
    });
  });

  it("reports missing and failed checks without promoting readiness", () => {
    const value = manifest();
    const evaluator = new FieldBootstrapEvaluator({ manifest: value, manifestDigest: sha256Canonical(value) });
    const missing = report(fieldBootstrapCheckNameSchema.options.slice(0, -1).map((name) => ({
      name,
      passed: true,
      observedAt: "2026-07-21T18:00:01.000Z",
      summary: `${name} passed`,
      evidence: {},
    })));
    expect(evaluator.evaluate(missing, new Date("2026-07-21T18:00:03.000Z"))).toMatchObject({
      status: "not_ready",
      missingChecks: ["heartbeat_started"],
    });

    const failed = report(fieldBootstrapCheckNameSchema.options.map((name) => ({
      name,
      passed: name !== "display_contract",
      observedAt: "2026-07-21T18:00:01.000Z",
      summary: `${name} checked`,
      evidence: {},
    })));
    expect(evaluator.evaluate(failed, new Date("2026-07-21T18:00:03.000Z"))).toMatchObject({
      status: "failed",
      failedChecks: ["display_contract"],
    });
  });

  it("rejects wrong manifests stale identities duplicate checks and invalid timestamps", () => {
    const value = manifest();
    const evaluator = new FieldBootstrapEvaluator({ manifest: value, manifestDigest: sha256Canonical(value) });
    expect(() => evaluator.evaluate({ ...report(), manifestDigest: "e".repeat(64) }, new Date("2026-07-21T18:00:03.000Z"))).toThrow(/digest/);
    expect(() => evaluator.evaluate({ ...report(), identity: { ...identity, fieldGeneration: 2 } }, new Date("2026-07-21T18:00:03.000Z"))).toThrow(/cross Field generations/);
    const duplicate = report();
    expect(() => evaluator.evaluate({ ...duplicate, checks: [...duplicate.checks, duplicate.checks[0]!] }, new Date("2026-07-21T18:00:03.000Z"))).toThrow(/unique/);
    const invalidTime = report();
    expect(() => evaluator.evaluate({ ...invalidTime, checks: invalidTime.checks.map((check, index) => index === 0 ? { ...check, observedAt: "2026-07-21T17:59:59.000Z" } : check }, new Date("2026-07-21T18:00:03.000Z"))).toThrow(/reporting interval/);
    expect(() => evaluator.evaluate(report(), new Date("2026-07-21T18:10:00.000Z"))).toThrow(/expired/);
  });

  it("requires the exact approved directory layout", () => {
    const value = manifest();
    expect(() => fieldBootstrapManifestSchema.parse({
      ...value,
      requiredDirectories: [...value.requiredDirectories.slice(0, -1), "C:\\Host"],
    })).toThrow(/exact Field directory layout/);
  });
});
