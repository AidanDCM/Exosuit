import { z } from "zod";
import { demonstrationEpisodeSchema, type DemonstrationEpisode } from "./demonstration.js";
import { fieldRefSchema, sha256Canonical } from "./fieldContracts.js";
import { behaviorMethodSchema, shadowActionSchema } from "./shadowLearning.js";

export const demonstrationStepLabelSchema = z.enum(["preferred", "mistake", "correction", "exploration", "changed_mind"]);

export const semanticStepAnnotationSchema = z
  .object({
    sourceSequenceStart: z.number().int().nonnegative(),
    sourceSequenceEnd: z.number().int().nonnegative(),
    observationKey: z.string().min(1).max(300),
    intent: z.string().min(1).max(1_000),
    targetKey: z.string().min(1).max(1_000),
    method: behaviorMethodSchema,
    expectedResult: z.string().min(1).max(2_000),
    reason: z.string().min(1).max(2_000).optional(),
    label: demonstrationStepLabelSchema.default("preferred"),
    correctionOfOrdinal: z.number().int().nonnegative().optional(),
    layoutFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    features: z.array(z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,99}$/)).min(1).max(100),
  })
  .strict();
export type SemanticStepAnnotation = z.infer<typeof semanticStepAnnotationSchema>;

export const processedDemonstrationStepSchema = z.object({
  stepId: z.string().regex(/^[a-f0-9]{64}$/),
  ordinal: z.number().int().nonnegative(),
  observationKey: z.string().min(1).max(300),
  action: shadowActionSchema,
  label: demonstrationStepLabelSchema,
  correctionOfOrdinal: z.number().int().nonnegative().optional(),
  layoutFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  features: z.array(z.string().min(1).max(100)).min(1).max(100),
  lineage: z.object({
    sourceSequenceStart: z.number().int().nonnegative(),
    sourceSequenceEnd: z.number().int().nonnegative(),
    sourceEventIds: z.array(z.string().uuid()).min(1).max(10_000),
    annotationEventId: z.string().uuid(),
  }),
});
export type ProcessedDemonstrationStep = z.infer<typeof processedDemonstrationStepSchema>;

export const processedDemonstrationSchema = z.object({
  contractVersion: z.literal(1),
  pipelineVersion: z.literal("deterministic-annotation-v1"),
  processedAt: z.string().datetime(),
  sourceEpisodeId: z.string().uuid(),
  sourceEpisodeHash: z.string().regex(/^[a-f0-9]{64}$/),
  field: fieldRefSchema,
  operatorIdHash: z.string().regex(/^[a-f0-9]{64}$/),
  successful: z.boolean(),
  steps: z.array(processedDemonstrationStepSchema).min(1).max(10_000),
});
export type ProcessedDemonstration = z.infer<typeof processedDemonstrationSchema>;

export interface DemonstrationRetrievalMatch {
  score: number;
  sourceEpisodeId: string;
  sourceEpisodeHash: string;
  step: ProcessedDemonstrationStep;
}

export interface HeldOutDemonstrationSplit {
  training: ProcessedDemonstration[];
  heldOut: ProcessedDemonstration[];
}

export function processDemonstration(
  episodeInput: DemonstrationEpisode,
  processedAt = new Date().toISOString(),
): ProcessedDemonstration {
  const episode = demonstrationEpisodeSchema.parse(structuredClone(episodeInput));
  validateEpisodeTimeline(episode);
  if (episode.status === "recording" || !episode.endedAt || !episode.outcome) {
    throw new Error("Only a terminal demonstration episode can be processed.");
  }

  const annotations = episode.events.filter((event) => event.source === "annotation" && event.kind === "semantic_step");
  if (annotations.length === 0) throw new Error("Demonstration processing requires at least one semantic_step annotation.");
  let previousEnd = -1;
  const steps = annotations.map((event, ordinal) => {
    const annotation = semanticStepAnnotationSchema.parse(event.payload);
    if (annotation.sourceSequenceStart > annotation.sourceSequenceEnd) throw new Error("Semantic step source range is reversed.");
    if (annotation.sourceSequenceEnd >= event.sequence) throw new Error("Semantic step annotation must follow every source event it references.");
    if (annotation.sourceSequenceStart <= previousEnd) throw new Error("Semantic step source ranges overlap or are out of order.");
    if (annotation.correctionOfOrdinal !== undefined && annotation.correctionOfOrdinal >= ordinal) {
      throw new Error("A correction must refer to an earlier step ordinal.");
    }
    if (annotation.label === "correction" && annotation.correctionOfOrdinal === undefined) {
      throw new Error("A correction step requires correctionOfOrdinal.");
    }
    if (annotation.label !== "correction" && annotation.correctionOfOrdinal !== undefined) {
      throw new Error("Only a correction step may set correctionOfOrdinal.");
    }
    assertNoRedactedSemanticValue(annotation);
    const sourceEvents = episode.events.slice(annotation.sourceSequenceStart, annotation.sourceSequenceEnd + 1);
    if (sourceEvents.length !== annotation.sourceSequenceEnd - annotation.sourceSequenceStart + 1) {
      throw new Error("Semantic step source range is incomplete.");
    }
    previousEnd = annotation.sourceSequenceEnd;
    const startedAt = new Date(sourceEvents[0]!.occurredAt).getTime();
    const endedAt = new Date(event.occurredAt).getTime();
    const stepWithoutId = {
      ordinal,
      observationKey: annotation.observationKey,
      action: {
        intent: annotation.intent,
        targetKey: annotation.targetKey,
        method: annotation.method,
        delayMs: endedAt - startedAt,
        expectedResult: annotation.expectedResult,
        ...(annotation.reason ? { reason: annotation.reason } : {}),
      },
      label: annotation.label,
      ...(annotation.correctionOfOrdinal !== undefined ? { correctionOfOrdinal: annotation.correctionOfOrdinal } : {}),
      layoutFingerprint: annotation.layoutFingerprint,
      features: [...new Set(annotation.features)].sort(),
      lineage: {
        sourceSequenceStart: annotation.sourceSequenceStart,
        sourceSequenceEnd: annotation.sourceSequenceEnd,
        sourceEventIds: sourceEvents.map((sourceEvent) => sourceEvent.eventId),
        annotationEventId: event.eventId,
      },
    };
    return processedDemonstrationStepSchema.parse({
      ...stepWithoutId,
      stepId: sha256Canonical({ sourceEpisodeId: episode.episodeId, ...stepWithoutId }),
    });
  });

  return processedDemonstrationSchema.parse({
    contractVersion: 1,
    pipelineVersion: "deterministic-annotation-v1",
    processedAt,
    sourceEpisodeId: episode.episodeId,
    sourceEpisodeHash: sha256Canonical(episode),
    field: episode.field,
    operatorIdHash: sha256Canonical({ operatorId: episode.operatorId }),
    successful: episode.outcome.successful,
    steps,
  });
}

export class DemonstrationRetrievalIndex {
  readonly #maxEpisodes: number;
  readonly #episodes = new Map<string, ProcessedDemonstration>();

  constructor(options: { maxEpisodes?: number } = {}) {
    this.#maxEpisodes = options.maxEpisodes ?? 10_000;
    if (!Number.isInteger(this.#maxEpisodes) || this.#maxEpisodes < 1 || this.#maxEpisodes > 100_000) {
      throw new Error("Retrieval index maxEpisodes must be from 1 through 100,000.");
    }
  }

  add(input: ProcessedDemonstration): void {
    const episode = processedDemonstrationSchema.parse(structuredClone(input));
    if (this.#episodes.has(episode.sourceEpisodeId)) throw new Error("Source episode is already indexed.");
    if (this.#episodes.size >= this.#maxEpisodes) throw new Error("Retrieval index episode limit reached.");
    this.#episodes.set(episode.sourceEpisodeId, episode);
  }

  removeSourceEpisode(sourceEpisodeId: string): boolean {
    return this.#episodes.delete(z.string().uuid().parse(sourceEpisodeId));
  }

  retrieve(input: {
    operatorId: string;
    layoutFingerprint: string;
    features: string[];
    limit?: number;
    minimumScore?: number;
  }): DemonstrationRetrievalMatch[] {
    if (!input.operatorId.trim()) throw new Error("Retrieval requires an operator identity.");
    const layoutFingerprint = z.string().regex(/^[a-f0-9]{64}$/).parse(input.layoutFingerprint);
    const features = new Set(z.array(z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,99}$/)).min(1).max(100).parse(input.features));
    const limit = input.limit ?? 5;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Retrieval limit must be from 1 through 100.");
    const minimumScore = input.minimumScore ?? 0.1;
    if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 1) throw new Error("minimumScore must be from 0 through 1.");
    const operatorIdHash = sha256Canonical({ operatorId: input.operatorId });
    const matches: DemonstrationRetrievalMatch[] = [];
    for (const episode of this.#episodes.values()) {
      if (episode.operatorIdHash !== operatorIdHash || !episode.successful) continue;
      for (const step of episode.steps) {
        if (step.layoutFingerprint !== layoutFingerprint || !["preferred", "correction"].includes(step.label)) continue;
        const score = jaccard(features, new Set(step.features));
        if (score < minimumScore) continue;
        matches.push({ score, sourceEpisodeId: episode.sourceEpisodeId, sourceEpisodeHash: episode.sourceEpisodeHash, step: structuredClone(step) });
      }
    }
    return matches
      .sort((left, right) => right.score - left.score || left.step.stepId.localeCompare(right.step.stepId))
      .slice(0, limit);
  }

  size(): number {
    return this.#episodes.size;
  }
}

export function splitHeldOutDemonstrations(
  inputs: ProcessedDemonstration[],
  options: { heldOutPercent?: number; seed?: string } = {},
): HeldOutDemonstrationSplit {
  const heldOutPercent = options.heldOutPercent ?? 20;
  if (!Number.isInteger(heldOutPercent) || heldOutPercent < 1 || heldOutPercent > 99) {
    throw new Error("heldOutPercent must be from 1 through 99.");
  }
  const seed = options.seed ?? "exosuit-held-out-v1";
  if (!seed.trim() || seed.length > 200) throw new Error("Held-out split seed must be non-empty and at most 200 characters.");
  const seen = new Set<string>();
  const training: ProcessedDemonstration[] = [];
  const heldOut: ProcessedDemonstration[] = [];
  for (const input of [...inputs].sort((left, right) => left.sourceEpisodeId.localeCompare(right.sourceEpisodeId))) {
    const episode = processedDemonstrationSchema.parse(structuredClone(input));
    if (seen.has(episode.sourceEpisodeId)) throw new Error("Held-out split contains a duplicate source episode.");
    seen.add(episode.sourceEpisodeId);
    const bucket = Number.parseInt(sha256Canonical({ seed, sourceEpisodeId: episode.sourceEpisodeId }).slice(0, 8), 16) % 100;
    (bucket < heldOutPercent ? heldOut : training).push(episode);
  }
  return { training, heldOut };
}

function validateEpisodeTimeline(episode: DemonstrationEpisode): void {
  const ids = new Set<string>();
  let previousAt = new Date(episode.startedAt).getTime();
  for (const [sequence, event] of episode.events.entries()) {
    const occurredAt = new Date(event.occurredAt).getTime();
    if (event.sequence !== sequence) throw new Error("Demonstration event sequence must be contiguous.");
    if (ids.has(event.eventId)) throw new Error("Demonstration contains a duplicate event ID.");
    if (occurredAt < previousAt) throw new Error("Demonstration event timestamps must be ordered.");
    if (episode.endedAt && occurredAt > new Date(episode.endedAt).getTime()) throw new Error("Demonstration event occurs after the episode ended.");
    ids.add(event.eventId);
    previousAt = occurredAt;
  }
}

function assertNoRedactedSemanticValue(annotation: SemanticStepAnnotation): void {
  for (const value of [annotation.observationKey, annotation.intent, annotation.targetKey, annotation.expectedResult, annotation.reason ?? ""]) {
    if (/\[REDACTED\]/i.test(value)) throw new Error("Redacted sensitive values cannot become semantic step features.");
  }
}

function jaccard(left: Set<string>, right: Set<string>): number {
  const intersection = [...left].filter((value) => right.has(value)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}
