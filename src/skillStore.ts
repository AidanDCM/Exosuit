import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import {
  SkillManifestSigner,
  SkillRegistry,
  signedSkillManifestSchema,
  type InstalledSkill,
  type SignedSkillManifest,
} from "./skills.js";

const installedSkillSchema = z.object({
  manifest: signedSkillManifestSchema,
  enabled: z.boolean(),
  installedAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
});

const skillStorePayloadSchema = z.object({
  formatVersion: z.literal(1),
  savedAt: z.string().datetime(),
  skills: z.array(installedSkillSchema).max(10_000),
});
const skillStoreEnvelopeSchema = z.object({
  payload: skillStorePayloadSchema,
  integrityHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export class FileSkillRegistryStore {
  readonly #path: string;
  readonly #maxBytes: number;

  constructor(options: { path: string; maxBytes?: number }) {
    if (!options.path.trim()) throw new Error("A skill registry path is required.");
    this.#path = resolve(options.path);
    this.#maxBytes = options.maxBytes ?? 20 * 1024 * 1024;
    if (!Number.isInteger(this.#maxBytes) || this.#maxBytes < 1_024 || this.#maxBytes > 200 * 1024 * 1024) {
      throw new Error("Skill registry maxBytes must be between 1024 and 209715200.");
    }
  }

  async save(skills: InstalledSkill[]): Promise<void> {
    const payload = skillStorePayloadSchema.parse({
      formatVersion: 1,
      savedAt: new Date().toISOString(),
      skills: [...skills].sort((left, right) => left.manifest.skillId.localeCompare(right.manifest.skillId)),
    });
    const ids = new Set<string>();
    for (const skill of payload.skills) {
      if (ids.has(skill.manifest.skillId)) throw new Error(`Duplicate installed skill ${skill.manifest.skillId}.`);
      ids.add(skill.manifest.skillId);
      if (skill.revokedAt && skill.enabled) throw new Error("A revoked persisted skill cannot be enabled.");
    }
    const envelope = skillStoreEnvelopeSchema.parse({
      payload,
      integrityHash: sha256(stableStringify(payload)),
    });
    const serialized = `${JSON.stringify(envelope)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > this.#maxBytes) {
      throw new Error("Skill registry exceeds the configured size limit.");
    }
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

  async load(): Promise<InstalledSkill[]> {
    let serialized: string;
    try {
      serialized = await readFile(this.#path, "utf8");
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    if (Buffer.byteLength(serialized, "utf8") > this.#maxBytes) {
      throw new Error("Stored skill registry exceeds the configured size limit.");
    }
    const envelope = skillStoreEnvelopeSchema.parse(JSON.parse(serialized) as unknown);
    if (envelope.integrityHash !== sha256(stableStringify(envelope.payload))) {
      throw new Error("Stored skill registry failed integrity verification.");
    }
    return structuredClone(envelope.payload.skills);
  }
}

export class PersistentSkillRegistry {
  readonly registry: SkillRegistry;
  readonly #store: FileSkillRegistryStore;

  private constructor(registry: SkillRegistry, store: FileSkillRegistryStore) {
    this.registry = registry;
    this.#store = store;
  }

  static async open(
    signer: SkillManifestSigner,
    store: FileSkillRegistryStore,
  ): Promise<PersistentSkillRegistry> {
    const registry = new SkillRegistry(signer);
    for (const stored of await store.load()) {
      registry.install(stored.manifest, { approveExpansion: true });
      if (stored.revokedAt) registry.revoke(stored.manifest.skillId);
      else if (stored.enabled) registry.enable(stored.manifest.skillId);
    }
    return new PersistentSkillRegistry(registry, store);
  }

  async install(
    manifest: SignedSkillManifest,
    options: { approveExpansion?: boolean } = {},
  ): Promise<ReturnType<SkillRegistry["install"]>> {
    const result = this.registry.install(manifest, options);
    await this.#save();
    return result;
  }

  async enable(skillId: string): Promise<InstalledSkill> {
    const result = this.registry.enable(skillId);
    await this.#save();
    return result;
  }

  async disable(skillId: string): Promise<InstalledSkill> {
    const result = this.registry.disable(skillId);
    await this.#save();
    return result;
  }

  async revoke(skillId: string): Promise<InstalledSkill> {
    const result = this.registry.revoke(skillId);
    await this.#save();
    return result;
  }

  async #save(): Promise<void> {
    await this.#store.save(this.registry.list());
  }
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
