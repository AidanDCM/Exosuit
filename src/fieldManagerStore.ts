import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { sha256Canonical } from "./fieldContracts.js";
import {
  FieldManager,
  fieldManagerStateSchema,
  type FieldManagerState,
  type FieldProvisioner,
} from "./fieldManager.js";

const fieldManagerStateEnvelopeSchema = z.object({
  state: fieldManagerStateSchema,
  integrityHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export class FileFieldManagerStateStore {
  readonly #path: string;
  readonly #maxBytes: number;

  constructor(options: { path: string; maxBytes?: number }) {
    if (!options.path.trim()) throw new Error("A Field Manager state path is required.");
    this.#path = resolve(options.path);
    this.#maxBytes = options.maxBytes ?? 25 * 1024 * 1024;
    if (!Number.isInteger(this.#maxBytes) || this.#maxBytes < 1_024 || this.#maxBytes > 100 * 1024 * 1024) {
      throw new Error("Field Manager state maxBytes must be between 1024 and 104857600.");
    }
  }

  async save(manager: FieldManager, now = new Date()): Promise<void> {
    const state = manager.exportState(now);
    const envelope = fieldManagerStateEnvelopeSchema.parse({
      state,
      integrityHash: sha256Canonical(state),
    });
    const serialized = `${JSON.stringify(envelope)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > this.#maxBytes) {
      throw new Error("Field Manager state exceeds the configured size limit.");
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

  async load(): Promise<FieldManagerState | undefined> {
    let serialized: string;
    try {
      serialized = await readFile(this.#path, "utf8");
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    if (Buffer.byteLength(serialized, "utf8") > this.#maxBytes) {
      throw new Error("Stored Field Manager state exceeds the configured size limit.");
    }
    const envelope = fieldManagerStateEnvelopeSchema.parse(JSON.parse(serialized) as unknown);
    const expected = Buffer.from(sha256Canonical(envelope.state), "hex");
    const actual = Buffer.from(envelope.integrityHash, "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new Error("Stored Field Manager state failed integrity verification.");
    }
    return structuredClone(envelope.state);
  }

  async restore(provisioner: FieldProvisioner): Promise<FieldManager> {
    const state = await this.load();
    return new FieldManager({ provisioner, ...(state ? { state } : {}) });
  }
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
