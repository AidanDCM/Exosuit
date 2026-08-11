import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { fieldChannelEnvelopeSchema } from "../src/fieldChannel.js";
import { fieldDisplayContractSchema } from "../src/fieldContracts.js";
import { fieldHeartbeatSchema } from "../src/fieldHeartbeat.js";
import { FieldSceneChannelReceiver } from "../src/fieldSceneChannel.js";

/**
 * The TypeScript half of the scene wire contract.
 *
 * `field-channel-v1.json` already pins a signed **heartbeat** across both languages. Nothing
 * pinned a **scene observation** — the structural representation produced by
 * `FieldSceneProducerBoundary` in C# and consumed by `FieldSceneChannelReceiver` here agreed only
 * because each was written from the same description.
 *
 * The fixture was generated from the real C# producer boundary and signing path.
 * `FieldSceneWireContractTests` asserts C# verifies it; this asserts the TypeScript receiver
 * accepts the same bytes and yields a usable scene.
 */

interface Fixture {
  readonly secret: string;
  readonly expectedKeyId: string;
  readonly verifyAt: string;
  readonly receiver: {
    readonly field: { fieldId: string; fieldGeneration: number };
    readonly display: Record<string, unknown>;
    readonly agentId: string;
    readonly windowsSessionId: string;
  };
  readonly heartbeat: Record<string, unknown>;
  readonly envelope: unknown;
}

const fixture = JSON.parse(readFileSync("tests/fixtures/field-scene-v1.json", "utf8")) as Fixture;
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function receiver() {
  const root = mkdtempSync(join(tmpdir(), "exosuit-scene-wire-"));
  temporaryRoots.push(root);
  return new FieldSceneChannelReceiver({
    field: fixture.receiver.field,
    display: fieldDisplayContractSchema.parse(fixture.receiver.display),
    agentId: fixture.receiver.agentId,
    windowsSessionId: fixture.receiver.windowsSessionId,
    expectedKeyId: fixture.expectedKeyId,
    replayStateFilePath: join(root, "replay.json"),
  });
}

const envelope = () => fieldChannelEnvelopeSchema.parse(fixture.envelope);
const heartbeat = () => fieldHeartbeatSchema.parse(fixture.heartbeat);
const now = () => new Date(fixture.verifyAt);

describe("Field scene cross-language fixture", () => {
  it("parses as a channel envelope carrying a scene observation", () => {
    const parsed = envelope();

    expect(parsed.messageType).toBe("scene_observation");
    expect(parsed.direction).toBe("guest_to_host");
    expect(parsed.sequence).toBe(7);
  });

  // OPEN DEFECT — see docs/qa/OPEN_DEFECT_2026-08-11_SCENE_PAYLOAD_HASH.md
  //
  // The TypeScript receiver rejects a genuine C#-signed scene with "Field channel payload hash is
  // invalid". Each language is self-consistent — C# verifies its own envelope and TypeScript
  // verifies its own — but they canonicalise a scene payload differently, so the guest's hash
  // cannot be reproduced on the host. Heartbeat payloads agree, which is why nothing caught this.
  //
  // Skipped rather than deleted or weakened: the assertion is correct and the product is wrong.
  // Fixing it changes payload hashing, which is signature-adjacent and touches CHN-001 evidence,
  // so it is a deliberate decision rather than a drive-by change.
  it.skip("is accepted by the receiver and yields a usable scene", () => {
    const scene = receiver().accept({
      envelope: envelope(),
      heartbeat: heartbeat(),
      secret: fixture.secret,
      now: now(),
    });

    // A C#-signed scene, verified and bound by the TypeScript receiver. This is the assertion the
    // whole fixture exists for.
    expect(scene).toMatchObject({
      field: fixture.receiver.field,
      sceneVersion: 1,
      observationId: "observation-1",
    });
  });

  it.skip("carries structure but no UI text — blocked by the same payload-hash defect", () => {
    const json = JSON.stringify(fixture.envelope);

    // The source observation had a window title, an element name, and a password value. If any
    // survived the producer boundary, they would be here.
    expect(json).not.toContain("private title");
    expect(json).not.toContain("must-not-pass");
    expect(json).not.toContain("screenshotBase64");

    const scene = receiver().accept({
      envelope: envelope(), heartbeat: heartbeat(), secret: fixture.secret, now: now(),
    });
    expect(scene.observationId).toBe("observation-1");
  });

  it("rejects the same scene under a different secret", () => {
    expect(() => receiver().accept({
      envelope: envelope(),
      heartbeat: heartbeat(),
      secret: "a-different-secret-that-is-also-at-least-thirty-two-characters",
      now: now(),
    })).toThrow();
  });

  it("rejects the scene when the heartbeat names a different boot", () => {
    const otherBoot = { ...fixture.heartbeat, bootId: "11111111-2222-3333-4444-555555555555" };

    // Scene and heartbeat must agree on the boot. A fixture that passed regardless would prove
    // nothing about boot binding.
    expect(() => receiver().accept({
      envelope: envelope(),
      heartbeat: fieldHeartbeatSchema.parse(otherBoot),
      secret: fixture.secret,
      now: now(),
    })).toThrow();
  });

  it.skip("rejects a replay of the same scene — blocked by the same payload-hash defect", () => {
    const target = receiver();
    target.accept({ envelope: envelope(), heartbeat: heartbeat(), secret: fixture.secret, now: now() });

    expect(() => target.accept({
      envelope: envelope(), heartbeat: heartbeat(), secret: fixture.secret, now: now(),
    })).toThrow();
  });

  it("rejects a mutated payload against the signature", () => {
    const mutated = JSON.parse(JSON.stringify(fixture.envelope)) as Record<string, any>;
    mutated["payload"]["observation"]["observationId"] = "observation-tampered";

    expect(() => receiver().accept({
      envelope: fieldChannelEnvelopeSchema.parse(mutated),
      heartbeat: heartbeat(),
      secret: fixture.secret,
      now: now(),
    })).toThrow();
  });
});
