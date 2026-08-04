import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  comparePersonaProfiles,
  createPersonaProfile,
  personaBehaviorPlanSchema,
  personaImperfectionPolicySchema,
  planPersonaBehavior,
  verifyPersonaProfile,
} from "../src/personaBehavior.js";

const profileInput = (overrides: Record<string, unknown> = {}) => ({
  contractVersion: 1 as const,
  profileId: randomUUID(),
  ownerId: "owner",
  version: 1,
  createdAt: "2026-08-03T20:00:00.000Z",
  status: "approved" as const,
  ownerApproved: true,
  traits: {
    cautiousness: 0.3,
    patience: 0.2,
    exploration: 0.1,
    directness: 0.5,
    expressiveness: 0.4,
    thoroughness: 0.6,
  },
  timing: {
    minimumThinkingMs: 100,
    maximumThinkingMs: 30_000,
    baseReactionMs: 400,
    readingMsPer100Characters: 300,
    uncertaintyMultiplier: 2,
    riskMultiplier: 2.5,
    familiarityDiscount: 0.6,
    urgencyDiscount: 0.75,
    deterministicVariationFraction: 0.1,
  },
  imperfection: {
    strategy: "observed_distribution_only" as const,
    purpose: "personalization_not_evasion" as const,
    maximumDraftTypoProbability: 0.04,
    maximumDraftMisclickProbability: 0.01,
    maximumImperfectionsPerActionChunk: 1,
    immediateCorrectionRequired: true as const,
    suppressAtOrAboveRisk: "medium" as const,
    suppressDuringFinalSubmission: true as const,
  },
  habits: [{
    habitId: "read-before-click",
    description: "Reads the primary control label before clicking.",
    confidence: 0.9,
    evidenceCount: 20,
    lastObservedAt: "2026-08-03T19:00:00.000Z",
  }],
  ...overrides,
});

const context = (overrides: Record<string, unknown> = {}) => ({
  contextId: "context-1",
  mode: "assisted" as const,
  taskStage: "drafting" as const,
  declaredRisk: "low" as const,
  complexity: 0.3,
  familiarity: 0.8,
  uncertainty: 0.2,
  urgency: 0.2,
  targetDifficulty: 0.8,
  contentCharacters: 200,
  systemReady: true,
  recoveringFromError: false,
  identitySensitiveCommunication: false,
  externalCommitment: false,
  financialOrLegalEffect: false,
  destructiveEffect: false,
  humanVerificationRequired: false,
  deterministicSeed: "repeatable-seed",
  ...overrides,
});

describe("Persona and behavioral dynamics", () => {
  it("creates an integrity-bound owner profile and detects tampering", () => {
    const profile = createPersonaProfile(profileInput());
    expect(verifyPersonaProfile(profile)).toBe(true);
    expect(verifyPersonaProfile({
      ...profile,
      traits: { ...profile.traits, cautiousness: -0.9 },
    })).toBe(false);
  });

  it("produces deterministic non-executing plans with bounded low-risk draft allowances", () => {
    const profile = createPersonaProfile(profileInput());
    const first = planPersonaBehavior(profile, context());
    const second = planPersonaBehavior(profile, context());
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      effectiveRisk: "low",
      abstain: false,
      actionAuthority: "none",
      imperfectionAllowance: {
        typoProcessEligible: true,
        misclickProcessEligible: true,
        maximumImperfections: 1,
        typoProbabilityCeiling: 0.04,
        misclickProbabilityCeiling: 0.01,
        immediateCorrectionRequired: true,
        observedDistributionOnly: true,
        purpose: "personalization_not_evasion",
      },
    });
    expect(() => personaBehaviorPlanSchema.parse({ ...first, actionAuthority: "execute" })).toThrow();
  });

  it("escalates consequential effects and suppresses all imperfections", () => {
    const profile = createPersonaProfile(profileInput());
    const plan = planPersonaBehavior(profile, context({
      externalCommitment: true,
      taskStage: "committing",
    }));
    expect(plan).toMatchObject({
      effectiveRisk: "consequential",
      state: "careful",
      ownerReviewRequired: true,
      disclosureRequired: true,
      imperfectionAllowance: {
        typoProcessEligible: false,
        misclickProcessEligible: false,
        maximumImperfections: 0,
      },
    });
    expect(plan.verificationIntensity).toBeGreaterThan(0.7);
  });

  it("uses longer thinking and stronger verification for uncertainty and risk", () => {
    const profile = createPersonaProfile(profileInput());
    const familiar = planPersonaBehavior(profile, context({ contextId: "familiar", uncertainty: 0.1, declaredRisk: "low" }));
    const careful = planPersonaBehavior(profile, context({
      contextId: "careful",
      uncertainty: 0.8,
      declaredRisk: "high",
      familiarity: 0.2,
    }));
    expect(careful.thinkingDelayMs).toBeGreaterThan(familiar.thinkingDelayMs);
    expect(careful.verificationIntensity).toBeGreaterThan(familiar.verificationIntensity);
    expect(careful.state).toBe("careful");
  });

  it("abstains when the desktop is unavailable or human verification is required", () => {
    const profile = createPersonaProfile(profileInput());
    const unavailable = planPersonaBehavior(profile, context({ systemReady: false }));
    expect(unavailable).toMatchObject({
      state: "waiting_for_system",
      thinkingDelayMs: 0,
      abstain: true,
      imperfectionAllowance: { maximumImperfections: 0 },
    });
    const humanCheck = planPersonaBehavior(profile, context({
      contextId: "human-check",
      humanVerificationRequired: true,
    }));
    expect(humanCheck.effectiveRisk).toBe("consequential");
    expect(humanCheck.abstain).toBe(true);
    expect(humanCheck.reasons).toContain("human_verification_required");
  });

  it("allows unapproved profiles only for non-executing evaluation modes", () => {
    const evaluating = createPersonaProfile(profileInput({ status: "evaluating", ownerApproved: false }));
    expect(() => planPersonaBehavior(evaluating, context({ mode: "pilot" }))).toThrow(/owner-approved/);
    const shadow = planPersonaBehavior(evaluating, context({ mode: "shadow" }));
    expect(shadow.actionAuthority).toBe("none");
  });

  it("detects material persona drift and requires explicit version progression", () => {
    const previous = createPersonaProfile(profileInput());
    const next = createPersonaProfile({
      ...profileInput({
        profileId: previous.profileId,
        version: 2,
        supersedesVersion: 1,
        traits: { ...previous.traits, cautiousness: -0.2 },
        habits: [],
      }),
      ownerId: previous.ownerId,
    });
    const drift = comparePersonaProfiles(previous, next);
    expect(drift.highDriftTraits).toContain("cautiousness");
    expect(drift.removedHabitIds).toEqual(["read-before-click"]);
    expect(drift.requiresOwnerApproval).toBe(true);
    expect(drift.promotionAllowed).toBe(true);
    const wrongVersion = createPersonaProfile(profileInput({
      profileId: previous.profileId,
      ownerId: previous.ownerId,
      version: 3,
      supersedesVersion: 2,
    }));
    expect(() => comparePersonaProfiles(previous, wrongVersion)).toThrow(/consecutive/);
  });

  it("rejects evasion-oriented or excessive imperfection policy", () => {
    expect(() => personaImperfectionPolicySchema.parse({
      ...profileInput().imperfection,
      purpose: "anti_detection",
    })).toThrow();
    expect(() => personaImperfectionPolicySchema.parse({
      ...profileInput().imperfection,
      maximumDraftMisclickProbability: 0.5,
    })).toThrow();
    expect(() => personaImperfectionPolicySchema.parse({
      ...profileInput().imperfection,
      immediateCorrectionRequired: false,
    })).toThrow();
  });
});
