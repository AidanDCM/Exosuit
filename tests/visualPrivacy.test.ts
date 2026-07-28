import { describe, expect, it } from "vitest";
import {
  EphemeralVisualFrame,
  VisualCapturePolicy,
  acceptVisualGrounding,
} from "../src/visualPrivacy.js";

describe("visual privacy foundation", () => {
  it("is disabled by default and requires local approval plus a visible indicator", () => {
    const disabled = new VisualCapturePolicy();
    expect(() =>
      disabled.issueConsent({
        taskId: "task-a",
        windowId: "window-a",
        region: { x: 0, y: 0, width: 2, height: 2 },
        purpose: "Synthetic test.",
        durationMs: 5_000,
        maxFrames: 1,
        localApproved: true,
        indicatorVisible: true,
      }),
    ).toThrow(/disabled/);
    const enabled = new VisualCapturePolicy({ enabled: true });
    expect(() =>
      enabled.issueConsent({
        taskId: "task-a",
        windowId: "window-a",
        region: { x: 0, y: 0, width: 2, height: 2 },
        purpose: "Synthetic test.",
        durationMs: 5_000,
        maxFrames: 1,
        localApproved: false,
        indicatorVisible: true,
      }),
    ).toThrow(/local task approval/);
    expect(() =>
      enabled.issueConsent({
        taskId: "task-a",
        windowId: "window-a",
        region: { x: 0, y: 0, width: 2, height: 2 },
        purpose: "Synthetic test.",
        durationMs: 5_000,
        maxFrames: 1,
        localApproved: true,
        indicatorVisible: false,
      }),
    ).toThrow(/visible local indicator/);
  });

  it("enforces task, window, region, expiry, and frame-budget scope", () => {
    const policy = new VisualCapturePolicy({ enabled: true });
    const now = new Date("2026-07-21T15:00:00.000Z");
    const consent = policy.issueConsent({
      taskId: "task-a",
      windowId: "window-a",
      region: { x: 10, y: 10, width: 20, height: 20 },
      purpose: "Synthetic test.",
      durationMs: 5_000,
      maxFrames: 1,
      localApproved: true,
      indicatorVisible: true,
      now,
    });
    expect(() =>
      policy.consume({
        consentId: consent.consentId,
        taskId: "other-task",
        windowId: "window-a",
        region: { x: 10, y: 10, width: 5, height: 5 },
        indicatorVisible: true,
        now,
      }),
    ).toThrow(/cannot cross/);
    expect(() =>
      policy.consume({
        consentId: consent.consentId,
        taskId: "task-a",
        windowId: "window-a",
        region: { x: 0, y: 0, width: 30, height: 30 },
        indicatorVisible: true,
        now,
      }),
    ).toThrow(/exceeds the approved bounds/);
    policy.consume({
      consentId: consent.consentId,
      taskId: "task-a",
      windowId: "window-a",
      region: { x: 10, y: 10, width: 5, height: 5 },
      indicatorVisible: true,
      now,
    });
    expect(() =>
      policy.consume({
        consentId: consent.consentId,
        taskId: "task-a",
        windowId: "window-a",
        region: { x: 10, y: 10, width: 5, height: 5 },
        indicatorVisible: true,
        now,
      }),
    ).toThrow(/frame budget/);

    const expiring = policy.issueConsent({
      taskId: "task-b",
      windowId: "window-b",
      region: { x: 0, y: 0, width: 2, height: 2 },
      purpose: "Expiry test.",
      durationMs: 1_000,
      maxFrames: 1,
      localApproved: true,
      indicatorVisible: true,
      now,
    });
    expect(() =>
      policy.consume({
        consentId: expiring.consentId,
        taskId: "task-b",
        windowId: "window-b",
        region: { x: 0, y: 0, width: 2, height: 2 },
        indicatorVisible: true,
        now: new Date(now.getTime() + 1_001),
      }),
    ).toThrow(/expired/);
  });

  it("redacts pixels in memory, omits bytes from JSON, and zeroizes on disposal", () => {
    const policy = new VisualCapturePolicy({ enabled: true });
    const consent = policy.issueConsent({
      taskId: "task-a",
      windowId: "window-a",
      region: { x: 0, y: 0, width: 2, height: 2 },
      purpose: "Synthetic redaction test.",
      durationMs: 5_000,
      maxFrames: 1,
      localApproved: true,
      indicatorVisible: true,
    });
    const frame = new EphemeralVisualFrame({
      consent,
      region: consent.region,
      width: 2,
      height: 2,
      rgbaBytes: new Uint8Array(16).fill(100),
      redactions: [{ x: 0, y: 0, width: 1, height: 1 }],
    });
    expect([...frame.read().slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect(JSON.stringify(frame)).not.toContain("100,100");
    expect(JSON.stringify(frame)).toContain("ephemeral_memory");
    frame.dispose();
    expect(() => frame.read()).toThrow(/disposed/);
  });

  it("rejects partially or wholly out-of-frame redactions instead of counting a no-op", () => {
    const policy = new VisualCapturePolicy({ enabled: true });
    const consent = policy.issueConsent({
      taskId: "task-a",
      windowId: "window-a",
      region: { x: 10, y: 20, width: 2, height: 2 },
      purpose: "Synthetic redaction containment test.",
      durationMs: 5_000,
      maxFrames: 2,
      localApproved: true,
      indicatorVisible: true,
    });
    const create = (redaction: { x: number; y: number; width: number; height: number }) =>
      new EphemeralVisualFrame({
        consent,
        region: consent.region,
        width: 2,
        height: 2,
        rgbaBytes: new Uint8Array(16).fill(100),
        redactions: [redaction],
      });

    expect(() => create({ x: 1, y: 1, width: 2, height: 1 })).toThrow(
      /redaction lies outside the captured frame/,
    );
    expect(() => create({ x: 3, y: 3, width: 1, height: 1 })).toThrow(
      /redaction lies outside the captured frame/,
    );
    const contained = create({ x: 1, y: 1, width: 1, height: 1 });
    expect(contained.metadata.redactedRegionCount).toBe(1);
    expect([...contained.read().slice(12, 16)]).toEqual([0, 0, 0, 255]);
  });

  it("accepts only in-frame grounding above the configured confidence threshold", () => {
    const policy = new VisualCapturePolicy({ enabled: true });
    const consent = policy.issueConsent({
      taskId: "task-a",
      windowId: "window-a",
      region: { x: 0, y: 0, width: 4, height: 4 },
      purpose: "Synthetic grounding test.",
      durationMs: 5_000,
      maxFrames: 1,
      localApproved: true,
      indicatorVisible: true,
    });
    const frame = new EphemeralVisualFrame({
      consent,
      region: consent.region,
      width: 4,
      height: 4,
      rgbaBytes: new Uint8Array(64),
    });
    expect(
      acceptVisualGrounding({
        frame,
        grounding: {
          frameId: frame.metadata.frameId,
          label: "Submit button",
          region: { x: 1, y: 1, width: 2, height: 2 },
          confidence: 0.95,
          source: "synthetic",
        },
      }).label,
    ).toBe("Submit button");
    expect(() =>
      acceptVisualGrounding({
        frame,
        grounding: {
          frameId: frame.metadata.frameId,
          label: "Uncertain target",
          region: { x: 1, y: 1, width: 2, height: 2 },
          confidence: 0.5,
          source: "synthetic",
        },
      }),
    ).toThrow(/below the required threshold/);
    expect(() =>
      acceptVisualGrounding({
        frame,
        grounding: {
          frameId: frame.metadata.frameId,
          label: "Outside",
          region: { x: 3, y: 3, width: 2, height: 2 },
          confidence: 0.99,
          source: "synthetic",
        },
      }),
    ).toThrow(/outside the captured frame/);
  });
});
