import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  createPersonaProfile,
  personaProfileSchema,
  verifyPersonaProfile,
  type PersonaProfile,
  type PersonaStatus,
} from "./personaBehavior.js";
import { sha256Canonical } from "./fieldContracts.js";

const FORMAT_VERSION = 1;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

const encryptedPersonaEnvelopeSchema = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
  algorithm: z.literal("aes-256-gcm"),
  recordKey: z.string().regex(/^[a-f0-9]{64}$/),
  profileKey: z.string().regex(/^[a-f0-9]{64}$/),
  profileVersion: z.number().int().positive(),
  savedAt: z.string().datetime(),
  iv: z.string().min(1),
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
}).strict();
type EncryptedPersonaEnvelope = z.infer<typeof encryptedPersonaEnvelopeSchema>;

export class EncryptedPersonaProfileStore {
  readonly #directory: string;
  readonly #key: Buffer;
  readonly #maxBytes: number;

  constructor(options: { directory: string; key: Buffer | string; maxRecordBytes?: number }) {
    if (!options.directory.trim()) throw new Error("A persona profile directory is required.");
    this.#directory = resolve(options.directory);
    this.#key = normalizeKey(options.key);
    this.#maxBytes = options.maxRecordBytes ?? DEFAULT_MAX_BYTES;
    if (!Number.isInteger(this.#maxBytes) || this.#maxBytes < 1_024 || this.#maxBytes > 20 * 1024 * 1024) {
      throw new Error("maxRecordBytes must be between 1024 and 20971520.");
    }
  }

  async save(input: PersonaProfile): Promise<void> {
    const profile = personaProfileSchema.parse(structuredClone(input));
    if (!verifyPersonaProfile(profile)) throw new Error("Persona profile integrity verification failed.");
    const plaintext = Buffer.from(JSON.stringify(profile), "utf8");
    if (plaintext.byteLength > this.#maxBytes) throw new Error("Persona profile exceeds the configured size limit.");
    const profileKey = profileIdentityKey(profile.ownerId, profile.profileId);
    const recordKey = personaRecordKey(profile.ownerId, profile.profileId, profile.version);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(Buffer.from(aad(recordKey, profileKey, profile.version), "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = encryptedPersonaEnvelopeSchema.parse({
      formatVersion: FORMAT_VERSION,
      algorithm: "aes-256-gcm",
      recordKey,
      profileKey,
      profileVersion: profile.version,
      savedAt: new Date().toISOString(),
      iv: iv.toString("base64url"),
      authTag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
    });
    const serialized = `${JSON.stringify(envelope)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > this.#maxBytes * 2) throw new Error("Encrypted persona profile exceeds the configured size limit.");
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const destination = this.#pathFor(recordKey);
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async load(ownerId: string, profileId: string, version: number): Promise<PersonaProfile | undefined> {
    const recordKey = personaRecordKey(ownerId, profileId, version);
    let data: string;
    try {
      data = await readFile(this.#pathFor(recordKey), "utf8");
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    const envelope = this.#parseEnvelope(data);
    if (envelope.recordKey !== recordKey) throw new Error("Encrypted persona profile identity does not match the requested record.");
    const profile = this.#decrypt(envelope);
    this.#validateIdentity(envelope, profile, ownerId, profileId, version);
    return structuredClone(profile);
  }

  async listVersions(ownerId: string, profileId: string): Promise<number[]> {
    const expectedProfileKey = profileIdentityKey(ownerId, profileId);
    let names: string[];
    try {
      names = await readdir(this.#directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const versions: number[] = [];
    for (const name of names.filter((value) => value.endsWith(".persona-profile.enc.json")).sort()) {
      try {
        const envelope = this.#parseEnvelope(await readFile(join(this.#directory, name), "utf8"));
        if (envelope.profileKey !== expectedProfileKey) continue;
        const profile = this.#decrypt(envelope);
        this.#validateIdentity(envelope, profile, ownerId, profileId, envelope.profileVersion);
        versions.push(profile.version);
      } catch {
        // Wrong-key, tampered, oversized, or inconsistent records are never advertised.
      }
    }
    return [...new Set(versions)].sort((left, right) => left - right);
  }

  async delete(ownerId: string, profileId: string, version: number): Promise<void> {
    await unlink(this.#pathFor(personaRecordKey(ownerId, profileId, version))).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }

  #parseEnvelope(data: string): EncryptedPersonaEnvelope {
    if (Buffer.byteLength(data, "utf8") > this.#maxBytes * 2) throw new Error("Stored encrypted persona profile exceeds the configured size limit.");
    return encryptedPersonaEnvelopeSchema.parse(JSON.parse(data) as unknown);
  }

  #decrypt(envelope: EncryptedPersonaEnvelope): PersonaProfile {
    const decipher = createDecipheriv("aes-256-gcm", this.#key, Buffer.from(envelope.iv, "base64url"));
    decipher.setAAD(Buffer.from(aad(envelope.recordKey, envelope.profileKey, envelope.profileVersion), "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]);
    } catch {
      throw new Error("Encrypted persona profile authentication failed.");
    }
    if (plaintext.byteLength > this.#maxBytes) throw new Error("Decrypted persona profile exceeds the configured size limit.");
    const profile = personaProfileSchema.parse(JSON.parse(plaintext.toString("utf8")) as unknown);
    if (!verifyPersonaProfile(profile)) throw new Error("Decrypted persona profile integrity verification failed.");
    return profile;
  }

  #validateIdentity(
    envelope: EncryptedPersonaEnvelope,
    profile: PersonaProfile,
    ownerId: string,
    profileId: string,
    version: number,
  ): void {
    if (profile.ownerId !== ownerId || profile.profileId !== profileId || profile.version !== version) {
      throw new Error("Decrypted persona profile identity does not match the request.");
    }
    if (envelope.profileKey !== profileIdentityKey(profile.ownerId, profile.profileId)) {
      throw new Error("Decrypted persona profile identity does not match the envelope.");
    }
    if (envelope.recordKey !== personaRecordKey(profile.ownerId, profile.profileId, profile.version)) {
      throw new Error("Decrypted persona profile version does not match the envelope.");
    }
  }

  #pathFor(recordKey: string): string {
    return join(this.#directory, `${z.string().regex(/^[a-f0-9]{64}$/).parse(recordKey)}.persona-profile.enc.json`);
  }
}

export const personaGovernanceActorSchema = z.enum(["owner_local", "field_service", "pilot_model"]);
export const personaGovernanceOperationSchema = z.enum(["approve", "retire", "revoke", "rollback", "delete"]);
export type PersonaGovernanceOperation = z.infer<typeof personaGovernanceOperationSchema>;

export const personaGovernanceRequestSchema = z.object({
  requestId: z.string().uuid(),
  actor: personaGovernanceActorSchema,
  operation: personaGovernanceOperationSchema,
  ownerId: z.string().min(1).max(200),
  profileId: z.string().uuid(),
  currentVersion: z.number().int().positive(),
  localTransport: z.boolean(),
  interactiveOwnerPresent: z.boolean(),
  requestedAt: z.string().datetime(),
  reason: z.string().min(1).max(1_000),
}).strict();
export type PersonaGovernanceRequest = z.infer<typeof personaGovernanceRequestSchema>;

export const personaGovernanceRecordSchema = z.object({
  contractVersion: z.literal(1),
  recordId: z.string().uuid(),
  previousRecordHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  request: personaGovernanceRequestSchema,
  currentProfileHash: z.string().regex(/^[a-f0-9]{64}$/),
  nextProfileHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  deletionCertificateHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  decision: z.enum(["allow", "block"]),
  rule: z.string().min(1).max(200),
  decidedAt: z.string().datetime(),
  modelMaySatisfyOwnerPresence: z.literal(false),
  recordHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type PersonaGovernanceRecord = z.infer<typeof personaGovernanceRecordSchema>;

export const personaDeletionCertificateSchema = z.object({
  contractVersion: z.literal(1),
  certificateId: z.string().uuid(),
  ownerIdHash: z.string().regex(/^[a-f0-9]{64}$/),
  profileIdHash: z.string().regex(/^[a-f0-9]{64}$/),
  throughVersion: z.number().int().positive(),
  requestedBy: z.literal("owner_local"),
  deletedAt: z.string().datetime(),
  reason: z.string().min(1).max(1_000),
  certificateHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type PersonaDeletionCertificate = z.infer<typeof personaDeletionCertificateSchema>;

export interface PersonaGovernanceTransition {
  record: PersonaGovernanceRecord;
  nextProfile?: PersonaProfile;
  deletionCertificate?: PersonaDeletionCertificate;
}

export class PersonaGovernanceLedger {
  readonly #records: PersonaGovernanceRecord[] = [];
  readonly #requestIds = new Set<string>();

  transition(input: {
    current: PersonaProfile;
    request: PersonaGovernanceRequest;
    rollbackTarget?: PersonaProfile;
    decidedAt?: string;
  }): PersonaGovernanceTransition {
    const current = personaProfileSchema.parse(structuredClone(input.current));
    if (!verifyPersonaProfile(current)) throw new Error("Current persona profile integrity verification failed.");
    const request = personaGovernanceRequestSchema.parse(structuredClone(input.request));
    if (this.#requestIds.has(request.requestId)) throw new Error("A persona governance request may be decided only once.");
    const decidedAt = input.decidedAt ?? new Date().toISOString();
    const previousRecordHash = this.#records.at(-1)?.recordHash;
    const blockedRule = governanceBlockRule(current, request, input.rollbackTarget);
    if (blockedRule) {
      const record = createGovernanceRecord({ previousRecordHash, request, current, decision: "block", rule: blockedRule, decidedAt });
      this.#append(record);
      return { record };
    }

    if (request.operation === "delete") {
      const deletionCertificate = createDeletionCertificate(current, request, decidedAt);
      const record = createGovernanceRecord({
        previousRecordHash,
        request,
        current,
        decision: "allow",
        rule: "interactive_owner_delete",
        decidedAt,
        deletionCertificateHash: deletionCertificate.certificateHash,
      });
      this.#append(record);
      return { record, deletionCertificate };
    }

    const nextProfile = nextProfileFor(current, request.operation, input.rollbackTarget, decidedAt);
    const record = createGovernanceRecord({
      previousRecordHash,
      request,
      current,
      nextProfile,
      decision: "allow",
      rule: `interactive_owner_${request.operation}`,
      decidedAt,
    });
    this.#append(record);
    return { record, nextProfile };
  }

  records(): PersonaGovernanceRecord[] {
    return structuredClone(this.#records);
  }

  verifyChain(): boolean {
    let previous: string | undefined;
    for (const record of this.#records) {
      if (record.previousRecordHash !== previous) return false;
      const { recordHash: _recordHash, ...core } = record;
      if (sha256Canonical(core) !== record.recordHash) return false;
      previous = record.recordHash;
    }
    return true;
  }

  #append(record: PersonaGovernanceRecord): void {
    this.#requestIds.add(record.request.requestId);
    this.#records.push(structuredClone(record));
  }
}

function governanceBlockRule(
  current: PersonaProfile,
  request: PersonaGovernanceRequest,
  rollbackTarget?: PersonaProfile,
): string | undefined {
  if (request.ownerId !== current.ownerId || request.profileId !== current.profileId || request.currentVersion !== current.version) {
    return "exact_profile_identity_required";
  }
  if (!request.localTransport) return "local_transport_required";
  if (request.actor !== "owner_local") return "owner_only_governance";
  if (!request.interactiveOwnerPresent) return "interactive_owner_presence_required";
  if (request.operation === "approve" && current.status === "retired") return "retired_profile_cannot_be_approved";
  if (["retire", "revoke"].includes(request.operation) && current.status === "retired") return "profile_already_retired";
  if (request.operation === "rollback") {
    if (!rollbackTarget) return "rollback_target_required";
    const target = personaProfileSchema.parse(structuredClone(rollbackTarget));
    if (!verifyPersonaProfile(target)) return "rollback_target_integrity";
    if (target.ownerId !== current.ownerId || target.profileId !== current.profileId || target.version >= current.version) {
      return "rollback_target_identity_or_version";
    }
  }
  return undefined;
}

function nextProfileFor(
  current: PersonaProfile,
  operation: Exclude<PersonaGovernanceOperation, "delete">,
  rollbackTarget: PersonaProfile | undefined,
  createdAt: string,
): PersonaProfile {
  const source = operation === "rollback" ? personaProfileSchema.parse(structuredClone(rollbackTarget)) : current;
  const status: PersonaStatus = operation === "approve" || operation === "rollback" ? "approved" : "retired";
  return createPersonaProfile({
    contractVersion: 1,
    profileId: current.profileId,
    ownerId: current.ownerId,
    version: current.version + 1,
    supersedesVersion: current.version,
    createdAt,
    status,
    ownerApproved: status === "approved",
    traits: structuredClone(source.traits),
    timing: structuredClone(source.timing),
    imperfection: structuredClone(source.imperfection),
    habits: structuredClone(source.habits),
  });
}

function createGovernanceRecord(input: {
  previousRecordHash?: string;
  request: PersonaGovernanceRequest;
  current: PersonaProfile;
  nextProfile?: PersonaProfile;
  deletionCertificateHash?: string;
  decision: "allow" | "block";
  rule: string;
  decidedAt: string;
}): PersonaGovernanceRecord {
  const core = {
    contractVersion: 1 as const,
    recordId: randomUUID(),
    ...(input.previousRecordHash ? { previousRecordHash: input.previousRecordHash } : {}),
    request: structuredClone(input.request),
    currentProfileHash: input.current.profileHash,
    ...(input.nextProfile ? { nextProfileHash: input.nextProfile.profileHash } : {}),
    ...(input.deletionCertificateHash ? { deletionCertificateHash: input.deletionCertificateHash } : {}),
    decision: input.decision,
    rule: input.rule,
    decidedAt: input.decidedAt,
    modelMaySatisfyOwnerPresence: false as const,
  };
  return personaGovernanceRecordSchema.parse({ ...core, recordHash: sha256Canonical(core) });
}

function createDeletionCertificate(
  current: PersonaProfile,
  request: PersonaGovernanceRequest,
  deletedAt: string,
): PersonaDeletionCertificate {
  const core = {
    contractVersion: 1 as const,
    certificateId: randomUUID(),
    ownerIdHash: sha256Canonical({ ownerId: current.ownerId }),
    profileIdHash: sha256Canonical({ profileId: current.profileId }),
    throughVersion: current.version,
    requestedBy: "owner_local" as const,
    deletedAt,
    reason: request.reason,
  };
  return personaDeletionCertificateSchema.parse({ ...core, certificateHash: sha256Canonical(core) });
}

function aad(recordKey: string, profileKey: string, version: number): string {
  return `${FORMAT_VERSION}:${recordKey}:${profileKey}:${version}`;
}

function normalizeKey(input: Buffer | string): Buffer {
  const key = Buffer.isBuffer(input) ? Buffer.from(input) : Buffer.from(input, "base64url");
  if (key.byteLength !== 32) throw new Error("The persona profile encryption key must decode to exactly 32 bytes.");
  return key;
}

function profileIdentityKey(ownerId: string, profileId: string): string {
  if (!ownerId.trim()) throw new Error("An owner identity is required.");
  return createHash("sha256").update(`${ownerId}:${z.string().uuid().parse(profileId)}`).digest("hex");
}

function personaRecordKey(ownerId: string, profileId: string, version: number): string {
  if (!Number.isInteger(version) || version < 1) throw new Error("Persona profile version must be a positive integer.");
  return createHash("sha256").update(`${profileIdentityKey(ownerId, profileId)}:${version}`).digest("hex");
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
