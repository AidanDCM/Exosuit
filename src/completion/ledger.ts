/**
 * The append-only transition ledger.
 *
 * Authoritative gate status is folded from this chain, never read from a
 * mutable field. Every event names the hash of its predecessor, so removing or
 * rewriting an earlier failure breaks every event after it. Transitions are
 * constrained, so a gate cannot jump from `planned` to `passed`, and a failure
 * can only be cleared by an explicit, signed, reviewed remediation.
 */

import { createHash } from "node:crypto";
import { canonicalJson } from "../fieldContracts.js";
import { isTransitionAllowed, requiredApprovalRole, type CompletionStatus } from "./policy.js";
import { verifyRecordSignature, verifyReviewerSignature } from "./signing.js";
import type { ApprovalRole } from "./policy.js";
import type {
  CompletionEvidence,
  CompletionLedger,
  CompletionLedgerEvent,
  CompletionLedgerEventV22,
  KeyRegistry,
} from "./contracts.js";

export const GENESIS_EVENT_HASH = "0".repeat(64);

export function hashLedgerEvent(event: CompletionLedgerEvent): string {
  return createHash("sha256").update(canonicalJson(event)).digest("hex");
}

export interface LedgerVerificationRequest {
  readonly ledger: CompletionLedger;
  readonly registry: KeyRegistry;
  /** Evidence that already passed store verification, keyed by evidence id. */
  readonly validEvidence: ReadonlyMap<string, CompletionEvidence>;
  readonly knownTestIds: ReadonlySet<string>;
  readonly now: string;
}

export interface LedgerVerificationResult {
  /** Folded status per test id. Tests with no accepted events are `planned`. */
  readonly statuses: ReadonlyMap<string, CompletionStatus>;
  /** Evidence ids cited by the event that most recently set each test's status. */
  readonly citedEvidence: ReadonlyMap<string, readonly string[]>;
  readonly failures: readonly string[];
}

export function verifyCompletionLedger(request: LedgerVerificationRequest): LedgerVerificationResult {
  const failures: string[] = [];
  const statuses = new Map<string, CompletionStatus>();
  const citedEvidence = new Map<string, readonly string[]>();

  const events = [...request.ledger.events].sort((left, right) => left.sequence - right.sequence);
  const seenEventIds = new Set<string>();
  let previousHash = GENESIS_EVENT_HASH;
  let previousRecordedAt = Number.NEGATIVE_INFINITY;

  for (const [index, event] of events.entries()) {
    const label = `ledger event ${event.eventId}`;

    if (event.sequence !== index) {
      failures.push(`${label}: sequence ${event.sequence} breaks contiguity at position ${index}`);
    }
    if (seenEventIds.has(event.eventId)) {
      failures.push(`${label}: duplicate event id`);
    }
    seenEventIds.add(event.eventId);

    // ---- chain integrity: a rewritten or dropped predecessor is detected here ----
    if (event.previousEventHash !== previousHash) {
      failures.push(
        `${label}: previousEventHash does not match the preceding event (chain broken or an event was removed)`,
      );
    }

    // ---- clock must not run backwards ----
    const recordedAt = Date.parse(event.recordedAt);
    if (Number.isNaN(recordedAt)) {
      failures.push(`${label}: unparseable recordedAt`);
    } else if (recordedAt < previousRecordedAt) {
      failures.push(`${label}: recordedAt runs backwards relative to the previous event`);
    } else {
      previousRecordedAt = recordedAt;
    }

    if (!request.knownTestIds.has(event.testId)) {
      failures.push(`${label}: references unknown test ${event.testId}`);
    }

    // ---- the declared starting point must match the folded state ----
    const current = statuses.get(event.testId) ?? "planned";
    if (event.previousStatus !== current) {
      failures.push(
        `${label}: declares previous status ${event.previousStatus} but ${event.testId} is ${current}`,
      );
    } else if (!isTransitionAllowed(event.previousStatus, event.newStatus)) {
      failures.push(
        `${label}: ${event.previousStatus} -> ${event.newStatus} is not a permitted transition`,
      );
    }

    // ---- promotion to passed demands evidence and a distinct reviewer ----
    if (event.newStatus === "passed") {
      if (event.evidenceIds.length === 0) {
        failures.push(`${label}: promotion to passed cites no evidence`);
      }
      if (event.reviewer === undefined) {
        failures.push(`${label}: promotion to passed requires an explicit reviewer`);
      } else if (event.reviewer === event.issuer) {
        failures.push(`${label}: reviewer and issuer must be different principals`);
      }
      // Engineering review, owner acceptance, and release approval are distinct
      // authorities; the gate decides which one it demands.
      const required = requiredApprovalRole(event.testId);
      if (event.reviewerRole === undefined) {
        failures.push(`${label}: promotion to passed requires reviewerRole ${required}`);
      } else if (event.reviewerRole !== required) {
        failures.push(
          `${label}: gate ${event.testId} requires ${required} but the transition claims ${event.reviewerRole}`,
        );
      }

      // ---- the approval must be independently signed ----
      // Without this, whoever holds the ledger key could name any reviewer and
      // claim any authority. The approval key is held by a person and must be
      // a different key from the one sealing the event.
      if (event.reviewerKeyId === undefined || event.reviewerSignature === undefined) {
        failures.push(
          `${label}: promotion to passed requires an independent reviewer signature (reviewerKeyId and reviewerSignature)`,
        );
      } else if (event.reviewerKeyId === event.signingKeyId) {
        failures.push(
          `${label}: the approval key must not be the key that seals the transition`,
        );
      } else if (event.reviewerRole !== undefined) {
        failures.push(...verifyReviewerSignature(
          { ...event, reviewerSignature: event.reviewerSignature },
          {
            registry: request.registry,
            keyId: event.reviewerKeyId,
            role: event.reviewerRole,
            signedAt: event.recordedAt,
          },
        ).map((reason) => `${label}: ${reason}`));
      }
    }

    // ---- cited evidence must be valid and bound to this very test ----
    for (const evidenceId of event.evidenceIds) {
      const record = request.validEvidence.get(evidenceId);
      if (record === undefined) {
        failures.push(`${label}: cites evidence ${evidenceId} that is missing or failed verification`);
        continue;
      }
      if (record.boundTestId !== event.testId) {
        failures.push(
          `${label}: cites evidence ${evidenceId} bound to ${record.boundTestId}, not ${event.testId}`,
        );
      }
      if (Date.parse(record.observedAt) > recordedAt) {
        failures.push(`${label}: cites evidence observed after the transition was recorded`);
      }

      // ---- the approver must not be the producer of the evidence ----
      // Bound to keys, not to names. `issuer` on both records is operator-chosen free
      // text, so comparing display strings would let one actor pick "harness-a" and
      // "reviewer-b" and satisfy the rule while changing nothing. The signing key is the
      // part an actor cannot choose without holding it.
      if (event.reviewerKeyId !== undefined && record.signingKeyId === event.reviewerKeyId) {
        failures.push(
          `${label}: approval key ${event.reviewerKeyId} also signed cited evidence ${evidenceId}; `
          + `an issuer may not approve its own evidence`,
        );
      }
    }

    failures.push(...verifyRecordSignature(event, {
      registry: request.registry,
      keyId: event.signingKeyId,
      role: "ledger",
      signedAt: event.recordedAt,
    }).map((reason) => `${label}: ${reason}`));

    previousHash = hashLedgerEvent(event);

    // The fold advances optimistically; any failure above is surfaced to the
    // evaluator, which refuses to treat the result as authoritative.
    statuses.set(event.testId, event.newStatus);
    citedEvidence.set(event.testId, event.evidenceIds);
  }

  return { statuses, citedEvidence, failures };
}

/** Builds the next event for a test, ready to be signed. */
export function nextLedgerEvent(input: {
  readonly ledger: CompletionLedger;
  readonly eventId: string;
  readonly testId: string;
  readonly previousStatus: CompletionStatus;
  readonly newStatus: CompletionStatus;
  readonly exactCommit: string;
  readonly evidenceIds: readonly string[];
  readonly issuer: string;
  readonly reviewer?: string;
  readonly reviewerRole?: ApprovalRole;
  readonly reviewerKeyId?: string;
  readonly reason: string;
  readonly recordedAt: string;
  readonly signingKeyId: string;
// Returns the legacy shape: this builds the event body, and a caller that has
// custody information spreads it on top to make a v2.3 record. Omit<> over the
// union would widen `recordVersion` and lose that distinction.
}): Omit<CompletionLedgerEventV22, "signature" | "reviewerSignature"> {
  const events = [...input.ledger.events].sort((left, right) => left.sequence - right.sequence);
  const last = events.at(-1);
  return {
    eventId: input.eventId,
    sequence: events.length,
    testId: input.testId,
    previousStatus: input.previousStatus,
    newStatus: input.newStatus,
    previousEventHash: last === undefined ? GENESIS_EVENT_HASH : hashLedgerEvent(last),
    exactCommit: input.exactCommit,
    evidenceIds: [...input.evidenceIds],
    issuer: input.issuer,
    ...(input.reviewer === undefined ? {} : { reviewer: input.reviewer }),
    ...(input.reviewerRole === undefined ? {} : { reviewerRole: input.reviewerRole }),
    ...(input.reviewerKeyId === undefined ? {} : { reviewerKeyId: input.reviewerKeyId }),
    reason: input.reason,
    recordedAt: input.recordedAt,
    signingKeyId: input.signingKeyId,
  };
}
