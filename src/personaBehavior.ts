import { z } from "zod";
import { sha256Canonical } from "./fieldContracts.js";

const unitIntervalSchema = z.number().finite().min(0).max(1);
const signedUnitSchema = z.number().finite().min(-1).max(1);

export type PersonaStatus = "draft" | "evaluating" | "approved" | "retired";
export const personaStatusSchema = z.enum(["draft", "evaluating", "approved", "retired"]);
export type BehavioralState = "focused" | "casual" | "rushed" | "uncertain" | "exploring" | "reading" | "waiting_for_system" | "recovering_from_error" | "careful";
export const behavioralStateSchema = z.enum([
  "focused",
  "casual",
  "rushed",
  "uncertain",
  "exploring",
  "reading",
  "waiting_for_system",
  "recovering_from_error",
  "careful",
]);
export type BehavioralRisk = "low" | "medium" | "high" | "consequential";
export const behavioralRiskSchema = z.enum(["low", "medium", "high", "consequential"]);
export type BehavioralTaskStage = "drafting" | "reviewing" | "committing";
export const behavioralTaskStageSchema = z.enum(["drafting", "reviewing", "committing"]);
export type BehavioralOperatingMode = "teach" | "shadow" | "correction" | "assisted" | "pilot";
export const behavioralOperatingModeSchema = z.enum(["teach", "shadow", "correction", "assisted", "pilot"]);

export const personaTraitNameSchema = z.enum([
  "cautiousness",
  "patience",
  "exploration",
  "directness",
  "expressiveness",
  "thoroughness",
]);
export type PersonaTraitName = z.infer<typeof personaTraitNameSchema>;

export const personaTraitsSchema = z.object({
  cautiousness: signedUnitSchema,
  patience: signedUnitSchema,
  exploration: signedUnitSchema,
  directness: signedUnitSchema,
  expressiveness: signedUnitSchema,
  thoroughness: signedUnitSchema,
}).strict();
export type PersonaTraits = z.infer<typeof personaTraitsSchema>;

export const personaHabitSchema = z.object({
  habitId: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  confidence: unitIntervalSchema,
  evidenceCount: z.number().int().nonnegative().max(1_000_000),
  lastObservedAt: z.string().datetime(),
}).strict();
export type PersonaHabit = z.infer<typeof personaHabitSchema>;

export const personaTimingProfileSchema = z.object({
  minimumThinkingMs: z.number().int().min(0).max(60_000),
  maximumThinkingMs: z.number().int().min(50).max(300_000),
  baseReactionMs: z.number().int().min(50).max(30_000),
  readingMsPer100Characters: z.number().int().min(50).max(60_000),
  uncertaintyMultiplier: z.number().finite().min(1).max(5),
  riskMultiplier: z.number().finite().min(1).max(5),
  familiarityDiscount: z.number().finite().min(0.25).max(1),
  urgencyDiscount: z.number().finite().min(0.5).max(1),
  deterministicVariationFraction: z.number().finite().min(0).max(0.35),
}).strict().superRefine((timing: {
  minimumThinkingMs: number; maximumThinkingMs: number; baseReactionMs: number;
}, context: z.RefinementCtx) => {
  if (timing.maximumThinkingMs <= timing.minimumThinkingMs) {
    context.addIssue({
      code: "custom",
      path: ["maximumThinkingMs"],
      message: "Maximum thinking time must exceed minimum thinking time.",
    });
  }
  if (timing.baseReactionMs > timing.maximumThinkingMs) {
    context.addIssue({
      code: "custom",
      path: ["baseReactionMs"],
      message: "Base reaction time cannot exceed maximum thinking time.",
    });
  }
});
export type PersonaTimingProfile = z.infer<typeof personaTimingProfileSchema>;

export const personaImperfectionPolicySchema = z.object({
  strategy: z.literal("observed_distribution_only"),
  purpose: z.literal("personalization_not_evasion"),
  maximumDraftTypoProbability: z.number().finite().min(0).max(0.15),
  maximumDraftMisclickProbability: z.number().finite().min(0).max(0.05),
  maximumImperfectionsPerActionChunk: z.number().int().min(0).max(1),
  immediateCorrectionRequired: z.literal(true),
  suppressAtOrAboveRisk: z.enum(["medium", "high", "consequential"]),
  suppressDuringFinalSubmission: z.literal(true),
}).strict();
export type PersonaImperfectionPolicy = z.infer<typeof personaImperfectionPolicySchema>;

const personaProfileFields = {
  contractVersion: z.literal(1),
  profileId: z.string().uuid(),
  ownerId: z.string().min(1).max(200),
  version: z.number().int().positive(),
  supersedesVersion: z.number().int().positive().optional(),
  createdAt: z.string().datetime(),
  status: personaStatusSchema,
  ownerApproved: z.boolean(),
  traits: personaTraitsSchema,
  timing: personaTimingProfileSchema,
  imperfection: personaImperfectionPolicySchema,
  habits: z.array(personaHabitSchema).max(200),
} as const;

function refinePersonaProfile(profile: {
  version: number;
  supersedesVersion?: number;
  status: PersonaStatus;
  ownerApproved: boolean;
  habits: PersonaHabit[];
}, context: z.RefinementCtx): void {
  if (profile.version === 1 && profile.supersedesVersion !== undefined) {
    context.addIssue({ code: "custom", path: ["supersedesVersion"], message: "Version 1 cannot supersede an earlier profile." });
  }
  if (profile.version > 1 && profile.supersedesVersion !== profile.version - 1) {
    context.addIssue({
      code: "custom",
      path: ["supersedesVersion"],
      message: "Persona versions must advance one reviewed version at a time.",
    });
  }
  if (profile.status === "approved" && !profile.ownerApproved) {
    context.addIssue({ code: "custom", path: ["ownerApproved"], message: "An approved persona requires explicit owner approval." });
  }
  const habitIds = profile.habits.map((habit) => habit.habitId);
  if (new Set(habitIds).size !== habitIds.length) {
    context.addIssue({ code: "custom", path: ["habits"], message: "Persona habit IDs must be unique." });
  }
}

const personaProfileCoreSchema = z.object(personaProfileFields).strict().superRefine(refinePersonaProfile);

export const personaProfileSchema = z.object({
  ...personaProfileFields,
  profileHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine(refinePersonaProfile);
export type PersonaProfile = z.infer<typeof personaProfileSchema>;

export const personaBehaviorContextSchema = z.object({
  contextId: z.string().min(1).max(200),
  mode: behavioralOperatingModeSchema,
  taskStage: behavioralTaskStageSchema,
  declaredRisk: behavioralRiskSchema,
  complexity: unitIntervalSchema,
  familiarity: unitIntervalSchema,
  uncertainty: unitIntervalSchema,
  urgency: unitIntervalSchema,
  targetDifficulty: unitIntervalSchema,
  contentCharacters: z.number().int().nonnegative().max(1_000_000),
  systemReady: z.boolean(),
  recoveringFromError: z.boolean().default(false),
  identitySensitiveCommunication: z.boolean().default(false),
  externalCommitment: z.boolean().default(false),
  financialOrLegalEffect: z.boolean().default(false),
  destructiveEffect: z.boolean().default(false),
  humanVerificationRequired: z.boolean().default(false),
  deterministicSeed: z.string().min(1).max(300),
}).strict();
export type PersonaBehaviorContext = z.infer<typeof personaBehaviorContextSchema>;

export const personaBehaviorPlanSchema = z.object({
  contractVersion: z.literal(1),
  profileId: z.string().uuid(),
  profileVersion: z.number().int().positive(),
  profileHash: z.string().regex(/^[a-f0-9]{64}$/),
  contextId: z.string().min(1).max(200),
  effectiveRisk: behavioralRiskSchema,
  state: behavioralStateSchema,
  thinkingDelayMs: z.number().int().nonnegative().max(300_000),
  motorSpeedScale: z.number().finite().min(0.25).max(2),
  verificationIntensity: z.number().finite().min(0).max(1),
  abstain: z.boolean(),
  ownerReviewRequired: z.boolean(),
  disclosureRequired: z.boolean(),
  imperfectionAllowance: z.object({
    typoProcessEligible: z.boolean(),
    misclickProcessEligible: z.boolean(),
    maximumImperfections: z.number().int().min(0).max(1),
    typoProbabilityCeiling: z.number().finite().min(0).max(0.15),
    misclickProbabilityCeiling: z.number().finite().min(0).max(0.05),
    immediateCorrectionRequired: z.literal(true),
    observedDistributionOnly: z.literal(true),
    purpose: z.literal("personalization_not_evasion"),
  }).strict(),
  reasons: z.array(z.string().min(1).max(200)).min(1).max(20),
  actionAuthority: z.literal("none"),
}).strict();
export type PersonaBehaviorPlan = z.infer<typeof personaBehaviorPlanSchema>;

export const personaDriftReportSchema = z.object({
  profileId: z.string().uuid(),
  previousVersion: z.number().int().positive(),
  nextVersion: z.number().int().positive(),
  maximumTraitDelta: z.number().finite().nonnegative().max(2),
  highDriftTraits: z.array(personaTraitNameSchema).max(6),
  timingDriftRatio: z.number().finite().nonnegative(),
  addedHabitIds: z.array(z.string()).max(200),
  removedHabitIds: z.array(z.string()).max(200),
  requiresOwnerApproval: z.boolean(),
  promotionAllowed: z.boolean(),
  actionAuthority: z.literal("none"),
}).strict();
export type PersonaDriftReport = z.infer<typeof personaDriftReportSchema>;

export function createPersonaProfile(input: z.input<typeof personaProfileCoreSchema>): PersonaProfile {
  const core = personaProfileCoreSchema.parse(input);
  return personaProfileSchema.parse({ ...core, profileHash: sha256Canonical(core) });
}

export function verifyPersonaProfile(profile: PersonaProfile): boolean {
  const parsed = personaProfileSchema.parse(profile);
  const { profileHash, ...core } = parsed;
  return profileHash === sha256Canonical(core);
}

export function planPersonaBehavior(profileInput: PersonaProfile, contextInput: PersonaBehaviorContext): PersonaBehaviorPlan {
  const profile = personaProfileSchema.parse(profileInput);
  if (!verifyPersonaProfile(profile)) throw new Error("Persona profile failed integrity verification.");
  const context = personaBehaviorContextSchema.parse(contextInput);
  if ((context.mode === "assisted" || context.mode === "pilot") && (profile.status !== "approved" || !profile.ownerApproved)) {
    throw new Error("Assisted and Pilot behavior require an owner-approved persona profile.");
  }

  const effectiveRisk = escalateRisk(context);
  const state = selectBehavioralState(profile, context, effectiveRisk);
  const variation = deterministicSignedVariation(profile.profileHash, context.deterministicSeed, context.contextId);
  const thinkingDelayMs = computeThinkingDelay(profile, context, effectiveRisk, state, variation);
  const verificationIntensity = computeVerificationIntensity(profile, context, effectiveRisk);
  const abstain = !context.systemReady || context.humanVerificationRequired || context.uncertainty >= 0.95;
  const ownerReviewRequired = context.identitySensitiveCommunication
    || context.externalCommitment
    || effectiveRisk === "high"
    || effectiveRisk === "consequential";
  const disclosureRequired = context.identitySensitiveCommunication || context.externalCommitment;
  const imperfectionAllowance = computeImperfectionAllowance(profile, context, effectiveRisk, abstain);
  const motorSpeedScale = computeMotorSpeedScale(profile, context, effectiveRisk, state);
  const reasons = buildReasons(context, effectiveRisk, state, abstain, ownerReviewRequired, imperfectionAllowance.maximumImperfections);

  return personaBehaviorPlanSchema.parse({
    contractVersion: 1,
    profileId: profile.profileId,
    profileVersion: profile.version,
    profileHash: profile.profileHash,
    contextId: context.contextId,
    effectiveRisk,
    state,
    thinkingDelayMs,
    motorSpeedScale,
    verificationIntensity,
    abstain,
    ownerReviewRequired,
    disclosureRequired,
    imperfectionAllowance,
    reasons,
    actionAuthority: "none",
  });
}

export function comparePersonaProfiles(previousInput: PersonaProfile, nextInput: PersonaProfile): PersonaDriftReport {
  const previous = personaProfileSchema.parse(previousInput);
  const next = personaProfileSchema.parse(nextInput);
  if (!verifyPersonaProfile(previous) || !verifyPersonaProfile(next)) {
    throw new Error("Persona drift comparison requires integrity-valid profiles.");
  }
  if (previous.profileId !== next.profileId || previous.ownerId !== next.ownerId) {
    throw new Error("Persona drift comparison cannot cross profile or owner identity.");
  }
  if (next.version !== previous.version + 1 || next.supersedesVersion !== previous.version) {
    throw new Error("Persona drift comparison requires consecutive reviewed versions.");
  }

  const traitNames = Object.keys(previous.traits) as Array<keyof PersonaTraits>;
  const traitDeltas = traitNames.map((trait) => ({ trait, delta: Math.abs(next.traits[trait] - previous.traits[trait]) }));
  const maximumTraitDelta = Math.max(...traitDeltas.map(({ delta }) => delta), 0);
  const highDriftTraits = traitDeltas.filter(({ delta }) => delta > 0.25).map(({ trait }) => trait);
  const timingDriftRatio = maximumTimingDriftRatio(previous.timing, next.timing);
  const previousHabitIds = new Set(previous.habits.map((habit: PersonaHabit) => habit.habitId));
  const nextHabitIds = new Set(next.habits.map((habit: PersonaHabit) => habit.habitId));
  const addedHabitIds = [...nextHabitIds].filter((habitId) => !previousHabitIds.has(habitId)).sort();
  const removedHabitIds = [...previousHabitIds].filter((habitId) => !nextHabitIds.has(habitId)).sort();
  const requiresOwnerApproval = highDriftTraits.length > 0 || timingDriftRatio > 0.5 || removedHabitIds.length > 0;
  const promotionAllowed = next.status === "approved" && next.ownerApproved;

  return personaDriftReportSchema.parse({
    profileId: previous.profileId,
    previousVersion: previous.version,
    nextVersion: next.version,
    maximumTraitDelta,
    highDriftTraits,
    timingDriftRatio,
    addedHabitIds,
    removedHabitIds,
    requiresOwnerApproval,
    promotionAllowed,
    actionAuthority: "none",
  });
}

function escalateRisk(context: PersonaBehaviorContext): BehavioralRisk {
  let rank = riskRank(context.declaredRisk);
  if (context.identitySensitiveCommunication) rank = Math.max(rank, riskRank("high"));
  if (context.externalCommitment || context.financialOrLegalEffect || context.destructiveEffect || context.humanVerificationRequired) {
    rank = riskRank("consequential");
  }
  return riskFromRank(rank);
}

function selectBehavioralState(
  profile: PersonaProfile,
  context: PersonaBehaviorContext,
  effectiveRisk: BehavioralRisk,
): BehavioralState {
  if (!context.systemReady) return "waiting_for_system";
  if (context.recoveringFromError) return "recovering_from_error";
  if (effectiveRisk === "high" || effectiveRisk === "consequential") return "careful";
  if (context.uncertainty >= 0.65) return "uncertain";
  if (context.contentCharacters >= 500 && context.taskStage !== "committing") return "reading";
  if (context.familiarity <= 0.3 || profile.traits.exploration >= 0.6) return "exploring";
  if (context.urgency >= 0.8) return "rushed";
  if (profile.traits.patience < -0.4 && profile.traits.thoroughness < -0.4) return "casual";
  return "focused";
}

function computeThinkingDelay(
  profile: PersonaProfile,
  context: PersonaBehaviorContext,
  effectiveRisk: BehavioralRisk,
  state: BehavioralState,
  variation: number,
): number {
  const timing = profile.timing;
  const readingMs = (context.contentCharacters / 100) * timing.readingMsPer100Characters;
  const complexityFactor = 1 + context.complexity * 1.5;
  const uncertaintyFactor = 1 + context.uncertainty * (timing.uncertaintyMultiplier - 1);
  const riskFactor = 1 + (riskRank(effectiveRisk) / 3) * (timing.riskMultiplier - 1);
  const familiarityFactor = 1 - context.familiarity * (1 - timing.familiarityDiscount);
  const urgencyFactor = 1 - context.urgency * (1 - timing.urgencyDiscount);
  const stateFactor = state === "careful" ? 1.2
    : state === "uncertain" ? 1.15
    : state === "reading" ? 1.1
    : state === "rushed" ? 0.85
    : state === "waiting_for_system" ? 0
    : 1;
  const variationFactor = 1 + variation * timing.deterministicVariationFraction;
  const raw = state === "waiting_for_system"
    ? 0
    : (timing.baseReactionMs + readingMs) * complexityFactor * uncertaintyFactor * riskFactor
      * familiarityFactor * urgencyFactor * stateFactor * variationFactor;
  if (state === "waiting_for_system") return 0;
  return Math.round(clamp(raw, timing.minimumThinkingMs, timing.maximumThinkingMs));
}

function computeVerificationIntensity(
  profile: PersonaProfile,
  context: PersonaBehaviorContext,
  effectiveRisk: BehavioralRisk,
): number {
  const traitContribution = (profile.traits.cautiousness + profile.traits.thoroughness + 2) / 4;
  const riskContribution = riskRank(effectiveRisk) / 3;
  const value = 0.2 + traitContribution * 0.25 + context.uncertainty * 0.25 + riskContribution * 0.3;
  return round(clamp(value, 0, 1), 4);
}

function computeMotorSpeedScale(
  profile: PersonaProfile,
  context: PersonaBehaviorContext,
  effectiveRisk: BehavioralRisk,
  state: BehavioralState,
): number {
  const familiarityBoost = context.familiarity * 0.35;
  const urgencyBoost = context.urgency * 0.25;
  const cautionPenalty = ((profile.traits.cautiousness + 1) / 2) * 0.25;
  const riskPenalty = (riskRank(effectiveRisk) / 3) * 0.35;
  const stateAdjustment = state === "rushed" ? 0.15 : state === "careful" || state === "uncertain" ? -0.15 : 0;
  return round(clamp(1 + familiarityBoost + urgencyBoost - cautionPenalty - riskPenalty + stateAdjustment, 0.25, 2), 4);
}

function computeImperfectionAllowance(
  profile: PersonaProfile,
  context: PersonaBehaviorContext,
  effectiveRisk: BehavioralRisk,
  abstain: boolean,
): PersonaBehaviorPlan["imperfectionAllowance"] {
  const threshold = riskRank(profile.imperfection.suppressAtOrAboveRisk);
  const riskSuppressed = riskRank(effectiveRisk) >= threshold;
  const stageSuppressed = context.taskStage !== "drafting" && profile.imperfection.suppressDuringFinalSubmission;
  const modeSuppressed = context.mode === "teach" || context.mode === "correction";
  const sensitiveSuppressed = context.identitySensitiveCommunication || context.externalCommitment
    || context.financialOrLegalEffect || context.destructiveEffect;
  const permitted = !abstain && !riskSuppressed && !stageSuppressed && !modeSuppressed && !sensitiveSuppressed
    && profile.imperfection.maximumImperfectionsPerActionChunk > 0;
  return {
    typoProcessEligible: permitted && profile.imperfection.maximumDraftTypoProbability > 0,
    misclickProcessEligible: permitted && profile.imperfection.maximumDraftMisclickProbability > 0
      && context.targetDifficulty >= 0.5,
    maximumImperfections: permitted ? profile.imperfection.maximumImperfectionsPerActionChunk : 0,
    typoProbabilityCeiling: permitted ? profile.imperfection.maximumDraftTypoProbability : 0,
    misclickProbabilityCeiling: permitted ? profile.imperfection.maximumDraftMisclickProbability : 0,
    immediateCorrectionRequired: true,
    observedDistributionOnly: true,
    purpose: "personalization_not_evasion",
  };
}

function buildReasons(
  context: PersonaBehaviorContext,
  effectiveRisk: BehavioralRisk,
  state: BehavioralState,
  abstain: boolean,
  ownerReviewRequired: boolean,
  maximumImperfections: number,
): string[] {
  const reasons = [`state:${state}`, `risk:${effectiveRisk}`];
  if (!context.systemReady) reasons.push("system_not_ready");
  if (context.humanVerificationRequired) reasons.push("human_verification_required");
  if (context.uncertainty >= 0.95) reasons.push("uncertainty_above_execution_ceiling");
  if (abstain) reasons.push("abstain");
  if (ownerReviewRequired) reasons.push("owner_review_required");
  reasons.push(maximumImperfections > 0 ? "bounded_low_risk_imperfection_eligible" : "imperfections_suppressed");
  return [...new Set(reasons)];
}

function maximumTimingDriftRatio(previous: PersonaTimingProfile, next: PersonaTimingProfile): number {
  const keys = Object.keys(previous) as Array<keyof PersonaTimingProfile>;
  return Math.max(...keys.map((key) => {
    const denominator = Math.max(Math.abs(previous[key]), Number.EPSILON);
    return Math.abs(next[key] - previous[key]) / denominator;
  }), 0);
}

function deterministicSignedVariation(profileHash: string, seed: string, contextId: string): number {
  const digest = sha256Canonical({ profileHash, seed, contextId });
  const integer = Number.parseInt(digest.slice(0, 13), 16);
  const unit = integer / 0x1fffffffffffff;
  return clamp(unit * 2 - 1, -1, 1);
}

function riskRank(risk: BehavioralRisk): number {
  return { low: 0, medium: 1, high: 2, consequential: 3 }[risk];
}

function riskFromRank(rank: number): BehavioralRisk {
  return (["low", "medium", "high", "consequential"] as const)[Math.max(0, Math.min(3, rank))]!;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
