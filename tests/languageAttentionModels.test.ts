import { describe, expect, it } from "vitest";
import { createPersonaProfile, planPersonaBehavior } from "../src/personaBehavior.js";
import {
  adviseAttention,
  adviseLanguageStyle,
  attentionVerificationModelSchema,
  fitAttentionVerificationModel,
  fitLanguageStyleModel,
  languageStyleModelSchema,
  summarizeLanguageSample,
} from "../src/languageAttentionModels.js";

const profile = createPersonaProfile({
  contractVersion: 1,
  profileId: "11111111-1111-4111-8111-111111111111",
  ownerId: "owner-a",
  version: 1,
  createdAt: "2026-08-04T00:00:00.000Z",
  status: "approved",
  ownerApproved: true,
  traits: { cautiousness: 0.2, patience: 0.1, exploration: 0, directness: 0.3, expressiveness: 0.2, thoroughness: 0.4 },
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
    maximumDraftTypoProbability: 0,
    maximumDraftMisclickProbability: 0,
    maximumImperfectionsPerActionChunk: 0,
    immediateCorrectionRequired: true,
    suppressAtOrAboveRisk: "medium",
    suppressDuringFinalSubmission: true,
  },
  habits: [],
});

function plan(risk: "low" | "high" = "low", identitySensitiveCommunication = false) {
  return planPersonaBehavior(profile, {
    contextId: `${risk}-${identitySensitiveCommunication}`,
    mode: "pilot",
    taskStage: "drafting",
    declaredRisk: risk,
    complexity: 0.4,
    familiarity: 0.5,
    uncertainty: 0.2,
    urgency: 0.1,
    targetDifficulty: 0.4,
    contentCharacters: 500,
    systemReady: true,
    recoveringFromError: false,
    identitySensitiveCommunication,
    externalCommitment: false,
    financialOrLegalEffect: false,
    destructiveEffect: false,
    humanVerificationRequired: false,
    deterministicSeed: "seed",
  });
}

function languageObservations() {
  const text = "I think this is a practical way to handle the task, and I don't want to overcomplicate it. We can review the result carefully, then make one clear adjustment if it is needed. Does that approach make sense to you? I would rather keep the explanation direct and useful than add details that do not help.";
  return Array.from({ length: 6 }, (_, index) => summarizeLanguageSample({
    observationId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    sourceEpisodeId: index < 3 ? "20000000-0000-4000-8000-000000000001" : "20000000-0000-4000-8000-000000000002",
    observedAt: `2026-08-04T07:00:0${index}.000Z`,
    text: `${text} ${index % 2 === 0 ? "I'm checking the outcome now." : "I will check the outcome now."}`,
    consented: true,
  }));
}

function attentionObservations() {
  return Array.from({ length: 6 }, (_, index) => ({
    observationId: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    sourceEpisodeId: index < 3 ? "40000000-0000-4000-8000-000000000001" : "40000000-0000-4000-8000-000000000002",
    observedAt: `2026-08-04T07:01:0${index}.000Z`,
    consented: true as const,
    contentCharacters: 500,
    dwellMs: 4_000 + index * 100,
    rereadCount: index % 2,
    scrollReversalCount: 1,
    focusSwitchCount: 1,
    verificationEventCount: 2,
    finalVerificationPerformed: true,
    taskCompletedCorrectly: true as const,
    protectedContentCaptured: false as const,
  }));
}

describe("language style model", () => {
  it("converts consented text into metrics without retaining raw text", () => {
    const observation = languageObservations()[0]!;
    expect(observation.sourceTextRetained).toBe(false);
    expect(observation.wordCount).toBeGreaterThanOrEqual(20);
    expect(JSON.stringify(observation)).not.toContain("practical way to handle");
  });

  it("rejects nonconsensual, protected, identity-sensitive, and secret-bearing text", () => {
    const base = {
      observationId: "50000000-0000-4000-8000-000000000001",
      sourceEpisodeId: "60000000-0000-4000-8000-000000000001",
      observedAt: "2026-08-04T07:00:00.000Z",
      text: "This is a sufficiently long sample with more than twenty ordinary words so that the validator reaches the intended consent and content checks safely.",
      consented: true,
    };
    expect(() => summarizeLanguageSample({ ...base, consented: false })).toThrow(/consent/i);
    expect(() => summarizeLanguageSample({ ...base, protectedContent: true })).toThrow(/protected/i);
    expect(() => summarizeLanguageSample({ ...base, identitySensitive: true })).toThrow(/identity-sensitive/i);
    expect(() => summarizeLanguageSample({ ...base, text: `${base.text} password: hunter2` })).toThrow(/secret/i);
  });

  it("fits integrity-bound style metrics and returns non-generating advice", () => {
    const model = fitLanguageStyleModel({
      ownerId: profile.ownerId,
      profileId: profile.profileId,
      profileVersion: 1,
      observations: languageObservations(),
      trainedAt: "2026-08-04T07:10:00.000Z",
    });
    expect(languageStyleModelSchema.parse(model)).toEqual(model);
    expect(model.rawTextRetained).toBe(false);
    expect(model.generatesText).toBe(false);
    const advice = adviseLanguageStyle({ model, behaviorPlan: plan("low") });
    expect(advice.generatesText).toBe(false);
    expect(advice.representsHumanAuthorship).toBe(false);
    expect(advice.disclosureRequired).toBe(false);
    expect(adviseLanguageStyle({ model, behaviorPlan: plan("low", true) }).disclosureRequired).toBe(true);
  });
});

describe("attention and verification model", () => {
  it("fits only successful consented observations across multiple episodes", () => {
    const model = fitAttentionVerificationModel({
      ownerId: profile.ownerId,
      profileId: profile.profileId,
      profileVersion: 1,
      observations: attentionObservations(),
      trainedAt: "2026-08-04T07:10:00.000Z",
    });
    expect(attentionVerificationModelSchema.parse(model)).toEqual(model);
    expect(model.sourceEpisodeIds).toHaveLength(2);
    expect(model.screenControlAuthority).toBe("none");
  });

  it("increases attention for risk without lowering deterministic verification or controlling the screen", () => {
    const model = fitAttentionVerificationModel({ ownerId: profile.ownerId, profileId: profile.profileId, profileVersion: 1, observations: attentionObservations() });
    const low = adviseAttention({ model, behaviorPlan: plan("low"), contentCharacters: 1_000 });
    const high = adviseAttention({ model, behaviorPlan: plan("high"), contentCharacters: 1_000 });
    expect(high.suggestedDwellMs).toBeGreaterThan(low.suggestedDwellMs);
    expect(high.suggestedVerificationEvents).toBeGreaterThanOrEqual(low.suggestedVerificationEvents);
    expect(high.finalVerificationRequired).toBe(true);
    expect(high.mayLowerPolicyVerification).toBe(false);
    expect(high.producesScrollEvents).toBe(false);
    expect(high.changesFocus).toBe(false);
  });

  it("rejects insufficient, duplicate, single-source, and protected corpora", () => {
    const observations = attentionObservations();
    expect(() => fitAttentionVerificationModel({ ownerId: profile.ownerId, profileId: profile.profileId, profileVersion: 1, observations: observations.slice(0, 4) }))
      .toThrow(/at least five/i);
    expect(() => fitAttentionVerificationModel({ ownerId: profile.ownerId, profileId: profile.profileId, profileVersion: 1, observations: [...observations.slice(0, 5), observations[0]!] }))
      .toThrow(/duplicate/i);
    expect(() => fitAttentionVerificationModel({
      ownerId: profile.ownerId,
      profileId: profile.profileId,
      profileVersion: 1,
      observations: observations.map((item) => ({ ...item, sourceEpisodeId: observations[0]!.sourceEpisodeId })),
    })).toThrow(/two source episodes/i);
    expect(() => fitAttentionVerificationModel({
      ownerId: profile.ownerId,
      profileId: profile.profileId,
      profileVersion: 1,
      observations: observations.map((item, index) => index === 0 ? { ...item, protectedContentCaptured: true as never } : item),
    })).toThrow();
  });
});
