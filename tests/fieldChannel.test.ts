import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  FieldChannelReplayGuard,
  createFieldChannelEnvelope,
  verifyFieldChannelEnvelope,
} from "../src/fieldChannel.js";

const field = { fieldId: randomUUID(), fieldGeneration: 1 };
const secret = "field-channel-test-secret-that-is-at-least-thirty-two-characters";

function envelope(sequence = 0) {
  return createFieldChannelEnvelope({
    field,
    direction: "guest_to_host",
    sequence,
    messageType: "heartbeat",
    payload: { healthy: true, queueDepth: 0 },
    keyId: "field-channel-key-1",
    secret,
    sentAt: "2026-07-21T18:00:00.000Z",
    ttlSeconds: 60,
  });
}

describe("authenticated Field channel", () => {
  it("authenticates one direction and exact Field generation", () => {
    expect(
      verifyFieldChannelEnvelope({
        envelope: envelope(),
        secret,
        expectedField: field,
        expectedDirection: "guest_to_host",
        expectedKeyId: "field-channel-key-1",
        now: new Date("2026-07-21T18:00:30.000Z"),
      }),
    ).toMatchObject({ sequence: 0, messageType: "heartbeat", payload: { healthy: true } });
  });

  it("rejects payload mutation signature mutation expiry wrong direction and cross-generation traffic", () => {
    const original = envelope();
    expect(() =>
      verifyFieldChannelEnvelope({
        envelope: { ...original, payload: { healthy: false } },
        secret,
        expectedField: field,
        expectedDirection: "guest_to_host",
        now: new Date("2026-07-21T18:00:30.000Z"),
      }),
    ).toThrow(/payload hash/);
    const changedSignature = `${original.signature.startsWith("A") ? "B" : "A"}${original.signature.slice(1)}`;
    expect(() =>
      verifyFieldChannelEnvelope({
        envelope: { ...original, signature: changedSignature },
        secret,
        expectedField: field,
        expectedDirection: "guest_to_host",
        now: new Date("2026-07-21T18:00:30.000Z"),
      }),
    ).toThrow(/signature/);
    expect(() =>
      verifyFieldChannelEnvelope({
        envelope: original,
        secret,
        expectedField: field,
        expectedDirection: "host_to_guest",
        now: new Date("2026-07-21T18:00:30.000Z"),
      }),
    ).toThrow(/direction/);
    expect(() =>
      verifyFieldChannelEnvelope({
        envelope: original,
        secret,
        expectedField: { ...field, fieldGeneration: 2 },
        expectedDirection: "guest_to_host",
        now: new Date("2026-07-21T18:00:30.000Z"),
      }),
    ).toThrow(/different Field generation/);
    expect(() =>
      verifyFieldChannelEnvelope({
        envelope: original,
        secret,
        expectedField: field,
        expectedDirection: "guest_to_host",
        now: new Date("2026-07-21T18:01:00.000Z"),
      }),
    ).toThrow(/expired/);
  });

  it("denies duplicate IDs nonces and non-increasing sequences", () => {
    const guard = new FieldChannelReplayGuard({
      field,
      direction: "guest_to_host",
      expectedKeyId: "field-channel-key-1",
    });
    const first = envelope(0);
    expect(guard.accept({ envelope: first, secret, now: new Date("2026-07-21T18:00:30.000Z") }).sequence).toBe(0);
    expect(() => guard.accept({ envelope: first, secret, now: new Date("2026-07-21T18:00:30.000Z") })).toThrow(/replayed/);

    const second = envelope(1);
    expect(guard.accept({ envelope: second, secret, now: new Date("2026-07-21T18:00:30.000Z") }).sequence).toBe(1);
    expect(() =>
      guard.accept({
        envelope: createFieldChannelEnvelope({
          field,
          direction: "guest_to_host",
          sequence: 1,
          messageType: "event",
          payload: { type: "duplicate-sequence" },
          keyId: "field-channel-key-1",
          secret,
          sentAt: "2026-07-21T18:00:00.000Z",
          ttlSeconds: 60,
        }),
        secret,
        now: new Date("2026-07-21T18:00:30.000Z"),
      }),
    ).toThrow(/increase strictly/);
    expect(guard.lastSequence()).toBe(1);
  });

  it("persists bounded replay state across restart and rejects wrong channel identity", async () => {
    const directory = await mkdtemp(join(tmpdir(), "exosuit-field-replay-"));
    const stateFilePath = join(directory, "replay.json");
    try {
      const firstGuard = new FieldChannelReplayGuard({ field, direction: "guest_to_host", expectedKeyId: "field-channel-key-1", maxRemembered: 2, stateFilePath });
      const first = envelope();
      firstGuard.accept({ envelope: first, secret, now: new Date("2026-07-21T18:00:30.000Z") });
      const restarted = new FieldChannelReplayGuard({ field, direction: "guest_to_host", expectedKeyId: "field-channel-key-1", maxRemembered: 2, stateFilePath });
      expect(restarted.lastSequence()).toBe(first.sequence);
      expect(() => restarted.accept({ envelope: first, secret, now: new Date("2026-07-21T18:00:30.000Z") })).toThrow(/replayed|increase strictly/);
      expect(() => new FieldChannelReplayGuard({ field: { ...field, fieldGeneration: 2 }, direction: "guest_to_host", expectedKeyId: "field-channel-key-1", stateFilePath })).toThrow(/identity/);
      const persisted = JSON.parse(await readFile(stateFilePath, "utf8")) as { entries: unknown[] };
      expect(persisted.entries).toHaveLength(1);
      await writeFile(stateFilePath, "{}", "utf8");
      expect(() => new FieldChannelReplayGuard({ field, direction: "guest_to_host", stateFilePath })).toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("requires canonical UTC millisecond timestamps before signing", () => {
    const create = (sentAt: string) => createFieldChannelEnvelope({
      field,
      direction: "guest_to_host",
      sequence: 0,
      messageType: "heartbeat",
      payload: { healthy: true },
      keyId: "field-channel-key-1",
      secret,
      sentAt,
    });
    expect(() => create("2026-07-21T18:00:00Z")).toThrow(/canonical UTC millisecond/);
    expect(() => create("2026-07-21T14:00:00.000-04:00")).toThrow(/canonical UTC millisecond/);
  });
});
