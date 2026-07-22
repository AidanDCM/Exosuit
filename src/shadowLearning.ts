import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fieldRefSchema } from "./fieldContracts.js";

export const behaviorMethodSchema = z.enum(["semantic", "mouse", "keyboard", "mixed", "wait"]);
export type BehaviorMethod = z.infer<typeof behaviorMethodSchema>;

export const trajectoryPointSchema = z.object({
  tMs: z.number().finite().nonnegative(),
  x: z.number().finite(),
  y: z.number().finite(),
});
export type TrajectoryPoint = z.infer<typeof trajectoryPointSchema>;

export const shadowActionSchema = z.object({
  intent: z.string().min(1).max(1_000),
  targetKey: z.string().min(1).max(1_000),
  method: behaviorMethodSchema,
  delayMs: z.number().finite().nonnegative().max(300_000),
  expectedResult: z.string().min(1).max(2_000),
  reason: z.string().min(1).max(2_000).optional(),
  trajectory: z.array(trajectoryPointSchema).max(10_000).optional(),
});
export type ShadowAction = z.infer<typeof shadowActionSchema>;

export const shadowPredictionSchema = z.object({
  predictionId: z.string().uuid(),
  field: fieldRefSchema,
  observationId: z.string().min(1).max(300),
  predictedAt: z.string().datetime(),
  action: shadowActionSchema,
  confidence: z.number().min(0).max(1),
  sourceEpisodeIds: z.array(z.string().uuid()).max(100),
  modelVersion: z.string().min(1).max(200),
  executionAllowed: z.literal(false),
});
export type ShadowPrediction = z.infer<typeof shadowPredictionSchema>;

export const shadowActualSchema = z.object({
  actualId: z.string().uuid(),
  field: fieldRefSchema,
  observationId: z.string().min(1).max(300),
  occurredAt: z.string().datetime(),
  action: shadowActionSchema,
  operatorId: z.string().min(1).max(200),
});
export type ShadowActual = z.infer<typeof shadowActualSchema>;

export const shadowComparisonSchema = z.object({
  comparisonId: z.string().uuid(),
  predictionId: z.string().uuid(),
  actualId: z.string().uuid(),
  field: fieldRefSchema,
  intentMatch: z.boolean(),
  targetMatch: z.boolean(),
  methodMatch: z.boolean(),
  expectedResultMatch: z.boolean(),
  timingAbsoluteErrorMs: z.number().finite().nonnegative(),
  trajectoryShapeDistance: z.number().finite().nonnegative().optional(),
  comparedAt: z.string().datetime(),
});
export type ShadowComparison = z.infer<typeof shadowComparisonSchema>;

export const shadowSummarySchema = z.object({
  sampleCount: z.number().int().nonnegative(),
  intentAccuracy: z.number().min(0).max(1),
  targetAccuracy: z.number().min(0).max(1),
  methodAccuracy: z.number().min(0).max(1),
  expectedResultAccuracy: z.number().min(0).max(1),
  meanTimingAbsoluteErrorMs: z.number().finite().nonnegative(),
  meanTrajectoryShapeDistance: z.number().finite().nonnegative().optional(),
});
export type ShadowSummary = z.infer<typeof shadowSummarySchema>;

export function createShadowPrediction(input: Omit<ShadowPrediction, "predictionId" | "executionAllowed"> & { predictionId?: string }): ShadowPrediction {
  return shadowPredictionSchema.parse({
    ...input,
    predictionId: input.predictionId ?? randomUUID(),
    executionAllowed: false,
  });
}

export function compareShadowPrediction(input: {
  prediction: ShadowPrediction;
  actual: ShadowActual;
  comparedAt?: string;
}): ShadowComparison {
  const prediction = shadowPredictionSchema.parse(input.prediction);
  const actual = shadowActualSchema.parse(input.actual);
  if (
    prediction.field.fieldId !== actual.field.fieldId ||
    prediction.field.fieldGeneration !== actual.field.fieldGeneration
  ) {
    throw new Error("Shadow prediction and actual action refer to different Field generations.");
  }
  if (prediction.observationId !== actual.observationId) {
    throw new Error("Shadow prediction and actual action must share the same source observation.");
  }
  return shadowComparisonSchema.parse({
    comparisonId: randomUUID(),
    predictionId: prediction.predictionId,
    actualId: actual.actualId,
    field: prediction.field,
    intentMatch: normalize(prediction.action.intent) === normalize(actual.action.intent),
    targetMatch: normalize(prediction.action.targetKey) === normalize(actual.action.targetKey),
    methodMatch: prediction.action.method === actual.action.method,
    expectedResultMatch: normalize(prediction.action.expectedResult) === normalize(actual.action.expectedResult),
    timingAbsoluteErrorMs: Math.abs(prediction.action.delayMs - actual.action.delayMs),
    ...(prediction.action.trajectory && actual.action.trajectory
      ? { trajectoryShapeDistance: trajectoryShapeDistance(prediction.action.trajectory, actual.action.trajectory) }
      : {}),
    comparedAt: input.comparedAt ?? new Date().toISOString(),
  });
}

export class ShadowSessionEvaluator {
  readonly #field: z.infer<typeof fieldRefSchema>;
  readonly #comparisons: ShadowComparison[] = [];

  constructor(field: z.infer<typeof fieldRefSchema>) {
    this.#field = fieldRefSchema.parse(field);
  }

  append(comparison: ShadowComparison): void {
    const parsed = shadowComparisonSchema.parse(comparison);
    if (
      parsed.field.fieldId !== this.#field.fieldId ||
      parsed.field.fieldGeneration !== this.#field.fieldGeneration
    ) {
      throw new Error("Shadow comparison cannot cross Field generations.");
    }
    if (this.#comparisons.some((existing) => existing.predictionId === parsed.predictionId)) {
      throw new Error("A shadow prediction may be compared only once in one session.");
    }
    this.#comparisons.push(parsed);
  }

  comparisons(): ShadowComparison[] {
    return structuredClone(this.#comparisons);
  }

  summary(): ShadowSummary {
    const count = this.#comparisons.length;
    if (count === 0) {
      return shadowSummarySchema.parse({
        sampleCount: 0,
        intentAccuracy: 0,
        targetAccuracy: 0,
        methodAccuracy: 0,
        expectedResultAccuracy: 0,
        meanTimingAbsoluteErrorMs: 0,
      });
    }
    const trajectory = this.#comparisons
      .map((comparison) => comparison.trajectoryShapeDistance)
      .filter((value): value is number => value !== undefined);
    return shadowSummarySchema.parse({
      sampleCount: count,
      intentAccuracy: ratio(this.#comparisons, "intentMatch"),
      targetAccuracy: ratio(this.#comparisons, "targetMatch"),
      methodAccuracy: ratio(this.#comparisons, "methodMatch"),
      expectedResultAccuracy: ratio(this.#comparisons, "expectedResultMatch"),
      meanTimingAbsoluteErrorMs:
        this.#comparisons.reduce((sum, comparison) => sum + comparison.timingAbsoluteErrorMs, 0) / count,
      ...(trajectory.length > 0
        ? { meanTrajectoryShapeDistance: trajectory.reduce((sum, value) => sum + value, 0) / trajectory.length }
        : {}),
    });
  }
}

function ratio(
  comparisons: ShadowComparison[],
  key: "intentMatch" | "targetMatch" | "methodMatch" | "expectedResultMatch",
): number {
  return comparisons.filter((comparison) => comparison[key]).length / comparisons.length;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function trajectoryShapeDistance(left: TrajectoryPoint[], right: TrajectoryPoint[]): number {
  if (left.length < 2 || right.length < 2) throw new Error("Trajectory comparison requires at least two points per path.");
  validateTrajectory(left);
  validateTrajectory(right);
  const sampleCount = Math.max(2, Math.min(100, Math.max(left.length, right.length)));
  const leftNormalized = normalizeTrajectory(left);
  const rightNormalized = normalizeTrajectory(right);
  let squared = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / (sampleCount - 1);
    const a = sampleTrajectory(leftNormalized, progress);
    const b = sampleTrajectory(rightNormalized, progress);
    squared += (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  }
  return Math.sqrt(squared / sampleCount);
}

function validateTrajectory(points: TrajectoryPoint[]): void {
  for (let index = 1; index < points.length; index += 1) {
    if (points[index]!.tMs <= points[index - 1]!.tMs) {
      throw new Error("Trajectory timestamps must increase strictly.");
    }
  }
}

function normalizeTrajectory(points: TrajectoryPoint[]): TrajectoryPoint[] {
  const first = points[0]!;
  const last = points.at(-1)!;
  const duration = last.tMs - first.tMs;
  const distance = Math.hypot(last.x - first.x, last.y - first.y);
  const scale = distance > 0 ? distance : 1;
  return points.map((point) => ({
    tMs: (point.tMs - first.tMs) / duration,
    x: (point.x - first.x) / scale,
    y: (point.y - first.y) / scale,
  }));
}

function sampleTrajectory(points: TrajectoryPoint[], progress: number): { x: number; y: number } {
  if (progress <= 0) return { x: points[0]!.x, y: points[0]!.y };
  if (progress >= 1) return { x: points.at(-1)!.x, y: points.at(-1)!.y };
  const upperIndex = points.findIndex((point) => point.tMs >= progress);
  const upper = points[upperIndex]!;
  const lower = points[upperIndex - 1]!;
  const span = upper.tMs - lower.tMs;
  const weight = span === 0 ? 0 : (progress - lower.tMs) / span;
  return {
    x: lower.x + (upper.x - lower.x) * weight,
    y: lower.y + (upper.y - lower.y) * weight,
  };
}
