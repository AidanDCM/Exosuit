import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { verifyCompletionLedger } from "../src/completion/ledger.js";
import {
  completionLedgerSchema,
  evidenceStoreSchema,
  keyRegistrySchema,
  type CompletionEvidence,
  type CompletionLedger,
} from "../src/completion/contracts.js";

/**
 * Gap 1 from the approval-independence audit: an issuer must not approve its own evidence.
 *
 * The rule is bound to signing keys rather than to `issuer` display strings. Both `issuer`
 * fields are operator-chosen free text, so a name comparison would let one actor pick
 * "harness-a" and "reviewer-b" and satisfy the rule while changing nothing. A signing key is
 * the part an actor cannot choose without holding it.
 */

const COMPLETION_ROOT = "docs/qa/completion";

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(`${COMPLETION_ROOT}/${name}.json`, "utf8"));
}

function loadReal() {
  const ledger = completionLedgerSchema.parse(readJson("ledger"));
  const registry = keyRegistrySchema.parse(readJson("keys"));
  const evidence = evidenceStoreSchema.parse(readJson("evidence"));
  return { ledger, registry, evidence };
}

function verify(ledger: CompletionLedger, registry: ReturnType<typeof keyRegistrySchema.parse>, records: readonly CompletionEvidence[]) {
  return verifyCompletionLedger({
    ledger,
    registry,
    validEvidence: new Map(records.map((record) => [record.evidenceId, record])),
    knownTestIds: new Set(ledger.events.map((event) => event.testId)),
    now: "2026-08-11T00:00:00.000Z",
  });
}

const ISSUER_APPROVAL_FAILURE = /may not approve its own evidence/;

describe("evidence-issuer separation", () => {
  it("does not fire on any existing promotion", () => {
    const { ledger, registry, evidence } = loadReal();

    const result = verify(ledger, registry, evidence.records);

    // The rule is additive: it must revoke nothing that has already been promoted.
    expect(result.failures.filter((failure) => ISSUER_APPROVAL_FAILURE.test(failure))).toEqual([]);
  });

  it("holds for every promotion in the ledger, not just the most recent", () => {
    const { ledger, evidence } = loadReal();
    const byId = new Map(evidence.records.map((record) => [record.evidenceId, record]));

    const promotions = ledger.events.filter((event) => event.newStatus === "passed");
    expect(promotions.length).toBeGreaterThan(0);

    for (const promotion of promotions) {
      for (const evidenceId of promotion.evidenceIds) {
        const record = byId.get(evidenceId);
        expect(record, `evidence ${evidenceId} for ${promotion.testId}`).toBeDefined();
        expect(record!.signingKeyId).not.toEqual(promotion.reviewerKeyId);
      }
    }
  });

  it("rejects a promotion whose approval key also signed the cited evidence", () => {
    const { ledger, registry, evidence } = loadReal();

    const promotion = ledger.events.find(
      (event) => event.testId === "CHN-001" && event.newStatus === "passed",
    );
    expect(promotion).toBeDefined();
    const citedId = promotion!.evidenceIds[0]!;
    const cited = evidence.records.find((record) => record.evidenceId === citedId);
    expect(cited).toBeDefined();

    // The approver now holds the very key that produced the evidence being approved.
    const tampered: CompletionLedger = {
      ...ledger,
      events: ledger.events.map((event) =>
        event === promotion ? { ...event, reviewerKeyId: cited!.signingKeyId } : event,
      ),
    };

    const result = verify(tampered, registry, evidence.records);

    expect(result.failures.some((failure) => ISSUER_APPROVAL_FAILURE.test(failure))).toBe(true);
  });

  it("names the offending key and evidence so the reason is actionable", () => {
    const { ledger, registry, evidence } = loadReal();
    const promotion = ledger.events.find(
      (event) => event.testId === "CHN-001" && event.newStatus === "passed",
    )!;
    const citedId = promotion.evidenceIds[0]!;
    const cited = evidence.records.find((record) => record.evidenceId === citedId)!;

    const tampered: CompletionLedger = {
      ...ledger,
      events: ledger.events.map((event) =>
        event === promotion ? { ...event, reviewerKeyId: cited.signingKeyId } : event,
      ),
    };

    const failure = verify(tampered, registry, evidence.records).failures.find((entry) =>
      ISSUER_APPROVAL_FAILURE.test(entry),
    );

    expect(failure).toContain(cited.signingKeyId);
    expect(failure).toContain(citedId);
  });

  it("is not satisfied by merely renaming the issuer", () => {
    const { ledger, registry, evidence } = loadReal();
    const promotion = ledger.events.find(
      (event) => event.testId === "CHN-001" && event.newStatus === "passed",
    )!;
    const citedId = promotion.evidenceIds[0]!;
    const cited = evidence.records.find((record) => record.evidenceId === citedId)!;

    // Same key, cosmetically distinct display names. A name-based rule would pass this.
    const tampered: CompletionLedger = {
      ...ledger,
      events: ledger.events.map((event) =>
        event === promotion
          ? { ...event, reviewerKeyId: cited.signingKeyId, issuer: "harness-a", reviewer: "reviewer-b" }
          : event,
      ),
    };

    const result = verify(tampered, registry, evidence.records);

    expect(result.failures.some((failure) => ISSUER_APPROVAL_FAILURE.test(failure))).toBe(true);
  });
});
