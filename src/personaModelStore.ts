import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { sha256Canonical } from "./fieldContracts.js";
import {
  attentionVerificationModelSchema,
  languageStyleModelSchema,
  type AttentionVerificationModel,
  type LanguageStyleModel,
} from "./languageAttentionModels.js";
import {
  motorPreferenceModelSchema,
  typingProcessModelSchema,
  type MotorPreferenceModel,
  type TypingProcessModel,
} from "./personalBehaviorModels.js";
import {
  personaBundleActivationSchema,
  personaModelBundleSchema,
  type PersonaBundleActivation,
  type PersonaModelBundle,
} from "./personaModelBundle.js";

const FORMAT_VERSION = 1;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const recordTypeSchema = z.enum(["typing", "motor", "language", "attention", "bundle", "activation"]);
type RecordType = z.infer<typeof recordTypeSchema>;
const envelopeSchema = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
  algorithm: z.literal("aes-256-gcm"),
  recordType: recordTypeSchema,
  recordHash: z.string().regex(/^[a-f0-9]{64}$/),
  savedAt: z.string().datetime(),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
}).strict();
type Envelope = z.infer<typeof envelopeSchema>;

export class EncryptedPersonaModelStore {
  readonly #directory: string;
  readonly #key: Buffer;
  readonly #maxBytes: number;

  constructor(options: { directory: string; key: Buffer | string; maxRecordBytes?: number }) {
    if (!options.directory.trim()) throw new Error("A persona model directory is required.");
    this.#directory = resolve(options.directory);
    this.#key = normalizeKey(options.key);
    this.#maxBytes = options.maxRecordBytes ?? DEFAULT_MAX_BYTES;
    if (!Number.isInteger(this.#maxBytes) || this.#maxBytes < 1_024 || this.#maxBytes > 50 * 1024 * 1024) {
      throw new Error("maxRecordBytes must be between 1024 and 52428800.");
    }
  }

  saveTyping(model: TypingProcessModel): Promise<void> {
    const value = verifyHashedRecord(typingProcessModelSchema.parse(structuredClone(model)), "modelHash", "Typing model");
    return this.#save("typing", value.modelHash, value);
  }

  loadTyping(modelHash: string): Promise<TypingProcessModel | undefined> {
    return this.#load("typing", modelHash, (value) => verifyHashedRecord(typingProcessModelSchema.parse(value), "modelHash", "Typing model"));
  }

  saveMotor(model: MotorPreferenceModel): Promise<void> {
    const value = verifyHashedRecord(motorPreferenceModelSchema.parse(structuredClone(model)), "modelHash", "Motor model");
    return this.#save("motor", value.modelHash, value);
  }

  loadMotor(modelHash: string): Promise<MotorPreferenceModel | undefined> {
    return this.#load("motor", modelHash, (value) => verifyHashedRecord(motorPreferenceModelSchema.parse(value), "modelHash", "Motor model"));
  }

  saveLanguage(model: LanguageStyleModel): Promise<void> {
    const value = verifyHashedRecord(languageStyleModelSchema.parse(structuredClone(model)), "modelHash", "Language model");
    return this.#save("language", value.modelHash, value);
  }

  loadLanguage(modelHash: string): Promise<LanguageStyleModel | undefined> {
    return this.#load("language", modelHash, (value) => verifyHashedRecord(languageStyleModelSchema.parse(value), "modelHash", "Language model"));
  }

  saveAttention(model: AttentionVerificationModel): Promise<void> {
    const value = verifyHashedRecord(attentionVerificationModelSchema.parse(structuredClone(model)), "modelHash", "Attention model");
    return this.#save("attention", value.modelHash, value);
  }

  loadAttention(modelHash: string): Promise<AttentionVerificationModel | undefined> {
    return this.#load("attention", modelHash, (value) => verifyHashedRecord(attentionVerificationModelSchema.parse(value), "modelHash", "Attention model"));
  }

  saveBundle(bundle: PersonaModelBundle): Promise<void> {
    const value = verifyHashedRecord(personaModelBundleSchema.parse(structuredClone(bundle)), "bundleHash", "Persona model bundle");
    return this.#save("bundle", value.bundleHash, value);
  }

  loadBundle(bundleHash: string): Promise<PersonaModelBundle | undefined> {
    return this.#load("bundle", bundleHash, (value) => verifyHashedRecord(personaModelBundleSchema.parse(value), "bundleHash", "Persona model bundle"));
  }

  saveActivation(activation: PersonaBundleActivation): Promise<void> {
    const value = verifyHashedRecord(personaBundleActivationSchema.parse(structuredClone(activation)), "activationHash", "Persona bundle activation");
    return this.#save("activation", value.activationHash, value);
  }

  loadActivation(activationHash: string): Promise<PersonaBundleActivation | undefined> {
    return this.#load("activation", activationHash, (value) => verifyHashedRecord(personaBundleActivationSchema.parse(value), "activationHash", "Persona bundle activation"));
  }

  async listHashes(recordType: RecordType): Promise<string[]> {
    const type = recordTypeSchema.parse(recordType);
    let names: string[];
    try {
      names = await readdir(this.#directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const suffix = `.${type}.persona-model.enc.json`;
    const hashes: string[] = [];
    for (const name of names.filter((value) => value.endsWith(suffix)).sort()) {
      try {
        const envelope = this.#parseEnvelope(await readFile(join(this.#directory, name), "utf8"));
        if (envelope.recordType !== type) continue;
        this.#decrypt(envelope);
        hashes.push(envelope.recordHash);
      } catch {
        // Invalid, wrong-key, tampered, oversized, or inconsistent records are never advertised.
      }
    }
    return [...new Set(hashes)].sort();
  }

  async delete(recordType: RecordType, recordHash: string): Promise<void> {
    await unlink(this.#pathFor(recordTypeSchema.parse(recordType), recordHash)).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }

  async #save(recordType: RecordType, recordHash: string, value: unknown): Promise<void> {
    const hash = z.string().regex(/^[a-f0-9]{64}$/).parse(recordHash);
    const plaintext = Buffer.from(JSON.stringify(value), "utf8");
    if (plaintext.byteLength > this.#maxBytes) throw new Error("Persona model record exceeds the configured size limit.");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(Buffer.from(aad(recordType, hash), "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = envelopeSchema.parse({
      formatVersion: FORMAT_VERSION,
      algorithm: "aes-256-gcm",
      recordType,
      recordHash: hash,
      savedAt: new Date().toISOString(),
      iv: iv.toString("base64url"),
      authTag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
    });
    const serialized = `${JSON.stringify(envelope)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > this.#maxBytes * 2) throw new Error("Encrypted persona model record exceeds the configured size limit.");
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const destination = this.#pathFor(recordType, hash);
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async #load<T>(recordType: RecordType, recordHash: string, parser: (value: unknown) => T): Promise<T | undefined> {
    const hash = z.string().regex(/^[a-f0-9]{64}$/).parse(recordHash);
    let data: string;
    try {
      data = await readFile(this.#pathFor(recordType, hash), "utf8");
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    const envelope = this.#parseEnvelope(data);
    if (envelope.recordType !== recordType || envelope.recordHash !== hash) throw new Error("Encrypted persona model identity does not match the request.");
    return parser(this.#decrypt(envelope));
  }

  #parseEnvelope(data: string): Envelope {
    if (Buffer.byteLength(data, "utf8") > this.#maxBytes * 2) throw new Error("Stored encrypted persona model exceeds the configured size limit.");
    return envelopeSchema.parse(JSON.parse(data) as unknown);
  }

  #decrypt(envelope: Envelope): unknown {
    const decipher = createDecipheriv("aes-256-gcm", this.#key, Buffer.from(envelope.iv, "base64url"));
    decipher.setAAD(Buffer.from(aad(envelope.recordType, envelope.recordHash), "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
    try {
      return JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8")) as unknown;
    } catch {
      throw new Error("Encrypted persona model authentication failed.");
    }
  }

  #pathFor(recordType: RecordType, recordHash: string): string {
    const hash = z.string().regex(/^[a-f0-9]{64}$/).parse(recordHash);
    return join(this.#directory, `${hash}.${recordType}.persona-model.enc.json`);
  }
}

function verifyHashedRecord<T extends Record<string, unknown>, K extends keyof T>(value: T, key: K, label: string): T {
  const hash = value[key];
  if (typeof hash !== "string") throw new Error(`${label} hash is missing.`);
  const core = { ...value };
  delete core[key];
  if (sha256Canonical(core) !== hash) throw new Error(`${label} integrity verification failed.`);
  return value;
}

function aad(recordType: RecordType, recordHash: string): string {
  return `${FORMAT_VERSION}:${recordType}:${recordHash}`;
}

function normalizeKey(input: Buffer | string): Buffer {
  const key = Buffer.isBuffer(input) ? Buffer.from(input) : Buffer.from(input, "base64url");
  if (key.byteLength !== 32) throw new Error("The persona model encryption key must decode to exactly 32 bytes.");
  return key;
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
