import { z } from "zod";

const canonicalUtcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const canonicalUtcTimestampSchema = z
  .string()
  .regex(canonicalUtcPattern, "Timestamp must use canonical UTC form YYYY-MM-DDTHH:mm:ss.sssZ.")
  .superRefine((value, context) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
      context.addIssue({ code: "custom", message: "Timestamp must round-trip exactly through UTC." });
    }
  });

export function canonicalUtcTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Timestamp is invalid.");
  return date.toISOString();
}

export function normalizeFieldOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Field origin must be a valid absolute URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Field origin must use http or https.");
  }
  if (parsed.username || parsed.password) throw new Error("Field origin must not include user information.");
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Field origin must not include a path, query, or fragment.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) throw new Error("Field origin must include a host.");
  const defaultPort = parsed.protocol === "https:" ? "443" : "80";
  const port = parsed.port && parsed.port !== defaultPort ? `:${parsed.port}` : "";
  return `${parsed.protocol}//${hostname}${port}`;
}

export const canonicalFieldOriginSchema = z.string().superRefine((value, context) => {
  try {
    const normalized = normalizeFieldOrigin(value);
    if (normalized !== value) {
      context.addIssue({ code: "custom", message: `Field origin is not canonical; use ${normalized}.` });
    }
  } catch (error) {
    context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Field origin is invalid." });
  }
});

export const personalStateIdentitySchema = z.object({
  diskId: z.string().min(1).max(300),
  generation: z.number().int().positive(),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  sealedSnapshotDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

export type PersonalStateIdentity = z.infer<typeof personalStateIdentitySchema>;
