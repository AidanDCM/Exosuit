import { describe, expect, it } from "vitest";
import { createPersonaProfile, planPersonaBehavior } from "../src/personaBehavior.js";
import {
  adviseMotorPreference,
  adviseTypingProcess,
  fitMotorPreferenceModel,
  fitTypingProcessModel,
  motorPreferenceModelSchema,
  typingProcessModelSchema,
} from "../src/personalBehaviorModels.js";

const profile = createPersonaProfile({
  contractVersion: 1,
  profileId: "11111111-1111-4111-8111-111111111111",
  ownerId: "owner-a",
  version: 1,
  createdAt: "2026-08-04T00:00:00.000Z",
  status: "approved",
  ownerApproved: true,
  traits: { cautiousness: 0.2, patience: 0.1, exploration: 0, directness: 0.3, expressiveness: 0, thoroughness: 0.4 },
  timing: {
    minimumThinkingMs: 100,
    maximumThinkingMs: 10_000,
    baseReactionMs: 400,
    readingMsPer100Characters: 800,
    uncertaintyMultiplier: 1.5,
    riskMultiplier: 1.5,
    familiarityDiscount: 0.8,
    urgencyDiscount: 0.75,
    deterministicVariationFraction: 0,
  },
  imperfection: {
    strategy: "observed_distribution_only",
    purpose: "personalization_not_evasion",
    maximumDraftTypoProbability: 0.08,
    maximumDraftMisclickProbability: 0.03,
    maximumImperfectionsPerActionChunk: 1,
    immediateCorrectionRequired: true,
    suppressAtOrAboveRisk: "medium",
    suppressDuringFinalSubmission: true,
  },
  habits: [],
});

function plan(risk: "low" | "medium" = "low", taskStage: "drafting" | "committing" = "drafting") {
  return planPersonaBehavior(profile, {
    contextId: `${risk}-${taskStage}`,
    mode: "pilot",
    taskStage,
    declaredRisk: risk,
    complexity: 0.4,
    familiarity: 0.6,
    uncertainty: 0.2,
    urgency: 0.1,
    targetDifficulty: 0.8,
    contentCharacters: 120,
    systemReady: true,
    recoveringFromError: false,
    identitySensitiveCommunication: false,
    externalCommitment: false,
    financialOrLegalEffect: false,
    destructiveEffect: false,
    humanVerificationRequired: false,
    deterministicSeed: "seed",
  });
}

function typingObservations() {
  return Array.from({ length: 6 }, (_, index) => ({
    observationId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    sourceEpisodeId: index < 3 ? "20000000-0000-4000-8000-000000000001" : "20000000-0000-4000-8000-000000000002",
    observedAt: `2026-08-04T00:00:0${index}.000Z`,
    stage: "drafting" as const,
    risk: "low" as const,
    protectedField: false as const,
    finalTextMatchedIntent: true as const,
    submittedExternally: false as const,
    characterCount: 100,
    durationMs: 10_000 + index * 100,
    pauseDurationsMs: [200 + index, 500 + index],
    typoCount: 2,
    correctionCount: 2,
    backspaceCount: 3,
    immediateCorrectionCount: 2,
  }));
}

function motorObservations() {
  return Array.from({ length: 6 }, (_, index) => ({
    observationId: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    sourceEpisodeId: index < 3 ? "40000000-0000-4000-8000-000000000001" : "40000000-0000-4000-8000-000000000002",
    observedAt: `2026-08-04T00:01:0${index}.000Z`,
    stage: "drafting" as const,
    risk: "low" as const,
    protectedTarget: false as const,
    externalCommitment: false as const,
    destructiveEffect: false as const,
    targetDifficulty: index < 3 ? 0.2 : 0.8,
    straightLineDistancePx: 400,
    pathLengthPx: 440 + index * 5,
    durationMs: index < 3 ? 800 : 1_000,
    correctionCount: 1,
    missCount: index === 5 ? 1 : 0,
    recoveredImmediately: true,
    resultVerified: true as const,
  }));
}

describe("observed typing process model", () => {
  it("fits only low-risk drafting observations with provenance and integrity", () => {
    const model = fitTypingProcessModel({
      ownerId: profile.ownerId,
      profileId: profile.profileId,
      profileVersion: profile.version,
      observations: typingObservations(),
      trainedAt: "2026-08-04T03:00:00.000Z",
    });
    expect(typingProcessModelSchema.parse(model)).toEqual(model);
    expect(model.sourceEpisodeIds).toHaveLength(2);
    expect(model.observationCount).toBe(6);
    expect(model.maximumDraftTypoProbability).toBeLessThanOrEqual(0.15);
    expect(model.actionAuthority).toBe("none");
  });

  it("returns advice without producing text or key events and suppresses non-low-risk errors", () => {
    const model = fitTypingProcessModel({ ownerId: profile.ownerId, profileId: profile.profileId, profileVersion: 1, observations: typingObservations() });
    const low = adviseTypingProcess({ model, behaviorPlan: plan("low", "drafting"), contentCharacters: 200 });
    expect(low.typoProcessEligible).toBe(true);
    expect(low.typoProbabilityCeiling).toBeLessThanOrEqual(0.08);
    expect(low.producesText).toBe(false);
    expect(low.producesKeyEvents).toBe(false);
    expect(adviseTypingProcess({ model, behaviorPlan: plan("medium", "drafting"), contentCharacters: 200 }).typoProcessEligible).toBe(false);
    expect(adviseTypingProcess({ model, behaviorPlan: plan("low", "committing"), contentCharacters: 200 }).typoProcessEligible).toBe(false);
  });

  it("rejects duplicate, protected, submitted, and insufficient corpora", () => {
    const observations = typingObservations();
    expect(() => fitTypingProcessModel({ ownerId: profile.ownerId, profileId: profile.profileId, profileVersion: 1, observations: observations.slice(0, 4) }))
      .toThrow(/at least five/i);
    expect(() => fitTypingProcessModel({ ownerId: profile.ownerId, profileId: profile.profileId, profileVersion: 1, observations: [...observations.slice(0, 5), observations[0]!] }))
      .toThrow(/duplicate/i);
    expect(() => fitTypingProcessModel({
      ownerId: profile.ownerId,
      profileId: profile.profileId,
      profileVersion: 1,
      observations: observations.map((item, index) => index === 0 ? { ...item, protectedField: true as never } : item),
    })).toThrow();
  });
});

describe("observed motor preference model", () => {
  it("fits verified low-risk movement preferences without physical-input authority", () => {
    const model = fitMotorPreferenceModel({
      ownerId: profile.ownerId,
      profileId: profile.profileId,
      profileVersion: 1,
      observations: motorObservations(),
      trainedAt: "2026-08-04T03:00:00.000Z",
    });
    expect(motorPreferenceModelSchema.parse(model)).toEqual(model);
    expect(model.sourceEpisodeIds).toHaveLength(2);
    expect(model.observedMissProbability).toBeLessThanOrEqual(0.05);
    expect(model.physicalInputAuthority).toBe("none");
  });

  it("returns preference advice without coordinates or input events", () => {
    const model = fitMotorPreferenceModel({ ownerId: profile.ownerId, profileId: profile.profileId, profileVersion: 1, observations: motorObservations() });
    const low = adviseMotorPreference({ model, behaviorPlan: plan("low", "drafting"), targetDifficulty: 0.9 });
    expect(low.correctionProcessEligible).toBe(true);
    expect(low.misclickProcessEligible).toBe(true);
    expect(low.misclickProbabilityCeiling).toBeLessThanOrEqual(0.03);
    expect(low.producesCoordinates).toBe(false);
    expect(low.producesInputEvents).toBe(false);
    expect(low.physicalInputAuthority).toBe("none");
    expect(adviseMotorPreference({ model, behaviorPlan: plan("medium", "drafting"), targetDifficulty: 0.9 }).misclickProcessEligible).toBe(false);
  });

  it("rejects impossible paths and unrecovered misses", () => {
    const observations = motorObservations();
    expect(() => fitMotorPreferenceModel({
      ownerId: profile.ownerId,
      profileId: profile.profileId,
      profileVersion: 1,
      observations: observations.map((item, index) => index === 0 ? { ...item, pathLengthPx: 10 } : item),
    })).toThrow(/shorter/i);
    expect(() => fitMotorPreferenceModel({
      ownerId: profile.ownerId,
      profileId: profile.profileId,
      profileVersion: 1,
      observations: observations.map((item, index) => index === 5 ? { ...item, recoveredImmediately: false } : item),
    })).toThrow(/immediately recovered/i);
  });
});
