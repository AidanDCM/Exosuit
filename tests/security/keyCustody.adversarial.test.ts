import { describe, expect, it } from "vitest";
import {
  hashCustodyEvent,
  verifyCustodyBinding,
  verifyKeyCustodyLedger,
  GENESIS_CUSTODY_HASH,
  type KeyCustodyEvent,
  type KeyCustodyLedger,
} from "../../src/completion/keyCustody.js";

/**
 * Contract v2.3. TPM enforcement at load stops a weaker backend from *producing*
 * a live signature; these cover the other half — a verifier, later and
 * elsewhere, being able to tell how the key was protected rather than taking
 * the record's word for it.
 */

const KEY = "live-host-1";
const OTHER_KEY = "live-evidence-1";

function event(overrides: Partial<KeyCustodyEvent> = {}): KeyCustodyEvent {
  return {
    eventId: "custody-1",
    sequence: 0,
    previousEventHash: GENESIS_CUSTODY_HASH,
    keyId: KEY,
    backend: "tpm",
    registryPurpose: "live",
    machineId: "machine-9c62d678dd970f15",
    recordedAt: "2026-08-06T12:00:00.000Z",
    signingKeyId: KEY,
    signature: "sig",
    ...overrides,
  };
}

function ledger(events: readonly KeyCustodyEvent[]): KeyCustodyLedger {
  return { contractVersion: 2, events: [...events] };
}

const goodCustody = verifyKeyCustodyLedger(ledger([event()]));

function binding(overrides: Record<string, unknown> = {}) {
  return {
    signingKeyId: KEY,
    keyProtectionBackend: "tpm",
    keyCustodyEventId: "custody-1",
    registryPurpose: "live",
    ...overrides,
  };
}

function check(record: Record<string, unknown>, opts: {
  custody?: typeof goodCustody;
  openRecoveryKeyIds?: readonly string[];
  registryPurpose?: "live" | "development";
  live?: boolean;
} = {}) {
  return verifyCustodyBinding({
    record: record as never,
    live: opts.live ?? true,
    registryPurpose: opts.registryPurpose ?? "live",
    custody: opts.custody ?? goodCustody,
    openRecoveryKeyIds: opts.openRecoveryKeyIds ?? [],
  });
}

describe("custody ledger verification", () => {
  it("accepts a well-formed chain", () => {
    expect(goodCustody.failures).toEqual([]);
    expect(goodCustody.byId.get("custody-1")?.backend).toBe("tpm");
  });

  it("rejects an event signed by a key other than the one it describes", () => {
    const result = verifyKeyCustodyLedger(ledger([event({ signingKeyId: OTHER_KEY })]));
    expect(result.failures.some((f) => f.includes("not the key it describes"))).toBe(true);
  });

  it("rejects a live custody event claiming a non-TPM backend with no grant", () => {
    const result = verifyKeyCustodyLedger(ledger([event({ backend: "dpapi" })]));
    expect(result.failures.some((f) => f.includes("no recovery grant"))).toBe(true);
  });

  it("rejects plaintext as a live backend even under a grant", () => {
    const result = verifyKeyCustodyLedger(
      ledger([event({ backend: "plaintext", recoveryGrantId: "grant-1" })]),
    );
    expect(result.failures.some((f) => f.includes("plaintext is never"))).toBe(true);
  });

  it("fails closed: a broken chain yields no usable events", () => {
    const result = verifyKeyCustodyLedger(ledger([event({ previousEventHash: "f".repeat(64) })]));
    expect(result.failures.length).toBeGreaterThan(0);
    // The important part: nothing survives to be referenced by a record.
    expect(result.byId.size).toBe(0);
  });

  it("rejects a duplicate event id", () => {
    const first = event();
    const second = event({
      eventId: "custody-1",
      sequence: 1,
      previousEventHash: hashCustodyEvent(first),
      recordedAt: "2026-08-06T12:00:01.000Z",
    });
    expect(verifyKeyCustodyLedger(ledger([first, second])).failures
      .some((f) => f.includes("duplicate event id"))).toBe(true);
  });

  it("rejects recordedAt running backwards", () => {
    const first = event();
    const second = event({
      eventId: "custody-2",
      sequence: 1,
      previousEventHash: hashCustodyEvent(first),
      recordedAt: "2026-08-06T11:00:00.000Z",
    });
    expect(verifyKeyCustodyLedger(ledger([first, second])).failures
      .some((f) => f.includes("runs backwards"))).toBe(true);
  });
});

describe("live record custody binding", () => {
  it("6. accepts a live record that records keyProtectionBackend: tpm", () => {
    expect(check(binding())).toEqual([]);
  });

  it("7. rejects a false TPM claim when custody says another backend was used", () => {
    // The record asserts tpm; the independent chain says dpapi. This is the
    // case the whole v2.3 change exists for.
    const custody = verifyKeyCustodyLedger(
      ledger([event({ backend: "dpapi", recoveryGrantId: "grant-1" })]),
    );
    const reasons = check(binding(), { custody });
    expect(reasons.some((r) => r.includes("custody event says dpapi"))).toBe(true);
  });

  it("rejects missing backend information rather than defaulting", () => {
    const reasons = check(binding({ keyProtectionBackend: undefined }));
    expect(reasons).toContain("live record does not state keyProtectionBackend");
  });

  it("rejects a missing custody reference", () => {
    const reasons = check(binding({ keyCustodyEventId: undefined }));
    expect(reasons).toContain("live record does not reference a key custody event");
  });

  it("rejects a missing registryPurpose", () => {
    const reasons = check(binding({ registryPurpose: undefined }));
    expect(reasons).toContain("live record does not state registryPurpose");
  });

  it("rejects a live signature generated from DPAPI", () => {
    const custody = verifyKeyCustodyLedger(
      ledger([event({ backend: "dpapi", recoveryGrantId: "grant-1" })]),
    );
    const reasons = check(binding({ keyProtectionBackend: "dpapi" }), { custody });
    expect(reasons.some((r) => r.includes("only tpm is acceptable"))).toBe(true);
  });

  it("rejects a live signature generated from plaintext", () => {
    const reasons = check(binding({ keyProtectionBackend: "plaintext" }));
    expect(reasons.some((r) => r.includes("only tpm is acceptable"))).toBe(true);
  });

  it("rejects a record whose custody event describes a different key", () => {
    const custody = verifyKeyCustodyLedger(ledger([event({ keyId: OTHER_KEY, signingKeyId: OTHER_KEY })]));
    const reasons = check(binding(), { custody });
    expect(reasons.some((r) => r.includes(`describes ${OTHER_KEY}, not signing key ${KEY}`))).toBe(true);
  });

  it("rejects a record signed while its key had an open recovery grant", () => {
    const reasons = check(binding(), { openRecoveryKeyIds: [KEY] });
    expect(reasons.some((r) => r.includes("has an open recovery grant"))).toBe(true);
  });

  it("rejects a live record that names a recovery grant of its own", () => {
    const reasons = check(binding({ recoveryGrantId: "grant-1" }));
    expect(reasons.some((r) => r.includes("signed under recovery grant"))).toBe(true);
  });

  it("rejects a live record verified against a development registry", () => {
    const reasons = check(binding(), { registryPurpose: "development" });
    expect(reasons.some((r) => r.includes("verified against a development registry"))).toBe(true);
  });

  it("rejects a live record when no custody ledger was supplied at all", () => {
    const reasons = check(binding(), {
      custody: { byId: new Map(), failures: ["no key custody ledger supplied"] },
    });
    expect(reasons.some((r) => r.includes("not in a verifiable custody ledger"))).toBe(true);
  });

  it("rejects a live record referencing a custody event from a broken chain", () => {
    const custody = verifyKeyCustodyLedger(ledger([event({ previousEventHash: "f".repeat(64) })]));
    const reasons = check(binding(), { custody });
    expect(reasons.some((r) => r.includes("not in a verifiable custody ledger"))).toBe(true);
  });
});

describe("non-live records keep working", () => {
  it("accepts a v2.2 record carrying no custody fields at all", () => {
    // Legacy records predate v2.3. Making the fields structurally required
    // would have forced a re-attestation of unrelated M0 evidence.
    expect(check({ signingKeyId: KEY }, { live: false })).toEqual([]);
  });

  it("still rejects a non-live record that disagrees with its custody event", () => {
    const custody = verifyKeyCustodyLedger(
      ledger([event({ backend: "dpapi", registryPurpose: "development" })]),
    );
    const reasons = check(
      { signingKeyId: KEY, keyProtectionBackend: "tpm", keyCustodyEventId: "custody-1" },
      { live: false, custody, registryPurpose: "development" },
    );
    expect(reasons.some((r) => r.includes("custody event says dpapi"))).toBe(true);
  });

  it("accepts a development record that legitimately used DPAPI", () => {
    const custody = verifyKeyCustodyLedger(
      ledger([event({ backend: "dpapi", registryPurpose: "development" })]),
    );
    const reasons = check(
      { signingKeyId: KEY, keyProtectionBackend: "dpapi", keyCustodyEventId: "custody-1" },
      { live: false, custody, registryPurpose: "development" },
    );
    expect(reasons).toEqual([]);
  });
});
