import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fieldChannelEnvelopeSchema, verifyFieldChannelEnvelope } from "../src/fieldChannel.js";

interface Fixture {
  secret: string;
  expectedDirection: "host_to_guest" | "guest_to_host";
  expectedKeyId: string;
  verifyAt: string;
  envelope: unknown;
}

describe("Field channel cross-language fixture", () => {
  it("verifies the canonical signed envelope", async () => {
    const fixture = JSON.parse(await readFile(resolve("tests/fixtures/field-channel-v1.json"), "utf8")) as Fixture;
    const envelope = fieldChannelEnvelopeSchema.parse(fixture.envelope);
    expect(
      verifyFieldChannelEnvelope({
        envelope,
        secret: fixture.secret,
        expectedField: envelope.field,
        expectedDirection: fixture.expectedDirection,
        expectedKeyId: fixture.expectedKeyId,
        now: new Date(fixture.verifyAt),
      }),
    ).toMatchObject({ sequence: 7, messageType: "heartbeat", payloadHash: "1b5130072c4824e9ff4bbed304a0cec7825e64cdd49bddc0b25db0dadc5d2471" });
  });
});
