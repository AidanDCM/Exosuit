/**
 * Key custody ledger (contract v2.3).
 *
 * TPM enforcement at load time (see `keyProtection.ts`) stops a live signature
 * from being *produced* with a weaker backend. It does not let a verifier, days
 * later and on another machine, tell how a key was protected when a record was
 * signed. Without that, `keyProtectionBackend: tpm` on a record would be an
 * assertion the record makes about itself.
 *
 * So every signing operation appends a custody attestation naming the key and
 * the backend that actually opened it, and the record it produced references
 * that event. The verifier then checks agreement between three independent
 * places — the record, the custody event, and the registry purpose — rather
 * than trusting a field.
 *
 * This is deliberately *not* the recovery ledger. Recovery grants (in
 * `keyRecovery.ts`) record an operator decision to reach past the TPM; custody
 * events record what actually happened on each signing. Keeping them separate
 * means neither file's rules have to bend to accommodate the other.
 *
 * What this does and does not prove: a custody event is signed by the same key
 * whose custody it describes, so it proves the signer held the key and
 * self-reported the backend. It is not a TPM quote and cannot cryptographically
 * prove the private key came out of the TPM. What it does provide is a
 * tamper-evident, append-only account that must agree with the record and the
 * registry, so a downgrade cannot be silent.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../fieldContracts.js";
import { COMPLETION_CONTRACT_VERSION, keyProtectionBackends, registryPurposes } from "./policy.js";

export const GENESIS_CUSTODY_HASH = "0".repeat(64);

const identifier = z.string().min(1).max(200);
const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

export const keyCustodyEventSchema = z.object({
  eventId: identifier,
  sequence: z.number().int().nonnegative(),
  previousEventHash: sha256Hex,
  /** The key whose custody this describes. Must match the record's signingKeyId. */
  keyId: identifier,
  /** The backend that actually opened the key. Computed at load, never asserted. */
  backend: z.enum(keyProtectionBackends),
  /** The purpose of the registry the key was used under. */
  registryPurpose: z.enum(registryPurposes),
  /** Set only when the key was opened under an explicit recovery grant. */
  recoveryGrantId: identifier.optional(),
  machineId: identifier,
  recordedAt: z.string().datetime(),
  signingKeyId: identifier,
  signature: z.string().min(1).max(400),
}).strict();
export type KeyCustodyEvent = z.infer<typeof keyCustodyEventSchema>;

export const keyCustodyLedgerSchema = z.object({
  contractVersion: z.literal(COMPLETION_CONTRACT_VERSION),
  events: z.array(keyCustodyEventSchema),
}).strict();
export type KeyCustodyLedger = z.infer<typeof keyCustodyLedgerSchema>;

export const EMPTY_CUSTODY_LEDGER: KeyCustodyLedger = {
  contractVersion: COMPLETION_CONTRACT_VERSION,
  events: [],
};

export function hashCustodyEvent(event: KeyCustodyEvent): string {
  return createHash("sha256").update(canonicalJson(event)).digest("hex");
}

export interface CustodyVerificationResult {
  /** Verified events by id. Empty when the ledger does not verify. */
  readonly byId: ReadonlyMap<string, KeyCustodyEvent>;
  readonly failures: readonly string[];
}

/**
 * Verifies the custody chain. A malformed ledger yields no usable events, so
 * every record referencing it fails closed rather than being waved through on
 * an unverifiable custody claim.
 */
export function verifyKeyCustodyLedger(ledger: KeyCustodyLedger): CustodyVerificationResult {
  const failures: string[] = [];
  const byId = new Map<string, KeyCustodyEvent>();
  const events = [...ledger.events].sort((a, b) => a.sequence - b.sequence);

  let previousHash = GENESIS_CUSTODY_HASH;
  let previousRecordedAt = Number.NEGATIVE_INFINITY;

  for (const [index, event] of events.entries()) {
    const label = `key custody ${event.eventId}`;

    if (event.sequence !== index) failures.push(`${label}: sequence ${event.sequence} breaks contiguity`);
    if (byId.has(event.eventId)) failures.push(`${label}: duplicate event id`);
    if (event.previousEventHash !== previousHash) {
      failures.push(`${label}: previousEventHash does not match the preceding event`);
    }

    const recordedAt = Date.parse(event.recordedAt);
    if (Number.isNaN(recordedAt)) failures.push(`${label}: unparseable recordedAt`);
    else if (recordedAt < previousRecordedAt) failures.push(`${label}: recordedAt runs backwards`);
    else previousRecordedAt = recordedAt;

    // A custody event describes the custody of the key that signed it. Anything
    // else would let one key vouch for another's protection.
    if (event.signingKeyId !== event.keyId) {
      failures.push(`${label}: signed by ${event.signingKeyId}, which is not the key it describes`);
    }

    // A live registry can only ever have produced a key from the TPM, unless a
    // recovery grant was open and named.
    if (event.registryPurpose === "live" && event.backend !== "tpm" && event.recoveryGrantId === undefined) {
      failures.push(`${label}: live custody claims backend ${event.backend} with no recovery grant`);
    }
    if (event.registryPurpose === "live" && event.backend === "plaintext") {
      failures.push(`${label}: plaintext is never an acceptable live backend`);
    }

    byId.set(event.eventId, event);
    previousHash = hashCustodyEvent(event);
  }

  // Fail closed: an unverifiable chain yields nothing usable.
  if (failures.length > 0) return { byId: new Map(), failures };
  return { byId, failures };
}

/** The custody fields a signed record carries. */
export interface CustodyBinding {
  readonly signingKeyId: string;
  readonly keyProtectionBackend?: string;
  readonly keyCustodyEventId?: string;
  readonly registryPurpose?: string;
  readonly recoveryGrantId?: string;
}

/**
 * Checks a record's custody binding. Shared by the evidence verifier and the
 * ledger verifier so one definition of "this signature is trustworthy for live
 * attestation" governs both.
 *
 * `live` is the caller's judgement (evidence class or ledger context). When it
 * is false the binding is advisory and only internal agreement is checked, so
 * development fixtures and legacy v2.2 records keep working.
 */
export function verifyCustodyBinding(input: {
  readonly record: CustodyBinding;
  readonly live: boolean;
  readonly registryPurpose: (typeof registryPurposes)[number];
  readonly custody: CustodyVerificationResult;
  readonly openRecoveryKeyIds: readonly string[];
}): readonly string[] {
  const { record, live, custody } = input;
  const reasons: string[] = [];

  if (!live) {
    // Not live: if a backend is claimed at all, it must still agree with its
    // custody event. Silence is acceptable; disagreement never is.
    if (record.keyCustodyEventId !== undefined) {
      const event = custody.byId.get(record.keyCustodyEventId);
      if (event === undefined) reasons.push(`custody event ${record.keyCustodyEventId} is not in a verifiable custody ledger`);
      else if (event.keyId !== record.signingKeyId) {
        reasons.push(`custody event ${event.eventId} describes ${event.keyId}, not signing key ${record.signingKeyId}`);
      } else if (record.keyProtectionBackend !== undefined && event.backend !== record.keyProtectionBackend) {
        reasons.push(`record claims backend ${record.keyProtectionBackend} but custody event says ${event.backend}`);
      }
    }
    return reasons;
  }

  // ---- live records ----

  // Missing backend information is a rejection, not a default. This is what
  // makes the schema's optionality safe: omission cannot buy leniency.
  if (record.keyProtectionBackend === undefined) {
    reasons.push("live record does not state keyProtectionBackend");
  } else if (record.keyProtectionBackend !== "tpm") {
    reasons.push(`live record was signed from ${record.keyProtectionBackend}; only tpm is acceptable`);
  }

  if (record.registryPurpose === undefined) {
    reasons.push("live record does not state registryPurpose");
  } else if (record.registryPurpose !== "live") {
    reasons.push(`live record claims registryPurpose ${record.registryPurpose}`);
  }
  if (input.registryPurpose !== "live") {
    reasons.push(`live record verified against a ${input.registryPurpose} registry`);
  }

  // A record signed while its key was under a recovery grant is not live
  // evidence, whatever it claims: the grant exists precisely because the TPM
  // path was unavailable.
  if (record.recoveryGrantId !== undefined) {
    reasons.push(`live record was signed under recovery grant ${record.recoveryGrantId}`);
  }
  if (input.openRecoveryKeyIds.includes(record.signingKeyId)) {
    reasons.push(`live record signed by ${record.signingKeyId}, which has an open recovery grant`);
  }

  if (record.keyCustodyEventId === undefined) {
    reasons.push("live record does not reference a key custody event");
    return reasons;
  }
  const event = custody.byId.get(record.keyCustodyEventId);
  if (event === undefined) {
    reasons.push(`custody event ${record.keyCustodyEventId} is not in a verifiable custody ledger`);
    return reasons;
  }
  // The three-way agreement. A false TPM claim survives only if the record, the
  // custody chain, and the registry all say the same thing.
  if (event.keyId !== record.signingKeyId) {
    reasons.push(`custody event ${event.eventId} describes ${event.keyId}, not signing key ${record.signingKeyId}`);
  }
  if (event.backend !== record.keyProtectionBackend) {
    reasons.push(`record claims backend ${record.keyProtectionBackend} but custody event says ${event.backend}`);
  }
  if (event.backend !== "tpm") {
    reasons.push(`custody event ${event.eventId} records backend ${event.backend} for a live record`);
  }
  if (event.registryPurpose !== "live") {
    reasons.push(`custody event ${event.eventId} was recorded under a ${event.registryPurpose} registry`);
  }
  if (event.recoveryGrantId !== undefined) {
    reasons.push(`custody event ${event.eventId} was recorded under recovery grant ${event.recoveryGrantId}`);
  }

  return reasons;
}

/** Builds the next custody event, leaving signing to the caller. */
export function nextCustodyEvent(input: {
  readonly ledger: KeyCustodyLedger;
  readonly eventId: string;
  readonly keyId: string;
  readonly backend: (typeof keyProtectionBackends)[number];
  readonly registryPurpose: (typeof registryPurposes)[number];
  readonly recoveryGrantId?: string;
  readonly machineId: string;
  readonly recordedAt: string;
}): Omit<KeyCustodyEvent, "signature"> {
  const events = [...input.ledger.events].sort((a, b) => a.sequence - b.sequence);
  const last = events.at(-1);
  return {
    eventId: input.eventId,
    sequence: events.length,
    previousEventHash: last === undefined ? GENESIS_CUSTODY_HASH : hashCustodyEvent(last),
    keyId: input.keyId,
    backend: input.backend,
    registryPurpose: input.registryPurpose,
    ...(input.recoveryGrantId === undefined ? {} : { recoveryGrantId: input.recoveryGrantId }),
    machineId: input.machineId,
    recordedAt: input.recordedAt,
    signingKeyId: input.keyId,
  };
}
