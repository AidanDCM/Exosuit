import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DemonstrationRecorder, type DemonstrationEpisode } from "../src/demonstration.js";
import { DemonstrationRetrievalIndex, processDemonstration, splitHeldOutDemonstrations } from "../src/demonstrationProcessing.js";

const layout = "a".repeat(64);

function episode(options: { operatorId?: string; successful?: boolean; secondLabel?: "preferred" | "mistake" | "correction" } = {}) {
  const recorder = new DemonstrationRecorder({
    field: { fieldId: randomUUID(), fieldGeneration: 1 },
    operatorId: options.operatorId ?? "aidan",
    goal: "Open a result and save it.",
    successCriteria: ["result saved"],
    consentGrantedAt: "2026-07-28T20:00:00.000Z",
    startedAt: "2026-07-28T20:00:00.000Z",
  });
  recorder.append({ source: "input", kind: "click", occurredAt: "2026-07-28T20:00:00.100Z", payload: { button: "left" } });
  recorder.append({
    source: "annotation", kind: "semantic_step", occurredAt: "2026-07-28T20:00:00.300Z",
    payload: { sourceSequenceStart: 0, sourceSequenceEnd: 0, observationKey: "results-page", intent: "Open result",
      targetKey: "result-card", method: "mouse", expectedResult: "Result detail appears", label: "preferred",
      layoutFingerprint: layout, features: ["results", "open", "result"] },
  });
  recorder.append({ source: "accessibility", kind: "focus_changed", occurredAt: "2026-07-28T20:00:00.400Z", payload: { role: "document" } });
  recorder.append({ source: "input", kind: "shortcut", occurredAt: "2026-07-28T20:00:00.500Z", payload: { keys: "ctrl+s" } });
  const secondLabel = options.secondLabel ?? "preferred";
  recorder.append({
    source: "annotation", kind: "semantic_step", occurredAt: "2026-07-28T20:00:00.700Z",
    payload: { sourceSequenceStart: 2, sourceSequenceEnd: 3, observationKey: "result-detail", intent: "Save result",
      targetKey: "save-command", method: "keyboard", expectedResult: "Result is saved", label: secondLabel,
      ...(secondLabel === "correction" ? { correctionOfOrdinal: 0 } : {}), layoutFingerprint: layout,
      features: ["result", "save", "detail"] },
  });
  return recorder.complete({ successful: options.successful ?? true, summary: "Done.", endedAt: "2026-07-28T20:00:01.000Z" });
}

describe("deterministic demonstration processing", () => {
  it("segments owner annotations into immutable, source-lined semantic steps", () => {
    const source = episode({ secondLabel: "correction" });
    const processed = processDemonstration(source, "2026-07-28T20:01:00.000Z");
    expect(processed).toMatchObject({ pipelineVersion: "deterministic-annotation-v1", sourceEpisodeId: source.episodeId, successful: true });
    expect(processed.steps).toHaveLength(2);
    expect(processed.steps[0]).toMatchObject({ ordinal: 0, label: "preferred", action: { intent: "Open result", delayMs: 200 } });
    expect(processed.steps[1]).toMatchObject({ ordinal: 1, label: "correction", correctionOfOrdinal: 0 });
    expect(processed.steps[1]!.lineage.sourceEventIds).toEqual([source.events[2]!.eventId, source.events[3]!.eventId]);
    expect(processed.operatorIdHash).not.toContain("aidan");
  });

  it("fails closed on nonterminal, ambiguous, overlapping, and redacted semantics", () => {
    const recording = { ...episode(), status: "recording", endedAt: undefined, outcome: undefined } as DemonstrationEpisode;
    expect(() => processDemonstration(recording)).toThrow(/terminal/);

    const overlapping = episode();
    overlapping.events[4]!.payload.sourceSequenceStart = 0;
    expect(() => processDemonstration(overlapping)).toThrow(/overlap/);

    const future = episode();
    future.events[1]!.payload.sourceSequenceEnd = 1;
    expect(() => processDemonstration(future)).toThrow(/must follow/);

    const redacted = episode();
    redacted.events[1]!.payload.intent = "Use [REDACTED]";
    expect(() => processDemonstration(redacted)).toThrow(/sensitive values/);
  });

  it("retrieves only relevant same-owner same-layout preferred behavior", () => {
    const index = new DemonstrationRetrievalIndex();
    const preferred = processDemonstration(episode());
    const mistake = processDemonstration(episode({ secondLabel: "mistake" }));
    const failed = processDemonstration(episode({ successful: false }));
    index.add(preferred);
    index.add(mistake);
    index.add(failed);

    const matches = index.retrieve({ operatorId: "aidan", layoutFingerprint: layout, features: ["save", "result"] });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((match) => ["preferred", "correction"].includes(match.step.label))).toBe(true);
    expect(matches.every((match) => match.sourceEpisodeId !== failed.sourceEpisodeId)).toBe(true);
    expect(index.retrieve({ operatorId: "someone-else", layoutFingerprint: layout, features: ["save", "result"] })).toEqual([]);
    expect(index.retrieve({ operatorId: "aidan", layoutFingerprint: "b".repeat(64), features: ["save", "result"] })).toEqual([]);
  });

  it("propagates source deletion and returns copies rather than index authority", () => {
    const index = new DemonstrationRetrievalIndex({ maxEpisodes: 1 });
    const processed = processDemonstration(episode());
    index.add(processed);
    const first = index.retrieve({ operatorId: "aidan", layoutFingerprint: layout, features: ["open", "result"] });
    first[0]!.step.action.intent = "mutated by caller";
    expect(index.retrieve({ operatorId: "aidan", layoutFingerprint: layout, features: ["open", "result"] })[0]!.step.action.intent).toBe("Open result");
    expect(index.removeSourceEpisode(processed.sourceEpisodeId)).toBe(true);
    expect(index.size()).toBe(0);
    expect(index.retrieve({ operatorId: "aidan", layoutFingerprint: layout, features: ["open", "result"] })).toEqual([]);
  });

  it("creates a deterministic source-isolated held-out split", () => {
    const episodes = Array.from({ length: 20 }, () => processDemonstration(episode()));
    const first = splitHeldOutDemonstrations(episodes, { heldOutPercent: 25, seed: "evaluation-v1" });
    const second = splitHeldOutDemonstrations([...episodes].reverse(), { heldOutPercent: 25, seed: "evaluation-v1" });
    expect(second).toEqual(first);
    expect(new Set([...first.training, ...first.heldOut].map((item) => item.sourceEpisodeId)).size).toBe(20);
    expect(first.training.every((item) => !first.heldOut.some((heldOut) => heldOut.sourceEpisodeId === item.sourceEpisodeId))).toBe(true);
    expect(() => splitHeldOutDemonstrations([episodes[0]!, episodes[0]!])).toThrow(/duplicate source/);
  });
});
