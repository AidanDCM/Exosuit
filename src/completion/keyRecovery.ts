/**
 * Key recovery grants.
 *
 * Removing the automatic DPAPI fallback from the live path leaves a real
 * operational hole: if the TPM is cleared, the machine reimaged, or a vault
 * corrupted, every live key becomes unusable. The DPAPI vaults still hold the
 * material — the point is that reaching them must be a deliberate, recorded act
 * rather than something that happens silently inside a signing call.
 *
 * A grant is an append-only, hash-chained, signed record that:
 *   - names the key and the reason the TPM path was unavailable
 *   - is opened only with an exact typed confirmation from the operator
 *   - permits DPAPI loading for that key while it is open
 *   - blocks live attestation for as long as any grant is open
 *   - is closed only by re-sealing the key to the TPM
 *
 * The grant is signed with the very key it recovers. That is deliberate: it
 * proves the operator actually recovered the key rather than merely claiming a
 * failure, and it leaves the event inside the same trust structure as
 * everything else. It does not, and cannot, prove the TPM failure itself.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../fieldContracts.js";
import { COMPLETION_CONTRACT_VERSION } from "./policy.js";

export const GENESIS_RECOVERY_HASH = "0".repeat(64);

const identifier = z.string().min(1).max(200);
const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

export const keyRecoveryEventSchema = z.object({
  eventId: identifier,
  sequence: z.number().int().nonnegative(),
  previousEventHash: sha256Hex,
  keyId: identifier,
  kind: z.enum(["opened", "closed"]),
  /** Why the TPM path was unavailable. Free text, but required. */
  reason: z.string().min(8).max(500),
  machineId: identifier,
  recordedAt: z.string().datetime(),
  signingKeyId: identifier,
  signature: z.string().min(1).max(400),
}).strict();
export type KeyRecoveryEvent = z.infer<typeof keyRecoveryEventSchema>;

export const keyRecoveryLedgerSchema = z.object({
  contractVersion: z.literal(COMPLETION_CONTRACT_VERSION),
  events: z.array(keyRecoveryEventSchema),
}).strict();
export type KeyRecoveryLedger = z.infer<typeof keyRecoveryLedgerSchema>;

export function hashRecoveryEvent(event: KeyRecoveryEvent): string {
  return createHash("sha256").update(canonicalJson(event)).digest("hex");
}

export const EMPTY_RECOVERY_LEDGER: KeyRecoveryLedger = {
  contractVersion: COMPLETION_CONTRACT_VERSION,
  events: [],
};

export interface RecoveryState {
  /** Key ids with a grant currently open. */
  readonly openKeyIds: readonly string[];
  readonly failures: readonly string[];
}

/**
 * Folds the ledger into the set of currently open grants, verifying the chain
 * as it goes. A malformed ledger fails closed: callers treat any failure as
 * "live attestation is blocked", never as "no grants are open".
 */
export function foldRecoveryLedger(ledger: KeyRecoveryLedger): RecoveryState {
  const failures: string[] = [];
  const open = new Set<string>();
  const events = [...ledger.events].sort((a, b) => a.sequence - b.sequence);

  let previousHash = GENESIS_RECOVERY_HASH;
  let previousRecordedAt = Number.NEGATIVE_INFINITY;
  const seen = new Set<string>();

  for (const [index, event] of events.entries()) {
    const label = `key recovery ${event.eventId}`;
    if (event.sequence !== index) failures.push(`${label}: sequence ${event.sequence} breaks contiguity`);
    if (seen.has(event.eventId)) failures.push(`${label}: duplicate event id`);
    seen.add(event.eventId);
    if (event.previousEventHash !== previousHash) {
      failures.push(`${label}: previousEventHash does not match the preceding event`);
    }
    const recordedAt = Date.parse(event.recordedAt);
    if (Number.isNaN(recordedAt)) failures.push(`${label}: unparseable recordedAt`);
    else if (recordedAt < previousRecordedAt) failures.push(`${label}: recordedAt runs backwards`);
    else previousRecordedAt = recordedAt;

    if (event.kind === "opened") {
      if (open.has(event.keyId)) failures.push(`${label}: ${event.keyId} already has an open grant`);
      open.add(event.keyId);
    } else {
      if (!open.has(event.keyId)) failures.push(`${label}: ${event.keyId} has no open grant to close`);
      open.delete(event.keyId);
    }

    previousHash = hashRecoveryEvent(event);
  }

  return { openKeyIds: [...open].sort(), failures };
}

/** Builds the next event, leaving signing to the caller. */
export function nextRecoveryEvent(input: {
  readonly ledger: KeyRecoveryLedger;
  readonly eventId: string;
  readonly keyId: string;
  readonly kind: "opened" | "closed";
  readonly reason: string;
  readonly machineId: string;
  readonly recordedAt: string;
  readonly signingKeyId: string;
}): Omit<KeyRecoveryEvent, "signature"> {
  const events = [...input.ledger.events].sort((a, b) => a.sequence - b.sequence);
  const last = events.at(-1);
  return {
    eventId: input.eventId,
    sequence: events.length,
    previousEventHash: last === undefined ? GENESIS_RECOVERY_HASH : hashRecoveryEvent(last),
    keyId: input.keyId,
    kind: input.kind,
    reason: input.reason,
    machineId: input.machineId,
    recordedAt: input.recordedAt,
    signingKeyId: input.signingKeyId,
  };
}

/** The exact confirmation the operator must type to open a grant. */
export function recoveryConfirmation(keyId: string): string {
  return `RECOVER KEY ${keyId} WITHOUT TPM`;
}
