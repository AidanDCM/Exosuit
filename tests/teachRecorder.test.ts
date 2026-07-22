import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TeachRecorderSession } from "../src/teachRecorder.js";

const field = { fieldId: randomUUID(), fieldGeneration: 1 };

function session(overrides: Record<string, unknown> = {}) {
  return new TeachRecorderSession({
    field,
    operatorId: "aidan",
    goal: "Inspect a fixture and save the strongest result.",
    successCriteria: ["one result saved"],
    consentGrantedAt: "2026-07-21T18:00:00.000Z",
    enabledSources: ["input", "accessibility", "annotation"],
    ...overrides,
  });
}

describe("Teach recorder state machine", () => {
  it("records only after consent while keeping input injection permanently disabled", () => {
    const recorder = session();
    expect(recorder.status()).toMatchObject({ state: "armed", inputInjectionAllowed: false, recordingIndicatorVisible: false });
    expect(recorder.start("2026-07-21T18:00:00.100Z")).toMatchObject({ state: "recording", inputInjectionAllowed: false, recordingIndicatorVisible: true });
    recorder.append({ source: "input", kind: "mouse_move", payload: { x: 10, y: 20 }, occurredAt: "2026-07-21T18:00:00.200Z" });
    recorder.pause();
    expect(recorder.status()).toMatchObject({ state: "paused", eventCount: 1, recordingIndicatorVisible: true });
    expect(() => recorder.append({ source: "input", kind: "click", payload: {} })).toThrow(/only while recording/);
    recorder.resume();
    recorder.append({ source: "annotation", kind: "reason", payload: { text: "Best match" }, occurredAt: "2026-07-21T18:00:00.300Z" });
    const episode = recorder.complete({
      successful: true,
      summary: "Fixture result saved.",
      artifactIds: ["artifact-1"],
      endedAt: "2026-07-21T18:00:01.000Z",
    });
    expect(episode).toMatchObject({ status: "completed", events: [{ sequence: 0 }, { sequence: 1 }] });
    expect(recorder.status()).toMatchObject({ state: "completed", recordingIndicatorVisible: false, inputInjectionAllowed: false });
  });

  it("rejects pre-consent start disabled sources and invalid state transitions", () => {
    const recorder = session();
    expect(() => recorder.start("2026-07-21T17:59:59.000Z")).toThrow(/before consent/);
    recorder.start("2026-07-21T18:00:00.000Z");
    expect(() => recorder.start()).toThrow(/armed/);
    expect(() => recorder.append({ source: "visual", kind: "frame_changed", payload: {} })).toThrow(/not enabled/);
    expect(() => recorder.resume()).toThrow(/paused/);
    recorder.abort({ summary: "Operator ended the demonstration.", endedAt: "2026-07-21T18:00:01.000Z" });
    expect(() => recorder.pause()).toThrow(/recording/);
    expect(() => recorder.complete({ successful: false, summary: "late" })).toThrow(/active/);
  });

  it("turns a recorder fault into a terminal aborted episode with visible reason", () => {
    const recorder = session();
    recorder.start("2026-07-21T18:00:00.000Z");
    recorder.append({ source: "accessibility", kind: "focus_changed", payload: { controlType: "Edit" }, occurredAt: "2026-07-21T18:00:00.100Z" });
    const episode = recorder.fault("Input hook disconnected.", "2026-07-21T18:00:00.200Z");
    expect(episode).toMatchObject({ status: "aborted", outcome: { successful: false } });
    expect(recorder.status()).toMatchObject({ state: "faulted", faultReason: "Input hook disconnected.", recordingIndicatorVisible: false });
    expect(() => recorder.fault("again")).toThrow(/cannot fault again/);
  });
});
