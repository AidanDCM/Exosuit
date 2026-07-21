import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
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
    expect(() =>
      verifyFieldChannelEnvelope({
        envelope: { ...original, signature: `${original.signature.slice(0, -1)}A` },
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
});
