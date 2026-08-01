import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { fieldChannelKeyRotationStateSchema, type FieldChannelKeyRotationState } from "./fieldChannelKeyRotation.js";
import { fieldRefSchema, type FieldRef } from "./fieldContracts.js";

const algorithm = "hmac-sha256" as const;
const protectedRotationStateSchema = z.object({
  contractVersion: z.literal(1),
  field: fieldRefSchema,
  algorithm: z.literal(algorithm),
  payloadBase64: z.string().min(1).max(128 * 1024).regex(/^[A-Za-z0-9+/]*={0,2}$/),
  authenticationTag: z.string().regex(/^[a-f0-9]{64}$/),
});

export class FileFieldChannelKeyRotationStateStore {
  readonly #path: string;
  readonly #field: FieldRef;
  readonly #maxBytes: number;

  constructor(input: { path: string; field: FieldRef; maxBytes?: number }) {
    if (!input.path.trim()) throw new Error("A channel-key rotation state path is required.");
    this.#path = resolve(input.path);
    this.#field = fieldRefSchema.parse(input.field);
    this.#maxBytes = input.maxBytes ?? 192 * 1024;
    if (!Number.isInteger(this.#maxBytes) || this.#maxBytes < 1_024 || this.#maxBytes > 1024 * 1024) {
      throw new Error("Rotation state maxBytes must be between 1024 and 1048576.");
    }
  }

  async save(stateInput: FieldChannelKeyRotationState, integritySecret: string): Promise<void> {
    requireSecret(integritySecret);
    const state = fieldChannelKeyRotationStateSchema.parse(structuredClone(stateInput));
    requireField(state.field, this.#field);
    const payload = Buffer.from(JSON.stringify(state), "utf8");
    const envelope = protectedRotationStateSchema.parse({
      contractVersion: 1,
      field: this.#field,
      algorithm,
      payloadBase64: payload.toString("base64"),
      authenticationTag: authenticate(this.#field, integritySecret, payload),
    });
    const serialized = `${JSON.stringify(envelope)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > this.#maxBytes) throw new Error("Protected rotation state exceeds its byte limit.");

    await mkdir(dirname(this.#path), { recursive: true });
    const temporary = `${this.#path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, this.#path);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async load(integritySecret: string): Promise<FieldChannelKeyRotationState | undefined> {
    requireSecret(integritySecret);
    let details;
    try {
      details = await stat(this.#path);
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    if (!details.isFile() || details.size <= 0 || details.size > this.#maxBytes) {
      throw new Error("Protected rotation state is empty, oversized, or not a file.");
    }
    const serialized = await readFile(this.#path, "utf8");
    let envelope: z.infer<typeof protectedRotationStateSchema>;
    try {
      envelope = protectedRotationStateSchema.parse(JSON.parse(serialized) as unknown);
    } catch {
      throw new Error("Protected rotation state envelope is malformed.");
    }
    requireField(envelope.field, this.#field);
    const payload = Buffer.from(envelope.payloadBase64, "base64");
    const expected = Buffer.from(authenticate(this.#field, integritySecret, payload), "hex");
    const actual = Buffer.from(envelope.authenticationTag, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new Error("Protected rotation state authentication failed.");
    }
    let state: FieldChannelKeyRotationState;
    try {
      state = fieldChannelKeyRotationStateSchema.parse(JSON.parse(payload.toString("utf8")) as unknown);
    } catch {
      throw new Error("Authenticated rotation state payload is invalid.");
    }
    requireField(state.field, this.#field);
    return structuredClone(state);
  }
}

function authenticate(field: FieldRef, secret: string, payload: Buffer): string {
  const scope = Buffer.from([
    "exosuit-field-channel-key-rotation-state-v1",
    field.fieldId,
    field.fieldGeneration.toString(),
    algorithm,
    "",
  ].join("\n"), "utf8");
  return createHmac("sha256", secret).update(Buffer.concat([scope, payload])).digest("hex");
}

function requireSecret(secret: string): void {
  if (secret.length < 32) throw new Error("Rotation state integrity secret must contain at least 32 characters.");
}

function requireField(actual: FieldRef, expected: FieldRef): void {
  if (actual.fieldId !== expected.fieldId || actual.fieldGeneration !== expected.fieldGeneration) {
    throw new Error("Rotation state cannot cross Field generations.");
  }
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
