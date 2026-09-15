import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createFieldChannelEnvelope } from "../src/fieldChannel.js";
import { fieldDisplayContractSchema } from "../src/fieldContracts.js";
import { fieldHeartbeatSchema, type FieldHeartbeat } from "../src/fieldHeartbeat.js";
import { FieldSceneChannelReceiver, type FieldSceneObservationPayload } from "../src/fieldSceneChannel.js";
import { readSceneFromKvp } from "../src/fieldSceneKvpIntake.js";

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

function receiver() {
  const root = mkdtempSync(join(tmpdir(), "exosuit-scene-intake-"));
  temporaryRoots.push(root);
  return new FieldSceneChannelReceiver({
    field, display, agentId: "glove-agent", windowsSessionId: "1", expectedKeyId: "scene-key-1",
    replayStateFilePath: join(root, "replay.json"),
  });
}

/** Writes a value the way the guest does: plain when short, chunked with a digest when long. */
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

/**
 * Flips one character of a real signature. The result is still a well-formed signature, so it
 * reaches authentication instead of failing the envelope schema — which is the only way to
 * exercise the rejected path rather than the unreadable one.
 */
function withBrokenSignature(value: ReturnType<typeof envelope>) {
  const original = value.signature;
  const flipped = (original[0] === "A" ? "B" : "A") + original.slice(1);
  return { ...value, signature: flipped };
}

function read(snapshot: Record<string, string>, target = receiver(), beat = heartbeat()) {
  return readSceneFromKvp({
    snapshot, valueName: VALUE_NAME, receiver: target, heartbeat: beat, secret, now,
  });
}

describe("host scene read from KVP", () => {
  it("accepts a verified scene end to end", () => {
    const result = read(snapshotFor(envelope(1)));

    expect(result.status).toBe("accepted");
    expect(result.status === "accepted" && result.scene).toMatchObject({
      field, sceneVersion: 1, observationId: "observation-1",
    });
  });

  it("accepts a scene that had to be chunked across the transport", () => {
    // The real envelope is well over one KVP chunk, so force a small chunk size to prove the
    // reassembled bytes still authenticate.
    const result = read(snapshotFor(envelope(1), 64));

    expect(result.status).toBe("accepted");
  });

  it("reports an unpublished scene as absent", () => {
    expect(read({}).status).toBe("absent");
  });

  it("reports a truncated transport as unreadable, not rejected", () => {
    const snapshot = snapshotFor(envelope(1), 64);
    delete snapshot[`${VALUE_NAME}.002`];

    const result = read(snapshot);

    // Transport fault, not an authentication decision. Conflating the two would make it
    // impossible to assert that a rejection happened for its intended reason.
    expect(result.status).toBe("unreadable");
    expect(result.status === "unreadable" && result.reason).toContain(`${VALUE_NAME}.002`);
  });

  it("reports a corrupted chunk as unreadable rather than letting it reach authentication", () => {
    const snapshot = snapshotFor(envelope(1), 64);
    snapshot[`${VALUE_NAME}.001`] = "tampered";

    const result = read(snapshot);

    expect(result.status).toBe("unreadable");
    expect(result.status === "unreadable" && result.reason).toContain("digest");
  });

  it("reports a value that is not an envelope at all as unreadable", () => {
    const result = read({ [VALUE_NAME]: JSON.stringify({ hello: "world" }) });

    expect(result.status).toBe("unreadable");
    expect(result.status === "unreadable" && result.reason).toContain("not a Field channel envelope");
  });

  it("reports a tampered signature as rejected, not unreadable", () => {
    const result = read(snapshotFor(withBrokenSignature(envelope(1))));

    // The bytes arrived intact; the authentication decision failed. That distinction is the
    // whole point of separating the two statuses.
    expect(result.status).toBe("rejected");
  });

  it("reports a scene bound to another boot as rejected", () => {
    const result = read(snapshotFor(envelope(1, payload({ bootId: randomUUID() }))));

    expect(result.status).toBe("rejected");
  });

  it("reports a scene bound to another session as rejected", () => {
    const result = read(snapshotFor(envelope(1, payload({ windowsSessionId: "2" }))));

    expect(result.status).toBe("rejected");
  });

  it("preserves the receiver's own reason verbatim", () => {
    const result = read(snapshotFor(envelope(1, payload({ windowsSessionId: "2" }))));

    // A reworded reason is a reason that can no longer be matched against an expected code.
    expect(result.status === "rejected" && result.reason.length).toBeGreaterThan(0);
    expect(result.status === "rejected" && result.reason).not.toContain("Unknown");
  });

  it("rejects a replayed scene when the same receiver sees it twice", () => {
    const target = receiver();
    const snapshot = snapshotFor(envelope(1));

    expect(read(snapshot, target).status).toBe("accepted");

    // Replay state lives on the receiver, which is why it is passed in rather than constructed
    // per read: a fresh receiver each time would silently disable replay rejection.
    expect(read(snapshot, target).status).toBe("rejected");
  });

  it("never falls back to a previously accepted scene when the value goes bad", () => {
    const target = receiver();
    expect(read(snapshotFor(envelope(1)), target).status).toBe("accepted");

    const broken = snapshotFor(envelope(2), 64);
    delete broken[`${VALUE_NAME}.001`];
    const result = read(broken, target);

    expect(result.status).toBe("unreadable");
    expect(result).not.toHaveProperty("scene");
  });

  it("distinguishes all four outcomes from one another", () => {
    const statuses = new Set([
      read({}).status,
      read({ [VALUE_NAME]: JSON.stringify({ hello: "world" }) }).status,
      read(snapshotFor(withBrokenSignature(envelope(1)))).status,
      read(snapshotFor(envelope(1))).status,
    ]);

    expect(statuses).toEqual(new Set(["absent", "unreadable", "rejected", "accepted"]));
  });
});
