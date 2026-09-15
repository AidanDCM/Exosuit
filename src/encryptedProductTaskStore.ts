import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { sha256Canonical } from "./fieldContracts.js";
import {
  productTaskSessionSchema,
  type ProductTaskSession,
  type ProductTaskStore,
} from "./personalTaskControl.js";

const FORMAT_VERSION = 1;
const DEFAULT_MAX_RECORD_BYTES = 5 * 1024 * 1024;

const encryptedProductTaskEnvelopeSchema = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
  algorithm: z.literal("aes-256-gcm"),
  taskKey: z.string().regex(/^[a-f0-9]{64}$/),
  checkpointVersion: z.number().int().nonnegative(),
  savedAt: z.string().datetime(),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
}).strict();
type EncryptedProductTaskEnvelope = z.infer<typeof encryptedProductTaskEnvelopeSchema>;

/**
 * Encrypted persistent storage for product task sessions.
 *
 * Filenames contain only a one-way task fingerprint. Goals, variables, task IDs,
 * brain selection, and lifecycle state remain inside authenticated ciphertext.
 */
export class EncryptedProductTaskStore implements ProductTaskStore {
  readonly #directory: string;
  readonly #key: Buffer;
  readonly #maximumRecordBytes: number;

  constructor(options: { directory: string; key: Buffer | string; maximumRecordBytes?: number }) {
    if (!options.directory.trim()) throw new Error("A product task directory is required.");
    this.#directory = path.resolve(options.directory);
    this.#key = normalizeEncryptionKey(options.key);
    this.#maximumRecordBytes = options.maximumRecordBytes ?? DEFAULT_MAX_RECORD_BYTES;
    if (
      !Number.isInteger(this.#maximumRecordBytes) ||
      this.#maximumRecordBytes < 1_024 ||
      this.#maximumRecordBytes > 100 * 1024 * 1024
    ) {
      throw new Error("maximumRecordBytes must be between 1024 and 104857600.");
    }
  }

  async save(raw: ProductTaskSession): Promise<void> {
    const task = verifyProductTask(raw);
    const plaintext = Buffer.from(JSON.stringify(task), "utf8");
    if (plaintext.byteLength > this.#maximumRecordBytes) {
      throw new Error("Product task checkpoint exceeds the configured encrypted size limit.");
    }

    const taskKey = taskIdentityKey(task.taskId);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(Buffer.from(aad(taskKey, task.checkpointVersion), "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = encryptedProductTaskEnvelopeSchema.parse({
      formatVersion: FORMAT_VERSION,
      algorithm: "aes-256-gcm",
      taskKey,
      checkpointVersion: task.checkpointVersion,
      savedAt: new Date().toISOString(),
      iv: iv.toString("base64url"),
      authTag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
    });
    const serialized = `${JSON.stringify(envelope)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > this.#maximumRecordBytes * 2) {
      throw new Error("Encrypted product task checkpoint exceeds the configured size limit.");
    }

    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const destination = this.#pathFor(taskKey);
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async load(taskId: string): Promise<ProductTaskSession | undefined> {
    const taskKey = taskIdentityKey(taskId);
    let serialized: string;
    try {
      serialized = await readFile(this.#pathFor(taskKey), "utf8");
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    const envelope = this.#parseEnvelope(serialized);
    if (envelope.taskKey !== taskKey) throw new Error("Encrypted product task identity does not match the request.");
    const task = this.#decrypt(envelope);
    if (task.taskId !== taskId || taskIdentityKey(task.taskId) !== envelope.taskKey) {
      throw new Error("Decrypted product task identity does not match its envelope.");
    }
    if (task.checkpointVersion !== envelope.checkpointVersion) {
      throw new Error("Decrypted product task checkpoint version does not match its envelope.");
    }
    return structuredClone(task);
  }

  async list(): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(this.#directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }

    const taskIds: string[] = [];
    for (const name of names.filter((candidate) => candidate.endsWith(".product-task.enc.json")).sort()) {
      try {
        const envelope = this.#parseEnvelope(await readFile(path.join(this.#directory, name), "utf8"));
        const task = this.#decrypt(envelope);
        if (taskIdentityKey(task.taskId) !== envelope.taskKey) continue;
        if (this.#pathFor(envelope.taskKey) !== path.join(this.#directory, name)) continue;
        if (task.checkpointVersion !== envelope.checkpointVersion) continue;
        taskIds.push(task.taskId);
      } catch {
        // Wrong-key, tampered, oversized, or inconsistent records are never advertised.
      }
    }
    return [...new Set(taskIds)].sort();
  }

  async delete(taskId: string): Promise<void> {
    await unlink(this.#pathFor(taskIdentityKey(taskId))).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }

  #parseEnvelope(serialized: string): EncryptedProductTaskEnvelope {
    if (Buffer.byteLength(serialized, "utf8") > this.#maximumRecordBytes * 2) {
      throw new Error("Stored encrypted product task exceeds the configured size limit.");
    }
    return encryptedProductTaskEnvelopeSchema.parse(JSON.parse(serialized) as unknown);
  }

  #decrypt(envelope: EncryptedProductTaskEnvelope): ProductTaskSession {
    const decipher = createDecipheriv("aes-256-gcm", this.#key, Buffer.from(envelope.iv, "base64url"));
    decipher.setAAD(Buffer.from(aad(envelope.taskKey, envelope.checkpointVersion), "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final(),
      ]);
    } catch {
      throw new Error("Encrypted product task authentication failed.");
    }
    if (plaintext.byteLength > this.#maximumRecordBytes) {
      throw new Error("Decrypted product task exceeds the configured size limit.");
    }
    return verifyProductTask(productTaskSessionSchema.parse(JSON.parse(plaintext.toString("utf8")) as unknown));
  }

  #pathFor(taskKey: string): string {
    return path.join(
      this.#directory,
      `${z.string().regex(/^[a-f0-9]{64}$/).parse(taskKey)}.product-task.enc.json`,
    );
  }
}

export function parseProductTaskEncryptionKey(value: string | undefined): Buffer | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return normalizeEncryptionKey(value.trim());
}

function verifyProductTask(raw: ProductTaskSession): ProductTaskSession {
  const task = productTaskSessionSchema.parse(structuredClone(raw));
  const { taskHash, ...core } = task;
  if (sha256Canonical(core) !== taskHash) throw new Error("Product task integrity verification failed.");
  return task;
}

function taskIdentityKey(taskId: string): string {
  return createHash("sha256").update(z.string().uuid().parse(taskId), "utf8").digest("hex");
}

function aad(taskKey: string, checkpointVersion: number): string {
  return `exosuit-product-task:v${FORMAT_VERSION}:${taskKey}:${checkpointVersion}`;
}

function normalizeEncryptionKey(value: Buffer | string): Buffer {
  const buffer = Buffer.isBuffer(value)
    ? Buffer.from(value)
    : /^[a-f0-9]{64}$/i.test(value)
      ? Buffer.from(value, "hex")
      : Buffer.from(value, "base64url");
  if (buffer.byteLength !== 32) {
    throw new Error("Product task encryption key must decode to exactly 32 bytes.");
  }
  return buffer;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
