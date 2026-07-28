import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fieldRefSchema, type FieldRef } from "./fieldContracts.js";
import {
  compareShadowPrediction,
  shadowActionSchema,
  shadowActualSchema,
  shadowComparisonSchema,
  shadowPredictionSchema,
  type ShadowActual,
  type ShadowPrediction,
} from "./shadowLearning.js";

export const correctionDispositionSchema = z.enum([
  "system_error",
  "owner_changed_mind",
  "owner_exploration",
  "task_cancelled",
]);
export const correctionTakeoverPhaseSchema = z.enum(["before_action", "during_motor", "after_action"]);
export const correctionEffectStateSchema = z.enum([
  "not_started",
  "confirmed_no_effect",
  "confirmed_effect",
  "uncertain_external_effect",
]);
export const correctionDimensionSchema = z.enum([
  "decision",
  "target",
  "method",
  "timing",
  "motor",
  "typing",
  "language",
  "verification",
]);

export const shadowCorrectionRecordSchema = z.object({
  correctionId: z.string().uuid(),
  field: fieldRefSchema,
  predictionId: z.string().uuid(),
  actualId: z.string().uuid().optional(),
  sourceObservationId: z.string().min(1).max(300),
  resultObservationId: z.string().min(1).max(300).optional(),
  capturedAt: z.string().datetime(),
  operatorId: z.string().min(1).max(200),
  takeoverPhase: correctionTakeoverPhaseSchema,
  effectState: correctionEffectStateSchema,
  disposition: correctionDispositionSchema,
  wrongDimensions: z.array(correctionDimensionSchema).max(8),
  prediction: shadowActionSchema,
  replacementAction: shadowActionSchema.optional(),
  comparison: shadowComparisonSchema.optional(),
  executionAllowed: z.literal(false),
});
export type ShadowCorrectionRecord = z.infer<typeof shadowCorrectionRecordSchema>;

export class ShadowCorrectionDataset {
  readonly #field: FieldRef;
  readonly #records: ShadowCorrectionRecord[] = [];

  constructor(field: FieldRef) {
    this.#field = fieldRefSchema.parse(field);
  }

  capture(input: {
    prediction: ShadowPrediction;
    actual?: ShadowActual;
    operatorId: string;
    takeoverPhase: z.infer<typeof correctionTakeoverPhaseSchema>;
    effectState: z.infer<typeof correctionEffectStateSchema>;
    disposition: z.infer<typeof correctionDispositionSchema>;
    wrongDimensions: readonly z.infer<typeof correctionDimensionSchema>[];
    resultObservationId?: string;
    capturedAt?: string;
  }): ShadowCorrectionRecord {
    const prediction = shadowPredictionSchema.parse(input.prediction);
    assertField(this.#field, prediction.field);
    if (this.#records.some((record) => record.predictionId === prediction.predictionId)) {
      throw new Error("A Shadow prediction may produce only one correction record.");
    }
    const takeoverPhase = correctionTakeoverPhaseSchema.parse(input.takeoverPhase);
    const effectState = correctionEffectStateSchema.parse(input.effectState);
    const disposition = correctionDispositionSchema.parse(input.disposition);
    const wrongDimensions = z.array(correctionDimensionSchema).max(8).parse(input.wrongDimensions);
    if (new Set(wrongDimensions).size !== wrongDimensions.length) {
      throw new Error("Correction dimensions must be unique.");
    }
    if (takeoverPhase === "before_action" && effectState !== "not_started") {
      throw new Error("A before-action takeover cannot claim an action effect.");
    }
    if (takeoverPhase === "during_motor" && !["confirmed_no_effect", "uncertain_external_effect"].includes(effectState)) {
      throw new Error("A during-motor takeover must preserve no-effect or uncertain-effect state.");
    }
    const isCancellation = disposition === "task_cancelled";
    const isOwnerChoice = disposition === "owner_changed_mind" || disposition === "owner_exploration";
    if ((isCancellation || isOwnerChoice) && wrongDimensions.length > 0) {
      throw new Error("Owner choice and cancellation cannot be mislabeled as system error dimensions.");
    }
    if (disposition === "system_error" && wrongDimensions.length === 0) {
      throw new Error("A system-error correction requires at least one wrong dimension.");
    }
    if (isCancellation && input.actual !== undefined) {
      throw new Error("A cancelled task cannot attach replacement behavior.");
    }
    if (!isCancellation && input.actual === undefined) {
      throw new Error("A non-cancellation correction requires the owner's replacement behavior.");
    }

    const capturedAt = input.capturedAt ?? new Date().toISOString();
    let actual: ShadowActual | undefined;
    let comparison: ReturnType<typeof compareShadowPrediction> | undefined;
    if (input.actual !== undefined) {
      actual = shadowActualSchema.parse(input.actual);
      assertField(this.#field, actual.field);
      if (new Date(actual.occurredAt).getTime() < new Date(prediction.predictedAt).getTime()) {
        throw new Error("Owner replacement behavior cannot occur before the Shadow prediction.");
      }
      comparison = compareShadowPrediction({ prediction, actual, comparedAt: capturedAt });
    }
    if (new Date(capturedAt).getTime() < new Date(actual?.occurredAt ?? prediction.predictedAt).getTime()) {
      throw new Error("Correction capture cannot precede its source behavior.");
    }

    const record = shadowCorrectionRecordSchema.parse({
      correctionId: randomUUID(),
      field: this.#field,
      predictionId: prediction.predictionId,
      ...(actual ? { actualId: actual.actualId, replacementAction: actual.action, comparison } : {}),
      sourceObservationId: prediction.observationId,
      ...(input.resultObservationId ? { resultObservationId: input.resultObservationId } : {}),
      capturedAt,
      operatorId: input.operatorId,
      takeoverPhase,
      effectState,
      disposition,
      wrongDimensions,
      prediction: prediction.action,
      executionAllowed: false,
    });
    this.#records.push(record);
    return structuredClone(record);
  }

  records(): ShadowCorrectionRecord[] {
    return structuredClone(this.#records);
  }
}

function assertField(expected: FieldRef, actual: FieldRef): void {
  if (expected.fieldId !== actual.fieldId || expected.fieldGeneration !== actual.fieldGeneration) {
    throw new Error("Correction data cannot cross Field generations.");
  }
}
