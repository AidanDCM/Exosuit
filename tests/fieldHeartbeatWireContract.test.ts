import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { fieldChannelEnvelopeSchema, verifyFieldChannelEnvelope } from "../src/fieldChannel.js";
import { fieldDisplayContractSchema } from "../src/fieldContracts.js";
import { fieldHeartbeatSchema } from "../src/fieldHeartbeat.js";
import { FieldSceneChannelReceiver } from "../src/fieldSceneChannel.js";
import { FieldSceneHostMonitor } from "../src/fieldSceneHostMonitor.js";

/**
 * The heartbeat the host keys readiness off.
 *
 * `field-channel-v1.json` pins a hand-authored heartbeat envelope, proving the envelope machinery
 * agrees across languages. It does not prove the payload the **guest runtime builds** is the
 * payload the host schema parses — that shape lived inline in the runtime loop and nothing checked
 * it. The same kind of gap hid two real defects in the scene payload.
 *
 * This fixture is generated from `FieldKvpRuntime.BuildHeartbeatPayload`, the exact function the
 * guest publishes from.
 */

interface FixtureCase {
  readonly description: string;
  readonly envelope: unknown;
}

interface Fixture {
  readonly secret: string;
  readonly expectedKeyId: string;
  readonly verifyAt: string;
  readonly field: { fieldId: string; fieldGeneration: number };
  readonly bootId: string;
  readonly cases: readonly FixtureCase[];
}

const fixture = JSON.parse(readFileSync("tests/fixtures/field-heartbeat-v1.json", "utf8")) as Fixture;
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const byDescription = (description: string) => {
  const found = fixture.cases.find((testCase) => testCase.description === description);
  expect(found, `fixture must contain the "${description}" case`).toBeDefined();
  return found!;
};

const envelopeOf = (testCase: FixtureCase) => fieldChannelEnvelopeSchema.parse(testCase.envelope);
const payloadOf = (testCase: FixtureCase) => (testCase.envelope as { payload: unknown }).payload;

function monitor() {
  const root = mkdtempSync(join(tmpdir(), "exosuit-hb-wire-"));
  temporaryRoots.push(root);
  return new FieldSceneHostMonitor({
    receiver: new FieldSceneChannelReceiver({
      field: fixture.field,
      display: fieldDisplayContractSchema.parse({
        monitorCount: 1, width: 1920, height: 1080, scalePercent: 100,
        browserZoomPercent: 100, keyboardLayout: "en-US", dynamicResolutionAllowed: false,
      }),
      agentId: "glove-agent",
      windowsSessionId: "2",
      expectedKeyId: "scene-key-1",
      replayStateFilePath: join(root, "replay.json"),
    }),
    secret: fixture.secret,
    valueName: "Exosuit.Field.Scene",
  });
}

describe("Field heartbeat cross-language fixture", () => {
  it("covers ready, locked, and Secure Desktop", () => {
    expect(fixture.cases.map((testCase) => testCase.description)).toEqual([
      "ready desktop", "locked session", "secure desktop",
    ]);
  });

  it.each(fixture.cases.map((testCase) => [testCase.description, testCase] as const))(
    "verifies the guest-signed envelope: %s",
    (_description, testCase) => {
      const envelope = envelopeOf(testCase);

      expect(
        verifyFieldChannelEnvelope({
          envelope,
          secret: fixture.secret,
          expectedField: envelope.field,
          expectedDirection: "guest_to_host",
          expectedKeyId: fixture.expectedKeyId,
          now: new Date(fixture.verifyAt),
        }),
      ).toMatchObject({ messageType: "heartbeat" });
    },
  );

  it.each(fixture.cases.map((testCase) => [testCase.description, testCase] as const))(
    "parses under the host heartbeat schema: %s",
    (_description, testCase) => {
      // The assertion the fixture exists for: the shape the guest builds is the shape the host
      // parses, without anyone having translated between them by hand.
      const heartbeat = fieldHeartbeatSchema.parse(payloadOf(testCase));

      expect(heartbeat.bootId).toBe(fixture.bootId);
      expect(heartbeat.field).toEqual(fixture.field);
      expect(heartbeat.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    },
  );

  it("reports a ready desktop as unlocked and not on the Secure Desktop", () => {
    const heartbeat = fieldHeartbeatSchema.parse(payloadOf(byDescription("ready desktop")));

    expect(heartbeat.lifecycle).toBe("ready");
    expect(heartbeat.desktopReady).toBe(true);
    expect(heartbeat.sessionLocked).toBe(false);
    expect(heartbeat.secureDesktopActive).toBe(false);
  });

  it("drives the host monitor to invalidate on a locked guest", () => {
    const target = monitor();

    const state = target.poll({
      snapshot: {},
      heartbeat: fieldHeartbeatSchema.parse(payloadOf(byDescription("locked session"))),
    });

    // A guest-built heartbeat, unmodified, driving the real host readiness decision.
    expect(state.status).toBe("invalidated");
    expect(state.status === "invalidated" && state.reason).toContain("locked");
  });

  it("drives the host monitor to invalidate on Secure Desktop", () => {
    const target = monitor();

    const state = target.poll({
      snapshot: {},
      heartbeat: fieldHeartbeatSchema.parse(payloadOf(byDescription("secure desktop"))),
    });

    expect(state.status === "invalidated" && state.reason).toContain("Secure Desktop");
  });

  it("carries no character that would canonicalise differently across languages", () => {
    // The scene defect was a single escaped '+'. Heartbeats are currently clean; this fails the
    // day one stops being, rather than at a live session.
    for (const testCase of fixture.cases) {
      const payload = JSON.stringify(payloadOf(testCase));
      expect(payload).not.toMatch(/[+<>&]/);
      expect(payload).toMatch(/^[\x20-\x7e]*$/);
    }
  });
});
