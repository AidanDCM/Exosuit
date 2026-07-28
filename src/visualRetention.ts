import { z } from "zod";
import { fieldRefSchema, sha256DigestSchema, type FieldRef } from "./fieldContracts.js";

export const visualRegionSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type VisualRegion = z.infer<typeof visualRegionSchema>;

export const visualCapturePolicySchema = z
  .object({
    contractVersion: z.literal(1),
    policyId: z.string().uuid(),
    field: fieldRefSchema,
    enabled: z.boolean(),
    consentGranted: z.boolean(),
    captureMode: z.enum(["disabled", "approved_regions", "change_only"]),
    approvedRegions: z.array(visualRegionSchema).max(128),
    redactSensitiveControls: z.literal(true),
    storeInlineBytes: z.literal(false),
    maximumFrameBytes: z.number().int().min(1_024).max(50 * 1024 * 1024),
    maximumSessionBytes: z.number().int().min(1_024).max(10 * 1024 * 1024 * 1024),
    maximumFrameCount: z.number().int().min(1).max(10_000_000),
    retentionSeconds: z.number().int().min(1).max(30 * 24 * 60 * 60),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .superRefine((policy, context) => {
    if (new Date(policy.expiresAt).getTime() <= new Date(policy.issuedAt).getTime()) {
      context.addIssue({ code: "custom", path: ["expiresAt"], message: "Visual policy must expire after issue." });
    }
    if (policy.enabled && !policy.consentGranted) {
      context.addIssue({ code: "custom", path: ["consentGranted"], message: "Enabled visual capture requires explicit consent." });
    }
    if (!policy.enabled && policy.captureMode !== "disabled") {
      context.addIssue({ code: "custom", path: ["captureMode"], message: "Disabled visual capture must use disabled mode." });
    }
    if (policy.enabled && policy.captureMode === "disabled") {
      context.addIssue({ code: "custom", path: ["captureMode"], message: "Enabled visual capture requires a bounded capture mode." });
    }
    if (policy.captureMode === "approved_regions" && policy.approvedRegions.length < 1) {
      context.addIssue({ code: "custom", path: ["approvedRegions"], message: "Approved-region capture requires at least one region." });
    }
    if (policy.captureMode !== "approved_regions" && policy.approvedRegions.length > 0) {
      context.addIssue({ code: "custom", path: ["approvedRegions"], message: "Regions are permitted only for approved-region capture." });
    }
    if (policy.maximumFrameBytes > policy.maximumSessionBytes) {
      context.addIssue({ code: "custom", path: ["maximumFrameBytes"], message: "One frame cannot exceed the session byte budget." });
    }
  });
export type VisualCapturePolicy = z.infer<typeof visualCapturePolicySchema>;

export const visualFrameReferenceSchema = z.object({
  contractVersion: z.literal(1),
  frameId: z.string().uuid(),
  field: fieldRefSchema,
  policyId: z.string().uuid(),
  capturedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  blobId: z.string().min(1).max(500),
  sha256: sha256DigestSchema,
  byteLength: z.number().int().positive(),
  mediaType: z.enum(["image/png", "image/webp"]),
  region: visualRegionSchema.optional(),
  changeScore: z.number().min(0).max(1).optional(),
  sensitiveRegionsRedacted: z.literal(true),
  classification: z.enum(["ephemeral", "demonstration", "diagnostic"]),
});
export type VisualFrameReference = z.infer<typeof visualFrameReferenceSchema>;

export class VisualRetentionLedger {
  readonly #field: FieldRef;
  readonly #policy: VisualCapturePolicy;
  readonly #frames = new Map<string, VisualFrameReference>();
  #totalBytes = 0;

  constructor(policy: VisualCapturePolicy) {
    this.#policy = visualCapturePolicySchema.parse(policy);
    this.#field = fieldRefSchema.parse(policy.field);
  }

  register(input: VisualFrameReference, now = new Date()): VisualFrameReference {
    if (!this.#policy.enabled) throw new Error("Visual capture is disabled by policy.");
    const frame = visualFrameReferenceSchema.parse(input);
    if (frame.field.fieldId !== this.#field.fieldId || frame.field.fieldGeneration !== this.#field.fieldGeneration) {
      throw new Error("Visual frame cannot cross Field generations.");
    }
    if (frame.policyId !== this.#policy.policyId) throw new Error("Visual frame policy identity is invalid.");
    if (now.getTime() >= new Date(this.#policy.expiresAt).getTime()) throw new Error("Visual capture policy has expired.");
    if (frame.byteLength > this.#policy.maximumFrameBytes) throw new Error("Visual frame exceeds the configured byte limit.");
    if (this.#frames.size >= this.#policy.maximumFrameCount) throw new Error("Visual frame count limit reached.");
    if (this.#totalBytes + frame.byteLength > this.#policy.maximumSessionBytes) throw new Error("Visual session byte budget exceeded.");
    if (this.#frames.has(frame.frameId)) throw new Error("Visual frame ID must be unique.");
    const captured = new Date(frame.capturedAt).getTime();
    const expires = new Date(frame.expiresAt).getTime();
    if (captured < new Date(this.#policy.issuedAt).getTime() || captured >= new Date(this.#policy.expiresAt).getTime()) {
      throw new Error("Visual frame timestamp is outside the policy interval.");
    }
    if (expires <= captured || expires > captured + this.#policy.retentionSeconds * 1_000) {
      throw new Error("Visual frame expiration exceeds the retention policy.");
    }
    if (this.#policy.captureMode === "approved_regions") {
      if (!frame.region || !this.#policy.approvedRegions.some((region) => sameRegion(region, frame.region!))) {
        throw new Error("Visual frame region is not approved by policy.");
      }
    }
    if (this.#policy.captureMode === "change_only" && frame.changeScore === undefined) {
      throw new Error("Change-only capture requires a change score.");
    }
    this.#frames.set(frame.frameId, structuredClone(frame));
    this.#totalBytes += frame.byteLength;
    return structuredClone(frame);
  }

  deleteExpired(now = new Date()): string[] {
    const deleted: string[] = [];
    for (const [frameId, frame] of this.#frames) {
      if (now.getTime() >= new Date(frame.expiresAt).getTime()) {
        this.#frames.delete(frameId);
        this.#totalBytes -= frame.byteLength;
        deleted.push(frameId);
      }
    }
    return deleted.sort();
  }

  delete(frameId: string): boolean {
    const frame = this.#frames.get(frameId);
    if (!frame) return false;
    this.#frames.delete(frameId);
    this.#totalBytes -= frame.byteLength;
    return true;
  }

  list(): VisualFrameReference[] {
    return [...this.#frames.values()].map((frame) => structuredClone(frame)).sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
  }

  usage(): { frameCount: number; totalBytes: number; maximumFrameCount: number; maximumSessionBytes: number } {
    return {
      frameCount: this.#frames.size,
      totalBytes: this.#totalBytes,
      maximumFrameCount: this.#policy.maximumFrameCount,
      maximumSessionBytes: this.#policy.maximumSessionBytes,
    };
  }
}

function sameRegion(left: VisualRegion, right: VisualRegion): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}
