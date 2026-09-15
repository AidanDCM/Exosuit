import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const exosuitSubsystemSchema = z.enum(["glove", "field"]);
export type ExosuitSubsystem = z.infer<typeof exosuitSubsystemSchema>;

export const fieldModeSchema = z.enum(["teach", "shadow", "pilot"]);
export type FieldMode = z.infer<typeof fieldModeSchema>;

export const fieldCapabilitySchema = z.enum([
  "observe_desktop",
  "record_demonstration",
  "predict_next_action",
  "semantic_input",
  "physical_input",
  "application_launch",
  "file_workspace",
  "network_access",
  "artifact_export",
]);
export type FieldCapability = z.infer<typeof fieldCapabilitySchema>;

export const sha256DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const canonicalOriginSchema = z.string().url().transform((value, context) => {
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    context.addIssue({ code: "custom", message: "Allowed origins must not contain credentials, paths, queries, or fragments." });
    return z.NEVER;
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost"))) {
    context.addIssue({ code: "custom", message: "Allowed origins require HTTPS except for loopback development." });
    return z.NEVER;
  }
  return url.origin;
});
export type CanonicalOrigin = z.infer<typeof canonicalOriginSchema>;

export const reviewedExecutableIdentitySchema = z.object({
  processName: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,126}\.exe$/),
  executableSha256: sha256DigestSchema,
}).strict();
export type ReviewedExecutableIdentity = z.infer<typeof reviewedExecutableIdentitySchema>;

export const fieldRefSchema = z.object({
  fieldId: z.string().uuid(),
  fieldGeneration: z.number().int().positive(),
});
export type FieldRef = z.infer<typeof fieldRefSchema>;

export const fieldIdentitySchema = fieldRefSchema
  .extend({
    subsystem: z.literal("field"),
    agentId: z.string().min(1).max(200),
    machineId: z.string().min(1).max(200),
    windowsSessionId: z.string().min(1).max(200),
    baseImageDigest: sha256DigestSchema,
    personalStateDiskId: z.string().min(1).max(300).optional(),
    personalStateGeneration: z.number().int().positive().optional(),
    taskDiskId: z.string().min(1).max(300),
    createdAt: z.string().datetime(),
  })
  .superRefine((identity, context) => {
    if ((identity.personalStateDiskId === undefined) !== (identity.personalStateGeneration === undefined)) {
      context.addIssue({
        code: "custom",
        path: ["personalStateDiskId"],
        message: "Personal-state disk ID and generation must be present together.",
      });
    }
  });
export type FieldIdentity = z.infer<typeof fieldIdentitySchema>;

export const fieldDisplayContractSchema = z.object({
  monitorCount: z.literal(1),
  width: z.number().int().min(1024).max(7680),
  height: z.number().int().min(720).max(4320),
  scalePercent: z.number().int().min(100).max(200),
  browserZoomPercent: z.number().int().min(50).max(200),
  keyboardLayout: z.string().min(2).max(40),
  dynamicResolutionAllowed: z.literal(false),
});
export type FieldDisplayContract = z.infer<typeof fieldDisplayContractSchema>;

export const fieldPolicySchema = z
  .object({
    contractVersion: z.literal(1),
    policyId: z.string().uuid(),
    field: fieldRefSchema,
    mode: fieldModeSchema,
    allowedExecutables: z.array(reviewedExecutableIdentitySchema).max(128),
    allowedCapabilities: z.array(fieldCapabilitySchema).min(1).max(32),
    allowedOrigins: z.array(canonicalOriginSchema).max(128).default([]),
    maximumRuntimeSeconds: z.number().int().min(1).max(86_400),
    maximumActions: z.number().int().min(1).max(1_000_000),
    recordingConsent: z.enum(["granted", "not_applicable"]),
    allowHostDesktopAccess: z.literal(false),
    allowHostDriveWrite: z.literal(false),
    allowPrivilegeEscalation: z.literal(false),
    allowSecurityControlChanges: z.literal(false),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .superRefine((policy, context) => {
    if (new Date(policy.expiresAt).getTime() <= new Date(policy.issuedAt).getTime()) {
      context.addIssue({ code: "custom", path: ["expiresAt"], message: "Field policy must expire after it is issued." });
    }
    if (policy.mode === "teach" && policy.recordingConsent !== "granted") {
      context.addIssue({ code: "custom", path: ["recordingConsent"], message: "Teach mode requires explicit recording consent." });
    }
    const executableKeys = policy.allowedExecutables.map((value) => `${value.processName}:${value.executableSha256}`);
    if (new Set(executableKeys).size !== executableKeys.length) {
      context.addIssue({ code: "custom", path: ["allowedExecutables"], message: "Allowed executable identities must be unique." });
    }
    if (new Set(policy.allowedOrigins).size !== policy.allowedOrigins.length) {
      context.addIssue({ code: "custom", path: ["allowedOrigins"], message: "Allowed origins must be unique after canonicalization." });
    }
    if (new Set(policy.allowedCapabilities).size !== policy.allowedCapabilities.length) {
      context.addIssue({ code: "custom", path: ["allowedCapabilities"], message: "Allowed capabilities must be unique." });
    }
  });
export type FieldPolicy = z.infer<typeof fieldPolicySchema>;

export const fieldAttestationSchema = z.object({
  contractVersion: z.literal(1),
  identity: fieldIdentitySchema,
  display: fieldDisplayContractSchema,
  policyHash: sha256DigestSchema,
  issuerKeyId: z.string().min(1).max(200),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  signature: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export type FieldAttestation = z.infer<typeof fieldAttestationSchema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function unsignedAttestation(input: Omit<FieldAttestation, "signature">): string {
  return canonicalJson(input);
}

export function createFieldAttestation(input: {
  identity: FieldIdentity;
  display: FieldDisplayContract;
  policy: FieldPolicy;
  issuerKeyId: string;
  secret: string;
  issuedAt?: string;
  ttlSeconds?: number;
}): FieldAttestation {
  const identity = fieldIdentitySchema.parse(input.identity);
  const display = fieldDisplayContractSchema.parse(input.display);
  const policy = fieldPolicySchema.parse(input.policy);
  if (policy.field.fieldId !== identity.fieldId || policy.field.fieldGeneration !== identity.fieldGeneration) {
    throw new Error("Field policy identity does not match the attested field generation.");
  }
  if (input.secret.length < 32) throw new Error("Field attestation secret must contain at least 32 characters.");
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const ttlSeconds = input.ttlSeconds ?? 300;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3_600) {
    throw new Error("Field attestation TTL must be an integer from 1 through 3600 seconds.");
  }
  const unsigned: Omit<FieldAttestation, "signature"> = {
    contractVersion: 1,
    identity,
    display,
    policyHash: sha256Canonical(policy),
    issuerKeyId: input.issuerKeyId,
    issuedAt,
    expiresAt: new Date(new Date(issuedAt).getTime() + ttlSeconds * 1_000).toISOString(),
  };
  return fieldAttestationSchema.parse({
    ...unsigned,
    signature: createHmac("sha256", input.secret).update(unsignedAttestation(unsigned)).digest("base64url"),
  });
}

export function verifyFieldAttestation(input: {
  attestation: FieldAttestation;
  policy: FieldPolicy;
  secret: string;
  now?: Date;
}): { identity: FieldIdentity; display: FieldDisplayContract; policy: FieldPolicy } {
  const attestation = fieldAttestationSchema.parse(input.attestation);
  const policy = fieldPolicySchema.parse(input.policy);
  if (input.secret.length < 32) throw new Error("Field attestation secret must contain at least 32 characters.");
  if (attestation.identity.fieldId !== policy.field.fieldId || attestation.identity.fieldGeneration !== policy.field.fieldGeneration) {
    throw new Error("Field attestation and policy refer to different field generations.");
  }
  if (attestation.policyHash !== sha256Canonical(policy)) throw new Error("Field policy hash does not match the attestation.");
  const now = input.now ?? new Date();
  if (now.getTime() < new Date(attestation.issuedAt).getTime()) throw new Error("Field attestation is not valid yet.");
  if (now.getTime() >= new Date(attestation.expiresAt).getTime()) throw new Error("Field attestation has expired.");
  if (now.getTime() >= new Date(policy.expiresAt).getTime()) throw new Error("Field policy has expired.");

  const { signature, ...unsigned } = attestation;
  const expected = createHmac("sha256", input.secret).update(unsignedAttestation(unsigned)).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Field attestation signature is invalid.");
  return { identity: attestation.identity, display: attestation.display, policy };
}
