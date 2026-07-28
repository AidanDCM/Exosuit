import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DemonstrationRetrievalIndex,
  processedDemonstrationSchema,
  type ProcessedDemonstration,
} from "../src/demonstrationProcessing.js";
import { sha256Canonical } from "../src/fieldContracts.js";
import { RetrievalShadowPredictor, retrievalShadowResultSchema } from "../src/retrievalShadowPredictor.js";

const layout = "a".repeat(64);
const field = { fieldId: randomUUID(), fieldGeneration: 3 };
let sequence = 0;

function processed(options: {
  intent?: string;
  targetKey?: string;
  features?: string[];
  operatorId?: string;
  layoutFingerprint?: string;
  delayMs?: number;
} = {}): ProcessedDemonstration {
  sequence += 1;
  const sourceEpisodeId = randomUUID();
  const action = {
    intent: options.intent ?? "Open result",
    targetKey: options.targetKey ?? "result-card",
    method: "mouse" as const,
    delayMs: options.delayMs ?? 400,
    expectedResult: "Result detail appears",
  };
  return processedDemonstrationSchema.parse({
    contractVersion: 1,
    pipelineVersion: "deterministic-annotation-v1",
    processedAt: "2026-07-28T21:00:00.000Z",
    sourceEpisodeId,
    sourceEpisodeHash: sha256Canonical({ sourceEpisodeId }),
    field: { fieldId: randomUUID(), fieldGeneration: 1 },
    operatorIdHash: sha256Canonical({ operatorId: options.operatorId ?? "aidan" }),
    successful: true,
    steps: [{
      stepId: sha256Canonical({ sourceEpisodeId, sequence }), ordinal: 0, observationKey: "results-page", action,
      label: "preferred", layoutFingerprint: options.layoutFingerprint ?? layout,
      features: options.features ?? ["open", "result", "results"],
      lineage: { sourceSequenceStart: 0, sourceSequenceEnd: 0, sourceEventIds: [randomUUID()], annotationEventId: randomUUID() },
    }],
  });
}

function predictor(...episodes: ProcessedDemonstration[]) {
  const index = new DemonstrationRetrievalIndex();
  for (const episode of episodes) index.add(episode);
  return new RetrievalShadowPredictor({ index });
}

const query = {
  field,
  operatorId: "aidan",
  observationId: "observation-7",
  layoutFingerprint: layout,
  features: ["open", "result", "results"],
  desktopReady: true,
  unexpectedModal: false,
  predictedAt: "2026-07-28T21:00:01.000Z",
};

describe("retrieval-backed Shadow baseline", () => {
  it("predicts a consensus action with exact provenance and no execution authority", () => {
    const result = predictor(processed({ delayMs: 300 }), processed({ delayMs: 500 })).predict(query);
    expect(result).toMatchObject({
      status: "predicted", candidateCount: 2, executionAllowed: false,
      prediction: { field, observationId: "observation-7", confidence: 1, modelVersion: "retrieval-shadow-baseline-v1", executionAllowed: false,
        action: { intent: "Open result", targetKey: "result-card", delayMs: 400 } },
    });
    if (result.status !== "predicted") throw new Error("Expected a prediction.");
    expect(result.prediction.sourceEpisodeIds).toHaveLength(2);
    expect(() => retrievalShadowResultSchema.parse({ ...result, executionAllowed: true })).toThrow();
    expect(() => retrievalShadowResultSchema.parse({ ...result, prediction: { ...result.prediction, executionAllowed: true } })).toThrow();
  });

  it("abstains for unsafe scene state, unknown work, another owner, or changed layout", () => {
    const baseline = predictor(processed());
    expect(baseline.predict({ ...query, desktopReady: false })).toMatchObject({ status: "abstained", reason: "desktop_not_ready" });
    expect(baseline.predict({ ...query, unexpectedModal: true })).toMatchObject({ status: "abstained", reason: "unexpected_modal" });
    expect(baseline.predict({ ...query, features: ["unknown"] })).toMatchObject({ status: "abstained", reason: "no_relevant_demonstration" });
    expect(baseline.predict({ ...query, operatorId: "someone-else" })).toMatchObject({ status: "abstained", reason: "no_relevant_demonstration" });
    expect(baseline.predict({ ...query, layoutFingerprint: "b".repeat(64) })).toMatchObject({ status: "abstained", reason: "no_relevant_demonstration" });
  });

  it("abstains when weak conflicting examples do not meet the confidence floor", () => {
    const baseline = predictor(
      processed({ intent: "Open result", targetKey: "result-card", features: ["common", "open"] }),
      processed({ intent: "Skip result", targetKey: "next-card", features: ["common", "skip"] }),
    );
    expect(baseline.predict({ ...query, features: ["common", "query"] })).toMatchObject({
      status: "abstained", reason: "low_confidence", candidateCount: 2, executionAllowed: false,
    });
  });

  it("validates bounded configuration and observation identity", () => {
    const index = new DemonstrationRetrievalIndex();
    expect(() => new RetrievalShadowPredictor({ index, minimumConfidence: 2 })).toThrow(/minimumConfidence/);
    expect(() => new RetrievalShadowPredictor({ index, maxCandidates: 0 })).toThrow(/maxCandidates/);
    expect(() => new RetrievalShadowPredictor({ index }).predict({ ...query, observationId: "" })).toThrow(/observationId/);
  });
});
