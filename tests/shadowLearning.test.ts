import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ShadowSessionEvaluator,
  compareShadowPrediction,
  createShadowPrediction,
  shadowActualSchema,
} from "../src/shadowLearning.js";

const field = { fieldId: randomUUID(), fieldGeneration: 1 };

function prediction() {
  return createShadowPrediction({
    field,
    observationId: "observation-1",
    predictedAt: "2026-07-21T18:00:00.000Z",
    action: {
      intent: "Open result in a new tab",
      targetKey: "result-3",
      method: "mixed",
      delayMs: 620,
      expectedResult: "Result detail is visible in another tab",
      reason: "The title and salary match the task.",
      trajectory: [
        { tMs: 0, x: 100, y: 100 },
        { tMs: 150, x: 300, y: 240 },
        { tMs: 300, x: 500, y: 300 },
      ],
    },
    confidence: 0.82,
    sourceEpisodeIds: [randomUUID()],
    modelVersion: "shadow-foundation-v1",
  });
}

function actual(overrides: Record<string, unknown> = {}) {
  return shadowActualSchema.parse({
    actualId: randomUUID(),
    field,
    observationId: "observation-1",
    occurredAt: "2026-07-21T18:00:00.700Z",
    action: {
      intent: " open result in a new tab ",
      targetKey: "RESULT-3",
      method: "mixed",
      delayMs: 700,
      expectedResult: "result detail is visible in another tab",
      trajectory: [
        { tMs: 0, x: 0, y: 0 },
        { tMs: 200, x: 400, y: 280 },
        { tMs: 400, x: 800, y: 400 },
      ],
    },
    operatorId: "aidan",
    ...overrides,
  });
}

describe("shadow learning foundation", () => {
  it("hard codes prediction records as non-executing", () => {
    const value = prediction();
    expect(value.executionAllowed).toBe(false);
    expect(() => ({ ...value, executionAllowed: true })).not.toThrow();
    expect(() =>
      createShadowPrediction({
        field,
        observationId: "observation-2",
        predictedAt: "2026-07-21T18:00:00.000Z",
        action: value.action,
        confidence: 0.5,
        sourceEpisodeIds: [],
        modelVersion: "v1",
        executionAllowed: true,
      } as never),
    ).toThrow();
  });

  it("compares intent target method timing result and normalized trajectory shape", () => {
    const comparison = compareShadowPrediction({
      prediction: prediction(),
      actual: actual(),
      comparedAt: "2026-07-21T18:00:01.000Z",
    });
    expect(comparison).toMatchObject({
      intentMatch: true,
      targetMatch: true,
      methodMatch: true,
      expectedResultMatch: true,
      timingAbsoluteErrorMs: 80,
    });
    expect(comparison.trajectoryShapeDistance).toBeGreaterThanOrEqual(0);
    expect(comparison.trajectoryShapeDistance).toBeLessThan(0.2);
  });

  it("aggregates multiple comparisons without turning prediction into action authority", () => {
    const evaluator = new ShadowSessionEvaluator(field);
    const firstPrediction = prediction();
    const first = compareShadowPrediction({ prediction: firstPrediction, actual: actual() });
    evaluator.append(first);

    const secondPrediction = createShadowPrediction({
      ...prediction(),
      predictionId: randomUUID(),
      observationId: "observation-2",
      action: { ...prediction().action, intent: "Skip result", method: "mouse", delayMs: 400 },
    });
    const secondActual = actual({
      observationId: "observation-2",
      action: { ...actual().action, intent: "Open result", method: "keyboard", delayMs: 600 },
    });
    evaluator.append(compareShadowPrediction({ prediction: secondPrediction, actual: secondActual }));

    expect(evaluator.summary()).toMatchObject({
      sampleCount: 2,
      intentAccuracy: 0.5,
      targetAccuracy: 1,
      methodAccuracy: 0.5,
      expectedResultAccuracy: 1,
      meanTimingAbsoluteErrorMs: 140,
    });
    expect(() => evaluator.append(first)).toThrow(/only once/);
  });

  it("rejects cross generation comparisons and malformed trajectories", () => {
    expect(() =>
      compareShadowPrediction({
        prediction: prediction(),
        actual: actual({ field: { fieldId: field.fieldId, fieldGeneration: 2 } }),
      }),
    ).toThrow(/different Field generations/);

    const malformed = actual({
      action: {
        ...actual().action,
        trajectory: [
          { tMs: 10, x: 0, y: 0 },
          { tMs: 10, x: 1, y: 1 },
        ],
      },
    });
    expect(() => compareShadowPrediction({ prediction: prediction(), actual: malformed })).toThrow(/timestamps/);
  });
});
