import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  DemonstrationRetrievalIndex,
  processDemonstration,
  processedDemonstrationSchema,
  type ProcessedDemonstration,
} from "./demonstrationProcessing.js";
import type { DemonstrationEpisodeStore } from "./encryptedDemonstrationStore.js";

const FORMAT_VERSION = 1;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

const encryptedProcessedEnvelopeSchema = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
  algorithm: z.literal("aes-256-gcm"),
  sourceEpisodeKey: z.string().regex(/^[a-f0-9]{64}$/),
  fieldKey: z.string().regex(/^[a-f0-9]{64}$/),
  pipelineVersion: z.literal("deterministic-annotation-v1"),
  savedAt: z.string().datetime(),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
});
type EncryptedProcessedEnvelope = z.infer<typeof encryptedProcessedEnvelopeSchema>;

export class EncryptedFileProcessedDemonstrationStore {
  readonly #directory: string;
  readonly #key: Buffer;
  readonly #maxBytes: number;

  constructor(options: { directory: string; key: Buffer | string; maxRecordBytes?: number }) {
    if (!options.directory.trim()) throw new Error("A processed demonstration directory is required.");
    this.#directory = resolve(options.directory);
    this.#key = normalizeKey(options.key);
    this.#maxBytes = options.maxRecordBytes ?? DEFAULT_MAX_BYTES;
    if (!Number.isInteger(this.#maxBytes) || this.#maxBytes < 1_024 || this.#maxBytes > 200 * 1024 * 1024) {
      throw new Error("maxRecordBytes must be between 1024 and 209715200.");
    }
  }

  async save(input: ProcessedDemonstration): Promise<void> {
    const record = processedDemonstrationSchema.parse(structuredClone(input));
    const plaintext = Buffer.from(JSON.stringify(record), "utf8");
    if (plaintext.byteLength > this.#maxBytes) throw new Error("Processed demonstration exceeds the configured size limit.");
    const sourceEpisodeKey = sha256(record.sourceEpisodeId);
    const fieldKey = sha256(`${record.field.fieldId}:${record.field.fieldGeneration}`);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(Buffer.from(aad(sourceEpisodeKey, fieldKey, record.pipelineVersion), "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = encryptedProcessedEnvelopeSchema.parse({
      formatVersion: FORMAT_VERSION,
      algorithm: "aes-256-gcm",
      sourceEpisodeKey,
      fieldKey,
      pipelineVersion: record.pipelineVersion,
      savedAt: new Date().toISOString(),
      iv: iv.toString("base64url"),
      authTag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
    });
    const serialized = `${JSON.stringify(envelope)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > this.#maxBytes * 2) {
      throw new Error("Encrypted processed demonstration exceeds the configured size limit.");
    }
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const destination = this.#pathFor(record.sourceEpisodeId);
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async load(sourceEpisodeId: string): Promise<ProcessedDemonstration | undefined> {
    let data: string;
    try {
      data = await readFile(this.#pathFor(sourceEpisodeId), "utf8");
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    const envelope = this.#parseEnvelope(data);
    if (envelope.sourceEpisodeKey !== sha256(sourceEpisodeId)) {
      throw new Error("Encrypted processed demonstration identity does not match the requested source episode.");
    }
    const record = this.#decrypt(envelope);
    this.#validateIdentity(envelope, record, sourceEpisodeId);
    return structuredClone(record);
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
    for (const name of names.filter((item) => item.endsWith(".encrypted-processed-demonstration.json")).sort()) {
      try {
        const envelope = this.#parseEnvelope(await readFile(join(this.#directory, name), "utf8"));
        const record = this.#decrypt(envelope);
        this.#validateIdentity(envelope, record, record.sourceEpisodeId);
        ids.push(record.sourceEpisodeId);
      } catch {
        // Invalid, wrong-key, oversized, or inconsistent records are never advertised or indexed.
      }
    }
    return [...new Set(ids)].sort();
  }

  async delete(sourceEpisodeId: string): Promise<void> {
    await unlink(this.#pathFor(sourceEpisodeId)).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }

  async hydrateIndex(index = new DemonstrationRetrievalIndex()): Promise<DemonstrationRetrievalIndex> {
    for (const sourceEpisodeId of await this.list()) {
      const record = await this.load(sourceEpisodeId);
      if (record) index.add(record);
    }
    return index;
  }

  #parseEnvelope(data: string): EncryptedProcessedEnvelope {
    if (Buffer.byteLength(data, "utf8") > this.#maxBytes * 2) {
      throw new Error("Stored encrypted processed demonstration exceeds the configured size limit.");
    }
    return encryptedProcessedEnvelopeSchema.parse(JSON.parse(data) as unknown);
  }

  #decrypt(envelope: EncryptedProcessedEnvelope): ProcessedDemonstration {
    const decipher = createDecipheriv("aes-256-gcm", this.#key, Buffer.from(envelope.iv, "base64url"));
    decipher.setAAD(Buffer.from(aad(envelope.sourceEpisodeKey, envelope.fieldKey, envelope.pipelineVersion), "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]);
    } catch {
      throw new Error("Encrypted processed demonstration authentication failed.");
    }
    if (plaintext.byteLength > this.#maxBytes) throw new Error("Decrypted processed demonstration exceeds the configured size limit.");
    return processedDemonstrationSchema.parse(JSON.parse(plaintext.toString("utf8")) as unknown);
  }

  #validateIdentity(envelope: EncryptedProcessedEnvelope, record: ProcessedDemonstration, sourceEpisodeId: string): void {
    if (record.sourceEpisodeId !== sourceEpisodeId || envelope.sourceEpisodeKey !== sha256(record.sourceEpisodeId)) {
      throw new Error("Decrypted processed demonstration identity does not match the envelope.");
    }
    if (envelope.fieldKey !== sha256(`${record.field.fieldId}:${record.field.fieldGeneration}`)) {
      throw new Error("Decrypted processed demonstration Field identity does not match the envelope.");
    }
    if (envelope.pipelineVersion !== record.pipelineVersion) {
      throw new Error("Decrypted processed demonstration pipeline does not match the envelope.");
    }
  }

  #pathFor(sourceEpisodeId: string): string {
    if (!sourceEpisodeId.trim()) throw new Error("A source episode ID is required.");
    return join(this.#directory, `${sha256(sourceEpisodeId)}.encrypted-processed-demonstration.json`);
  }
}

export class EncryptedDemonstrationCorpus {
  readonly #source: DemonstrationEpisodeStore;
  readonly #derived: EncryptedFileProcessedDemonstrationStore;

  constructor(options: { source: DemonstrationEpisodeStore; derived: EncryptedFileProcessedDemonstrationStore }) {
    this.#source = options.source;
    this.#derived = options.derived;
  }

  async processSource(sourceEpisodeId: string, processedAt?: string): Promise<ProcessedDemonstration> {
    const episode = await this.#source.load(sourceEpisodeId);
    if (!episode) throw new Error("Source demonstration episode does not exist.");
    const processed = processDemonstration(episode, processedAt);
    await this.#derived.save(processed);
    return processed;
  }

  async deleteSource(sourceEpisodeId: string): Promise<void> {
    // Delete derived behavior first. A partial failure may retain encrypted source evidence,
    // but can never leave deleted source behavior available for retrieval.
    await this.#derived.delete(sourceEpisodeId);
    await this.#source.delete(sourceEpisodeId);
  }

  async hydrateIndex(): Promise<DemonstrationRetrievalIndex> {
    return this.#derived.hydrateIndex();
  }
}

function aad(sourceEpisodeKey: string, fieldKey: string, pipelineVersion: string): string {
  return `${FORMAT_VERSION}:${sourceEpisodeKey}:${fieldKey}:${pipelineVersion}`;
}

function normalizeKey(input: Buffer | string): Buffer {
  const value = Buffer.isBuffer(input) ? Buffer.from(input) : Buffer.from(input, "base64url");
  if (value.byteLength !== 32) throw new Error("The processed demonstration encryption key must decode to exactly 32 bytes.");
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
