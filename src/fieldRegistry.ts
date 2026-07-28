import { z } from "zod";
import { fieldIdentitySchema, fieldRefSchema, type FieldIdentity, type FieldRef } from "./fieldContracts.js";

export const fieldLifecycleSchema = z.enum([
  "planned",
  "provisioning",
  "ready",
  "teaching",
  "shadowing",
  "piloting",
  "stopping",
  "stopped",
  "faulted",
  "destroyed",
]);
export type FieldLifecycle = z.infer<typeof fieldLifecycleSchema>;

export const fieldRecordSchema = z.object({
  subsystem: z.literal("field"),
  identity: fieldIdentitySchema,
  lifecycle: fieldLifecycleSchema,
  gloveAgentId: z.string().min(1).max(200),
  updatedAt: z.string().datetime(),
  faultReason: z.string().min(1).max(2_000).optional(),
});
export type FieldRecord = z.infer<typeof fieldRecordSchema>;

const transitions: Readonly<Record<FieldLifecycle, readonly FieldLifecycle[]>> = {
  planned: ["provisioning", "destroyed"],
  provisioning: ["ready", "faulted", "stopping"],
  ready: ["teaching", "shadowing", "piloting", "stopping", "faulted"],
  teaching: ["ready", "stopping", "faulted"],
  shadowing: ["ready", "stopping", "faulted"],
  piloting: ["ready", "stopping", "faulted"],
  stopping: ["stopped", "faulted"],
  stopped: ["provisioning", "destroyed"],
  faulted: ["stopping", "destroyed"],
  destroyed: [],
};

function key(ref: FieldRef): string {
  return `${ref.fieldId}:${ref.fieldGeneration}`;
}

export class FieldRegistry {
  readonly #records = new Map<string, FieldRecord>();

  register(input: { identity: FieldIdentity; gloveAgentId: string; now?: Date }): FieldRecord {
    const identity = fieldIdentitySchema.parse(input.identity);
    const record = fieldRecordSchema.parse({
      subsystem: "field",
      identity,
      lifecycle: "planned",
      gloveAgentId: input.gloveAgentId,
      updatedAt: (input.now ?? new Date()).toISOString(),
    });
    const recordKey = key(identity);
    if (this.#records.has(recordKey)) throw new Error("This field generation is already registered.");
    const newerOrEqual = [...this.#records.values()].find(
      (candidate) => candidate.identity.fieldId === identity.fieldId && candidate.identity.fieldGeneration >= identity.fieldGeneration,
    );
    if (newerOrEqual) throw new Error("Field generations must increase for a reused field ID.");
    this.#records.set(recordKey, record);
    return record;
  }

  get(ref: FieldRef): FieldRecord | undefined {
    return this.#records.get(key(fieldRefSchema.parse(ref)));
  }

  list(): FieldRecord[] {
    return [...this.#records.values()].sort(
      (left, right) => left.identity.createdAt.localeCompare(right.identity.createdAt) || left.identity.fieldGeneration - right.identity.fieldGeneration,
    );
  }

  transition(input: { field: FieldRef; to: FieldLifecycle; faultReason?: string; now?: Date }): FieldRecord {
    const ref = fieldRefSchema.parse(input.field);
    const to = fieldLifecycleSchema.parse(input.to);
    const current = this.#records.get(key(ref));
    if (!current) throw new Error("Field generation is not registered.");
    if (!transitions[current.lifecycle].includes(to)) {
      throw new Error(`Field lifecycle cannot transition from ${current.lifecycle} to ${to}.`);
    }
    if (to === "faulted" && !input.faultReason?.trim()) throw new Error("A faulted field requires a fault reason.");
    if (to !== "faulted" && input.faultReason !== undefined) throw new Error("Fault reasons are only valid for the faulted lifecycle.");
    const updated = fieldRecordSchema.parse({
      ...current,
      lifecycle: to,
      updatedAt: (input.now ?? new Date()).toISOString(),
      ...(to === "faulted" ? { faultReason: input.faultReason } : { faultReason: undefined }),
    });
    this.#records.set(key(ref), updated);
    return updated;
  }

  assertModeReady(input: { field: FieldRef; mode: "teach" | "shadow" | "pilot"; gloveAgentId: string }): FieldRecord {
    const record = this.get(input.field);
    if (!record) throw new Error("Field generation is not registered.");
    if (record.gloveAgentId !== input.gloveAgentId) throw new Error("The requested glove agent is not bound to this field generation.");
    const required: FieldLifecycle = input.mode === "teach" ? "teaching" : input.mode === "shadow" ? "shadowing" : "piloting";
    if (record.lifecycle !== required) throw new Error(`Field must be in ${required} lifecycle before ${input.mode} work can run.`);
    return record;
  }
}
