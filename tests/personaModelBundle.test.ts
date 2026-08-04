import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPersonaProfile } from "../src/personaBehavior.js";
import type { PersonaEvaluation } from "../src/personaDerivation.js";
import { fitTypingProcessModel } from "../src/personalBehaviorModels.js";
import { createPersonaModelBundle, PersonaModelBundleRegistry } from "../src/personaModelBundle.js";

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
    minimumThinkingMs: 100, maximumThinkingMs: 10_000, baseReactionMs: 400, readingMsPer100Characters: 800,
    uncertaintyMultiplier: 1.5, riskMultiplier: 1.5, familiarityDiscount: 0.8, urgencyDiscount: 0.75,
    deterministicVariationFraction: 0,
  },
  imperfection: {
    strategy: "observed_distribution_only", purpose: "personalization_not_evasion", maximumDraftTypoProbability: 0,
    maximumDraftMisclickProbability: 0, maximumImperfectionsPerActionChunk: 0, immediateCorrectionRequired: true,
    suppressAtOrAboveRisk: "medium", suppressDuringFinalSubmission: true,
  },
  habits: [],
});

const stableEvaluation: PersonaEvaluation = {
  contractVersion: 1,
  trainingCandidateHash: "a".repeat(64),
  heldOutCandidateHash: "b".repeat(64),
  trainingEpisodeCount: 2,
  heldOutEpisodeCount: 2,
  maximumTraitDelta: 0.1,
  meanTraitDelta: 0.05,
  habitPrecision: 1,
  habitRecall: 1,
  medianTimingRatio: 1.1,
  stableEnoughForOwnerReview: true,
  reasons: ["Stable enough for owner review."],
  actionAuthority: "none",
};

function typingModel() {
  return fitTypingProcessModel({
    ownerId: profile.ownerId,
    profileId: profile.profileId,
    profileVersion: profile.version,
    trainedAt: "2026-08-04T08:00:00.000Z",
    observations: Array.from({ length: 5 }, (_, index) => ({
      observationId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      sourceEpisodeId: index < 3 ? "20000000-0000-4000-8000-000000000001" : "20000000-0000-4000-8000-000000000002",
      observedAt: `2026-08-04T08:00:0${index}.000Z`,
      stage: "drafting" as const,
      risk: "low" as const,
      protectedField: false as const,
      finalTextMatchedIntent: true as const,
      submittedExternally: false as const,
      characterCount: 100,
      durationMs: 10_000,
      pauseDurationsMs: [200, 400],
      typoCount: 1,
      correctionCount: 1,
      backspaceCount: 1,
      immediateCorrectionCount: 1,
    })),
  });
}

function request(bundle: ReturnType<typeof createPersonaModelBundle>, operation: "activate" | "deactivate" | "rollback") {
  return {
    requestId: randomUUID(),
    actor: "owner_local" as const,
    ownerId: profile.ownerId,
    operation,
    bundleId: bundle.bundleId,
    bundleHash: bundle.bundleHash,
    localTransport: true,
    interactiveOwnerPresent: true,
    requestedAt: "2026-08-04T08:10:00.000Z",
    reason: `${operation} reviewed bundle`,
  };
}

describe("persona model bundle", () => {
  it("binds observed models to one exact profile and remains advisory", () => {
    const bundle = createPersonaModelBundle({
      bundleId: "33333333-3333-4333-8333-333333333333",
      profile,
      evaluation: stableEvaluation,
      typing: typingModel(),
      createdAt: "2026-08-04T08:05:00.000Z",
    });
    expect(bundle).toMatchObject({
      ownerId: profile.ownerId,
      profileHash: profile.profileHash,
      advisoryOnly: true,
      mayLowerPolicyVerification: false,
      mayAuthorizeActions: false,
      mayInjectInput: false,
      actionAuthority: "none",
    });
    expect(bundle.supportedDimensions).toEqual(expect.arrayContaining(["task", "timing", "habits", "typing"]));
  });

  it("allows only the interactive owner to activate, deactivate, and roll back", () => {
    const first = createPersonaModelBundle({ bundleId: "33333333-3333-4333-8333-333333333333", profile, evaluation: stableEvaluation, typing: typingModel() });
    const second = createPersonaModelBundle({ bundleId: "44444444-4444-4444-8444-444444444444", profile, evaluation: stableEvaluation, typing: typingModel(), createdAt: "2026-08-04T08:06:00.000Z" });
    const registry = new PersonaModelBundleRegistry();
    registry.register(first);
    registry.register(second);
    expect(registry.decide({ request: request(first, "activate"), profile }).status).toBe("active");
    expect(registry.active()?.bundleHash).toBe(first.bundleHash);
    const blocked = registry.decide({ request: { ...request(second, "activate"), actor: "pilot_model" }, profile });
    expect(blocked.status).toBe("blocked");
    expect(blocked.modelMayActivate).toBe(false);
    expect(registry.decide({ request: request(second, "activate"), profile }).status).toBe("active");
    expect(registry.active()?.bundleHash).toBe(second.bundleHash);
    expect(registry.decide({ request: request(first, "rollback"), profile }).status).toBe("active");
    expect(registry.active()?.bundleHash).toBe(first.bundleHash);
    expect(registry.decide({ request: request(first, "deactivate"), profile }).status).toBe("inactive");
    expect(registry.active()).toBeUndefined();
  });

  it("blocks unstable evaluation, unapproved profiles, identity mismatch, tampering, and duplicate requests", () => {
    const unstable = createPersonaModelBundle({
      profile,
      evaluation: { ...stableEvaluation, stableEnoughForOwnerReview: false, reasons: ["Unstable."] },
      typing: typingModel(),
    });
    const registry = new PersonaModelBundleRegistry();
    registry.register(unstable);
    const activationRequest = request(unstable, "activate");
    expect(registry.decide({ request: activationRequest, profile }).rule).toBe("stable_evaluation_required");
    expect(() => registry.decide({ request: activationRequest, profile })).toThrow(/only once/i);

    const unapproved = createPersonaProfile({
      ...profile,
      version: 2,
      supersedesVersion: 1,
      createdAt: "2026-08-04T09:00:00.000Z",
      status: "evaluating",
      ownerApproved: false,
      profileHash: undefined as never,
    });
    const unapprovedBundle = createPersonaModelBundle({
      profile: unapproved,
      evaluation: stableEvaluation,
      typing: fitTypingProcessModel({
        ownerId: unapproved.ownerId,
        profileId: unapproved.profileId,
        profileVersion: unapproved.version,
        observations: Array.from({ length: 5 }, (_, index) => ({
          observationId: `50000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          sourceEpisodeId: index < 3 ? "60000000-0000-4000-8000-000000000001" : "60000000-0000-4000-8000-000000000002",
          observedAt: `2026-08-04T09:00:0${index}.000Z`, stage: "drafting", risk: "low", protectedField: false,
          finalTextMatchedIntent: true, submittedExternally: false, characterCount: 100, durationMs: 10_000,
          pauseDurationsMs: [], typoCount: 0, correctionCount: 0, backspaceCount: 0, immediateCorrectionCount: 0,
        })),
      }),
    });
    const secondRegistry = new PersonaModelBundleRegistry();
    secondRegistry.register(unapprovedBundle);
    expect(secondRegistry.decide({ request: { ...request(unapprovedBundle, "activate"), currentVersion: undefined } as never, profile: unapproved }).status).toBe("blocked");

    expect(() => registry.register({ ...unstable, mayInjectInput: true as never })).toThrow();
  });
});
