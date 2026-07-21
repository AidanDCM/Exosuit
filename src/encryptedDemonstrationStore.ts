import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  demonstrationEpisodeSchema,
  redactDemonstrationPayload,
  type DemonstrationEpisode,
} from "./demonstration.js";

const FORMAT_VERSION = 1;
const DEFAULT_MAX_EPISODE_BYTES = 100 * 1024 * 1024;

const encryptedDemonstrationEnvelopeSchema = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
  algorithm: z.literal("aes-256-gcm"),
  episodeKey: z.string().regex(/^[a-f0-9]{64}$/),
  fieldKey: z.string().regex(/^[a-f0-9]{64}$/),
  savedAt: z.string().datetime(),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
});

type EncryptedDemonstrationEnvelope = z.infer<typeof encryptedDemonstrationEnvelopeSchema>;

export interface DemonstrationEpisodeStore {
  save(episode: DemonstrationEpisode): Promise<void>;
  load(episodeId: string): Promise<DemonstrationEpisode | undefined>;
  list(): Promise<string[]>;
  delete(episodeId: string): Promise<void>;
  deleteByField(fieldId: string, fieldGeneration?: number): Promise<number>;
}

export class EncryptedFileDemonstrationStore implements DemonstrationEpisodeStore {
  readonly #directory: string;
  readonly #key: Buffer;
  readonly #maxEpisodeBytes: number;

  constructor(options: { directory: string; key: Buffer | string; maxEpisodeBytes?: number }) {
    if (!options.directory.trim()) throw new Error("A demonstration directory is required.");
    this.#directory = resolve(options.directory);
    this.#key = normalizeKey(options.key);
    this.#maxEpisodeBytes = options.maxEpisodeBytes ?? DEFAULT_MAX_EPISODE_BYTES;
    if (
      !Number.isInteger(this.#maxEpisodeBytes) ||
      this.#maxEpisodeBytes < 1_024 ||
      this.#maxEpisodeBytes > 500 * 1024 * 1024
    ) {
      throw new Error("maxEpisodeBytes must be between 1024 and 524288000.");
    }
  }

  async save(input: DemonstrationEpisode): Promise<void> {
    const episode = sanitizeEpisode(demonstrationEpisodeSchema.parse(input));
    if (episode.status === "recording" || !episode.endedAt || !episode.outcome) {
      throw new Error("Only completed or aborted demonstration episodes may be persisted.");
    }
    rejectInlineVisualBytes(episode);
    const plaintext = Buffer.from(JSON.stringify(episode), "utf8");
    if (plaintext.byteLength > this.#maxEpisodeBytes) {
      throw new Error("Demonstration episode exceeds the configured size limit.");
    }

    const episodeKey = sha256(episode.episodeId);
    const fieldKey = sha256(`${episode.field.fieldId}:${episode.field.fieldGeneration}`);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(Buffer.from(`${FORMAT_VERSION}:${episodeKey}:${fieldKey}`, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = encryptedDemonstrationEnvelopeSchema.parse({
      formatVersion: FORMAT_VERSION,
      algorithm: "aes-256-gcm",
      episodeKey,
      fieldKey,
      savedAt: new Date().toISOString(),
      iv: iv.toString("base64url"),
      authTag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
    });
    const serialized = `${JSON.stringify(envelope)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > this.#maxEpisodeBytes * 2) {
      throw new Error("Encrypted demonstration episode exceeds the configured size limit.");
    }

    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const destination = this.#pathFor(episode.episodeId);
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async load(episodeId: string): Promise<DemonstrationEpisode | undefined> {
    let data: string;
    try {
      data = await readFile(this.#pathFor(episodeId), "utf8");
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    const envelope = this.#parseEnvelope(data);
    if (envelope.episodeKey !== sha256(episodeId)) {
      throw new Error("Encrypted demonstration identity does not match the requested episode.");
    }
    const episode = this.#decrypt(envelope);
    this.#validateEnvelopeIdentity(envelope, episode, episodeId);
    return structuredClone(episode);
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
    for (const name of names.filter((item) => item.endsWith(".encrypted-demonstration.json")).sort()) {
      try {
        const data = await readFile(join(this.#directory, name), "utf8");
        const envelope = this.#parseEnvelope(data);
        const episode = this.#decrypt(envelope);
        this.#validateEnvelopeIdentity(envelope, episode, episode.episodeId);
        ids.push(episode.episodeId);
      } catch {
        // Invalid, unauthenticated, oversized, or wrong-key files are never advertised.
      }
    }
    return [...new Set(ids)].sort();
  }

  async delete(episodeId: string): Promise<void> {
    await unlink(this.#pathFor(episodeId)).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }

  async deleteByField(fieldId: string, fieldGeneration?: number): Promise<number> {
    if (!fieldId.trim()) throw new Error("A Field ID is required.");
    if (fieldGeneration !== undefined && (!Number.isInteger(fieldGeneration) || fieldGeneration < 1)) {
      throw new Error("Field generation must be a positive integer when supplied.");
    }
    let deleted = 0;
    for (const episodeId of await this.list()) {
      const episode = await this.load(episodeId);
      if (!episode) continue;
      if (
        episode.field.fieldId === fieldId &&
        (fieldGeneration === undefined || episode.field.fieldGeneration === fieldGeneration)
      ) {
        await this.delete(episodeId);
        deleted += 1;
      }
    }
    return deleted;
  }

  #parseEnvelope(data: string): EncryptedDemonstrationEnvelope {
    if (Buffer.byteLength(data, "utf8") > this.#maxEpisodeBytes * 2) {
      throw new Error("Stored encrypted demonstration exceeds the configured size limit.");
    }
    return encryptedDemonstrationEnvelopeSchema.parse(JSON.parse(data) as unknown);
  }

  #decrypt(envelope: EncryptedDemonstrationEnvelope): DemonstrationEpisode {
    const decipher = createDecipheriv("aes-256-gcm", this.#key, Buffer.from(envelope.iv, "base64url"));
    decipher.setAAD(Buffer.from(`${FORMAT_VERSION}:${envelope.episodeKey}:${envelope.fieldKey}`, "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final(),
      ]);
    } catch {
      throw new Error("Encrypted demonstration authentication failed.");
    }
    if (plaintext.byteLength > this.#maxEpisodeBytes) {
      throw new Error("Decrypted demonstration exceeds the configured size limit.");
    }
    return demonstrationEpisodeSchema.parse(JSON.parse(plaintext.toString("utf8")) as unknown);
  }

  #validateEnvelopeIdentity(
    envelope: EncryptedDemonstrationEnvelope,
    episode: DemonstrationEpisode,
    episodeId: string,
  ): void {
    if (episode.episodeId !== episodeId || envelope.episodeKey !== sha256(episode.episodeId)) {
      throw new Error("Decrypted demonstration identity does not match the envelope.");
    }
    const expectedFieldKey = sha256(`${episode.field.fieldId}:${episode.field.fieldGeneration}`);
    if (envelope.fieldKey !== expectedFieldKey) {
      throw new Error("Decrypted demonstration Field identity does not match the envelope.");
    }
    if (episode.status === "recording" || !episode.endedAt || !episode.outcome) {
      throw new Error("Stored demonstration is not in a terminal state.");
    }
    rejectInlineVisualBytes(episode);
  }

  #pathFor(episodeId: string): string {
    if (!episodeId.trim()) throw new Error("An episode ID is required.");
    return join(this.#directory, `${sha256(episodeId)}.encrypted-demonstration.json`);
  }
}

function sanitizeEpisode(episode: DemonstrationEpisode): DemonstrationEpisode {
  return demonstrationEpisodeSchema.parse({
    ...episode,
    events: episode.events.map((event) => ({ ...event, payload: redactDemonstrationPayload(event.payload) })),
  });
}

function rejectInlineVisualBytes(value: unknown, path = "episode"): void {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    throw new Error(`Inline visual or binary bytes are forbidden in demonstration metadata at ${path}.`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectInlineVisualBytes(item, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/screenshot|raw.?frame|frame.?bytes|image.?bytes|pixel.?bytes/i.test(key)) {
        throw new Error(`Inline visual bytes are forbidden in demonstration metadata at ${path}.${key}.`);
      }
      rejectInlineVisualBytes(item, `${path}.${key}`);
    }
  }
}

function normalizeKey(input: Buffer | string): Buffer {
  const value = Buffer.isBuffer(input) ? Buffer.from(input) : Buffer.from(input, "base64url");
  if (value.byteLength !== 32) throw new Error("The demonstration encryption key must decode to exactly 32 bytes.");
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
