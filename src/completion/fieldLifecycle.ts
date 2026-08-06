/**
 * Field lifecycle ledger (contract v2.2).
 *
 * Closes the gap found during M0.5 reboot verification on 2026-08-05: a fully
 * valid, correctly signed evidence record naming the boot of a Field generation
 * that had already been destroyed was accepted, because nothing bound evidence
 * to a boot's lifetime.
 *
 * The host records `created`, `booted`, `stopped`, and `destroyed` for each
 * generation. Field-bound live evidence must then fall inside an open boot
 * window of a generation that existed and had not been destroyed at the time.
 */

import { createHash } from "node:crypto";
import { canonicalJson } from "../fieldContracts.js";
import { verifyRecordSignature } from "./signing.js";
import type {
  FieldLifecycleEvent,
  FieldLifecycleLedger,
  KeyRegistry,
} from "./contracts.js";

export const GENESIS_LIFECYCLE_HASH = "0".repeat(64);

export function hashLifecycleEvent(event: FieldLifecycleEvent): string {
  return createHash("sha256").update(canonicalJson(event)).digest("hex");
}

/** One boot of one generation, half-open: `[startedAt, stoppedAt)`. */
export interface BootWindow {
  readonly fieldId: string;
  readonly generation: number;
  readonly bootId: string;
  readonly startedMs: number;
  readonly stoppedMs?: number;
}

export interface GenerationWindow {
  readonly fieldId: string;
  readonly generation: number;
  readonly createdMs: number;
  readonly destroyedMs?: number;
  readonly baseImageSha256?: string;
}

export interface LifecycleVerificationResult {
  readonly boots: readonly BootWindow[];
  readonly generations: readonly GenerationWindow[];
  readonly failures: readonly string[];
}

interface GenerationState {
  createdMs: number;
  destroyedMs?: number;
  baseImageSha256?: string;
  openBootId?: string;
  openBootStartMs?: number;
  seenBootIds: Set<string>;
}

export function verifyFieldLifecycle(input: {
  readonly ledger: FieldLifecycleLedger;
  readonly registry: KeyRegistry;
}): LifecycleVerificationResult {
  const failures: string[] = [];
  const boots: BootWindow[] = [];
  const generations = new Map<string, GenerationState>();
  const key = (fieldId: string, generation: number) => `${fieldId}#${generation}`;

  const events = [...input.ledger.events].sort((a, b) => a.sequence - b.sequence);
  const seenEventIds = new Set<string>();
  let previousHash = GENESIS_LIFECYCLE_HASH;
  let previousRecordedAt = Number.NEGATIVE_INFINITY;

  for (const [index, event] of events.entries()) {
    const label = `field lifecycle ${event.eventId}`;

    if (event.sequence !== index) {
      failures.push(`${label}: sequence ${event.sequence} breaks contiguity at position ${index}`);
    }
    if (seenEventIds.has(event.eventId)) failures.push(`${label}: duplicate event id`);
    seenEventIds.add(event.eventId);

    if (event.previousEventHash !== previousHash) {
      failures.push(`${label}: previousEventHash does not match the preceding event`);
    }

    const recordedAt = Date.parse(event.recordedAt);
    if (Number.isNaN(recordedAt)) {
      failures.push(`${label}: unparseable recordedAt`);
    } else if (recordedAt < previousRecordedAt) {
      failures.push(`${label}: recordedAt runs backwards`);
    } else {
      previousRecordedAt = recordedAt;
    }

    // Only the host observes a Field's lifecycle, so only a host-bound key may
    // assert it, and it must name its own machine.
    failures.push(...verifyRecordSignature(event, {
      registry: input.registry,
      keyId: event.signingKeyId,
      role: "host",
      signedAt: event.recordedAt,
      machineId: event.machineId,
      requiredPurpose: "live",
    }).map((reason) => `${label}: ${reason}`));

    const id = key(event.fieldId, event.generation);
    const state = generations.get(id);

    switch (event.kind) {
      case "created": {
        if (state !== undefined) {
          failures.push(`${label}: generation ${event.generation} of ${event.fieldId} already created`);
          break;
        }
        if (event.baseImageSha256 === undefined) {
          failures.push(`${label}: created must name the immutable base image hash`);
        }
        generations.set(id, {
          createdMs: recordedAt,
          ...(event.baseImageSha256 === undefined ? {} : { baseImageSha256: event.baseImageSha256 }),
          seenBootIds: new Set<string>(),
        });
        break;
      }
      case "booted": {
        if (state === undefined) { failures.push(`${label}: boot of a generation that was never created`); break; }
        if (state.destroyedMs !== undefined) { failures.push(`${label}: boot of a destroyed generation`); break; }
        if (event.bootId === undefined) { failures.push(`${label}: booted must name a bootId`); break; }
        if (state.openBootId !== undefined) {
          failures.push(`${label}: boot ${event.bootId} starts while ${state.openBootId} is still open`);
          break;
        }
        if (state.seenBootIds.has(event.bootId)) {
          failures.push(`${label}: boot id ${event.bootId} reused for the same generation`);
          break;
        }
        state.seenBootIds.add(event.bootId);
        state.openBootId = event.bootId;
        state.openBootStartMs = recordedAt;
        break;
      }
      case "stopped": {
        if (state === undefined) { failures.push(`${label}: stop of a generation that was never created`); break; }
        if (event.bootId === undefined) { failures.push(`${label}: stopped must name a bootId`); break; }
        if (state.openBootId !== event.bootId) {
          failures.push(`${label}: stop of ${event.bootId}, but the open boot is ${state.openBootId ?? "none"}`);
          break;
        }
        boots.push({
          fieldId: event.fieldId,
          generation: event.generation,
          bootId: event.bootId,
          startedMs: state.openBootStartMs!,
          stoppedMs: recordedAt,
        });
        delete state.openBootId;
        delete state.openBootStartMs;
        break;
      }
      case "destroyed": {
        if (state === undefined) { failures.push(`${label}: destroy of a generation that was never created`); break; }
        if (state.destroyedMs !== undefined) { failures.push(`${label}: generation already destroyed`); break; }
        if (state.openBootId !== undefined) {
          // A destroy implicitly ends the running boot at this instant.
          boots.push({
            fieldId: event.fieldId,
            generation: event.generation,
            bootId: state.openBootId,
            startedMs: state.openBootStartMs!,
            stoppedMs: recordedAt,
          });
          delete state.openBootId;
          delete state.openBootStartMs;
        }
        state.destroyedMs = recordedAt;
        break;
      }
    }

    previousHash = hashLifecycleEvent(event);
  }

  // Boots still open at the end of the ledger have no upper bound.
  for (const [id, state] of generations) {
    if (state.openBootId !== undefined) {
      const [fieldId, generation] = id.split("#");
      boots.push({
        fieldId: fieldId!,
        generation: Number.parseInt(generation!, 10),
        bootId: state.openBootId,
        startedMs: state.openBootStartMs!,
      });
    }
  }

  const generationWindows: GenerationWindow[] = [...generations.entries()].map(([id, state]) => {
    const [fieldId, generation] = id.split("#");
    return {
      fieldId: fieldId!,
      generation: Number.parseInt(generation!, 10),
      createdMs: state.createdMs,
      ...(state.destroyedMs === undefined ? {} : { destroyedMs: state.destroyedMs }),
      ...(state.baseImageSha256 === undefined ? {} : { baseImageSha256: state.baseImageSha256 }),
    };
  });

  return { boots, generations: generationWindows, failures };
}

/**
 * Decides whether Field-bound evidence falls inside a recorded, open boot of a
 * generation that existed at the time. Returns the reasons it does not.
 */
export function checkAgainstLifecycle(input: {
  readonly fieldId: string;
  readonly generation: number;
  readonly bootId: string;
  readonly observedAtMs: number;
  readonly lifecycle: LifecycleVerificationResult;
}): string[] {
  const reasons: string[] = [];

  const generation = input.lifecycle.generations.find(
    (candidate) => candidate.fieldId === input.fieldId && candidate.generation === input.generation,
  );
  if (generation === undefined) {
    return [`no Field lifecycle record for ${input.fieldId} generation ${input.generation}`];
  }
  if (input.observedAtMs < generation.createdMs) {
    reasons.push(`evidence predates the creation of ${input.fieldId} generation ${input.generation}`);
  }
  if (generation.destroyedMs !== undefined && input.observedAtMs > generation.destroyedMs) {
    reasons.push(
      `evidence was observed after ${input.fieldId} generation ${input.generation} was destroyed`,
    );
  }

  const boot = input.lifecycle.boots.find(
    (candidate) => candidate.fieldId === input.fieldId
      && candidate.generation === input.generation
      && candidate.bootId === input.bootId,
  );
  if (boot === undefined) {
    reasons.push(`no recorded boot ${input.bootId} for ${input.fieldId} generation ${input.generation}`);
    return reasons;
  }
  if (input.observedAtMs < boot.startedMs) {
    reasons.push(`evidence predates the start of boot ${input.bootId}`);
  }
  if (boot.stoppedMs !== undefined && input.observedAtMs > boot.stoppedMs) {
    reasons.push(`evidence was observed after boot ${input.bootId} ended`);
  }
  return reasons;
}

/** Builds the next lifecycle event, ready to be signed. */
export function nextLifecycleEvent(input: {
  readonly ledger: FieldLifecycleLedger;
  readonly eventId: string;
  readonly fieldId: string;
  readonly generation: number;
  readonly kind: FieldLifecycleEvent["kind"];
  readonly bootId?: string;
  readonly baseImageSha256?: string;
  readonly vmGuid?: string;
  readonly machineId: string;
  readonly recordedAt: string;
  readonly signingKeyId: string;
}): Omit<FieldLifecycleEvent, "signature"> {
  const events = [...input.ledger.events].sort((a, b) => a.sequence - b.sequence);
  const last = events.at(-1);
  return {
    eventId: input.eventId,
    sequence: events.length,
    fieldId: input.fieldId,
    generation: input.generation,
    kind: input.kind,
    ...(input.bootId === undefined ? {} : { bootId: input.bootId }),
    ...(input.baseImageSha256 === undefined ? {} : { baseImageSha256: input.baseImageSha256 }),
    ...(input.vmGuid === undefined ? {} : { vmGuid: input.vmGuid }),
    previousEventHash: last === undefined ? GENESIS_LIFECYCLE_HASH : hashLifecycleEvent(last),
    machineId: input.machineId,
    recordedAt: input.recordedAt,
    signingKeyId: input.signingKeyId,
  };
}
