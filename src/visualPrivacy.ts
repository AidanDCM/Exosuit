import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

export const visualRegionSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
});
export type VisualRegion = z.infer<typeof visualRegionSchema>;

export const visualConsentSchema = z.object({
  consentId: z.string().uuid(),
  taskId: z.string().min(1).max(300),
  windowId: z.string().min(1).max(500),
  region: visualRegionSchema,
  purpose: z.string().min(1).max(2_000),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  maxFrames: z.number().int().min(1).max(120),
  indicatorRequired: z.literal(true),
  persistentStorageAllowed: z.literal(false),
});
export type VisualConsent = z.infer<typeof visualConsentSchema>;

export const visualFrameMetadataSchema = z.object({
  frameId: z.string().uuid(),
  consentId: z.string().uuid(),
  taskId: z.string().min(1),
  windowId: z.string().min(1),
  capturedAt: z.string().datetime(),
  region: visualRegionSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteLength: z.number().int().nonnegative(),
  redactedRegionCount: z.number().int().nonnegative(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  storage: z.literal("ephemeral_memory"),
});
export type VisualFrameMetadata = z.infer<typeof visualFrameMetadataSchema>;

export const visualGroundingSchema = z.object({
  frameId: z.string().uuid(),
  label: z.string().min(1).max(500),
  region: visualRegionSchema,
  confidence: z.number().min(0).max(1),
  source: z.enum(["synthetic", "local_model", "remote_model"]),
});
export type VisualGrounding = z.infer<typeof visualGroundingSchema>;

export class VisualCapturePolicy {
  readonly #enabled: boolean;
  readonly #leases = new Map<string, { consent: VisualConsent; remainingFrames: number }>();

  constructor(options: { enabled?: boolean } = {}) {
    this.#enabled = options.enabled ?? false;
  }

  issueConsent(input: {
    taskId: string;
    windowId: string;
    region: VisualRegion;
    purpose: string;
    durationMs: number;
    maxFrames: number;
    localApproved: boolean;
    indicatorVisible: boolean;
    now?: Date;
  }): VisualConsent {
    if (!this.#enabled) throw new Error("Visual capture is disabled by local configuration.");
    if (!input.localApproved) throw new Error("Visual capture requires explicit local task approval.");
    if (!input.indicatorVisible) throw new Error("Visual capture requires a visible local indicator.");
    if (!Number.isInteger(input.durationMs) || input.durationMs < 1_000 || input.durationMs > 300_000) {
      throw new Error("Visual consent duration must be between 1000 and 300000 milliseconds.");
    }
    const now = input.now ?? new Date();
    const consent = visualConsentSchema.parse({
      consentId: randomUUID(),
      taskId: input.taskId,
      windowId: input.windowId,
      region: input.region,
      purpose: input.purpose,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + input.durationMs).toISOString(),
      maxFrames: input.maxFrames,
      indicatorRequired: true,
      persistentStorageAllowed: false,
    });
    this.#leases.set(consent.consentId, { consent, remainingFrames: consent.maxFrames });
    return structuredClone(consent);
  }

  consume(input: {
    consentId: string;
    taskId: string;
    windowId: string;
    region: VisualRegion;
    indicatorVisible: boolean;
    now?: Date;
  }): VisualConsent {
    const lease = this.#leases.get(input.consentId);
    if (!lease) throw new Error("Visual consent is missing or revoked.");
    const now = input.now ?? new Date();
    if (Date.parse(lease.consent.expiresAt) <= now.getTime()) {
      this.#leases.delete(input.consentId);
      throw new Error("Visual consent expired.");
    }
    if (!input.indicatorVisible) throw new Error("The visual capture indicator is not visible.");
    if (lease.consent.taskId !== input.taskId || lease.consent.windowId !== input.windowId) {
      throw new Error("Visual consent cannot cross its task or window scope.");
    }
    if (!contains(lease.consent.region, visualRegionSchema.parse(input.region))) {
      throw new Error("The requested visual region exceeds the approved bounds.");
    }
    if (lease.remainingFrames <= 0) throw new Error("Visual consent frame budget is exhausted.");
    lease.remainingFrames -= 1;
    return structuredClone(lease.consent);
  }

  revoke(consentId: string): void {
    this.#leases.delete(consentId);
  }
}

export class EphemeralVisualFrame {
  readonly metadata: VisualFrameMetadata;
  #bytes: Uint8Array;
  #disposed = false;

  constructor(input: {
    consent: VisualConsent;
    region: VisualRegion;
    width: number;
    height: number;
    rgbaBytes: Uint8Array;
    redactions?: VisualRegion[];
    capturedAt?: string;
  }) {
    const region = visualRegionSchema.parse(input.region);
    if (!contains(input.consent.region, region)) {
      throw new Error("Visual frame lies outside its approved consent region.");
    }
    if (input.width !== region.width || input.height !== region.height) {
      throw new Error("Visual frame dimensions must match the approved capture region.");
    }
    const expectedBytes = input.width * input.height * 4;
    if (input.rgbaBytes.byteLength !== expectedBytes) {
      throw new Error(`RGBA frame requires exactly ${expectedBytes} bytes.`);
    }
    this.#bytes = new Uint8Array(input.rgbaBytes);
    const redactions = (input.redactions ?? []).map((item) => visualRegionSchema.parse(item));
    for (const redaction of redactions) redact(this.#bytes, input.width, input.height, redaction);
    this.metadata = visualFrameMetadataSchema.parse({
      frameId: randomUUID(),
      consentId: input.consent.consentId,
      taskId: input.consent.taskId,
      windowId: input.consent.windowId,
      capturedAt: input.capturedAt ?? new Date().toISOString(),
      region,
      width: input.width,
      height: input.height,
      byteLength: this.#bytes.byteLength,
      redactedRegionCount: redactions.length,
      contentHash: createHash("sha256").update(this.#bytes).digest("hex"),
      storage: "ephemeral_memory",
    });
  }

  read(): Uint8Array {
    if (this.#disposed) throw new Error("Visual frame has been disposed.");
    return new Uint8Array(this.#bytes);
  }

  dispose(): void {
    this.#bytes.fill(0);
    this.#disposed = true;
  }

  toJSON(): VisualFrameMetadata {
    return structuredClone(this.metadata);
  }
}

export function acceptVisualGrounding(input: {
  frame: EphemeralVisualFrame;
  grounding: VisualGrounding;
  minimumConfidence?: number;
}): VisualGrounding {
  const grounding = visualGroundingSchema.parse(input.grounding);
  const threshold = input.minimumConfidence ?? 0.85;
  if (threshold < 0.5 || threshold > 1) throw new Error("Visual confidence threshold must be between 0.5 and 1.");
  if (grounding.frameId !== input.frame.metadata.frameId) throw new Error("Visual grounding references another frame.");
  if (grounding.confidence < threshold) throw new Error("Visual grounding confidence is below the required threshold.");
  const frameBounds = { x: 0, y: 0, width: input.frame.metadata.width, height: input.frame.metadata.height };
  if (!contains(frameBounds, grounding.region)) throw new Error("Visual grounding lies outside the captured frame.");
  return grounding;
}

function contains(outer: VisualRegion, inner: VisualRegion): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function redact(bytes: Uint8Array, width: number, height: number, input: VisualRegion): void {
  const region = visualRegionSchema.parse(input);
  const startX = Math.max(0, region.x);
  const startY = Math.max(0, region.y);
  const endX = Math.min(width, region.x + region.width);
  const endY = Math.min(height, region.y + region.height);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * width + x) * 4;
      bytes[offset] = 0;
      bytes[offset + 1] = 0;
      bytes[offset + 2] = 0;
      bytes[offset + 3] = 255;
    }
  }
}
