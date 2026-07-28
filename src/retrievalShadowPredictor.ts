import { z } from "zod";
import { DemonstrationRetrievalIndex, type DemonstrationRetrievalMatch } from "./demonstrationProcessing.js";
import { fieldRefSchema, sha256Canonical } from "./fieldContracts.js";
import { createShadowPrediction, shadowActionSchema, shadowPredictionSchema } from "./shadowLearning.js";

export const shadowAbstentionReasonSchema = z.enum([
  "desktop_not_ready",
  "unexpected_modal",
  "no_relevant_demonstration",
  "low_confidence",
]);

export const retrievalShadowResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("abstained"),
    reason: shadowAbstentionReasonSchema,
    candidateCount: z.number().int().nonnegative(),
    executionAllowed: z.literal(false),
  }),
  z.object({
    status: z.literal("predicted"),
    candidateCount: z.number().int().positive(),
    prediction: shadowPredictionSchema,
    executionAllowed: z.literal(false),
  }),
]);
export type RetrievalShadowResult = z.infer<typeof retrievalShadowResultSchema>;

export class RetrievalShadowPredictor {
  readonly #index: DemonstrationRetrievalIndex;
  readonly #minimumConfidence: number;
  readonly #maxCandidates: number;

  constructor(options: { index: DemonstrationRetrievalIndex; minimumConfidence?: number; maxCandidates?: number }) {
    this.#index = options.index;
    this.#minimumConfidence = options.minimumConfidence ?? 0.6;
    if (!Number.isFinite(this.#minimumConfidence) || this.#minimumConfidence < 0 || this.#minimumConfidence > 1) {
      throw new Error("Shadow minimumConfidence must be from 0 through 1.");
    }
    this.#maxCandidates = options.maxCandidates ?? 20;
    if (!Number.isInteger(this.#maxCandidates) || this.#maxCandidates < 1 || this.#maxCandidates > 100) {
      throw new Error("Shadow maxCandidates must be from 1 through 100.");
    }
  }

  predict(input: {
    field: z.infer<typeof fieldRefSchema>;
    operatorId: string;
    observationId: string;
    layoutFingerprint: string;
    features: string[];
    desktopReady: boolean;
    unexpectedModal: boolean;
    predictedAt?: string;
  }): RetrievalShadowResult {
    const field = fieldRefSchema.parse(input.field);
    if (!input.observationId.trim() || input.observationId.length > 300) throw new Error("Shadow observationId is invalid.");
    if (!input.desktopReady) return abstain("desktop_not_ready", 0);
    if (input.unexpectedModal) return abstain("unexpected_modal", 0);

    const candidates = this.#index.retrieve({
      operatorId: input.operatorId,
      layoutFingerprint: input.layoutFingerprint,
      features: input.features,
      limit: this.#maxCandidates,
      minimumScore: 0.01,
    });
    if (candidates.length === 0) return abstain("no_relevant_demonstration", 0);
    const consensus = selectConsensus(candidates);
    if (consensus.confidence < this.#minimumConfidence) return abstain("low_confidence", candidates.length);

    const prediction = createShadowPrediction({
      field,
      observationId: input.observationId,
      predictedAt: input.predictedAt ?? new Date().toISOString(),
      action: consensus.action,
      confidence: consensus.confidence,
      sourceEpisodeIds: [...new Set(consensus.matches.map((match) => match.sourceEpisodeId))].slice(0, 100),
      modelVersion: "retrieval-shadow-baseline-v1",
    });
    return retrievalShadowResultSchema.parse({
      status: "predicted",
      candidateCount: candidates.length,
      prediction,
      executionAllowed: false,
    });
  }
}

function abstain(reason: z.infer<typeof shadowAbstentionReasonSchema>, candidateCount: number): RetrievalShadowResult {
  return retrievalShadowResultSchema.parse({ status: "abstained", reason, candidateCount, executionAllowed: false });
}

function selectConsensus(matches: DemonstrationRetrievalMatch[]): {
  matches: DemonstrationRetrievalMatch[];
  confidence: number;
  action: z.infer<typeof shadowActionSchema>;
} {
  const groups = new Map<string, DemonstrationRetrievalMatch[]>();
  for (const match of matches) {
    const signature = sha256Canonical({
      intent: normalize(match.step.action.intent),
      targetKey: normalize(match.step.action.targetKey),
      method: match.step.action.method,
      expectedResult: normalize(match.step.action.expectedResult),
    });
    groups.set(signature, [...(groups.get(signature) ?? []), match]);
  }
  const selected = [...groups.entries()]
    .map(([signature, group]) => ({ signature, group, total: group.reduce((sum, match) => sum + match.score, 0) }))
    .sort((left, right) => right.total - left.total || left.signature.localeCompare(right.signature))[0]!;
  const averageSimilarity = selected.total / selected.group.length;
  const consensusRatio = selected.group.length / matches.length;
  const confidence = clamp(averageSimilarity * 0.7 + consensusRatio * 0.3);
  const template = selected.group
    .slice()
    .sort((left, right) => right.score - left.score || left.step.stepId.localeCompare(right.step.stepId))[0]!;
  const weight = selected.group.reduce((sum, match) => sum + Math.max(match.score, Number.EPSILON), 0);
  const delayMs = selected.group.reduce(
    (sum, match) => sum + match.step.action.delayMs * Math.max(match.score, Number.EPSILON),
    0,
  ) / weight;
  return {
    matches: selected.group,
    confidence,
    action: shadowActionSchema.parse({ ...template.step.action, delayMs }),
  };
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
