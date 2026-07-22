import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  VisualRetentionLedger,
  visualCapturePolicySchema,
  visualFrameReferenceSchema,
} from "../src/visualRetention.js";

const field = { fieldId: randomUUID(), fieldGeneration: 1 };
const policyId = randomUUID();

function policy(overrides: Record<string, unknown> = {}) {
  return visualCapturePolicySchema.parse({
    contractVersion: 1,
    policyId,
    field,
    enabled: true,
    consentGranted: true,
    captureMode: "approved_regions",
    approvedRegions: [{ x: 0, y: 0, width: 800, height: 600 }],
    redactSensitiveControls: true,
    storeInlineBytes: false,
    maximumFrameBytes: 10_000,
    maximumSessionBytes: 20_000,
    maximumFrameCount: 2,
    retentionSeconds: 60,
    issuedAt: "2026-07-21T18:00:00.000Z",
    expiresAt: "2026-07-21T18:10:00.000Z",
    ...overrides,
  });
}

function frame(overrides: Record<string, unknown> = {}) {
  return visualFrameReferenceSchema.parse({
    contractVersion: 1,
    frameId: randomUUID(),
    field,
    policyId,
    capturedAt: "2026-07-21T18:00:01.000Z",
    expiresAt: "2026-07-21T18:01:01.000Z",
    blobId: "visual/frame-1",
    sha256: "a".repeat(64),
    byteLength: 5_000,
    mediaType: "image/webp",
    region: { x: 0, y: 0, width: 800, height: 600 },
    sensitiveRegionsRedacted: true,
    classification: "demonstration",
    ...overrides,
  });
}

describe("visual retention policy", () => {
  it("requires explicit consent and forbids unbounded capture modes", () => {
    expect(() => policy({ consentGranted: false })).toThrow(/consent/);
    expect(() => policy({ enabled: false, consentGranted: false, captureMode: "approved_regions" })).toThrow(/Disabled visual capture/);
    expect(() => policy({ captureMode: "approved_regions", approvedRegions: [] })).toThrow(/at least one region/);
    expect(() => policy({ captureMode: "change_only", approvedRegions: [] })).not.toThrow();
  });

  it("registers only approved redacted external frame references", () => {
    const ledger = new VisualRetentionLedger(policy());
    const value = frame();
    expect(ledger.register(value, new Date("2026-07-21T18:00:02.000Z"))).toMatchObject({
      frameId: value.frameId,
      sensitiveRegionsRedacted: true,
      region: { width: 800, height: 600 },
    });
    expect(ledger.usage()).toEqual({ frameCount: 1, totalBytes: 5_000, maximumFrameCount: 2, maximumSessionBytes: 20_000 });
    expect(() => ledger.register(value, new Date("2026-07-21T18:00:02.000Z"))).toThrow(/unique/);
  });

  it("enforces Field policy region size count session and retention bounds", () => {
    const ledger = new VisualRetentionLedger(policy());
    expect(() => ledger.register(frame({ field: { ...field, fieldGeneration: 2 } }), new Date("2026-07-21T18:00:02.000Z"))).toThrow(/cross Field generations/);
    expect(() => ledger.register(frame({ region: { x: 1, y: 1, width: 10, height: 10 } }), new Date("2026-07-21T18:00:02.000Z"))).toThrow(/not approved/);
    expect(() => ledger.register(frame({ byteLength: 10_001 }), new Date("2026-07-21T18:00:02.000Z"))).toThrow(/byte limit/);
    expect(() => ledger.register(frame({ expiresAt: "2026-07-21T18:02:00.000Z" }), new Date("2026-07-21T18:00:02.000Z"))).toThrow(/retention/);

    ledger.register(frame({ frameId: randomUUID(), blobId: "visual/a", byteLength: 9_000 }), new Date("2026-07-21T18:00:02.000Z"));
    ledger.register(frame({ frameId: randomUUID(), blobId: "visual/b", byteLength: 9_000 }), new Date("2026-07-21T18:00:02.000Z"));
    expect(() => ledger.register(frame({ frameId: randomUUID(), blobId: "visual/c", byteLength: 1_000 }), new Date("2026-07-21T18:00:02.000Z"))).toThrow(/count limit/);
  });

  it("requires change scores and deletes expired references deterministically", () => {
    const changePolicy = policy({ captureMode: "change_only", approvedRegions: [], retentionSeconds: 10 });
    const ledger = new VisualRetentionLedger(changePolicy);
    const value = frame({ policyId: changePolicy.policyId, region: undefined, changeScore: 0.4, expiresAt: "2026-07-21T18:00:11.000Z" });
    ledger.register(value, new Date("2026-07-21T18:00:02.000Z"));
    expect(ledger.deleteExpired(new Date("2026-07-21T18:00:10.999Z"))).toEqual([]);
    expect(ledger.deleteExpired(new Date("2026-07-21T18:00:11.000Z"))).toEqual([value.frameId]);
    expect(ledger.usage().totalBytes).toBe(0);
    expect(() => ledger.register(frame({ policyId: changePolicy.policyId, region: undefined }), new Date("2026-07-21T18:00:02.000Z"))).toThrow(/change score/);
  });
});
