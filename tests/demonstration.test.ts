import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DemonstrationRecorder, redactDemonstrationPayload, summarizeDemonstration } from "../src/demonstration.js";

function recorder(maxEvents = 10) {
  return new DemonstrationRecorder({
    field: { fieldId: randomUUID(), fieldGeneration: 1 },
    operatorId: "aidan",
    goal: "Open a test site, inspect results, and save the strongest two.",
    successCriteria: ["two results selected", "output artifact created"],
    consentGrantedAt: "2026-07-21T18:00:00.000Z",
    startedAt: "2026-07-21T18:00:00.000Z",
    maxEvents,
  });
}

describe("demonstration recorder", () => {
  it("records synchronized event sources and returns a summary", () => {
    const session = recorder();
    session.append({
      source: "input",
      kind: "mouse_move",
      occurredAt: "2026-07-21T18:00:00.100Z",
      payload: { x: 100, y: 200 },
    });
    session.append({
      source: "accessibility",
      kind: "focused_element_changed",
      occurredAt: "2026-07-21T18:00:00.200Z",
      payload: { controlType: "Edit", name: "Search" },
    });
    const episode = session.complete({
      successful: true,
      summary: "The output artifact was created.",
      artifactIds: ["artifact-1"],
      endedAt: "2026-07-21T18:00:01.000Z",
    });
    expect(episode.events.map((event) => event.sequence)).toEqual([0, 1]);
    expect(summarizeDemonstration(episode)).toEqual({
      eventCount: 2,
      bySource: { input: 1, visual: 0, accessibility: 1, system: 0, annotation: 0 },
      durationMilliseconds: 1_000,
    });
  });

  it("redacts secret-shaped fields recursively without deleting useful motor timing", () => {
    expect(
      redactDemonstrationPayload({
        keyDownAtUs: 100,
        keyUpAtUs: 112,
        nested: { accessToken: "secret-value", cookie: "session-value", ordinaryText: "hello" },
      }),
    ).toEqual({
      keyDownAtUs: 100,
      keyUpAtUs: 112,
      nested: { accessToken: "[REDACTED]", cookie: "[REDACTED]", ordinaryText: "hello" },
    });
  });

  it("rejects out-of-order timestamps", () => {
    const session = recorder(2);
    session.append({
      source: "visual",
      kind: "frame_changed",
      occurredAt: "2026-07-21T18:00:02.000Z",
      payload: { changedPixels: 22 },
    });
    expect(() =>
      session.append({
        source: "input",
        kind: "click",
        occurredAt: "2026-07-21T18:00:01.000Z",
        payload: { x: 2, y: 3 },
      }),
    ).toThrow(/timestamp order/);
  });

  it("rejects post-completion writes and event overflow", () => {
    const limited = recorder(1);
    limited.append({
      source: "visual",
      kind: "frame_changed",
      occurredAt: "2026-07-21T18:00:00.100Z",
      payload: { changedPixels: 22 },
    });
    expect(() =>
      limited.append({
        source: "input",
        kind: "click",
        occurredAt: "2026-07-21T18:00:00.200Z",
        payload: { x: 2, y: 3 },
      }),
    ).toThrow(/event limit/);

    const completeSession = recorder();
    completeSession.complete({
      successful: false,
      summary: "Demonstration intentionally ended.",
      endedAt: "2026-07-21T18:00:01.000Z",
    });
    expect(() =>
      completeSession.append({ source: "input", kind: "click", payload: { x: 1, y: 1 } }),
    ).toThrow(/recording/);
  });
});
