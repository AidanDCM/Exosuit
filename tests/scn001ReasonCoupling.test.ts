import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createFieldChannelEnvelope } from "../src/fieldChannel.js";
import { fieldDisplayContractSchema } from "../src/fieldContracts.js";
import { fieldHeartbeatSchema, type FieldHeartbeat } from "../src/fieldHeartbeat.js";
import { FieldSceneChannelReceiver, type FieldSceneObservationPayload } from "../src/fieldSceneChannel.js";
import { FieldSceneHostMonitor } from "../src/fieldSceneHostMonitor.js";
import { scn001Expectations, type Scn001CeremonyId } from "../src/completion/scn001.js";

/**
 * The SCN-001 contract pins the exact reason each negative ceremony must observe. Those strings
 * are only worth anything while they are the strings the runtime actually emits, and a contract
 * that pins a reworded reason is worse than one that pins nothing: it would keep passing while
 * asserting a rule the runtime no longer implements.
 *
 * So the expectations are checked against the real monitor here rather than against a copy of the
 * text. Rewording an invalidation reason fails this suite, which is the intended cost.
 */

const VALUE_NAME = "Exosuit.Field.Scene";
const field = { fieldId: randomUUID(), fieldGeneration: 4 };
const bootId = randomUUID();
const secret = "scene-channel-test-secret-that-is-at-least-thirty-two-characters";
const sentAt = "2026-08-10T18:00:00.000Z";
const now = new Date("2026-08-10T18:00:01.000Z");
const display = fieldDisplayContractSchema.parse({
  monitorCount: 1, width: 1920, height: 1080, scalePercent: 100, browserZoomPercent: 100,
  keyboardLayout: "en-US", dynamicResolutionAllowed: false,
});
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function heartbeat(overrides: Partial<FieldHeartbeat> = {}): FieldHeartbeat {
  return fieldHeartbeatSchema.parse({
    contractVersion: 1, field, agentId: "glove-agent", bootId, sequence: 20, observedAt: sentAt,
    lifecycle: "ready", desktopReady: true, sessionLocked: false, secureDesktopActive: false,
    inputQueueDepth: 0, pendingCommandCount: 0, workingSetBytes: 1_000, ...overrides,
  });
}

function payload(overrides: Partial<FieldSceneObservationPayload> = {}): FieldSceneObservationPayload {
  const window = {
    id: "window-1", title: "", processName: "notepad", processId: 123, isActive: true,
    isMinimized: false, bounds: { x: 0, y: 0, width: 800, height: 600 },
  };
  return {
    contractVersion: 1, bootId, agentId: "glove-agent", windowsSessionId: "1",
    observation: {
      observationId: "observation-1", capturedAt: sentAt, mode: "observe",
      provider: "windows-ui-automation", activeWindow: window, windows: [window],
      elements: [{
        id: "element-1", windowId: "window-1", name: "", controlType: "Button", automationId: "save",
        enabled: true, focused: true, offscreen: false, isSensitive: false, source: "accessibility",
        supportedActions: ["invoke_element"],
      }],
      warnings: ["UI text and provider warning text were removed before structural Field scene transport."],
    },
    cursor: { x: 100, y: 100, visible: true }, modal: { present: false }, ...overrides,
  };
}

function envelope(sequence: number, value: Record<string, unknown> = payload()) {
  return createFieldChannelEnvelope({
    field, direction: "guest_to_host", sequence, messageType: "scene_observation", payload: value,
    keyId: "scene-key-1", secret, sentAt, ttlSeconds: 30,
  });
}

function snapshotFor(value: unknown): Record<string, string> {
  return { [VALUE_NAME]: JSON.stringify(value) };
}

function monitor(): FieldSceneHostMonitor {
  const root = mkdtempSync(join(tmpdir(), "exosuit-scn001-coupling-"));
  temporaryRoots.push(root);
  return new FieldSceneHostMonitor({
    receiver: new FieldSceneChannelReceiver({
      field, display, agentId: "glove-agent", windowsSessionId: "1", expectedKeyId: "scene-key-1",
      replayStateFilePath: join(root, "replay.json"),
    }),
    secret,
    valueName: VALUE_NAME,
  });
}

/** Drives a monitor to a genuinely actionable scene, as every negative case below assumes. */
function ready(): FieldSceneHostMonitor {
  const target = monitor();
  expect(target.poll({ snapshot: snapshotFor(envelope(1)), heartbeat: heartbeat(), now }).status).toBe("ready");
  return target;
}

function invalidationReason(state: ReturnType<FieldSceneHostMonitor["poll"]>): string {
  expect(state.status).toBe("invalidated");
  return state.status === "invalidated" ? state.reason : "";
}

function pinnedCode(id: Scn001CeremonyId, index = 0): string {
  return scn001Expectations[id].expectedCodes[index]!;
}

describe("SCN-001 pinned reasons match the runtime", () => {
  it("SCN-001.L4 pins the reason a locked session actually produces", () => {
    const reason = invalidationReason(
      ready().poll({ snapshot: snapshotFor(envelope(2)), heartbeat: heartbeat({ sessionLocked: true }), now }),
    );
    expect(reason).toBe(pinnedCode("SCN-001.L4"));
  });

  it("SCN-001.L6 pins the reason Secure Desktop actually produces", () => {
    const reason = invalidationReason(
      ready().poll({ snapshot: snapshotFor(envelope(2)), heartbeat: heartbeat({ secureDesktopActive: true }), now }),
    );
    expect(reason).toBe(pinnedCode("SCN-001.L6"));
  });

  it("SCN-001.L8 pins the reason a boot change actually produces", () => {
    const reason = invalidationReason(
      ready().poll({ snapshot: snapshotFor(envelope(2)), heartbeat: heartbeat({ bootId: randomUUID() }), now }),
    );
    expect(reason).toBe(pinnedCode("SCN-001.L8"));
  });

  it("SCN-001.L7 and SCN-001.L10 pin the reason an absent value actually produces", () => {
    const reason = invalidationReason(ready().poll({ snapshot: {}, heartbeat: heartbeat(), now }));
    expect(reason).toBe(pinnedCode("SCN-001.L7"));
    expect(reason).toBe(pinnedCode("SCN-001.L10", 0));
  });

  it("SCN-001.L10 pins the stem a corrupt value actually produces", () => {
    const reason = invalidationReason(
      ready().poll({ snapshot: { [VALUE_NAME]: "{not json" }, heartbeat: heartbeat(), now }),
    );
    const stem = pinnedCode("SCN-001.L10", 1);
    expect(reason.startsWith(stem)).toBe(true);
    // The contract requires a cause past the stem, so the runtime must supply one.
    expect(reason.length).toBeGreaterThan(stem.length);
  });

  it("SCN-001.L9 pins the stem a rejected scene actually produces", () => {
    const foreign = createFieldChannelEnvelope({
      field: { fieldId: field.fieldId, fieldGeneration: 3 },
      direction: "guest_to_host", sequence: 2, messageType: "scene_observation", payload: payload(),
      keyId: "scene-key-1", secret, sentAt, ttlSeconds: 30,
    });
    const reason = invalidationReason(
      ready().poll({ snapshot: snapshotFor(foreign), heartbeat: heartbeat(), now }),
    );
    const stem = pinnedCode("SCN-001.L9");
    expect(reason.startsWith(stem)).toBe(true);
    expect(reason.length).toBeGreaterThan(stem.length);
  });

  it("SCN-001.L5 pins the reason a pre-lock scene actually produces after unlock", () => {
    const target = ready();
    // Lock, then unlock, then present a scene captured while the desktop was still observable.
    invalidationReason(target.poll({
      snapshot: snapshotFor(envelope(2)), heartbeat: heartbeat({ sessionLocked: true, observedAt: "2026-08-10T18:00:05.000Z" }), now,
    }));
    const stale = envelope(3, payload({
      observation: { ...payload().observation, observationId: "observation-stale", capturedAt: "2026-08-10T18:00:02.000Z" },
    }) as unknown as Record<string, unknown>);
    const reason = invalidationReason(target.poll({
      snapshot: snapshotFor(stale),
      heartbeat: heartbeat({ sessionLocked: false, observedAt: "2026-08-10T18:00:06.000Z" }),
      now: new Date("2026-08-10T18:00:07.000Z"),
    }));
    expect(reason).toBe(pinnedCode("SCN-001.L5"));
  });
});
