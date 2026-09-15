import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFieldChannelEnvelope } from "../src/fieldChannel.js";
import { fieldDisplayContractSchema } from "../src/fieldContracts.js";
import { fieldHeartbeatSchema, type FieldHeartbeat } from "../src/fieldHeartbeat.js";
import { FieldSceneChannelReceiver, type FieldSceneObservationPayload } from "../src/fieldSceneChannel.js";

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
  const window = { id: "window-1", title: "", processName: "notepad", processId: 123, isActive: true,
    isMinimized: false, bounds: { x: 0, y: 0, width: 800, height: 600 } };
  return {
    contractVersion: 1, bootId, agentId: "glove-agent", windowsSessionId: "1",
    observation: {
      observationId: "observation-1", capturedAt: sentAt, mode: "observe", provider: "windows-ui-automation",
      activeWindow: window, windows: [window], elements: [{
        id: "element-1", windowId: "window-1", name: "", controlType: "Button", automationId: "save",
        enabled: true, focused: true, offscreen: false, isSensitive: false, source: "accessibility",
        supportedActions: ["invoke_element"],
      }], warnings: ["UI text and provider warning text were removed before structural Field scene transport."],
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

function receiver(maximumPayloadBytes?: number, replayStateFilePath?: string) {
  if (!replayStateFilePath) {
    const root = mkdtempSync(join(tmpdir(), "exosuit-scene-channel-"));
    temporaryRoots.push(root);
    replayStateFilePath = join(root, "replay.json");
  }
  return new FieldSceneChannelReceiver({
    field, display, agentId: "glove-agent", windowsSessionId: "1", expectedKeyId: "scene-key-1",
    maximumPayloadBytes, replayStateFilePath,
  });
}

describe("authenticated structural Field scene receiver", () => {
  it("accepts an exact boot/session-bound structural scene and advances monotonically", () => {
    const target = receiver();
    const first = target.accept({ envelope: envelope(1), heartbeat: heartbeat(), secret, now });
    const secondPayload = payload({ observation: { ...payload().observation, observationId: "observation-2", capturedAt: "2026-08-10T18:00:00.500Z" } });
    const second = target.accept({ envelope: envelope(2, secondPayload), heartbeat: heartbeat({ sequence: 21, observedAt: "2026-08-10T18:00:00.500Z" }), secret, now });
    expect(first).toMatchObject({ field, sceneVersion: 1, observationId: "observation-1" });
    expect(second.sceneVersion).toBe(2);
  });

  it("rejects raw UI text screenshots wrong boot session agent and message type", () => {
    const cases: Array<() => unknown> = [
      () => receiver().accept({ envelope: envelope(1, payload({ observation: { ...payload().observation, windows: [{ ...payload().observation.windows[0]!, title: "private" }] } })), heartbeat: heartbeat(), secret, now }),
      () => receiver().accept({ envelope: envelope(1, { ...payload(), observation: { ...payload().observation, screenshotBase64: "abc" } }), heartbeat: heartbeat(), secret, now }),
      () => receiver().accept({ envelope: envelope(1, payload({ bootId: randomUUID() })), heartbeat: heartbeat(), secret, now }),
      () => receiver().accept({ envelope: envelope(1, payload({ windowsSessionId: "2" })), heartbeat: heartbeat(), secret, now }),
      () => receiver().accept({ envelope: envelope(1, payload({ agentId: "other-agent" })), heartbeat: heartbeat(), secret, now }),
      () => receiver().accept({ envelope: createFieldChannelEnvelope({ field, direction: "guest_to_host", sequence: 1, messageType: "event", payload: {}, keyId: "scene-key-1", secret, sentAt, ttlSeconds: 30 }), heartbeat: heartbeat(), secret, now }),
    ];
    for (const attempt of cases) expect(attempt).toThrow();
  });

  it("rejects oversize replay and timestamp regression without consuming the next scene version", () => {
    const root = mkdtempSync(join(tmpdir(), "exosuit-scene-channel-restart-"));
    temporaryRoots.push(root);
    const replayStateFilePath = join(root, "replay.json");
    const target = receiver(1_024, replayStateFilePath);
    const firstEnvelope = envelope(1);
    expect(target.accept({ envelope: firstEnvelope, heartbeat: heartbeat(), secret, now }).sceneVersion).toBe(1);
    expect(() => target.accept({ envelope: firstEnvelope, heartbeat: heartbeat(), secret, now })).toThrow(/replayed/);
    expect(() => receiver(1_024, replayStateFilePath).accept({ envelope: firstEnvelope, heartbeat: heartbeat(), secret, now })).toThrow();
    const regressed = payload({ observation: { ...payload().observation, capturedAt: "2026-08-10T17:59:59.999Z" } });
    expect(() => target.accept({ envelope: envelope(2, regressed), heartbeat: heartbeat(), secret, now })).toThrow(/backwards/);
    const oversized = payload({ observation: { ...payload().observation, windows: Array.from({ length: 10 }, (_, index) => ({
      ...payload().observation.windows[0]!, id: `window-${index + 1}`, isActive: index === 0,
    })) } });
    expect(() => target.accept({ envelope: envelope(2, oversized), heartbeat: heartbeat(), secret, now })).toThrow(/byte bound/);
    const next = payload({ observation: { ...payload().observation, observationId: "observation-2", capturedAt: "2026-08-10T18:00:00.500Z" } });
    expect(target.accept({ envelope: envelope(2, next), heartbeat: heartbeat(), secret, now }).sceneVersion).toBe(2);
  });

  it("rejects an authenticated scene whose coordinates contradict the display contract without consuming replay state", () => {
    const target = receiver();
    const mismatchedWindow = {
      ...payload().observation.windows[0]!,
      bounds: { x: 0, y: 0, width: 2048, height: 1152 },
    };
    const mismatched = payload({
      observation: {
        ...payload().observation,
        activeWindow: mismatchedWindow,
        windows: [mismatchedWindow],
      },
    });
    expect(() => target.accept({ envelope: envelope(1, mismatched), heartbeat: heartbeat(), secret, now }))
      .toThrow(/display contract/);
    expect(target.accept({ envelope: envelope(1), heartbeat: heartbeat(), secret, now }).sceneVersion).toBe(1);
  });
});
