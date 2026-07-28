import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ShadowCorrectionDataset, shadowCorrectionRecordSchema } from "../src/correctionMode.js";
import { createShadowPrediction, shadowActualSchema } from "../src/shadowLearning.js";

const field = { fieldId: randomUUID(), fieldGeneration: 4 };
const prediction = () => createShadowPrediction({
  field,
  observationId: "scene-observation-1",
  predictedAt: "2026-07-28T23:00:00.000Z",
  action: { intent: "open search", targetKey: "search", method: "semantic", delayMs: 500,
    expectedResult: "search is focused" },
  confidence: 0.8,
  sourceEpisodeIds: [randomUUID()],
  modelVersion: "retrieval-shadow-baseline-v1",
});
const actual = (overrides = {}) => shadowActualSchema.parse({
  actualId: randomUUID(), field, observationId: "scene-observation-1", occurredAt: "2026-07-28T23:00:01.000Z",
  operatorId: "owner", action: { intent: "open address", targetKey: "address", method: "keyboard", delayMs: 700,
    expectedResult: "address is focused" }, ...overrides,
});

describe("Shadow correction dataset", () => {
  it("captures an owner replacement with exact prediction comparison and no execution authority", () => {
    const dataset = new ShadowCorrectionDataset(field);
    const record = dataset.capture({ prediction: prediction(), actual: actual(), operatorId: "owner",
      takeoverPhase: "before_action", effectState: "not_started", disposition: "system_error",
      wrongDimensions: ["decision", "target", "method"], capturedAt: "2026-07-28T23:00:02.000Z" });
    expect(record).toMatchObject({ field, sourceObservationId: "scene-observation-1", executionAllowed: false,
      comparison: { intentMatch: false, targetMatch: false, methodMatch: false } });
    expect(() => shadowCorrectionRecordSchema.parse({ ...record, executionAllowed: true })).toThrow();
    expect(dataset.records()).toHaveLength(1);
  });

  it("represents owner cancellation without inventing replacement behavior", () => {
    const record = new ShadowCorrectionDataset(field).capture({ prediction: prediction(), operatorId: "owner",
      takeoverPhase: "before_action", effectState: "not_started", disposition: "task_cancelled",
      wrongDimensions: [], capturedAt: "2026-07-28T23:00:01.000Z" });
    expect(record).not.toHaveProperty("actualId");
    expect(record).not.toHaveProperty("replacementAction");
    expect(record).not.toHaveProperty("comparison");
  });

  it("preserves uncertain external effect during a motor takeover", () => {
    const record = new ShadowCorrectionDataset(field).capture({ prediction: prediction(), actual: actual(), operatorId: "owner",
      takeoverPhase: "during_motor", effectState: "uncertain_external_effect", disposition: "system_error",
      wrongDimensions: ["motor"], capturedAt: "2026-07-28T23:00:02.000Z" });
    expect(record).toMatchObject({ takeoverPhase: "during_motor", effectState: "uncertain_external_effect" });
  });

  it("separates changed mind and exploration from system mistakes", () => {
    for (const disposition of ["owner_changed_mind", "owner_exploration"] as const) {
      const record = new ShadowCorrectionDataset(field).capture({ prediction: prediction(), actual: actual(), operatorId: "owner",
        takeoverPhase: "after_action", effectState: "confirmed_no_effect", disposition, wrongDimensions: [],
        capturedAt: "2026-07-28T23:00:02.000Z" });
      expect(record.disposition).toBe(disposition);
    }
  });

  it("rejects duplicate, cross-generation, cross-observation, and impossible timing records", () => {
    const dataset = new ShadowCorrectionDataset(field);
    const source = prediction();
    const input = { prediction: source, actual: actual(), operatorId: "owner", takeoverPhase: "after_action" as const,
      effectState: "confirmed_no_effect" as const, disposition: "system_error" as const,
      wrongDimensions: ["target"] as const, capturedAt: "2026-07-28T23:00:02.000Z" };
    dataset.capture(input);
    expect(() => dataset.capture(input)).toThrow(/only one correction/);
    expect(() => new ShadowCorrectionDataset(field).capture({ ...input,
      actual: actual({ observationId: "other" }) })).toThrow(/same source observation/);
    expect(() => new ShadowCorrectionDataset(field).capture({ ...input,
      actual: actual({ field: { ...field, fieldGeneration: 5 } }) })).toThrow(/cross Field generations/);
    expect(() => new ShadowCorrectionDataset(field).capture({ ...input,
      actual: actual({ occurredAt: "2026-07-28T22:59:59.000Z" }) })).toThrow(/cannot occur before/);
  });

  it("rejects conflicting labels and impossible effect claims", () => {
    const dataset = new ShadowCorrectionDataset(field);
    const source = prediction();
    expect(() => dataset.capture({ prediction: source, actual: actual(), operatorId: "owner", takeoverPhase: "before_action",
      effectState: "confirmed_effect", disposition: "system_error", wrongDimensions: ["decision"] })).toThrow(/before-action/);
    expect(() => dataset.capture({ prediction: source, actual: actual(), operatorId: "owner", takeoverPhase: "after_action",
      effectState: "confirmed_no_effect", disposition: "owner_changed_mind", wrongDimensions: ["decision"] })).toThrow(/mislabeled/);
    expect(() => dataset.capture({ prediction: source, actual: actual(), operatorId: "owner", takeoverPhase: "after_action",
      effectState: "confirmed_no_effect", disposition: "system_error", wrongDimensions: [] })).toThrow(/at least one/);
  });
});
