import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { AgentRegistry, supervisorAgentSchema, type SupervisorAgent } from "./supervisor.js";

const registryPayloadSchema = z.object({
  contractVersion: z.literal(1),
  savedAt: z.string().datetime(),
  agents: z.array(supervisorAgentSchema).max(10_000),
});
const registryEnvelopeSchema = z.object({
  payload: registryPayloadSchema,
  integrityHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export class FileAgentRegistryStore {
  readonly #path: string;
  readonly #maxBytes: number;

  constructor(options: { path: string; maxBytes?: number }) {
    if (!options.path.trim()) throw new Error("An agent registry path is required.");
    this.#path = resolve(options.path);
    this.#maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
    if (!Number.isInteger(this.#maxBytes) || this.#maxBytes < 1_024 || this.#maxBytes > 100 * 1024 * 1024) {
      throw new Error("Agent registry maxBytes must be between 1024 and 104857600.");
    }
  }

  async save(agents: SupervisorAgent[]): Promise<void> {
    const payload = registryPayloadSchema.parse({
      contractVersion: 1,
      savedAt: new Date().toISOString(),
      agents: [...agents].sort((left, right) => left.agentId.localeCompare(right.agentId)),
    });
    const envelope = registryEnvelopeSchema.parse({
      payload,
      integrityHash: sha256(stableStringify(payload)),
    });
    const serialized = `${JSON.stringify(envelope)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > this.#maxBytes) {
      throw new Error("Agent registry exceeds the configured size limit.");
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

  async load(): Promise<SupervisorAgent[]> {
    let serialized: string;
    try {
      serialized = await readFile(this.#path, "utf8");
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    if (Buffer.byteLength(serialized, "utf8") > this.#maxBytes) {
      throw new Error("Stored agent registry exceeds the configured size limit.");
    }
    const envelope = registryEnvelopeSchema.parse(JSON.parse(serialized) as unknown);
    if (envelope.integrityHash !== sha256(stableStringify(envelope.payload))) {
      throw new Error("Stored agent registry failed integrity verification.");
    }
    const ids = new Set<string>();
    for (const agent of envelope.payload.agents) {
      if (ids.has(agent.agentId)) throw new Error(`Stored agent registry contains duplicate agent ${agent.agentId}.`);
      ids.add(agent.agentId);
    }
    return structuredClone(envelope.payload.agents);
  }

  async hydrateRegistry(registry: AgentRegistry): Promise<AgentRegistry> {
    for (const agent of await this.load()) registry.register(agent);
    return registry;
  }
}

export class PersistentAgentRegistry {
  readonly registry: AgentRegistry;
  readonly #store: FileAgentRegistryStore;

  private constructor(registry: AgentRegistry, store: FileAgentRegistryStore) {
    this.registry = registry;
    this.#store = store;
  }

  static async open(store: FileAgentRegistryStore): Promise<PersistentAgentRegistry> {
    const registry = await store.hydrateRegistry(new AgentRegistry());
    return new PersistentAgentRegistry(registry, store);
  }

  async register(agent: SupervisorAgent): Promise<SupervisorAgent> {
    const result = this.registry.register(agent);
    await this.#store.save(this.registry.list());
    return result;
  }

  async heartbeat(input: Parameters<AgentRegistry["heartbeat"]>[0]): Promise<SupervisorAgent> {
    const result = this.registry.heartbeat(input);
    await this.#store.save(this.registry.list());
    return result;
  }

  async expireStale(input: Parameters<AgentRegistry["expireStale"]>[0]): Promise<SupervisorAgent[]> {
    const result = this.registry.expireStale(input);
    if (result.length > 0) await this.#store.save(this.registry.list());
    return result;
  }

  async stop(agentId: string): Promise<SupervisorAgent> {
    const result = this.registry.stop(agentId);
    await this.#store.save(this.registry.list());
    return result;
  }

  async stopAll(): Promise<ReturnType<AgentRegistry["stopAll"]>> {
    const result = this.registry.stopAll();
    await this.#store.save(this.registry.list());
    return result;
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
