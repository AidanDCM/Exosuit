import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  fieldAttestationSchema,
  fieldIdentitySchema,
  fieldPolicySchema,
  fieldRefSchema,
  sha256Canonical,
  verifyFieldAttestation,
  type FieldAttestation,
  type FieldIdentity,
  type FieldPolicy,
  type FieldRef,
} from "./fieldContracts.js";
import { FieldRegistry, fieldRecordSchema, type FieldRecord } from "./fieldRegistry.js";

export const fieldManagerEventSchema = z.object({
  sequence: z.number().int().nonnegative(),
  eventId: z.string().uuid(),
  eventType: z.string().min(1).max(200),
  occurredAt: z.string().datetime(),
  actor: z.string().min(1).max(200),
  field: fieldRefSchema,
  payload: z.record(z.string(), z.unknown()),
  previousHash: z.string().regex(/^[a-f0-9]{64}$/),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type FieldManagerEvent = z.infer<typeof fieldManagerEventSchema>;

export interface FieldProvisioner {
  readonly name: string;
  provision(input: { identity: FieldIdentity; policy: FieldPolicy; attestation: FieldAttestation }): Promise<Record<string, unknown>>;
  stop(input: { field: FieldRef; reason: string }): Promise<Record<string, unknown>>;
  destroy(input: { field: FieldRef }): Promise<Record<string, unknown>>;
}

export class FakeFieldProvisioner implements FieldProvisioner {
  readonly name = "fake-field-provisioner";
  readonly events: string[] = [];
  readonly #failProvision: boolean;
  readonly #failStop: boolean;
  readonly #failDestroy: boolean;

  constructor(options: { failProvision?: boolean; failStop?: boolean; failDestroy?: boolean } = {}) {
    this.#failProvision = options.failProvision ?? false;
    this.#failStop = options.failStop ?? false;
    this.#failDestroy = options.failDestroy ?? false;
  }

  async provision(input: { identity: FieldIdentity }): Promise<Record<string, unknown>> {
    this.events.push(`provision:${input.identity.fieldId}:${input.identity.fieldGeneration}`);
    if (this.#failProvision) throw new Error("Fake field provisioning failed.");
    return { provider: this.name, ready: true, taskDiskId: input.identity.taskDiskId };
  }

  async stop(input: { field: FieldRef; reason: string }): Promise<Record<string, unknown>> {
    this.events.push(`stop:${input.field.fieldId}:${input.field.fieldGeneration}:${input.reason}`);
    if (this.#failStop) throw new Error("Fake field stop failed.");
    return { provider: this.name, stopped: true };
  }

  async destroy(input: { field: FieldRef }): Promise<Record<string, unknown>> {
    this.events.push(`destroy:${input.field.fieldId}:${input.field.fieldGeneration}`);
    if (this.#failDestroy) throw new Error("Fake field destruction failed.");
    return { provider: this.name, destroyed: true };
  }
}

function modeLifecycle(mode: FieldPolicy["mode"]): "teaching" | "shadowing" | "piloting" {
  return mode === "teach" ? "teaching" : mode === "shadow" ? "shadowing" : "piloting";
}

function fieldKey(field: FieldRef): string {
  return `${field.fieldId}:${field.fieldGeneration}`;
}

export class FieldManager {
  readonly #registry: FieldRegistry;
  readonly #provisioner: FieldProvisioner;
  readonly #audit: FieldManagerEvent[] = [];
  readonly #provisionedPolicyHashes = new Map<string, string>();

  constructor(options: { provisioner: FieldProvisioner; registry?: FieldRegistry }) {
    this.#provisioner = options.provisioner;
    this.#registry = options.registry ?? new FieldRegistry();
  }

  plan(input: { identity: FieldIdentity; gloveAgentId: string; actor: string; now?: Date }): FieldRecord {
    const identity = fieldIdentitySchema.parse(input.identity);
    const record = this.#registry.register({ identity, gloveAgentId: input.gloveAgentId, now: input.now });
    this.#appendAudit("field_planned", input.actor, identity, { gloveAgentId: input.gloveAgentId }, input.now);
    return record;
  }

  async provision(input: {
    field: FieldRef;
    policy: FieldPolicy;
    attestation: FieldAttestation;
    attestationSecret: string;
    actor: string;
    now?: Date;
  }): Promise<FieldRecord> {
    const ref = fieldRefSchema.parse(input.field);
    const current = this.#registry.get(ref);
    if (!current) throw new Error("Field generation must be planned before provisioning.");
    if (current.lifecycle !== "planned" && current.lifecycle !== "stopped") {
      throw new Error("Only a planned or stopped field can begin provisioning.");
    }
    const policy = fieldPolicySchema.parse(input.policy);
    const attestation = fieldAttestationSchema.parse(input.attestation);
    verifyFieldAttestation({ attestation, policy, secret: input.attestationSecret, now: input.now });
    if (attestation.identity.fieldId !== ref.fieldId || attestation.identity.fieldGeneration !== ref.fieldGeneration) {
      throw new Error("Provisioning request does not match the attested field generation.");
    }
    if (sha256Canonical(current.identity) !== sha256Canonical(attestation.identity)) {
      throw new Error("Planned field identity does not match the attested field identity.");
    }

    this.#registry.transition({ field: ref, to: "provisioning", now: input.now });
    this.#appendAudit("field_provisioning_started", input.actor, ref, { provider: this.#provisioner.name }, input.now);
    try {
      const evidence = await this.#provisioner.provision({ identity: current.identity, policy, attestation });
      this.#provisionedPolicyHashes.set(fieldKey(ref), sha256Canonical(policy));
      const ready = this.#registry.transition({ field: ref, to: "ready", now: input.now });
      this.#appendAudit("field_ready", input.actor, ref, { ...evidence, policyHash: sha256Canonical(policy) }, input.now);
      return ready;
    } catch (error) {
      this.#provisionedPolicyHashes.delete(fieldKey(ref));
      const reason = error instanceof Error ? error.message : "Unknown field provisioning failure.";
      const faulted = this.#registry.transition({ field: ref, to: "faulted", faultReason: reason, now: input.now });
      this.#appendAudit("field_faulted", input.actor, ref, { operation: "provision", reason }, input.now);
      return faulted;
    }
  }

  enterMode(input: { field: FieldRef; policy: FieldPolicy; actor: string; now?: Date }): FieldRecord {
    const ref = fieldRefSchema.parse(input.field);
    const policy = fieldPolicySchema.parse(input.policy);
    if (policy.field.fieldId !== ref.fieldId || policy.field.fieldGeneration !== ref.fieldGeneration) {
      throw new Error("Field mode policy does not match the requested field generation.");
    }
    const now = input.now ?? new Date();
    if (now.getTime() < new Date(policy.issuedAt).getTime()) throw new Error("Field policy is not valid yet.");
    if (now.getTime() >= new Date(policy.expiresAt).getTime()) throw new Error("Field policy has expired.");
    const provisionedHash = this.#provisionedPolicyHashes.get(fieldKey(ref));
    if (!provisionedHash) throw new Error("Field has no provisioned policy binding.");
    if (provisionedHash !== sha256Canonical(policy)) {
      throw new Error("Field mode policy differs from the policy used for provisioning.");
    }
    const current = this.#registry.get(ref);
    if (!current) throw new Error("Field generation is not registered.");
    if (current.lifecycle !== "ready") throw new Error("Field must be ready before entering an operating mode.");
    const lifecycle = modeLifecycle(policy.mode);
    const updated = this.#registry.transition({ field: ref, to: lifecycle, now });
    this.#appendAudit("field_mode_entered", input.actor, ref, { mode: policy.mode, policyId: policy.policyId, policyHash: provisionedHash }, now);
    return updated;
  }

  returnReady(input: { field: FieldRef; actor: string; reason: string; now?: Date }): FieldRecord {
    const ref = fieldRefSchema.parse(input.field);
    const current = this.#registry.get(ref);
    if (!current || !["teaching", "shadowing", "piloting"].includes(current.lifecycle)) {
      throw new Error("Only an active Teach, Shadow, or Pilot field can return to ready.");
    }
    const ready = this.#registry.transition({ field: ref, to: "ready", now: input.now });
    this.#appendAudit("field_mode_exited", input.actor, ref, { reason: input.reason }, input.now);
    return ready;
  }

  async stop(input: { field: FieldRef; actor: string; reason: string; now?: Date }): Promise<FieldRecord> {
    const ref = fieldRefSchema.parse(input.field);
    const current = this.#registry.get(ref);
    if (!current) throw new Error("Field generation is not registered.");
    this.#registry.transition({ field: ref, to: "stopping", now: input.now });
    this.#appendAudit("field_stopping", input.actor, ref, { from: current.lifecycle, reason: input.reason }, input.now);
    try {
      const evidence = await this.#provisioner.stop({ field: ref, reason: input.reason });
      const stopped = this.#registry.transition({ field: ref, to: "stopped", now: input.now });
      this.#appendAudit("field_stopped", input.actor, ref, evidence, input.now);
      return stopped;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown field stop failure.";
      const faulted = this.#registry.transition({ field: ref, to: "faulted", faultReason: reason, now: input.now });
      this.#appendAudit("field_faulted", input.actor, ref, { operation: "stop", reason }, input.now);
      return faulted;
    }
  }

  async destroy(input: { field: FieldRef; actor: string; now?: Date }): Promise<FieldRecord> {
    const ref = fieldRefSchema.parse(input.field);
    const current = this.#registry.get(ref);
    if (!current) throw new Error("Field generation is not registered.");
    if (current.lifecycle !== "stopped" && current.lifecycle !== "faulted" && current.lifecycle !== "planned") {
      throw new Error("Field must be stopped, faulted, or unprovisioned before destruction.");
    }
    const evidence = await this.#provisioner.destroy({ field: ref });
    this.#provisionedPolicyHashes.delete(fieldKey(ref));
    const destroyed = this.#registry.transition({ field: ref, to: "destroyed", now: input.now });
    this.#appendAudit("field_destroyed", input.actor, ref, evidence, input.now);
    return destroyed;
  }

  get(field: FieldRef): FieldRecord | undefined {
    const record = this.#registry.get(field);
    return record ? fieldRecordSchema.parse(structuredClone(record)) : undefined;
  }

  auditTail(limit = 100): FieldManagerEvent[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new Error("Audit limit must be from 1 through 10,000.");
    return this.#audit.slice(-limit).map((event) => fieldManagerEventSchema.parse(structuredClone(event)));
  }

  verifyAudit(): boolean {
    let previousHash = "0".repeat(64);
    for (const event of this.#audit) {
      const { hash, ...unsigned } = event;
      if (event.previousHash !== previousHash || sha256Canonical(unsigned) !== hash) return false;
      previousHash = hash;
    }
    return true;
  }

  #appendAudit(
    eventType: string,
    actor: string,
    field: FieldRef,
    payload: Record<string, unknown>,
    now?: Date,
  ): FieldManagerEvent {
    const previousHash = this.#audit.at(-1)?.hash ?? "0".repeat(64);
    const unsigned = {
      sequence: this.#audit.length,
      eventId: randomUUID(),
      eventType,
      occurredAt: (now ?? new Date()).toISOString(),
      actor,
      field: fieldRefSchema.parse(field),
      payload,
      previousHash,
    };
    const event = fieldManagerEventSchema.parse({ ...unsigned, hash: sha256Canonical(unsigned) });
    this.#audit.push(event);
    return event;
  }
}
