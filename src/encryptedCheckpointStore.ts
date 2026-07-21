import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  runtimeWorkflowRecordSchema,
  workflowArtifactSchema,
  type RuntimeWorkflowRecord,
  type WorkflowArtifact,
  type WorkflowCheckpointStore,
} from "./workflowRuntime.js";

const FORMAT_VERSION = 1;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const encryptedEnvelopeSchema = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
  algorithm: z.literal("aes-256-gcm"),
  workflowKey: z.string().regex(/^[a-f0-9]{64}$/),
  savedAt: z.string().datetime(),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
});

const payloadSchema = z.object({
  workflow: runtimeWorkflowRecordSchema,
  artifacts: z.array(workflowArtifactSchema),
});

type Payload = z.infer<typeof payloadSchema>;
type Envelope = z.infer<typeof encryptedEnvelopeSchema>;

export class EncryptedFileWorkflowCheckpointStore implements WorkflowCheckpointStore {
  readonly #directory: string;
  readonly #key: Buffer;
  readonly #maxBytes: number;

  constructor(options: { directory: string; key: Buffer | string; maxCheckpointBytes?: number }) {
    if (!options.directory.trim()) throw new Error("A checkpoint directory is required.");
    this.#directory = resolve(options.directory);
    this.#key = normalizeKey(options.key);
    this.#maxBytes = options.maxCheckpointBytes ?? DEFAULT_MAX_BYTES;
    if (!Number.isInteger(this.#maxBytes) || this.#maxBytes < 1_024 || this.#maxBytes > 200 * 1024 * 1024) {
      throw new Error("maxCheckpointBytes must be between 1024 and 209715200.");
    }
  }

  async save(workflow: RuntimeWorkflowRecord, artifacts: WorkflowArtifact[]): Promise<void> {
    const payload = payloadSchema.parse({ workflow, artifacts });
    const workflowId = payload.workflow.definition.workflowId;
    if (payload.artifacts.some((artifact) => artifact.workflowId !== workflowId)) {
      throw new Error("Artifact identity does not match the checkpoint workflow.");
    }
    const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
    if (plaintext.byteLength > this.#maxBytes) throw new Error("Workflow checkpoint exceeds the configured size limit.");

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const workflowKey = sha256(workflowId);
    cipher.setAAD(Buffer.from(`${FORMAT_VERSION}:${workflowKey}`, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = encryptedEnvelopeSchema.parse({
      formatVersion: FORMAT_VERSION,
      algorithm: "aes-256-gcm",
      workflowKey,
      savedAt: new Date().toISOString(),
      iv: iv.toString("base64url"),
      authTag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
    });
    const serialized = `${JSON.stringify(envelope)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > this.#maxBytes * 2) {
      throw new Error("Encrypted workflow checkpoint exceeds the configured size limit.");
    }

    await mkdir(this.#directory, { recursive: true });
    const destination = this.#pathFor(workflowId);
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async load(workflowId: string): Promise<Payload | undefined> {
    let data: string;
    try {
      data = await readFile(this.#pathFor(workflowId), "utf8");
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    const envelope = this.#parseEnvelope(data);
    if (envelope.workflowKey !== sha256(workflowId)) {
      throw new Error("Encrypted workflow checkpoint identity does not match the requested workflow.");
    }
    const payload = this.#decrypt(envelope);
    this.#validatePayloadIdentity(payload, workflowId);
    return structuredClone(payload);
  }

  async list(): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(this.#directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const ids: string[] = [];
    for (const name of names.filter((item) => item.endsWith(".encrypted-checkpoint.json")).sort()) {
      try {
        const data = await readFile(join(this.#directory, name), "utf8");
        const envelope = this.#parseEnvelope(data);
        const payload = this.#decrypt(envelope);
        const workflowId = payload.workflow.definition.workflowId;
        this.#validatePayloadIdentity(payload, workflowId);
        if (envelope.workflowKey !== sha256(workflowId)) continue;
        ids.push(workflowId);
      } catch {
        // Invalid, unauthenticated, or wrong-key files are never advertised as resumable.
      }
    }
    return [...new Set(ids)].sort();
  }

  async delete(workflowId: string): Promise<void> {
    await unlink(this.#pathFor(workflowId)).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }

  #parseEnvelope(data: string): Envelope {
    if (Buffer.byteLength(data, "utf8") > this.#maxBytes * 2) {
      throw new Error("Stored encrypted checkpoint exceeds the configured size limit.");
    }
    return encryptedEnvelopeSchema.parse(JSON.parse(data) as unknown);
  }

  #decrypt(envelope: Envelope): Payload {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.#key,
      Buffer.from(envelope.iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(`${FORMAT_VERSION}:${envelope.workflowKey}`, "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final(),
      ]);
    } catch {
      throw new Error("Encrypted workflow checkpoint authentication failed.");
    }
    return payloadSchema.parse(JSON.parse(plaintext.toString("utf8")) as unknown);
  }

  #validatePayloadIdentity(payload: Payload, workflowId: string): void {
    if (payload.workflow.definition.workflowId !== workflowId) {
      throw new Error("Decrypted workflow identity does not match the requested workflow.");
    }
    for (const artifact of payload.artifacts) {
      if (artifact.workflowId !== workflowId) {
        throw new Error("Decrypted artifact identity does not match the checkpoint workflow.");
      }
    }
  }

  #pathFor(workflowId: string): string {
    if (!workflowId.trim()) throw new Error("A workflow ID is required.");
    return join(this.#directory, `${sha256(workflowId)}.encrypted-checkpoint.json`);
  }
}

function normalizeKey(input: Buffer | string): Buffer {
  const value = Buffer.isBuffer(input) ? Buffer.from(input) : Buffer.from(input, "base64url");
  if (value.byteLength !== 32) {
    throw new Error("The encrypted checkpoint key must decode to exactly 32 bytes.");
  }
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
