import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const healthStateSchema = z.enum(["healthy", "degraded", "offline", "stopped"]);

export const supportBundleInputSchema = z.object({
  generatedAt: z.string().datetime(),
  exosuitVersion: z.string().min(1).max(100),
  platform: z.string().min(1).max(200),
  provider: z.string().min(1).max(200),
  mode: z.string().min(1).max(100),
  emergencyStopped: z.boolean(),
  persistenceMode: z.enum(["memory", "file", "encrypted_file"]),
  counts: z.object({
    windows: z.number().int().nonnegative(),
    workflows: z.number().int().nonnegative(),
    agents: z.number().int().nonnegative(),
    installedSkills: z.number().int().nonnegative(),
    applicationMaps: z.number().int().nonnegative(),
  }),
  agents: z.array(z.object({
    agentIdHash: z.string().regex(/^[a-f0-9]{64}$/),
    sessionKind: z.string().min(1).max(100),
    health: healthStateSchema,
    capabilities: z.array(z.string().min(1).max(100)).max(100),
    softwareVersion: z.string().min(1).max(100),
  })).max(10_000),
  workflowStates: z.record(z.string(), z.number().int().nonnegative()),
  auditSummary: z.object({
    eventCount: z.number().int().nonnegative(),
    eventTypes: z.record(z.string(), z.number().int().nonnegative()),
    chainValid: z.boolean(),
  }),
  performanceSummary: z.array(z.object({
    metric: z.string().min(1).max(200),
    count: z.number().int().nonnegative(),
    p50: z.number().finite().nonnegative(),
    p95: z.number().finite().nonnegative(),
    p99: z.number().finite().nonnegative(),
    maximum: z.number().finite().nonnegative(),
  })).max(1_000),
  recentErrorCodes: z.array(z.string().min(1).max(200)).max(1_000),
  configurationFlags: z.record(z.string(), z.boolean()),
});
export type SupportBundleInput = z.infer<typeof supportBundleInputSchema>;

export const supportBundleSchema = z.object({
  formatVersion: z.literal(1),
  bundleId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  data: supportBundleInputSchema.omit({ generatedAt: true }),
  integrityHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type SupportBundle = z.infer<typeof supportBundleSchema>;

const forbiddenKeyPatterns = [
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /authorization/i,
  /cookie/i,
  /screenshot/i,
  /clipboard/i,
  /elementvalue/i,
  /windowtitle/i,
  /rawpayload/i,
];

const forbiddenValuePatterns = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/i,
  /\bsk-[A-Za-z0-9_-]{12,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/,
];

export function createSupportBundle(input: SupportBundleInput): SupportBundle {
  const parsed = supportBundleInputSchema.parse(input);
  assertNoSensitiveData(parsed);
  const { generatedAt, ...data } = parsed;
  const unsigned = {
    formatVersion: 1 as const,
    bundleId: randomUUID(),
    generatedAt,
    data,
  };
  return supportBundleSchema.parse({
    ...unsigned,
    integrityHash: sha256(stableStringify(unsigned)),
  });
}

export function verifySupportBundle(bundle: SupportBundle): void {
  const parsed = supportBundleSchema.parse(bundle);
  const { integrityHash, ...unsigned } = parsed;
  assertNoSensitiveData(unsigned);
  if (integrityHash !== sha256(stableStringify(unsigned))) {
    throw new Error("Support bundle failed integrity verification.");
  }
}

export async function writeSupportBundle(path: string, bundle: SupportBundle): Promise<void> {
  verifySupportBundle(bundle);
  const destination = resolve(path);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(bundle, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export function hashPrivateIdentifier(value: string): string {
  if (!value.trim()) throw new Error("Private identifier cannot be empty.");
  return sha256(value);
}

function assertNoSensitiveData(value: unknown, path = "root"): void {
  if (typeof value === "string") {
    if (forbiddenValuePatterns.some((pattern) => pattern.test(value))) {
      throw new Error(`Support bundle contains a forbidden sensitive value at ${path}.`);
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveData(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKeyPatterns.some((pattern) => pattern.test(key))) {
      throw new Error(`Support bundle contains forbidden field ${path}.${key}.`);
    }
    assertNoSensitiveData(child, `${path}.${key}`);
  }
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
