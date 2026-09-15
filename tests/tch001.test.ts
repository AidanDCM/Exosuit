import { describe, expect, it } from "vitest";
import { tch001RecordingStopProofSchema, validateTch001RecordingStopProof } from "../src/completion/tch001.js";

function proof(): unknown {
  return {
    contractVersion: 1,
    testId: "TCH-001",
    testCaseId: "TCH-001.12",
    exactCommit: "a".repeat(40),
    machineId: "machine-test",
    field: { fieldId: "11111111-1111-4111-8111-111111111111", fieldGeneration: 3 },
    vmGuid: "22222222-2222-4222-8222-222222222222",
    consent: {
      receiptSha256: "b".repeat(64),
      grantedAt: "2026-08-10T12:00:00.000Z",
      activeAtTrigger: true,
    },
    indicator: {
      observationSha256: "c".repeat(64),
      observedAt: "2026-08-10T12:00:55.000Z",
      visibleAtTrigger: true,
    },
    triggeredAt: "2026-08-10T12:01:00.000Z",
    recordingStoppedAt: "2026-08-10T12:01:01.100Z",
    fieldStoppedAt: "2026-08-10T12:01:01.250Z",
    latencyMs: 1_250,
    channelIndependent: true,
    modelIndependent: true,
    inputHooksStopped: true,
    pendingInputInvalidated: true,
    recordingStopped: true,
    fieldState: "Off",
    sourceArtifactSha256: "d".repeat(64),
  };
}

describe("TCH-001 recording emergency-stop proof", () => {
  it("accepts consented visible recording stopped independently within five seconds", () => {
    expect(validateTch001RecordingStopProof(proof())).toEqual([]);
  });

  it("rejects inferred consent, hidden indication, active hooks, and an unstopped Field", () => {
    const candidate = proof() as Record<string, unknown>;
    candidate.consent = { ...(candidate.consent as object), activeAtTrigger: false };
    candidate.indicator = { ...(candidate.indicator as object), visibleAtTrigger: false };
    candidate.inputHooksStopped = false;
    candidate.fieldState = "Running";
    expect(validateTch001RecordingStopProof(candidate).join("\n")).toMatch(/activeAtTrigger|visibleAtTrigger|inputHooksStopped|fieldState/);
  });

  it("rejects inconsistent timing and extra content-bearing fields", () => {
    const candidate = proof() as Record<string, unknown>;
    candidate.latencyMs = 1_249;
    expect(validateTch001RecordingStopProof(candidate).join("\n")).toMatch(/latency/);
    expect(() => tch001RecordingStopProofSchema.parse({ ...candidate, rawEvents: ["forbidden"] })).toThrow();
  });

  it("rejects consent granted after the stop trigger", () => {
    const candidate = proof() as Record<string, unknown>;
    candidate.consent = { ...(candidate.consent as object), grantedAt: "2026-08-10T12:02:00.000Z" };
    expect(validateTch001RecordingStopProof(candidate).join("\n")).toMatch(/consent was granted after/);
  });
});
