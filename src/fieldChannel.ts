import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { canonicalJson, fieldRefSchema, sha256Canonical, type FieldRef } from "./fieldContracts.js";

export const fieldChannelDirectionSchema = z.enum(["host_to_guest", "guest_to_host"]);
export type FieldChannelDirection = z.infer<typeof fieldChannelDirectionSchema>;

export const fieldChannelMessageTypeSchema = z.enum([
  "handshake",
  "bootstrap_status",
  "heartbeat",
  "scene_observation",
  "command",
  "command_result",
  "event",
  "emergency_stop",
  "shutdown",
]);
export type FieldChannelMessageType = z.infer<typeof fieldChannelMessageTypeSchema>;

const canonicalWireTimestampSchema = z
  .string()
  .datetime()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "Field channel timestamps must use canonical UTC millisecond format.");

const unsignedFieldChannelEnvelopeSchema = z.object({
  contractVersion: z.literal(1),
  messageId: z.string().uuid(),
  field: fieldRefSchema,
  direction: fieldChannelDirectionSchema,
  sequence: z.number().int().nonnegative(),
  messageType: fieldChannelMessageTypeSchema,
  sentAt: canonicalWireTimestampSchema,
  expiresAt: canonicalWireTimestampSchema,
  nonce: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  keyId: z.string().min(1).max(200),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.record(z.string(), z.unknown()),
});

export const fieldChannelEnvelopeSchema = unsignedFieldChannelEnvelopeSchema.extend({
  signature: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export type FieldChannelEnvelope = z.infer<typeof fieldChannelEnvelopeSchema>;

type UnsignedFieldChannelEnvelope = z.infer<typeof unsignedFieldChannelEnvelopeSchema>;

function sign(unsigned: UnsignedFieldChannelEnvelope, secret: string): string {
  return createHmac("sha256", secret).update(canonicalJson(unsigned)).digest("base64url");
}

export function createFieldChannelEnvelope(input: {
  field: FieldRef;
  direction: FieldChannelDirection;
  sequence: number;
  messageType: FieldChannelMessageType;
  payload: Record<string, unknown>;
  keyId: string;
  secret: string;
  sentAt?: string;
  ttlSeconds?: number;
  messageId?: string;
  nonce?: string;
}): FieldChannelEnvelope {
  if (input.secret.length < 32) throw new Error("Field channel secret must contain at least 32 characters.");
  const sentAt = canonicalWireTimestampSchema.parse(input.sentAt ?? new Date().toISOString());
  const ttlSeconds = input.ttlSeconds ?? 30;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) {
    throw new Error("Field channel TTL must be an integer from 1 through 300 seconds.");
  }
  const unsigned = unsignedFieldChannelEnvelopeSchema.parse({
    contractVersion: 1,
    messageId: input.messageId ?? randomUUID(),
    field: input.field,
    direction: input.direction,
    sequence: input.sequence,
    messageType: input.messageType,
    sentAt,
    expiresAt: new Date(new Date(sentAt).getTime() + ttlSeconds * 1_000).toISOString(),
    nonce: input.nonce ?? randomBytes(16).toString("base64url"),
    keyId: input.keyId,
    payloadHash: sha256Canonical(input.payload),
    payload: input.payload,
  });
  return fieldChannelEnvelopeSchema.parse({ ...unsigned, signature: sign(unsigned, input.secret) });
}

export function verifyFieldChannelEnvelope(input: {
  envelope: FieldChannelEnvelope;
  secret: string;
  expectedField: FieldRef;
  expectedDirection: FieldChannelDirection;
  expectedKeyId?: string;
  now?: Date;
}): FieldChannelEnvelope {
  if (input.secret.length < 32) throw new Error("Field channel secret must contain at least 32 characters.");
  const envelope = fieldChannelEnvelopeSchema.parse(input.envelope);
  const expectedField = fieldRefSchema.parse(input.expectedField);
  if (
    envelope.field.fieldId !== expectedField.fieldId ||
    envelope.field.fieldGeneration !== expectedField.fieldGeneration
  ) {
    throw new Error("Field channel message refers to a different Field generation.");
  }
  if (envelope.direction !== input.expectedDirection) throw new Error("Field channel message direction is invalid.");
  if (input.expectedKeyId !== undefined && envelope.keyId !== input.expectedKeyId) {
    throw new Error("Field channel key identity is invalid.");
  }
  const now = input.now ?? new Date();
  if (now.getTime() < new Date(envelope.sentAt).getTime()) throw new Error("Field channel message is not valid yet.");
  if (now.getTime() >= new Date(envelope.expiresAt).getTime()) throw new Error("Field channel message has expired.");
  if (envelope.payloadHash !== sha256Canonical(envelope.payload)) {
    throw new Error("Field channel payload hash is invalid.");
  }
  const { signature, ...unsigned } = envelope;
  const expected = createHmac("sha256", input.secret).update(canonicalJson(unsigned)).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Field channel signature is invalid.");
  }
  return envelope;
}

export class FieldChannelReplayGuard {
  readonly #field: FieldRef;
  readonly #direction: FieldChannelDirection;
  readonly #keyId?: string;
  readonly #maxRemembered: number;
  readonly #stateFilePath?: string;
  readonly #seenMessageIds = new Set<string>();
  readonly #seenNonces = new Set<string>();
  readonly #order: Array<{ messageId: string; nonce: string }> = [];
  #lastSequence = -1;

  constructor(input: {
    field: FieldRef;
    direction: FieldChannelDirection;
    expectedKeyId?: string;
    maxRemembered?: number;
    stateFilePath?: string;
  }) {
    this.#field = fieldRefSchema.parse(input.field);
    this.#direction = fieldChannelDirectionSchema.parse(input.direction);
    this.#keyId = input.expectedKeyId;
    this.#maxRemembered = input.maxRemembered ?? 10_000;
    this.#stateFilePath = input.stateFilePath;
    if (!Number.isInteger(this.#maxRemembered) || this.#maxRemembered < 1 || this.#maxRemembered > 1_000_000) {
      throw new Error("maxRemembered must be an integer from 1 through 1,000,000.");
    }
    this.#hydrate();
  }

  accept(input: { envelope: FieldChannelEnvelope; secret: string; now?: Date }): FieldChannelEnvelope {
    const envelope = verifyFieldChannelEnvelope({
      envelope: input.envelope,
      secret: input.secret,
      expectedField: this.#field,
      expectedDirection: this.#direction,
      expectedKeyId: this.#keyId,
      now: input.now,
    });
    if (this.#seenMessageIds.has(envelope.messageId)) throw new Error("Field channel message ID was replayed.");
    if (this.#seenNonces.has(envelope.nonce)) throw new Error("Field channel nonce was replayed.");
    if (envelope.sequence <= this.#lastSequence) throw new Error("Field channel sequence must increase strictly.");

    this.#seenMessageIds.add(envelope.messageId);
    this.#seenNonces.add(envelope.nonce);
    this.#order.push({ messageId: envelope.messageId, nonce: envelope.nonce });
    this.#lastSequence = envelope.sequence;
    while (this.#order.length > this.#maxRemembered) {
      const removed = this.#order.shift();
      if (removed) {
        this.#seenMessageIds.delete(removed.messageId);
        this.#seenNonces.delete(removed.nonce);
      }
    }
    this.#persist();
    return envelope;
  }

  lastSequence(): number {
    return this.#lastSequence;
  }

  #hydrate(): void {
    if (!this.#stateFilePath) return;
    let raw: string;
    try {
      raw = readFileSync(this.#stateFilePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    const state = replayStateSchema.parse(JSON.parse(raw));
    if (
      state.field.fieldId !== this.#field.fieldId ||
      state.field.fieldGeneration !== this.#field.fieldGeneration ||
      state.direction !== this.#direction ||
      state.expectedKeyId !== (this.#keyId ?? null)
    ) {
      throw new Error("Persisted Field replay state identity does not match this channel.");
    }
    if (state.entries.length > this.#maxRemembered) throw new Error("Persisted Field replay state exceeds the configured bound.");
    this.#lastSequence = state.lastSequence;
    for (const entry of state.entries) {
      if (this.#seenMessageIds.has(entry.messageId) || this.#seenNonces.has(entry.nonce)) {
        throw new Error("Persisted Field replay state contains duplicate identities.");
      }
      this.#seenMessageIds.add(entry.messageId);
      this.#seenNonces.add(entry.nonce);
      this.#order.push(entry);
    }
  }

  #persist(): void {
    if (!this.#stateFilePath) return;
    const state = replayStateSchema.parse({
      contractVersion: 1,
      field: this.#field,
      direction: this.#direction,
      expectedKeyId: this.#keyId ?? null,
      lastSequence: this.#lastSequence,
      entries: this.#order,
    });
    mkdirSync(dirname(this.#stateFilePath), { recursive: true });
    const temporary = `${this.#stateFilePath}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, this.#stateFilePath);
  }
}

const replayStateSchema = z.object({
  contractVersion: z.literal(1),
  field: fieldRefSchema,
  direction: fieldChannelDirectionSchema,
  expectedKeyId: z.string().min(1).max(200).nullable(),
  lastSequence: z.number().int().min(-1),
  entries: z.array(z.object({ messageId: z.string().uuid(), nonce: z.string().regex(/^[A-Za-z0-9_-]{22}$/) })).max(1_000_000),
}).strict();
