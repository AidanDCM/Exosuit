import { z } from "zod";
import { sha256Canonical } from "./fieldContracts.js";
import { personaBehaviorPlanSchema, type PersonaBehaviorPlan } from "./personaBehavior.js";

const unitIntervalSchema = z.number().finite().min(0).max(1);
const MODEL_VERSION = "observed-behavior-v1" as const;

export const typingProcessObservationSchema = z.object({
  observationId: z.string().uuid(),
  sourceEpisodeId: z.string().uuid(),
  observedAt: z.string().datetime(),
  stage: z.literal("drafting"),
  risk: z.literal("low"),
  protectedField: z.literal(false),
  finalTextMatchedIntent: z.literal(true),
  submittedExternally: z.literal(false),
  characterCount: z.number().int().min(1).max(1_000_000),
  durationMs: z.number().finite().positive().max(3_600_000),
  pauseDurationsMs: z.array(z.number().finite().nonnegative().max(300_000)).max(100_000),
  typoCount: z.number().int().nonnegative().max(100_000),
  correctionCount: z.number().int().nonnegative().max(100_000),
  backspaceCount: z.number().int().nonnegative().max(1_000_000),
  immediateCorrectionCount: z.number().int().nonnegative().max(100_000),
}).strict().superRefine((value, context) => {
  if (value.immediateCorrectionCount > value.correctionCount) {
    context.addIssue({ code: "custom", path: ["immediateCorrectionCount"], message: "Immediate corrections cannot exceed total corrections." });
  }
  if (value.correctionCount > value.typoCount + 10) {
    context.addIssue({ code: "custom", path: ["correctionCount"], message: "Correction count is implausibly larger than the observed typo count." });
  }
});
export type TypingProcessObservation = z.infer<typeof typingProcessObservationSchema>;

export const typingProcessModelSchema = z.object({
  contractVersion: z.literal(1),
  modelVersion: z.literal(MODEL_VERSION),
  ownerId: z.string().min(1).max(200),
  profileId: z.string().uuid(),
  profileVersion: z.number().int().positive(),
  trainedAt: z.string().datetime(),
  sourceEpisodeIds: z.array(z.string().uuid()).min(2).max(10_000),
  observationCount: z.number().int().min(5),
  characterCount: z.number().int().positive(),
  charactersPerSecond: z.number().finite().positive(),
  medianPauseMs: z.number().finite().nonnegative(),
  p90PauseMs: z.number().finite().nonnegative(),
  observedTyposPer100Characters: z.number().finite().min(0).max(15),
  observedCorrectionsPer100Characters: z.number().finite().min(0).max(15),
  observedBackspacesPer100Characters: z.number().finite().min(0).max(100),
  immediateCorrectionRate: unitIntervalSchema,
  maximumDraftTypoProbability: z.number().finite().min(0).max(0.15),
  actionAuthority: z.literal("none"),
  modelHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type TypingProcessModel = z.infer<typeof typingProcessModelSchema>;

export const typingProcessAdviceSchema = z.object({
  modelHash: z.string().regex(/^[a-f0-9]{64}$/),
  contextId: z.string().min(1).max(200),
  suggestedCharactersPerSecond: z.number().finite().positive(),
  suggestedPauseMs: z.number().finite().nonnegative(),
  typoProcessEligible: z.boolean(),
  typoProbabilityCeiling: z.number().finite().min(0).max(0.15),
  immediateCorrectionRequired: z.literal(true),
  producesText: z.literal(false),
  producesKeyEvents: z.literal(false),
  actionAuthority: z.literal("none"),
}).strict();
export type TypingProcessAdvice = z.infer<typeof typingProcessAdviceSchema>;

export const motorPreferenceObservationSchema = z.object({
  observationId: z.string().uuid(),
  sourceEpisodeId: z.string().uuid(),
  observedAt: z.string().datetime(),
  stage: z.literal("drafting"),
  risk: z.literal("low"),
  protectedTarget: z.literal(false),
  externalCommitment: z.literal(false),
  destructiveEffect: z.literal(false),
  targetDifficulty: unitIntervalSchema,
  straightLineDistancePx: z.number().finite().nonnegative().max(100_000),
  pathLengthPx: z.number().finite().nonnegative().max(1_000_000),
  durationMs: z.number().finite().positive().max(300_000),
  correctionCount: z.number().int().nonnegative().max(1_000),
  missCount: z.number().int().min(0).max(1),
  recoveredImmediately: z.boolean(),
  resultVerified: z.literal(true),
}).strict().superRefine((value, context) => {
  if (value.pathLengthPx + 0.001 < value.straightLineDistancePx) {
    context.addIssue({ code: "custom", path: ["pathLengthPx"], message: "Observed pointer path cannot be shorter than straight-line distance." });
  }
  if (value.missCount > 0 && !value.recoveredImmediately) {
    context.addIssue({ code: "custom", path: ["recoveredImmediately"], message: "Only immediately recovered low-risk misses may enter the model." });
  }
});
export type MotorPreferenceObservation = z.infer<typeof motorPreferenceObservationSchema>;

export const motorPreferenceModelSchema = z.object({
  contractVersion: z.literal(1),
  modelVersion: z.literal(MODEL_VERSION),
  ownerId: z.string().min(1).max(200),
  profileId: z.string().uuid(),
  profileVersion: z.number().int().positive(),
  trainedAt: z.string().datetime(),
  sourceEpisodeIds: z.array(z.string().uuid()).min(2).max(10_000),
  observationCount: z.number().int().min(5),
  medianSpeedPxPerSecond: z.number().finite().positive(),
  medianPathEfficiency: unitIntervalSchema,
  correctionRatePerMovement: z.number().finite().nonnegative().max(20),
  observedMissProbability: z.number().finite().min(0).max(0.05),
  difficultySpeedSlope: z.number().finite().min(-1).max(1),
  actionAuthority: z.literal("none"),
  physicalInputAuthority: z.literal("none"),
  modelHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type MotorPreferenceModel = z.infer<typeof motorPreferenceModelSchema>;

export const motorPreferenceAdviceSchema = z.object({
  modelHash: z.string().regex(/^[a-f0-9]{64}$/),
  contextId: z.string().min(1).max(200),
  targetDifficulty: unitIntervalSchema,
  suggestedSpeedPxPerSecond: z.number().finite().positive(),
  suggestedPathEfficiency: unitIntervalSchema,
  correctionProcessEligible: z.boolean(),
  misclickProcessEligible: z.boolean(),
  misclickProbabilityCeiling: z.number().finite().min(0).max(0.05),
  producesCoordinates: z.literal(false),
  producesInputEvents: z.literal(false),
  actionAuthority: z.literal("none"),
  physicalInputAuthority: z.literal("none"),
}).strict();
export type MotorPreferenceAdvice = z.infer<typeof motorPreferenceAdviceSchema>;

export function fitTypingProcessModel(input: {
  ownerId: string;
  profileId: string;
  profileVersion: number;
  observations: TypingProcessObservation[];
  trainedAt?: string;
}): TypingProcessModel {
  const observations = validateObservationCorpus(input.observations, typingProcessObservationSchema, "typing");
  const sourceEpisodeIds = [...new Set(observations.map((item) => item.sourceEpisodeId))].sort();
  if (sourceEpisodeIds.length < 2) throw new Error("Typing model requires observations from at least two source episodes.");
  const characters = observations.reduce((sum, item) => sum + item.characterCount, 0);
  const duration = observations.reduce((sum, item) => sum + item.durationMs, 0);
  const typoCount = observations.reduce((sum, item) => sum + item.typoCount, 0);
  const corrections = observations.reduce((sum, item) => sum + item.correctionCount, 0);
  const backspaces = observations.reduce((sum, item) => sum + item.backspaceCount, 0);
  const immediate = observations.reduce((sum, item) => sum + item.immediateCorrectionCount, 0);
  const pauses = observations.flatMap((item) => item.pauseDurationsMs).sort((left, right) => left - right);
  const typosPer100 = Math.min(15, typoCount / characters * 100);
  const core = {
    contractVersion: 1 as const,
    modelVersion: MODEL_VERSION,
    ownerId: input.ownerId,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    trainedAt: input.trainedAt ?? new Date().toISOString(),
    sourceEpisodeIds,
    observationCount: observations.length,
    characterCount: characters,
    charactersPerSecond: characters / (duration / 1_000),
    medianPauseMs: pauses.length > 0 ? quantile(pauses, 0.5) : 0,
    p90PauseMs: pauses.length > 0 ? quantile(pauses, 0.9) : 0,
    observedTyposPer100Characters: typosPer100,
    observedCorrectionsPer100Characters: Math.min(15, corrections / characters * 100),
    observedBackspacesPer100Characters: Math.min(100, backspaces / characters * 100),
    immediateCorrectionRate: corrections === 0 ? 1 : immediate / corrections,
    maximumDraftTypoProbability: Math.min(0.15, typosPer100 / 100),
    actionAuthority: "none" as const,
  };
  return typingProcessModelSchema.parse({ ...core, modelHash: sha256Canonical(core) });
}

export function adviseTypingProcess(input: {
  model: TypingProcessModel;
  behaviorPlan: PersonaBehaviorPlan;
  contentCharacters: number;
}): TypingProcessAdvice {
  const model = verifyModel(input.model, typingProcessModelSchema, "typing");
  const plan = personaBehaviorPlanSchema.parse(structuredClone(input.behaviorPlan));
  if (!Number.isInteger(input.contentCharacters) || input.contentCharacters < 0 || input.contentCharacters > 1_000_000) {
    throw new Error("contentCharacters must be an integer from 0 through 1000000.");
  }
  const typoProcessEligible = plan.imperfectionAllowance.typoProcessEligible && model.maximumDraftTypoProbability > 0;
  return typingProcessAdviceSchema.parse({
    modelHash: model.modelHash,
    contextId: plan.contextId,
    suggestedCharactersPerSecond: Math.max(0.1, model.charactersPerSecond * plan.motorSpeedScale),
    suggestedPauseMs: input.contentCharacters >= 100 ? model.p90PauseMs : model.medianPauseMs,
    typoProcessEligible,
    typoProbabilityCeiling: typoProcessEligible
      ? Math.min(model.maximumDraftTypoProbability, plan.imperfectionAllowance.typoProbabilityCeiling)
      : 0,
    immediateCorrectionRequired: true,
    producesText: false,
    producesKeyEvents: false,
    actionAuthority: "none",
  });
}

export function fitMotorPreferenceModel(input: {
  ownerId: string;
  profileId: string;
  profileVersion: number;
  observations: MotorPreferenceObservation[];
  trainedAt?: string;
}): MotorPreferenceModel {
  const observations = validateObservationCorpus(input.observations, motorPreferenceObservationSchema, "motor");
  const sourceEpisodeIds = [...new Set(observations.map((item) => item.sourceEpisodeId))].sort();
  if (sourceEpisodeIds.length < 2) throw new Error("Motor model requires observations from at least two source episodes.");
  const speeds = observations.map((item) => item.pathLengthPx / (item.durationMs / 1_000)).sort((left, right) => left - right);
  const efficiencies = observations.map((item) => item.pathLengthPx === 0 ? 1 : item.straightLineDistancePx / item.pathLengthPx).sort((left, right) => left - right);
  const misses = observations.reduce((sum, item) => sum + item.missCount, 0);
  const corrections = observations.reduce((sum, item) => sum + item.correctionCount, 0);
  const lowDifficulty = observations.filter((item) => item.targetDifficulty < 0.5);
  const highDifficulty = observations.filter((item) => item.targetDifficulty >= 0.5);
  const averageSpeed = (items: MotorPreferenceObservation[]) => items.length === 0
    ? quantile(speeds, 0.5)
    : items.reduce((sum, item) => sum + item.pathLengthPx / (item.durationMs / 1_000), 0) / items.length;
  const baseline = Math.max(1, averageSpeed(lowDifficulty));
  const difficultySpeedSlope = Math.max(-1, Math.min(1, (averageSpeed(highDifficulty) - baseline) / baseline));
  const core = {
    contractVersion: 1 as const,
    modelVersion: MODEL_VERSION,
    ownerId: input.ownerId,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    trainedAt: input.trainedAt ?? new Date().toISOString(),
    sourceEpisodeIds,
    observationCount: observations.length,
    medianSpeedPxPerSecond: quantile(speeds, 0.5),
    medianPathEfficiency: quantile(efficiencies, 0.5),
    correctionRatePerMovement: corrections / observations.length,
    observedMissProbability: Math.min(0.05, misses / observations.length),
    difficultySpeedSlope,
    actionAuthority: "none" as const,
    physicalInputAuthority: "none" as const,
  };
  return motorPreferenceModelSchema.parse({ ...core, modelHash: sha256Canonical(core) });
}

export function adviseMotorPreference(input: {
  model: MotorPreferenceModel;
  behaviorPlan: PersonaBehaviorPlan;
  targetDifficulty: number;
}): MotorPreferenceAdvice {
  const model = verifyModel(input.model, motorPreferenceModelSchema, "motor");
  const plan = personaBehaviorPlanSchema.parse(structuredClone(input.behaviorPlan));
  const targetDifficulty = unitIntervalSchema.parse(input.targetDifficulty);
  const difficultyScale = Math.max(0.25, 1 + model.difficultySpeedSlope * targetDifficulty);
  const misclickProcessEligible = plan.imperfectionAllowance.misclickProcessEligible && model.observedMissProbability > 0;
  return motorPreferenceAdviceSchema.parse({
    modelHash: model.modelHash,
    contextId: plan.contextId,
    targetDifficulty,
    suggestedSpeedPxPerSecond: Math.max(1, model.medianSpeedPxPerSecond * plan.motorSpeedScale * difficultyScale),
    suggestedPathEfficiency: model.medianPathEfficiency,
    correctionProcessEligible: plan.effectiveRisk === "low" && !plan.abstain && model.correctionRatePerMovement > 0,
    misclickProcessEligible,
    misclickProbabilityCeiling: misclickProcessEligible
      ? Math.min(model.observedMissProbability, plan.imperfectionAllowance.misclickProbabilityCeiling)
      : 0,
    producesCoordinates: false,
    producesInputEvents: false,
    actionAuthority: "none",
    physicalInputAuthority: "none",
  });
}

function validateObservationCorpus<T>(input: T[], schema: z.ZodType<T>, label: string): T[] {
  if (input.length < 5) throw new Error(`${capitalize(label)} model requires at least five observations.`);
  const parsed = input.map((item) => schema.parse(structuredClone(item)));
  const ids = parsed.map((item) => (item as { observationId: string }).observationId);
  if (new Set(ids).size !== ids.length) throw new Error(`${capitalize(label)} model contains duplicate observation IDs.`);
  return parsed;
}

function verifyModel<T extends { modelHash: string }>(input: T, schema: z.ZodType<T>, label: string): T {
  const model = schema.parse(structuredClone(input));
  const { modelHash: _modelHash, ...core } = model;
  if (sha256Canonical(core) !== model.modelHash) throw new Error(`${capitalize(label)} model integrity verification failed.`);
  return model;
}

function quantile(sorted: number[], value: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * value;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
