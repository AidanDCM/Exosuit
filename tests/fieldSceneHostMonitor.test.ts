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

function snapshotFor(value: unknown, chunkSize = 1000): Record<string, string> {
  const text = JSON.stringify(value);
  if (text.length <= chunkSize) return { [VALUE_NAME]: text };
  const parts: string[] = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    parts.push(text.slice(index, index + chunkSize));
  }
  const snapshot: Record<string, string> = {
    [VALUE_NAME]: JSON.stringify({
      contractVersion: 1, transport: "chunked", chunkCount: parts.length,
      sha256: createHash("sha256").update(text, "utf8").digest("hex"),
    }),
  };
  parts.forEach((part, index) => {
    snapshot[`${VALUE_NAME}.${index.toString().padStart(3, "0")}`] = part;
  });
  return snapshot;
}

function monitor() {
  const root = mkdtempSync(join(tmpdir(), "exosuit-host-monitor-"));
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

/** Drives a monitor to a genuinely actionable scene. */
function ready(sequence = 1) {
  const target = monitor();
  const state = target.poll({ snapshot: snapshotFor(envelope(sequence)), heartbeat: heartbeat(), now });
  expect(state.status).toBe("ready");
  return target;
}

describe("host scene monitor", () => {
  it("starts with no scene and is not actionable", () => {
    const target = monitor();
    expect(target.state).toEqual({ status: "no_scene" });
    expect(target.isActionable).toBe(false);
  });

  it("becomes ready on a verified scene", () => {
    const target = ready();
    expect(target.isActionable).toBe(true);
  });

  it("invalidates when the scene value disappears", () => {
    const target = ready();

    const state = target.poll({ snapshot: {}, heartbeat: heartbeat({ sequence: 21 }), now });

    // Absence is not quiet: the guest stopped publishing, so the last scene describes a desktop
    // nothing is observing.
    expect(state.status).toBe("invalidated");
    expect(target.isActionable).toBe(false);
  });

  it("invalidates on a corrupt transport and says so", () => {
    const target = ready();
    const broken = snapshotFor(envelope(2), 64);
    delete broken[`${VALUE_NAME}.001`];

    const state = target.poll({ snapshot: broken, heartbeat: heartbeat({ sequence: 21 }), now });

    expect(state.status === "invalidated" && state.reason).toContain("scene transport failed");
  });

  it("invalidates on a rejected scene and says so distinctly", () => {
    const target = ready();

    const state = target.poll({
      snapshot: snapshotFor(envelope(2, payload({ windowsSessionId: "2" }))),
      heartbeat: heartbeat({ sequence: 21 }),
      now,
    });

    // A rejection reads differently from a transport fault, so the recorded reason stays exact.
    expect(state.status === "invalidated" && state.reason).toContain("scene rejected");
  });

  it("invalidates on a locked guest without reading the value", () => {
    const target = ready();

    const state = target.poll({
      // A perfectly good scene is present; the lock alone must clear readiness.
      snapshot: snapshotFor(envelope(2)),
      heartbeat: heartbeat({ sequence: 21, sessionLocked: true }),
      now,
    });

    expect(state.status === "invalidated" && state.reason).toContain("locked");
  });

  it("invalidates on Secure Desktop", () => {
    const target = ready();

    const state = target.poll({
      snapshot: snapshotFor(envelope(2)),
      heartbeat: heartbeat({ sequence: 21, secureDesktopActive: true }),
      now,
    });

    expect(state.status === "invalidated" && state.reason).toContain("Secure Desktop");
  });

  it("does not restore readiness when the guest merely unlocks", () => {
    const target = ready();
    // The lock is observed after the scene was captured.
    target.poll({
      snapshot: snapshotFor(envelope(2)),
      heartbeat: heartbeat({ sequence: 21, sessionLocked: true, observedAt: "2026-08-10T18:00:00.500Z" }),
      now,
    });

    // A scene captured before the lock authenticates perfectly and is still stale: the desktop
    // may have changed while nothing was observing it.
    const state = target.poll({ snapshot: snapshotFor(envelope(2)), heartbeat: heartbeat({ sequence: 22 }), now });

    expect(state.status).toBe("invalidated");
    expect(state.status === "invalidated" && state.reason).toContain("stopped being observable");
  });

  it("restores readiness on a scene captured after the desktop became observable again", () => {
    const target = ready();
    target.poll({
      snapshot: snapshotFor(envelope(2)),
      heartbeat: heartbeat({ sequence: 21, sessionLocked: true, observedAt: "2026-08-10T18:00:00.500Z" }),
      now,
    });

    const fresh = payload({
      observation: {
        ...payload().observation,
        observationId: "observation-2",
        capturedAt: "2026-08-10T18:00:00.900Z",
      },
    });
    const state = target.poll({
      snapshot: snapshotFor(envelope(3, fresh)),
      heartbeat: heartbeat({ sequence: 22, observedAt: "2026-08-10T18:00:00.900Z" }),
      now,
    });

    expect(state.status).toBe("ready");
  });

  it("returns to ready only on a fresh accepted scene", () => {
    const target = ready();
    target.poll({ snapshot: {}, heartbeat: heartbeat({ sequence: 21 }), now });
    expect(target.isActionable).toBe(false);

    const state = target.poll({
      snapshot: snapshotFor(envelope(2, payload({
        observation: { ...payload().observation, observationId: "observation-2", capturedAt: "2026-08-10T18:00:00.500Z" },
      }))),
      heartbeat: heartbeat({ sequence: 22, observedAt: "2026-08-10T18:00:00.500Z" }),
      now,
    });

    expect(state.status).toBe("ready");
  });

  it("treats a boot change as terminal and stops folding further reads", () => {
    const target = ready();
    const newBoot = randomUUID();

    const state = target.poll({
      snapshot: snapshotFor(envelope(2)),
      heartbeat: heartbeat({ sequence: 21, bootId: newBoot }),
      now,
    });

    expect(state.status === "invalidated" && state.reason).toContain("boot identity changed");
    expect(target.isBootStale).toBe(true);

    // The receiver's replay state belongs to the previous boot, so a further read must not be
    // folded into this monitor at all.
    const after = target.poll({ snapshot: snapshotFor(envelope(3)), heartbeat: heartbeat({ sequence: 22, bootId: newBoot }), now });
    expect(after.status).toBe("invalidated");
    expect(target.isActionable).toBe(false);
  });

  it("reports a reboot as a reboot even when the desktop is also locked", () => {
    const target = ready();

    const state = target.poll({
      snapshot: snapshotFor(envelope(2)),
      heartbeat: heartbeat({ sequence: 21, bootId: randomUUID(), sessionLocked: true }),
      now,
    });

    // The most fundamental cause is the one recorded.
    expect(state.status === "invalidated" && state.reason).toContain("boot identity changed");
  });

  it("never exposes a scene while invalidated", () => {
    const target = ready();
    const state = target.poll({ snapshot: {}, heartbeat: heartbeat({ sequence: 21 }), now });

    expect(state).not.toHaveProperty("scene");
    expect(target.state).not.toHaveProperty("scene");
  });
});
