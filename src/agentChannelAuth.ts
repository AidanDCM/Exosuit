import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const agentRegistrationPayloadSchema = z.object({
  contractVersion: z.literal(1),
  agentId: z.string().min(1).max(200),
  machineId: z.string().min(1).max(300),
  windowsSessionId: z.string().min(1).max(300),
  userSessionKind: z.enum(["console", "vm", "rdp", "cloud"]),
  issuedAt: z.string().datetime(),
  nonce: z.string().regex(/^[a-f0-9]{32,128}$/),
  capabilities: z.array(z.string().min(1).max(200)).max(200),
  softwareVersion: z.string().min(1).max(100),
  minimumContractVersion: z.number().int().positive(),
  maximumContractVersion: z.number().int().positive(),
});
export type AgentRegistrationPayload = z.infer<typeof agentRegistrationPayloadSchema>;

export const signedAgentRegistrationSchema = z.object({
  payload: agentRegistrationPayloadSchema,
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});
export type SignedAgentRegistration = z.infer<typeof signedAgentRegistrationSchema>;

export class AgentChannelAuthenticator {
  readonly #secret: Buffer;
  readonly #maximumClockSkewMs: number;
  readonly #nonceRetentionMs: number;
  readonly #seenNonces = new Map<string, number>();

  constructor(options: {
    secret: string | Buffer;
    maximumClockSkewMs?: number;
    nonceRetentionMs?: number;
  }) {
    this.#secret = Buffer.isBuffer(options.secret)
      ? Buffer.from(options.secret)
      : Buffer.from(options.secret, "utf8");
    if (this.#secret.byteLength < 32) {
      throw new Error("Agent-channel authentication requires at least 32 secret bytes.");
    }
    this.#maximumClockSkewMs = options.maximumClockSkewMs ?? 30_000;
    this.#nonceRetentionMs = options.nonceRetentionMs ?? 300_000;
    if (
      !Number.isInteger(this.#maximumClockSkewMs) ||
      this.#maximumClockSkewMs < 1_000 ||
      this.#maximumClockSkewMs > 300_000
    ) {
      throw new Error("maximumClockSkewMs must be between 1000 and 300000.");
    }
    if (
      !Number.isInteger(this.#nonceRetentionMs) ||
      this.#nonceRetentionMs < this.#maximumClockSkewMs ||
      this.#nonceRetentionMs > 3_600_000
    ) {
      throw new Error("nonceRetentionMs must cover clock skew and remain at most one hour.");
    }
  }

  createPayload(input: Omit<AgentRegistrationPayload, "contractVersion" | "issuedAt" | "nonce"> & {
    issuedAt?: string;
    nonce?: string;
  }): AgentRegistrationPayload {
    return agentRegistrationPayloadSchema.parse({
      contractVersion: 1,
      ...input,
      issuedAt: input.issuedAt ?? new Date().toISOString(),
      nonce: input.nonce ?? randomBytes(24).toString("hex"),
    });
  }

  sign(payload: AgentRegistrationPayload): SignedAgentRegistration {
    const parsed = agentRegistrationPayloadSchema.parse(payload);
    return signedAgentRegistrationSchema.parse({
      payload: parsed,
      signature: this.#signature(parsed),
    });
  }

  verify(input: SignedAgentRegistration, now = new Date()): AgentRegistrationPayload {
    this.#pruneNonces(now);
    const registration = signedAgentRegistrationSchema.parse(input);
    const issuedAt = Date.parse(registration.payload.issuedAt);
    if (!Number.isFinite(issuedAt)) throw new Error("Agent registration timestamp is invalid.");
    if (Math.abs(now.getTime() - issuedAt) > this.#maximumClockSkewMs) {
      throw new Error("Agent registration is outside the allowed clock-skew window.");
    }
    if (registration.payload.minimumContractVersion > registration.payload.maximumContractVersion) {
      throw new Error("Agent registration contract range is invalid.");
    }
    const expected = Buffer.from(this.#signature(registration.payload), "hex");
    const actual = Buffer.from(registration.signature, "hex");
    if (expected.byteLength !== actual.byteLength || !timingSafeEqual(expected, actual)) {
      throw new Error("Agent registration signature is invalid.");
    }
    const replayKey = `${registration.payload.agentId}:${registration.payload.nonce}`;
    if (this.#seenNonces.has(replayKey)) throw new Error("Agent registration nonce was already used.");
    this.#seenNonces.set(replayKey, now.getTime() + this.#nonceRetentionMs);
    return structuredClone(registration.payload);
  }

  #signature(payload: AgentRegistrationPayload): string {
    return createHmac("sha256", this.#secret).update(stableStringify(payload)).digest("hex");
  }

  #pruneNonces(now: Date): void {
    for (const [key, expiresAt] of this.#seenNonces) {
      if (expiresAt <= now.getTime()) this.#seenNonces.delete(key);
    }
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}
