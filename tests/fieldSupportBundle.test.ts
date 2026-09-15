import { describe, expect, it } from "vitest";
import {
  assertFieldBundleSafe,
  createFieldSupportBundle,
  hashFieldPrivateIdentifier,
  verifyFieldSupportBundle,
} from "../src/fieldSupportBundle.js";

function input() {
  return {
    generatedAt: "2026-07-21T18:00:00.000Z",
    exosuitVersion: "0.1.0",
    fieldIdHash: hashFieldPrivateIdentifier("field-private-id"),
    fieldGeneration: 1,
    lifecycle: "ready",
    health: "healthy" as const,
    bootstrapStatus: "ready" as const,
    recorderState: "not_started" as const,
    visualCaptureEnabled: false,
    visualUsage: { frameCount: 0, totalBytes: 0 },
    artifactSummary: { prepared: 0, verified: 0, completed: 0, cancelled: 0, failed: 0, quarantined: 0 },
    channelSummary: { authenticated: true, inboundSequence: 4, outboundSequence: 3, replayDenials: 1, authenticationDenials: 0 },
    auditSummary: { eventCount: 10, chainValid: true, eventTypes: { field_ready: 1 } },
    recoverySummary: { decisions: 1, retriesAllowed: 0, ownerReviewsRequired: 1, generationIncrementsRequired: 0 },
    recentErrorCodes: ["artifact_hash_mismatch"],
    configurationFlags: { hostDesktopAccess: false, visualCapture: false },
  };
}

describe("Field support bundle", () => {
  it("creates an integrity-protected summary without private identifiers", () => {
    const bundle = createFieldSupportBundle(input());
    expect(() => verifyFieldSupportBundle(bundle)).not.toThrow();
    expect(bundle.data).toMatchObject({ fieldGeneration: 1, health: "healthy", channelSummary: { replayDenials: 1 } });
    expect(JSON.stringify(bundle)).not.toContain("field-private-id");
  });

  it("detects bundle tampering", () => {
    const bundle = createFieldSupportBundle(input());
    expect(() => verifyFieldSupportBundle({ ...bundle, data: { ...bundle.data, fieldGeneration: 2 } })).toThrow(/integrity/);
  });

  it.each([
    [{ accessToken: "secret" }, /forbidden field/],
    [{ screenshotBase64: "abc" }, /forbidden field/],
    [{ operatorId: "aidan" }, /forbidden field/],
    [{ nested: { windowTitle: "Private window" } }, /forbidden field/],
    [{ message: "Bearer abcdefghijklmnop" }, /sensitive value/],
    [{ message: "sk-abcdefghijklmnop" }, /sensitive value/],
  ])("rejects unsafe diagnostic data %#", (value, pattern) => {
    expect(() => assertFieldBundleSafe(value)).toThrow(pattern);
  });

  it("requires non-empty private identifiers before hashing", () => {
    expect(hashFieldPrivateIdentifier("field-a")).toMatch(/^[a-f0-9]{64}$/);
    expect(() => hashFieldPrivateIdentifier(" ")).toThrow(/cannot be empty/);
  });
});
