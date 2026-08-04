import { z } from "zod";
import { processedDemonstrationSchema, type ProcessedDemonstration } from "./demonstrationProcessing.js";
import { sha256Canonical } from "./fieldContracts.js";
import {
  createPersonaProfile,
  personaTraitNameSchema,
  type PersonaProfile,
  type PersonaTraitName,
} from "./personaBehavior.js";

const unitIntervalSchema = z.number().finite().min(0).max(1);
const signedUnitSchema = z.number().finite().min(-1).max(1);
const DERIVATION_VERSION = "persona-heuristic-v1" as const;

export const personaTraitEstimateSchema = z.object({
  trait: personaTraitNameSchema,
  value: signedUnitSchema,
  confidence: unitIntervalSchema,
  evidenceCount: z.number().int().nonnegative(),
  sourceEpisodeIds: z.array(z.string().uuid()).max(10_000),
  rationale: z.string().min(1).max(1_000),
}).strict();
export type PersonaTraitEstimate = z.infer<typeof personaTraitEstimateSchema>;

export const personaHabitCandidateSchema = z.object({
  habitId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  description: z.string().min(1).max(500),
  confidence: unitIntervalSchema,
  evidenceCount: z.number().int().positive(),
  sourceEpisodeIds: z.array(z.string().uuid()).min(1).max(10_000),
  lastObservedAt: z.string().datetime(),
  sourceFeature: z.string().regex(/^habit:[a-z0-9][a-z0-9-]{0,79}$/),
}).strict();
export type PersonaHabitCandidate = z.infer<typeof personaHabitCandidateSchema>;

export const personaTimingEstimateSchema = z.object({
  sampleCount: z.number().int().positive(),
  minimumObservedMs: z.number().finite().nonnegative(),
  medianObservedMs: z.number().finite().nonnegative(),
  p90ObservedMs: z.number().finite().nonnegative(),
  maximumObservedMs: z.number().finite().nonnegative(),
  meanObservedMs: z.number().finite().nonnegative(),
  sourceEpisodeIds: z.array(z.string().uuid()).min(1).max(10_000),
}).strict();
export type PersonaTimingEstimate = z.infer<typeof personaTimingEstimateSchema>;

export const personaCandidateSchema = z.object({
  contractVersion: z.literal(1),
  derivationVersion: z.literal(DERIVATION_VERSION),
  candidateId: z.string().uuid(),
  ownerId: z.string().min(1).max(200),
  operatorIdHash: z.string().regex(/^[a-f0-9]{64}$/),
  derivedAt: z.string().datetime(),
  sourceEpisodeIds: z.array(z.string().uuid()).min(2).max(10_000),
  sourceEpisodeHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(2).max(10_000),
  successfulEpisodeCount: z.number().int().min(2),
  stepCount: z.number().int().min(5),
  traits: z.array(personaTraitEstimateSchema).length(6),
  timing: personaTimingEstimateSchema,
  habits: z.array(personaHabitCandidateSchema).max(200),
  unsupportedDomains: z.array(z.enum(["expressiveness", "draft_typo_rate", "motor_misclick_rate"])).min(1),
  actionAuthority: z.literal("none"),
  candidateHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type PersonaCandidate = z.infer<typeof personaCandidateSchema>;

export const personaCandidateReviewSchema = z.object({
  reviewId: z.string().uuid(),
  candidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  ownerId: z.string().min(1).max(200),
  localTransport: z.literal(true),
  interactiveOwnerPresent: z.literal(true),
  reviewedAt: z.string().datetime(),
  traitOverrides: z.record(personaTraitNameSchema, signedUnitSchema).default({}),
  approvedHabitIds: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)).max(200),
  reason: z.string().min(1).max(1_000),
  modelMayApprove: z.literal(false),
}).strict();
export type PersonaCandidateReview = z.infer<typeof personaCandidateReviewSchema>;

export const personaEvaluationSchema = z.object({
  contractVersion: z.literal(1),
  trainingCandidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  heldOutCandidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  trainingEpisodeCount: z.number().int().min(2),
  heldOutEpisodeCount: z.number().int().min(2),
  maximumTraitDelta: z.number().finite().min(0).max(2),
  meanTraitDelta: z.number().finite().min(0).max(2),
  habitPrecision: unitIntervalSchema,
  habitRecall: unitIntervalSchema,
  medianTimingRatio: z.number().finite().positive(),
  stableEnoughForOwnerReview: z.boolean(),
  reasons: z.array(z.string().min(1).max(300)).min(1).max(20),
  actionAuthority: z.literal("none"),
}).strict();
export type PersonaEvaluation = z.infer<typeof personaEvaluationSchema>;

export function derivePersonaCandidate(input: {
  ownerId: string;
  operatorId: string;
  candidateId: string;
  demonstrations: ProcessedDemonstration[];
  derivedAt?: string;
  minimumHabitEvidence?: number;
}): PersonaCandidate {
  if (!input.ownerId.trim() || !input.operatorId.trim()) throw new Error("Owner and operator identities are required.");
  const expectedOperatorIdHash = sha256Canonical({ operatorId: input.operatorId });
  const episodes = input.demonstrations
    .map((item) => processedDemonstrationSchema.parse(structuredClone(item)))
    .filter((episode) => episode.successful)
    .sort((left, right) => left.sourceEpisodeId.localeCompare(right.sourceEpisodeId));
  const unique = new Set(episodes.map((episode) => episode.sourceEpisodeId));
  if (unique.size !== episodes.length) throw new Error("Persona derivation contains duplicate source episodes.");
  if (episodes.length < 2) throw new Error("Persona derivation requires at least two successful episodes.");
  if (episodes.some((episode) => episode.operatorIdHash !== expectedOperatorIdHash)) {
    throw new Error("Persona derivation cannot mix operators or use an unverified operator identity.");
  }
  const steps = episodes.flatMap((episode) => episode.steps.map((step) => ({ episode, step })));
  if (steps.length < 5) throw new Error("Persona derivation requires at least five processed steps.");
  const sourceEpisodeIds = episodes.map((episode) => episode.sourceEpisodeId);
  const sourceEpisodeHashes = episodes.map((episode) => episode.sourceEpisodeHash);
  const delays = steps.map(({ step }) => step.action.delayMs).sort((left, right) => left - right);
  const methodRate = (method: string) => ratio(steps.filter(({ step }) => step.action.method === method).length, steps.length);
  const labelRate = (label: string) => ratio(steps.filter(({ step }) => step.label === label).length, steps.length);
  const reasonRate = ratio(steps.filter(({ step }) => Boolean(step.action.reason)).length, steps.length);
  const longExpectedRate = ratio(steps.filter(({ step }) => step.action.expectedResult.length >= 40).length, steps.length);
  const meanDelay = delays.reduce((sum, value) => sum + value, 0) / delays.length;
  const delayPatience = clampSigned((Math.log10(Math.max(100, meanDelay)) - 3) / 1.5);
  const traitInputs: Record<PersonaTraitName, { value: number; confidence: number; evidenceCount: number; rationale: string }> = {
    cautiousness: {
      value: clampSigned((labelRate("correction") + methodRate("wait") + reasonRate) * 1.5 - 0.5),
      confidence: confidenceFromCount(steps.length), evidenceCount: steps.length,
      rationale: "Estimated from correction, wait, and explicit-reason frequencies.",
    },
    patience: {
      value: delayPatience,
      confidence: confidenceFromCount(delays.length), evidenceCount: delays.length,
      rationale: "Estimated from the observed action-delay distribution.",
    },
    exploration: {
      value: clampSigned((labelRate("exploration") + labelRate("changed_mind")) * 3 - 0.5),
      confidence: confidenceFromCount(steps.length), evidenceCount: steps.length,
      rationale: "Estimated from explicitly annotated exploration and changed-mind steps.",
    },
    directness: {
      value: clampSigned((methodRate("semantic") + methodRate("keyboard") - methodRate("mixed") - methodRate("mouse")) * 1.5),
      confidence: confidenceFromCount(steps.length), evidenceCount: steps.length,
      rationale: "Estimated from semantic/keyboard preference relative to mouse/mixed methods.",
    },
    expressiveness: {
      value: 0,
      confidence: 0,
      evidenceCount: 0,
      rationale: "Action demonstrations do not provide sufficient language evidence for expressiveness.",
    },
    thoroughness: {
      value: clampSigned((reasonRate + longExpectedRate + labelRate("correction")) * 1.4 - 0.6),
      confidence: confidenceFromCount(steps.length), evidenceCount: steps.length,
      rationale: "Estimated from explicit reasons, detailed expected results, and correction behavior.",
    },
  };
  const traits = personaTraitNameSchema.options.map((trait) => personaTraitEstimateSchema.parse({
    trait,
    ...traitInputs[trait],
    sourceEpisodeIds: traitInputs[trait].evidenceCount > 0 ? sourceEpisodeIds : [],
  }));
  const minimumHabitEvidence = input.minimumHabitEvidence ?? 2;
  if (!Number.isInteger(minimumHabitEvidence) || minimumHabitEvidence < 2 || minimumHabitEvidence > 1_000) {
    throw new Error("minimumHabitEvidence must be from 2 through 1000.");
  }
  const habits = deriveHabits(episodes, minimumHabitEvidence);
  const timing = personaTimingEstimateSchema.parse({
    sampleCount: delays.length,
    minimumObservedMs: delays[0],
    medianObservedMs: quantile(delays, 0.5),
    p90ObservedMs: quantile(delays, 0.9),
    maximumObservedMs: delays.at(-1),
    meanObservedMs: meanDelay,
    sourceEpisodeIds,
  });
  const core = {
    contractVersion: 1 as const,
    derivationVersion: DERIVATION_VERSION,
    candidateId: input.candidateId,
    ownerId: input.ownerId,
    operatorIdHash: expectedOperatorIdHash,
    derivedAt: input.derivedAt ?? new Date().toISOString(),
    sourceEpisodeIds,
    sourceEpisodeHashes,
    successfulEpisodeCount: episodes.length,
    stepCount: steps.length,
    traits,
    timing,
    habits,
    unsupportedDomains: ["expressiveness", "draft_typo_rate", "motor_misclick_rate"] as const,
    actionAuthority: "none" as const,
  };
  return personaCandidateSchema.parse({ ...core, candidateHash: sha256Canonical(core) });
}

export function promotePersonaCandidate(input: {
  candidate: PersonaCandidate;
  review: PersonaCandidateReview;
  profileId: string;
  version: number;
  supersedesVersion?: number;
}): PersonaProfile {
  const candidate = personaCandidateSchema.parse(structuredClone(input.candidate));
  const { candidateHash: _candidateHash, ...candidateCore } = candidate;
  if (sha256Canonical(candidateCore) !== candidate.candidateHash) throw new Error("Persona candidate integrity verification failed.");
  const review = personaCandidateReviewSchema.parse(structuredClone(input.review));
  if (review.candidateHash !== candidate.candidateHash || review.ownerId !== candidate.ownerId) {
    throw new Error("Persona candidate review is not bound to this owner and candidate.");
  }
  const approvedHabitIds = new Set(review.approvedHabitIds);
  if ([...approvedHabitIds].some((habitId) => !candidate.habits.some((habit) => habit.habitId === habitId))) {
    throw new Error("Owner review references an unsupported habit candidate.");
  }
  const traitValues = Object.fromEntries(candidate.traits.map((estimate) => [estimate.trait, estimate.value])) as Record<PersonaTraitName, number>;
  for (const [trait, value] of Object.entries(review.traitOverrides)) traitValues[trait as PersonaTraitName] = value;
  const median = Math.round(candidate.timing.medianObservedMs);
  const p90 = Math.round(candidate.timing.p90ObservedMs);
  return createPersonaProfile({
    contractVersion: 1,
    profileId: input.profileId,
    ownerId: candidate.ownerId,
    version: input.version,
    ...(input.supersedesVersion !== undefined ? { supersedesVersion: input.supersedesVersion } : {}),
    createdAt: review.reviewedAt,
    status: "evaluating",
    ownerApproved: false,
    traits: traitValues,
    timing: {
      minimumThinkingMs: Math.max(0, Math.min(median, Math.round(candidate.timing.minimumObservedMs))),
      maximumThinkingMs: Math.max(50, Math.min(300_000, Math.max(p90 * 2, median + 50))),
      baseReactionMs: Math.max(50, Math.min(30_000, median)),
      readingMsPer100Characters: Math.max(50, Math.min(60_000, median)),
      uncertaintyMultiplier: 1.75,
      riskMultiplier: 1.75,
      familiarityDiscount: 0.8,
      urgencyDiscount: 0.75,
      deterministicVariationFraction: 0.1,
    },
    imperfection: {
      strategy: "observed_distribution_only",
      purpose: "personalization_not_evasion",
      maximumDraftTypoProbability: 0,
      maximumDraftMisclickProbability: 0,
      maximumImperfectionsPerActionChunk: 0,
      immediateCorrectionRequired: true,
      suppressAtOrAboveRisk: "medium",
      suppressDuringFinalSubmission: true,
    },
    habits: candidate.habits
      .filter((habit) => approvedHabitIds.has(habit.habitId))
      .map((habit) => ({
        habitId: habit.habitId,
        description: habit.description,
        confidence: habit.confidence,
        evidenceCount: habit.evidenceCount,
        lastObservedAt: habit.lastObservedAt,
      })),
  });
}

export function evaluatePersonaStability(training: PersonaCandidate, heldOut: PersonaCandidate): PersonaEvaluation {
  const left = personaCandidateSchema.parse(structuredClone(training));
  const right = personaCandidateSchema.parse(structuredClone(heldOut));
  if (left.ownerId !== right.ownerId || left.operatorIdHash !== right.operatorIdHash) {
    throw new Error("Persona stability evaluation cannot cross owner/operator identity.");
  }
  const deltas = personaTraitNameSchema.options.map((trait) => {
    const a = left.traits.find((item) => item.trait === trait)!.value;
    const b = right.traits.find((item) => item.trait === trait)!.value;
    return Math.abs(a - b);
  });
  const leftHabits = new Set(left.habits.map((habit) => habit.habitId));
  const rightHabits = new Set(right.habits.map((habit) => habit.habitId));
  const intersection = [...leftHabits].filter((habit) => rightHabits.has(habit)).length;
  const precision = leftHabits.size === 0 ? (rightHabits.size === 0 ? 1 : 0) : intersection / leftHabits.size;
  const recall = rightHabits.size === 0 ? (leftHabits.size === 0 ? 1 : 0) : intersection / rightHabits.size;
  const medianTimingRatio = Math.max(left.timing.medianObservedMs, right.timing.medianObservedMs)
    / Math.max(1, Math.min(left.timing.medianObservedMs, right.timing.medianObservedMs));
  const maximumTraitDelta = Math.max(...deltas);
  const meanTraitDelta = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  const reasons: string[] = [];
  if (maximumTraitDelta > 0.5) reasons.push("At least one trait differs by more than 0.5 between training and held-out evidence.");
  if (meanTraitDelta > 0.3) reasons.push("Mean trait drift exceeds 0.3.");
  if (precision < 0.5 || recall < 0.5) reasons.push("Evidence-backed habit overlap is below 0.5 precision or recall.");
  if (medianTimingRatio > 2) reasons.push("Median timing differs by more than 2x.");
  if (reasons.length === 0) reasons.push("Candidate behavior is stable enough to present for owner review; no promotion is automatic.");
  return personaEvaluationSchema.parse({
    contractVersion: 1,
    trainingCandidateHash: left.candidateHash,
    heldOutCandidateHash: right.candidateHash,
    trainingEpisodeCount: left.successfulEpisodeCount,
    heldOutEpisodeCount: right.successfulEpisodeCount,
    maximumTraitDelta,
    meanTraitDelta,
    habitPrecision: precision,
    habitRecall: recall,
    medianTimingRatio,
    stableEnoughForOwnerReview: maximumTraitDelta <= 0.5 && meanTraitDelta <= 0.3 && precision >= 0.5 && recall >= 0.5 && medianTimingRatio <= 2,
    reasons,
    actionAuthority: "none",
  });
}

function deriveHabits(episodes: ProcessedDemonstration[], minimumEvidence: number): PersonaHabitCandidate[] {
  const observations = new Map<string, { count: number; episodeIds: Set<string>; lastObservedAt: string }>();
  for (const episode of episodes) {
    for (const step of episode.steps) {
      if (!["preferred", "correction"].includes(step.label)) continue;
      for (const feature of step.features.filter((value) => /^habit:[a-z0-9][a-z0-9-]{0,79}$/.test(value))) {
        const existing = observations.get(feature) ?? { count: 0, episodeIds: new Set<string>(), lastObservedAt: episode.processedAt };
        existing.count += 1;
        existing.episodeIds.add(episode.sourceEpisodeId);
        if (episode.processedAt > existing.lastObservedAt) existing.lastObservedAt = episode.processedAt;
        observations.set(feature, existing);
      }
    }
  }
  return [...observations.entries()]
    .filter(([, value]) => value.count >= minimumEvidence && value.episodeIds.size >= 2)
    .map(([feature, value]) => {
      const habitId = feature.slice("habit:".length);
      return personaHabitCandidateSchema.parse({
        habitId,
        description: humanizeHabit(habitId),
        confidence: Math.min(0.95, 0.4 + Math.log10(value.count + 1) * 0.25 + Math.min(0.2, value.episodeIds.size * 0.04)),
        evidenceCount: value.count,
        sourceEpisodeIds: [...value.episodeIds].sort(),
        lastObservedAt: value.lastObservedAt,
        sourceFeature: feature,
      });
    })
    .sort((left, right) => right.evidenceCount - left.evidenceCount || left.habitId.localeCompare(right.habitId))
    .slice(0, 200);
}

function humanizeHabit(habitId: string): string {
  const words = habitId.split("-").join(" ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}

function confidenceFromCount(count: number): number {
  return Math.min(0.95, Math.max(0, Math.log10(count + 1) / 2));
}

function quantile(sorted: number[], value: number): number {
  const position = (sorted.length - 1) * value;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function ratio(value: number, total: number): number {
  return total === 0 ? 0 : value / total;
}

function clampSigned(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
