import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

const healthSchema = z.enum(["unknown", "healthy", "degraded", "faulted"]);
const recorderStateSchema = z.enum(["not_started", "armed", "recording", "paused", "completed", "aborted", "faulted"]);

export const fieldSupportBundleInputSchema = z.object({
  generatedAt: z.string().datetime(),
  exosuitVersion: z.string().min(1).max(100),
  fieldIdHash: z.string().regex(/^[a-f0-9]{64}$/),
  fieldGeneration: z.number().int().positive(),
  lifecycle: z.string().min(1).max(100),
  health: healthSchema,
  bootstrapStatus: z.enum(["not_started", "not_ready", "ready", "failed"]),
  recorderState: recorderStateSchema,
  visualCaptureEnabled: z.boolean(),
  visualUsage: z.object({
    frameCount: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative(),
    maximumFrameCount: z.number().int().nonnegative().optional(),
    maximumSessionBytes: z.number().int().nonnegative().optional(),
  }).strict(),
  artifactSummary: z.object({
    prepared: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    quarantined: z.number().int().nonnegative(),
  }).strict(),
  channelSummary: z.object({
    authenticated: z.boolean(),
    inboundSequence: z.number().int().min(-1),
    outboundSequence: z.number().int().min(-1),
    replayDenials: z.number().int().nonnegative(),
    authenticationDenials: z.number().int().nonnegative(),
  }).strict(),
  auditSummary: z.object({
    eventCount: z.number().int().nonnegative(),
    chainValid: z.boolean(),
    eventTypes: z.record(z.string(), z.number().int().nonnegative()),
  }).strict(),
  recoverySummary: z.object({
    decisions: z.number().int().nonnegative(),
    retriesAllowed: z.number().int().nonnegative(),
    ownerReviewsRequired: z.number().int().nonnegative(),
    generationIncrementsRequired: z.number().int().nonnegative(),
  }).strict(),
  recentErrorCodes: z.array(z.string().min(1).max(200)).max(1_000),
  configurationFlags: z.record(z.string(), z.boolean()),
}).strict();
export type FieldSupportBundleInput = z.infer<typeof fieldSupportBundleInputSchema>;

export const fieldSupportBundleSchema = z.object({
  formatVersion: z.literal(1),
  bundleId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  data: fieldSupportBundleInputSchema.omit({ generatedAt: true }),
  integrityHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type FieldSupportBundle = z.infer<typeof fieldSupportBundleSchema>;

const forbiddenKeyPatterns = [
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /authorization/i,
  /cookie/i,
  /screenshot/i,
  /framebytes/i,
  /imagebytes/i,
  /clipboard/i,
  /windowtitle/i,
  /elementvalue/i,
  /rawpayload/i,
  /artifactcontent/i,
  /demonstrationevent/i,
  /operatorid/i,
  /machineid/i,
  /windowssessionid/i,
];

const forbiddenValuePatterns = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/i,
  /\bsk-[A-Za-z0-9_-]{12,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/,
];

export function hashFieldPrivateIdentifier(value: string): string {
  if (!value.trim()) throw new Error("Private Field identifier cannot be empty.");
  return createHash("sha256").update(value).digest("hex");
}

export function createFieldSupportBundle(input: FieldSupportBundleInput): FieldSupportBundle {
  const parsed = fieldSupportBundleInputSchema.parse(input);
  assertFieldBundleSafe(parsed);
  const { generatedAt, ...data } = parsed;
  const unsigned = { formatVersion: 1 as const, bundleId: randomUUID(), generatedAt, data };
  return fieldSupportBundleSchema.parse({ ...unsigned, integrityHash: sha256(stableStringify(unsigned)) });
}

export function verifyFieldSupportBundle(input: FieldSupportBundle): void {
  const bundle = fieldSupportBundleSchema.parse(input);
  const { integrityHash, ...unsigned } = bundle;
  assertFieldBundleSafe(unsigned);
  if (integrityHash !== sha256(stableStringify(unsigned))) throw new Error("Field support bundle failed integrity verification.");
}

export function assertFieldBundleSafe(value: unknown, path = "root"): void {
  if (typeof value === "string") {
    if (forbiddenValuePatterns.some((pattern) => pattern.test(value))) {
      throw new Error(`Field support bundle contains a forbidden sensitive value at ${path}.`);
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFieldBundleSafe(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKeyPatterns.some((pattern) => pattern.test(key))) {
      throw new Error(`Field support bundle contains forbidden field ${path}.${key}.`);
    }
    assertFieldBundleSafe(child, `${path}.${key}`);
  }
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
