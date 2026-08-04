import { describe, expect, it } from "vitest";
import { sha256Canonical } from "../src/fieldContracts.js";
import type { ProcessedDemonstration } from "../src/demonstrationProcessing.js";
import {
  derivePersonaCandidate,
  evaluatePersonaStability,
  personaCandidateSchema,
  personaEvaluationSchema,
  promotePersonaCandidate,
} from "../src/personaDerivation.js";

const operatorId = "owner-operator";
const ownerId = "owner-a";
const operatorIdHash = sha256Canonical({ operatorId });

function episode(index: number, options: { delays?: number[]; habits?: string[]; exploration?: boolean } = {}): ProcessedDemonstration {
  const delays = options.delays ?? [400 + index * 10, 600 + index * 10, 800 + index * 10];
  const habits = options.habits ?? ["habit:verify-export-name"];
  const episodeId = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  return {
    contractVersion: 1,
    pipelineVersion: "deterministic-annotation-v1",
    processedAt: `2026-08-0${Math.min(index, 9)}T12:00:00.000Z`,
    sourceEpisodeId: episodeId,
    sourceEpisodeHash: `${index}`.repeat(64).slice(0, 64),
    field: { fieldId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", fieldGeneration: 1 },
    operatorIdHash,
    successful: true,
    steps: delays.map((delayMs, ordinal) => ({
      stepId: `${index}${ordinal}`.repeat(64).slice(0, 64),
      ordinal,
      observationKey: `observation-${index}-${ordinal}`,
      action: {
        intent: ordinal === 0 ? "Open export dialog" : ordinal === 1 ? "Enter a file name" : "Verify the exported file name",
        targetKey: `target-${ordinal}`,
        method: ordinal === 1 ? "keyboard" : "semantic",
        delayMs,
        expectedResult: "The intended low-risk local state is visible and verified before continuing.",
        reason: "The owner demonstrated this order repeatedly.",
      },
      label: options.exploration && ordinal === 0 ? "exploration" : ordinal === 2 ? "correction" : "preferred",
      ...(ordinal === 2 ? { correctionOfOrdinal: 1 } : {}),
      layoutFingerprint: "a".repeat(64),
      features: [...habits, `step:${ordinal}`],
      lineage: {
        sourceSequenceStart: ordinal * 2,
        sourceSequenceEnd: ordinal * 2 + 1,
        sourceEventIds: [
          `10000000-0000-4000-8000-${String(index * 10 + ordinal).padStart(12, "0")}`,
        ],
        annotationEventId: `20000000-0000-4000-8000-${String(index * 10 + ordinal).padStart(12, "0")}`,
      },
    })),
  };
}

describe("persona derivation", () => {
  it("derives deterministic provenance-bound candidates without inventing unsupported domains", () => {
    const input = {
      ownerId,
      operatorId,
      candidateId: "33333333-3333-4333-8333-333333333333",
      demonstrations: [episode(1), episode(2)],
      derivedAt: "2026-08-04T02:00:00.000Z",
    };
    const first = derivePersonaCandidate(input);
    const second = derivePersonaCandidate(input);
    expect(first).toEqual(second);
    expect(personaCandidateSchema.parse(first)).toEqual(first);
    expect(first.sourceEpisodeIds).toHaveLength(2);
    expect(first.stepCount).toBe(6);
    expect(first.habits).toMatchObject([{ habitId: "verify-export-name", evidenceCount: 6 }]);
    expect(first.traits.find((trait) => trait.trait === "expressiveness")).toMatchObject({ confidence: 0, evidenceCount: 0 });
    expect(first.unsupportedDomains).toEqual(["expressiveness", "draft_typo_rate", "motor_misclick_rate"]);
    expect(first.actionAuthority).toBe("none");
  });

  it("rejects mixed operators, duplicate episodes, and insufficient evidence", () => {
    const mixed = episode(2);
    mixed.operatorIdHash = "f".repeat(64);
    expect(() => derivePersonaCandidate({ ownerId, operatorId, candidateId: "33333333-3333-4333-8333-333333333333", demonstrations: [episode(1), mixed] }))
      .toThrow(/mix operators/i);
    expect(() => derivePersonaCandidate({ ownerId, operatorId, candidateId: "33333333-3333-4333-8333-333333333333", demonstrations: [episode(1), episode(1)] }))
      .toThrow(/duplicate/i);
    expect(() => derivePersonaCandidate({ ownerId, operatorId, candidateId: "33333333-3333-4333-8333-333333333333", demonstrations: [episode(1)] }))
      .toThrow(/at least two/i);
  });

  it("requires explicit owner review and promotes only supported habits into an evaluating profile", () => {
    const candidate = derivePersonaCandidate({
      ownerId,
      operatorId,
      candidateId: "33333333-3333-4333-8333-333333333333",
      demonstrations: [episode(1), episode(2)],
      derivedAt: "2026-08-04T02:00:00.000Z",
    });
    const profile = promotePersonaCandidate({
      candidate,
      profileId: "44444444-4444-4444-8444-444444444444",
      version: 1,
      review: {
        reviewId: "55555555-5555-4555-8555-555555555555",
        candidateHash: candidate.candidateHash,
        ownerId,
        localTransport: true,
        interactiveOwnerPresent: true,
        reviewedAt: "2026-08-04T02:30:00.000Z",
        traitOverrides: { expressiveness: 0.25 },
        approvedHabitIds: ["verify-export-name"],
        reason: "Owner reviewed evidence and supplied the unsupported language trait.",
        modelMayApprove: false,
      },
    });
    expect(profile).toMatchObject({ status: "evaluating", ownerApproved: false, version: 1 });
    expect(profile.traits.expressiveness).toBe(0.25);
    expect(profile.habits.map((habit) => habit.habitId)).toEqual(["verify-export-name"]);
    expect(profile.imperfection.maximumDraftTypoProbability).toBe(0);
    expect(profile.imperfection.maximumDraftMisclickProbability).toBe(0);
  });

  it("rejects unsupported owner-reviewed habits and mismatched candidate hashes", () => {
    const candidate = derivePersonaCandidate({ ownerId, operatorId, candidateId: "33333333-3333-4333-8333-333333333333", demonstrations: [episode(1), episode(2)] });
    const baseReview = {
      reviewId: "55555555-5555-4555-8555-555555555555",
      candidateHash: candidate.candidateHash,
      ownerId,
      localTransport: true as const,
      interactiveOwnerPresent: true as const,
      reviewedAt: "2026-08-04T02:30:00.000Z",
      traitOverrides: {},
      approvedHabitIds: ["invented-habit"],
      reason: "test",
      modelMayApprove: false as const,
    };
    expect(() => promotePersonaCandidate({ candidate, profileId: "44444444-4444-4444-8444-444444444444", version: 1, review: baseReview }))
      .toThrow(/unsupported habit/i);
    expect(() => promotePersonaCandidate({
      candidate,
      profileId: "44444444-4444-4444-8444-444444444444",
      version: 1,
      review: { ...baseReview, approvedHabitIds: [], candidateHash: "f".repeat(64) },
    })).toThrow(/not bound/i);
  });

  it("evaluates held-out stability without automatically approving promotion", () => {
    const training = derivePersonaCandidate({
      ownerId,
      operatorId,
      candidateId: "33333333-3333-4333-8333-333333333333",
      demonstrations: [episode(1), episode(2)],
      derivedAt: "2026-08-04T02:00:00.000Z",
    });
    const heldOut = derivePersonaCandidate({
      ownerId,
      operatorId,
      candidateId: "66666666-6666-4666-8666-666666666666",
      demonstrations: [episode(3), episode(4)],
      derivedAt: "2026-08-04T02:10:00.000Z",
    });
    const evaluation = evaluatePersonaStability(training, heldOut);
    expect(personaEvaluationSchema.parse(evaluation)).toEqual(evaluation);
    expect(evaluation.stableEnoughForOwnerReview).toBe(true);
    expect(evaluation.reasons.join(" ")).toMatch(/owner review/i);
    expect(evaluation.actionAuthority).toBe("none");
  });

  it("flags unstable timing, traits, and habits", () => {
    const training = derivePersonaCandidate({ ownerId, operatorId, candidateId: "33333333-3333-4333-8333-333333333333", demonstrations: [episode(1), episode(2)] });
    const heldOut = derivePersonaCandidate({
      ownerId,
      operatorId,
      candidateId: "66666666-6666-4666-8666-666666666666",
      demonstrations: [
        episode(5, { delays: [10_000, 15_000, 20_000], habits: ["habit:open-links-in-tabs"], exploration: true }),
        episode(6, { delays: [11_000, 16_000, 21_000], habits: ["habit:open-links-in-tabs"], exploration: true }),
      ],
    });
    const evaluation = evaluatePersonaStability(training, heldOut);
    expect(evaluation.stableEnoughForOwnerReview).toBe(false);
    expect(evaluation.reasons.length).toBeGreaterThan(0);
  });
});
