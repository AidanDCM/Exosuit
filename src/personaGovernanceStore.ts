import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { sha256Canonical } from "./fieldContracts.js";
import {
  personaDeletionCertificateSchema,
  personaGovernanceRecordSchema,
  type PersonaDeletionCertificate,
  type PersonaGovernanceRecord,
} from "./personaProfileVault.js";

const FORMAT_VERSION = 1;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const governanceEnvelopeSchema = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
  algorithm: z.literal("aes-256-gcm"),
  recordType: z.enum(["governance", "deletion_certificate"]),
  recordHash: z.string().regex(/^[a-f0-9]{64}$/),
  savedAt: z.string().datetime(),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
}).strict();
type GovernanceEnvelope = z.infer<typeof governanceEnvelopeSchema>;

export class EncryptedPersonaGovernanceStore {
  readonly #directory: string;
  readonly #key: Buffer;
  readonly #maxBytes: number;

  constructor(options: { directory: string; key: Buffer | string; maxRecordBytes?: number }) {
    if (!options.directory.trim()) throw new Error("A persona governance directory is required.");
    this.#directory = resolve(options.directory);
    this.#key = normalizeKey(options.key);
    this.#maxBytes = options.maxRecordBytes ?? DEFAULT_MAX_BYTES;
    if (!Number.isInteger(this.#maxBytes) || this.#maxBytes < 1_024 || this.#maxBytes > 20 * 1024 * 1024) {
      throw new Error("maxRecordBytes must be between 1024 and 20971520.");
    }
  }

  async saveRecord(input: PersonaGovernanceRecord): Promise<void> {
    const record = verifyGovernanceRecord(input);
    await this.#save("governance", record.recordHash, record);
  }

  async saveDeletionCertificate(input: PersonaDeletionCertificate): Promise<void> {
    const certificate = verifyDeletionCertificate(input);
    await this.#save("deletion_certificate", certificate.certificateHash, certificate);
  }

  async loadRecord(recordHash: string): Promise<PersonaGovernanceRecord | undefined> {
    const envelope = await this.#loadEnvelope("governance", recordHash);
    if (!envelope) return undefined;
    return verifyGovernanceRecord(this.#decrypt(envelope));
  }

  async loadDeletionCertificate(certificateHash: string): Promise<PersonaDeletionCertificate | undefined> {
    const envelope = await this.#loadEnvelope("deletion_certificate", certificateHash);
    if (!envelope) return undefined;
    return verifyDeletionCertificate(this.#decrypt(envelope));
  }

  async listRecords(): Promise<PersonaGovernanceRecord[]> {
    const envelopes = await this.#listEnvelopes("governance");
    const records: PersonaGovernanceRecord[] = [];
    for (const envelope of envelopes) {
      try {
        records.push(verifyGovernanceRecord(this.#decrypt(envelope)));
      } catch {
        // Invalid, wrong-key, tampered, oversized, or inconsistent records are never advertised.
      }
    }
    return records.sort((left, right) => left.decidedAt.localeCompare(right.decidedAt) || left.recordId.localeCompare(right.recordId));
  }

  async verifyStoredChain(): Promise<boolean> {
    const records = await this.listRecords();
    let previous: string | undefined;
    for (const record of records) {
      if (record.previousRecordHash !== previous) return false;
      previous = record.recordHash;
    }
    return true;
  }

  async #save(recordType: GovernanceEnvelope["recordType"], recordHash: string, value: unknown): Promise<void> {
    z.string().regex(/^[a-f0-9]{64}$/).parse(recordHash);
    const plaintext = Buffer.from(JSON.stringify(value), "utf8");
    if (plaintext.byteLength > this.#maxBytes) throw new Error("Persona governance record exceeds the configured size limit.");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(Buffer.from(aad(recordType, recordHash), "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = governanceEnvelopeSchema.parse({
      formatVersion: FORMAT_VERSION,
      algorithm: "aes-256-gcm",
      recordType,
      recordHash,
      savedAt: new Date().toISOString(),
      iv: iv.toString("base64url"),
      authTag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
    });
    const serialized = `${JSON.stringify(envelope)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > this.#maxBytes * 2) throw new Error("Encrypted persona governance record exceeds the configured size limit.");
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const destination = this.#pathFor(recordType, recordHash);
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async #loadEnvelope(recordType: GovernanceEnvelope["recordType"], recordHash: string): Promise<GovernanceEnvelope | undefined> {
    let data: string;
    try {
      data = await readFile(this.#pathFor(recordType, recordHash), "utf8");
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    const envelope = this.#parseEnvelope(data);
    if (envelope.recordType !== recordType || envelope.recordHash !== recordHash) throw new Error("Encrypted persona governance identity does not match the request.");
    return envelope;
  }

  async #listEnvelopes(recordType: GovernanceEnvelope["recordType"]): Promise<GovernanceEnvelope[]> {
    let names: string[];
    try {
      names = await readdir(this.#directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const suffix = recordType === "governance" ? ".persona-governance.enc.json" : ".persona-deletion.enc.json";
    const result: GovernanceEnvelope[] = [];
    for (const name of names.filter((value) => value.endsWith(suffix)).sort()) {
      try {
        const envelope = this.#parseEnvelope(await readFile(join(this.#directory, name), "utf8"));
        if (envelope.recordType === recordType) result.push(envelope);
      } catch {
        // Invalid envelopes are not advertised.
      }
    }
    return result;
  }

  #parseEnvelope(data: string): GovernanceEnvelope {
    if (Buffer.byteLength(data, "utf8") > this.#maxBytes * 2) throw new Error("Stored encrypted persona governance record exceeds the configured size limit.");
    return governanceEnvelopeSchema.parse(JSON.parse(data) as unknown);
  }

  #decrypt(envelope: GovernanceEnvelope): unknown {
    const decipher = createDecipheriv("aes-256-gcm", this.#key, Buffer.from(envelope.iv, "base64url"));
    decipher.setAAD(Buffer.from(aad(envelope.recordType, envelope.recordHash), "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
    try {
      return JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8")) as unknown;
    } catch {
      throw new Error("Encrypted persona governance authentication failed.");
    }
  }

  #pathFor(recordType: GovernanceEnvelope["recordType"], recordHash: string): string {
    const hash = z.string().regex(/^[a-f0-9]{64}$/).parse(recordHash);
    const suffix = recordType === "governance" ? "persona-governance.enc.json" : "persona-deletion.enc.json";
    return join(this.#directory, `${hash}.${suffix}`);
  }
}

function verifyGovernanceRecord(input: unknown): PersonaGovernanceRecord {
  const record = personaGovernanceRecordSchema.parse(structuredClone(input));
  const { recordHash, ...core } = record;
  if (sha256Canonical(core) !== recordHash) throw new Error("Persona governance record integrity verification failed.");
  return record;
}

function verifyDeletionCertificate(input: unknown): PersonaDeletionCertificate {
  const certificate = personaDeletionCertificateSchema.parse(structuredClone(input));
  const { certificateHash, ...core } = certificate;
  if (sha256Canonical(core) !== certificateHash) throw new Error("Persona deletion certificate integrity verification failed.");
  return certificate;
}

function aad(recordType: string, recordHash: string): string {
  return `${FORMAT_VERSION}:${recordType}:${recordHash}`;
}

function normalizeKey(input: Buffer | string): Buffer {
  const key = Buffer.isBuffer(input) ? Buffer.from(input) : Buffer.from(input, "base64url");
  if (key.byteLength !== 32) throw new Error("The persona governance encryption key must decode to exactly 32 bytes.");
  return key;
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
