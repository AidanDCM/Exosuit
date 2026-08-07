import { describe, expect, it } from "vitest";
import {
  completionEvidenceSchema,
  completionEvidenceV22Schema,
  completionEvidenceV23Schema,
  completionLedgerEventSchema,
  custodyBindingOf,
  type CompletionEvidence,
} from "../../src/completion/contracts.js";
import { LEGACY_LIVE_RECORD_CUTOFF } from "../../src/completion/policy.js";
import { signRecord } from "../../src/completion/signing.js";
import { createCompletionFixture } from "../support/completionFixture.js";

/**
 * Records are a union of two shapes rather than one shape with optional
 * fields. Under optionality a v2.3 record could omit a custody field and still
 * parse, leaving the verifier as the only thing between a partial record and
 * acceptance. These pin the structural half.
 */

const core = {
  evidenceId: "ev-1",
  boundTestId: "HYP-001",
  evidenceClass: "hyperv_host_guest" as const,
  artifactSha256: "a".repeat(64),
  artifactBytes: 128,
  mediaType: "application/json",
  exactCommit: "b".repeat(40),
  runId: "run-1",
  environment: { machineId: "machine-1", osEdition: "Windows_NT win32", osBuild: "10.0.26200" },
  testDefinitionVersion: "2026.08.04",
  issuer: "harness",
  observedAt: "2026-08-06T12:00:00.000Z",
  nonce: "0123456789abcdef0123456789abcdef",
  designation: "live" as const,
  signingKeyId: "live-host-1",
  signature: "c".repeat(40),
};

const custody = {
  recordVersion: "2.3" as const,
  keyProtectionBackend: "tpm" as const,
  keyCustodyEventId: "custody-1",
  registryPurpose: "live" as const,
  recoveryGrantId: null,
  tpmProofId: "proof-1",
};

describe("record version union", () => {
  it("accepts a complete v2.3 record", () => {
    expect(() => completionEvidenceSchema.parse({ ...core, ...custody })).not.toThrow();
  });

  it("accepts a legacy record with no recordVersion and no custody fields", () => {
    // Every record signed before v2.3 looks like this. Defaulting the field in
    // would change the canonical bytes and invalidate its signature.
    expect(() => completionEvidenceSchema.parse(core)).not.toThrow();
  });

  it("accepts an explicit recordVersion 2.2", () => {
    expect(() => completionEvidenceSchema.parse({ ...core, recordVersion: "2.2" })).not.toThrow();
  });

  it("rejects a v2.3 record missing keyProtectionBackend", () => {
    const { keyProtectionBackend: _omitted, ...partial } = custody;
    expect(() => completionEvidenceSchema.parse({ ...core, ...partial })).toThrow();
  });

  it("rejects a v2.3 record missing keyCustodyEventId", () => {
    const { keyCustodyEventId: _omitted, ...partial } = custody;
    expect(() => completionEvidenceSchema.parse({ ...core, ...partial })).toThrow();
  });

  it("rejects a v2.3 record missing registryPurpose", () => {
    const { registryPurpose: _omitted, ...partial } = custody;
    expect(() => completionEvidenceSchema.parse({ ...core, ...partial })).toThrow();
  });

  it("rejects a v2.3 record that omits recoveryGrantId instead of nulling it", () => {
    // Omission is indistinguishable from a stripped field; null is a fact the
    // signature covers.
    const { recoveryGrantId: _omitted, ...partial } = custody;
    expect(() => completionEvidenceSchema.parse({ ...core, ...partial })).toThrow();
  });

  it("rejects a v2.3 record that omits tpmProofId instead of nulling it", () => {
    const { tpmProofId: _omitted, ...partial } = custody;
    expect(() => completionEvidenceSchema.parse({ ...core, ...partial })).toThrow();
  });

  it("accepts an explicit null tpmProofId for a synthetic record", () => {
    expect(() => completionEvidenceSchema.parse({
      ...core, ...custody, designation: "synthetic", tpmProofId: null,
    })).not.toThrow();
  });

  it("rejects a legacy-shaped record that smuggles custody fields", () => {
    // No recordVersion, but custody present: fails 2.3 (no discriminator) and
    // fails 2.2 (strict rejects the extra keys).
    expect(() => completionEvidenceSchema.parse({
      ...core, keyProtectionBackend: "tpm", keyCustodyEventId: "custody-1",
    })).toThrow();
  });

  it("rejects an unknown record version", () => {
    expect(() => completionEvidenceSchema.parse({ ...core, recordVersion: "2.4" })).toThrow();
  });

  it("rejects custody fields on the explicit 2.2 shape", () => {
    expect(() => completionEvidenceV22Schema.parse({ ...core, ...custody })).toThrow();
  });

  it("requires the discriminator on the 2.3 shape", () => {
    const { recordVersion: _omitted, ...partial } = custody;
    expect(() => completionEvidenceV23Schema.parse({ ...core, ...partial })).toThrow();
  });

  it("applies the same union to ledger events", () => {
    const event = {
      eventId: "ev-1",
      sequence: 0,
      testId: "HYP-001",
      previousStatus: "ready_for_live" as const,
      newStatus: "passed" as const,
      previousEventHash: "0".repeat(64),
      exactCommit: "b".repeat(40),
      evidenceIds: [],
      issuer: "harness",
      reason: "promotion",
      recordedAt: "2026-08-06T12:00:00.000Z",
      signingKeyId: "live-ledger-1",
      signature: "c".repeat(40),
    };
    expect(() => completionLedgerEventSchema.parse(event)).not.toThrow();
    expect(() => completionLedgerEventSchema.parse({ ...event, ...custody })).not.toThrow();
    const { recoveryGrantId: _omitted, ...partial } = custody;
    expect(() => completionLedgerEventSchema.parse({ ...event, ...partial })).toThrow();
  });
});

describe("custodyBindingOf", () => {
  it("reports 2.2 for a legacy record and exposes no custody fields", () => {
    const binding = custodyBindingOf(completionEvidenceSchema.parse(core) as CompletionEvidence);
    expect(binding.recordVersion).toBe("2.2");
    expect(binding.keyProtectionBackend).toBeUndefined();
    expect(binding.tpmProofId).toBeUndefined();
  });

  it("normalises an explicit null grant to an absent field", () => {
    const binding = custodyBindingOf(
      completionEvidenceSchema.parse({ ...core, ...custody }) as CompletionEvidence,
    );
    expect(binding.recordVersion).toBe("2.3");
    expect(binding.keyProtectionBackend).toBe("tpm");
    expect(binding.recoveryGrantId).toBeUndefined();
    expect(binding.tpmProofId).toBe("proof-1");
  });
});

describe("migration cutoff", () => {
  it("is a parseable instant", () => {
    expect(Number.isNaN(Date.parse(LEGACY_LIVE_RECORD_CUTOFF))).toBe(false);
  });

  it("is not in the far past, so existing live evidence is not retroactively voided", () => {
    // The cutoff exists to stop NEW legacy live records, not to invalidate the
    // recorded M0.5 attestation.
    expect(Date.parse(LEGACY_LIVE_RECORD_CUTOFF)).toBeGreaterThan(Date.parse("2026-08-05T00:00:00.000Z"));
  });
});

describe("cutoff enforcement in the verifier", () => {
  /**
   * Re-signed rather than merely stripped. A mutated record would fail on its
   * signature and score green for the wrong reason — the M0.5 lesson — so the
   * legacy record here is genuinely valid apart from its shape.
   */
  function legacyLiveStore(observedAt: string) {
    const fixture = createCompletionFixture();
    fixture.addLifecycle({ fieldId: "field-fixture-1", generation: 1, kind: "created" });
    fixture.addLifecycle({ fieldId: "field-fixture-1", generation: 1, kind: "booted", bootId: "boot-fixture-1" });
    const live = fixture.addEvidence({ testId: "HYP-001", observedAt });

    const { recordVersion, keyProtectionBackend, keyCustodyEventId, registryPurpose,
      recoveryGrantId, tpmProofId, signature, ...legacyCore } = live as Record<string, unknown>;
    const relegated = {
      ...legacyCore,
      signature: signRecord(legacyCore, fixture.secrets[String(legacyCore["signingKeyId"])]!),
    } as CompletionEvidence;

    fixture.evidence = { contractVersion: 2, records: [relegated] };
    return fixture;
  }

  it("rejects a new legacy-shaped live record observed after the cutoff", () => {
    const after = new Date(Date.parse(LEGACY_LIVE_RECORD_CUTOFF) + 86_400_000).toISOString();
    const failures = legacyLiveStore(after).evaluate().integrityFailures.join(" | ");
    expect(failures).toContain("after the 2026-08-07T00:00:00.000Z migration cutoff");
  });

  it("still accepts the legacy shape for a live record observed before the cutoff", () => {
    const before = new Date(Date.parse(LEGACY_LIVE_RECORD_CUTOFF) - 86_400_000).toISOString();
    const failures = legacyLiveStore(before).evaluate().integrityFailures.join(" | ");
    // Existing attestations must not be voided by the cutoff.
    expect(failures).not.toContain("migration cutoff");
  });
});
