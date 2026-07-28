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

/**
 * A heartbeat asserts liveness and may restate capabilities and version, so it changes
 * how `AgentRegistry.select` routes work. It must therefore be authenticated to the same
 * standard as registration.
 *
 * `machineId` and `windowsSessionId` are included so the registrar can refuse a heartbeat
 * that does not match the identity the agent registered under, rather than trusting an
 * `agentId` on its own.
 */
export const agentHeartbeatPayloadSchema = z.object({
  contractVersion: z.literal(1),
  agentId: z.string().min(1).max(200),
  machineId: z.string().min(1).max(300),
  windowsSessionId: z.string().min(1).max(300),
  issuedAt: z.string().datetime(),
  nonce: z.string().regex(/^[a-f0-9]{32,128}$/),
  healthState: z.enum(["online", "degraded"]),
  capabilities: z.array(z.string().min(1).max(200)).max(200),
  softwareVersion: z.string().min(1).max(100),
});
export type AgentHeartbeatPayload = z.infer<typeof agentHeartbeatPayloadSchema>;

export const signedAgentHeartbeatSchema = z.object({
  payload: agentHeartbeatPayloadSchema,
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});
export type SignedAgentHeartbeat = z.infer<typeof signedAgentHeartbeatSchema>;

/**
 * Domain separators.
 *
 * Both message types are signed with the same secret, so the domain tag is what stops a
 * signature minted for one from being presented as the other. Without it, any pair of
 * payload shapes that canonicalize identically would be interchangeable, and the guarantee
 * would rest on the two schemas never converging — which is a property no one is checking.
 */
const REGISTRATION_DOMAIN = "exosuit.agent-registration.v1";
const HEARTBEAT_DOMAIN = "exosuit.agent-heartbeat.v1";

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
      signature: this.#signature(REGISTRATION_DOMAIN, parsed),
    });
  }

  verify(input: SignedAgentRegistration, now = new Date()): AgentRegistrationPayload {
    const registration = signedAgentRegistrationSchema.parse(input);
    if (registration.payload.minimumContractVersion > registration.payload.maximumContractVersion) {
      throw new Error("Agent registration contract range is invalid.");
    }
    this.#verifySigned({
      domain: REGISTRATION_DOMAIN,
      payload: registration.payload,
      signature: registration.signature,
      now,
      subject: "Agent registration",
    });
    return structuredClone(registration.payload);
  }

  createHeartbeatPayload(
    input: Omit<AgentHeartbeatPayload, "contractVersion" | "issuedAt" | "nonce"> & {
      issuedAt?: string;
      nonce?: string;
    },
  ): AgentHeartbeatPayload {
    return agentHeartbeatPayloadSchema.parse({
      contractVersion: 1,
      ...input,
      issuedAt: input.issuedAt ?? new Date().toISOString(),
      nonce: input.nonce ?? randomBytes(24).toString("hex"),
    });
  }

  signHeartbeat(payload: AgentHeartbeatPayload): SignedAgentHeartbeat {
    const parsed = agentHeartbeatPayloadSchema.parse(payload);
    return signedAgentHeartbeatSchema.parse({
      payload: parsed,
      signature: this.#signature(HEARTBEAT_DOMAIN, parsed),
    });
  }

  verifyHeartbeat(input: SignedAgentHeartbeat, now = new Date()): AgentHeartbeatPayload {
    const heartbeat = signedAgentHeartbeatSchema.parse(input);
    this.#verifySigned({
      domain: HEARTBEAT_DOMAIN,
      payload: heartbeat.payload,
      signature: heartbeat.signature,
      now,
      subject: "Agent heartbeat",
    });
    return structuredClone(heartbeat.payload);
  }

  /**
   * Shared verification for every signed agent message.
   *
   * Registration and heartbeat go through one path deliberately: a second, parallel
   * implementation is how one of them quietly ends up without replay protection.
   *
   * Order matters. The nonce is recorded only after the signature verifies, so an
   * unauthenticated caller cannot burn a nonce or grow the replay cache.
   */
  #verifySigned(input: {
    domain: string;
    payload: { agentId: string; nonce: string; issuedAt: string };
    signature: string;
    now: Date;
    subject: string;
  }): void {
    this.#pruneNonces(input.now);
    const issuedAt = Date.parse(input.payload.issuedAt);
    if (!Number.isFinite(issuedAt)) throw new Error(`${input.subject} timestamp is invalid.`);
    if (Math.abs(input.now.getTime() - issuedAt) > this.#maximumClockSkewMs) {
      throw new Error(`${input.subject} is outside the allowed clock-skew window.`);
    }
    const expected = Buffer.from(this.#signature(input.domain, input.payload), "hex");
    const actual = Buffer.from(input.signature, "hex");
    if (expected.byteLength !== actual.byteLength || !timingSafeEqual(expected, actual)) {
      throw new Error(`${input.subject} signature is invalid.`);
    }
    const replayKey = `${input.domain}:${input.payload.agentId}:${input.payload.nonce}`;
    if (this.#seenNonces.has(replayKey)) throw new Error(`${input.subject} nonce was already used.`);
    this.#seenNonces.set(replayKey, input.now.getTime() + this.#nonceRetentionMs);
  }

  #signature(domain: string, payload: unknown): string {
    return createHmac("sha256", this.#secret)
      .update(`${domain}\n${stableStringify(payload)}`)
      .digest("hex");
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
