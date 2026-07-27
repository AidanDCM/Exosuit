import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import {
  runtimeWorkflowRecordSchema,
  workflowArtifactSchema,
  type RuntimeWorkflowRecord,
  type WorkflowArtifact,
  type WorkflowCheckpointStore,
} from "./workflowRuntime.js";

const CHECKPOINT_SCHEMA_VERSION = 1;
const DEFAULT_MAX_CHECKPOINT_BYTES = 10 * 1024 * 1024;

const checkpointPayloadSchema = z.object({
  workflow: runtimeWorkflowRecordSchema,
  artifacts: z.array(workflowArtifactSchema),
});

const checkpointEnvelopeSchema = z.object({
  schemaVersion: z.literal(CHECKPOINT_SCHEMA_VERSION),
  workflowId: z.string().min(1),
  savedAt: z.string().datetime(),
  payload: checkpointPayloadSchema,
  integrityHash: z.string().regex(/^[a-f0-9]{64}$/),
});

type CheckpointEnvelope = z.infer<typeof checkpointEnvelopeSchema>;

export class FileWorkflowCheckpointStore implements WorkflowCheckpointStore {
  readonly #directory: string;
  readonly #maxCheckpointBytes: number;

  constructor(options: { directory: string; maxCheckpointBytes?: number }) {
    if (!options.directory.trim()) throw new Error("A checkpoint directory is required.");
    this.#directory = resolve(options.directory);
    this.#maxCheckpointBytes = options.maxCheckpointBytes ?? DEFAULT_MAX_CHECKPOINT_BYTES;
    if (
      !Number.isInteger(this.#maxCheckpointBytes) ||
      this.#maxCheckpointBytes < 1_024 ||
      this.#maxCheckpointBytes > 100 * 1024 * 1024
    ) {
      throw new Error("maxCheckpointBytes must be between 1024 and 104857600.");
    }
  }

  async save(workflow: RuntimeWorkflowRecord, artifacts: WorkflowArtifact[]): Promise<void> {
    const payload = checkpointPayloadSchema.parse({ workflow, artifacts });
    if (payload.artifacts.some((artifact) => artifact.classification === "sensitive")) {
      throw new Error("Sensitive workflow artifacts require an encrypted checkpoint store.");
    }
    if (payload.workflow.definition.workflowId !== workflow.definition.workflowId) {
      throw new Error("Workflow checkpoint identity is inconsistent.");
    }
    const unsigned = {
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      workflowId: payload.workflow.definition.workflowId,
      savedAt: new Date().toISOString(),
      payload,
    };
    const envelope: CheckpointEnvelope = checkpointEnvelopeSchema.parse({
      ...unsigned,
      integrityHash: sha256(stableStringify(unsigned)),
    });
    const serialized = `${JSON.stringify(envelope, null, 2)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > this.#maxCheckpointBytes) {
      throw new Error("Workflow checkpoint exceeds the configured size limit.");
    }
    await mkdir(this.#directory, { recursive: true });
    const destination = this.#pathFor(envelope.workflowId);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async load(
    workflowId: string,
  ): Promise<{ workflow: RuntimeWorkflowRecord; artifacts: WorkflowArtifact[] } | undefined> {
    const path = this.#pathFor(workflowId);
    let data: string;
    try {
      data = await readFile(path, "utf8");
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    if (Buffer.byteLength(data, "utf8") > this.#maxCheckpointBytes) {
      throw new Error("Stored workflow checkpoint exceeds the configured size limit.");
    }
    const envelope = checkpointEnvelopeSchema.parse(JSON.parse(data) as unknown);
    if (envelope.workflowId !== workflowId) {
      throw new Error("Stored workflow checkpoint identity does not match the requested workflow.");
    }
    const { integrityHash, ...unsigned } = envelope;
    if (integrityHash !== sha256(stableStringify(unsigned))) {
      throw new Error("Stored workflow checkpoint failed integrity verification.");
    }
    if (envelope.payload.workflow.definition.workflowId !== workflowId) {
      throw new Error("Workflow payload identity does not match the checkpoint envelope.");
    }
    for (const artifact of envelope.payload.artifacts) {
      if (artifact.workflowId !== workflowId) {
        throw new Error("Artifact identity does not match the checkpoint workflow.");
      }
    }
    return structuredClone(envelope.payload);
  }

  async list(): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(this.#directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const workflowIds: string[] = [];
    for (const name of names.filter((item) => item.endsWith(".checkpoint.json")).sort()) {
      const path = join(this.#directory, basename(name));
      try {
        const data = await readFile(path, "utf8");
        if (Buffer.byteLength(data, "utf8") > this.#maxCheckpointBytes) continue;
        const envelope = checkpointEnvelopeSchema.parse(JSON.parse(data) as unknown);
        const { integrityHash, ...unsigned } = envelope;
        if (integrityHash !== sha256(stableStringify(unsigned))) continue;
        workflowIds.push(envelope.workflowId);
      } catch {
        // Invalid or partially written files are ignored during listing and fail explicitly on direct load.
      }
    }
    return [...new Set(workflowIds)].sort();
  }

  async delete(workflowId: string): Promise<void> {
    await unlink(this.#pathFor(workflowId)).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }

  #pathFor(workflowId: string): string {
    if (!workflowId.trim()) throw new Error("A workflow ID is required.");
    return join(this.#directory, `${sha256(workflowId)}.checkpoint.json`);
  }
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
