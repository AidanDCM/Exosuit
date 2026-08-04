/**
 * M0.5 live-attestation negative suite (contract v2.1).
 *
 * These are the attacks the live smoke test must reject before M1 may begin.
 * They run against fixtures here so the verifier is proven correct before it
 * meets the real host; the same list is executed against genuine host-bound
 * evidence during M0.5 itself.
 *
 * If any case here starts passing, repair the contract before starting M1.
 */

import { describe, expect, it } from "vitest";
import {
  evaluateBuildCompletion,
  requiredApprovalRole,
  signRecord,
  type BuildCompletionEvaluation,
  type KeyRevocation,
} from "../../src/completion/index.js";
import { artifactSourceFromMap } from "../../src/completion/evidence.js";
import { createCompletionFixture, MACHINE_ID } from "../support/completionFixture.js";

const LIVE_GATE = "HYP-001";

function allFailures(result: BuildCompletionEvaluation): string {
  return [...result.integrityFailures, ...result.gates.flatMap((gate) => gate.failures)].join(" | ");
}

function provenLiveGate(result: BuildCompletionEvaluation): boolean {
  return result.gates.find((gate) => gate.testId === LIVE_GATE)?.proven === true;
}

describe("M0.5 — the live attestation path succeeds when honest", () => {
  it("proves a host-bound live gate under a live registry", () => {
    const fixture = createCompletionFixture();
    for (const testId of ["SRC-001", "SRC-002", "SRC-003"]) fixture.promote(testId);
    fixture.promote(LIVE_GATE);
    const result = fixture.evaluate("personal_mvp");
    expect(result.integrityFailures).toEqual([]);
    expect(provenLiveGate(result)).toBe(true);
    expect(result.metrics.liveCompletionPercent).toBeGreaterThan(0);
  });

  it("survives re-verification in a fresh evaluation (restart equivalence)", () => {
    const fixture = createCompletionFixture();
    for (const testId of ["SRC-001", "SRC-002", "SRC-003"]) fixture.promote(testId);
    fixture.promote(LIVE_GATE);
    const first = fixture.evaluate("personal_mvp");
    // Re-evaluate from the same persisted state, later, as after a reboot.
    const second = fixture.evaluate("personal_mvp", "2026-08-05T09:00:00.000Z");
    expect(second.integrityFailures).toEqual([]);
    expect(provenLiveGate(second)).toBe(true);
    expect(second.metrics.provenCompletionPercent).toBe(first.metrics.provenCompletionPercent);
  });
});

describe("M0.5 — required negative cases", () => {
  function liveFixture() {
    const fixture = createCompletionFixture();
    for (const testId of ["SRC-001", "SRC-002", "SRC-003"]) fixture.promote(testId);
    return fixture;
  }

  it("rejects modified artifact bytes", () => {
    const fixture = liveFixture();
    const record = fixture.promote(LIVE_GATE);
    fixture.artifacts.set(record.artifactSha256, Buffer.from("tampered host output", "utf8"));
    const result = fixture.evaluate("personal_mvp");
    expect(allFailures(result)).toMatch(/artifact hash mismatch/);
    expect(provenLiveGate(result)).toBe(false);
  });

  it("rejects a missing artifact", () => {
    const fixture = liveFixture();
    fixture.promote(LIVE_GATE, { storeArtifact: false });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/not present in the evidence store/);
  });

  it("rejects a reused nonce", () => {
    const fixture = liveFixture();
    const nonce = "b".repeat(32);
    fixture.promote(LIVE_GATE, { nonce });
    fixture.promote("CHN-001", { nonce });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/nonce replayed from evidence/);
  });

  it("rejects a reused evidence id", () => {
    const fixture = liveFixture();
    fixture.promote(LIVE_GATE, { evidenceId: "live-shared" });
    fixture.promote("CHN-001", { evidenceId: "live-shared" });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/duplicate evidence id live-shared/);
  });

  it("rejects evidence from the wrong machine", () => {
    const fixture = liveFixture();
    fixture.promote(LIVE_GATE, { machineId: "machine-not-the-laptop" });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/host-bound key k-host belongs to machine .* but the record names machine-not-the-laptop/);
  });

  it("rejects evidence copied to another machine wholesale", () => {
    const fixture = liveFixture();
    const record = fixture.promote(LIVE_GATE);
    // Same signed bytes, replayed under a different host identity. The signature
    // covers machineId, so the copy cannot be re-pointed without invalidating it.
    const copied = {
      ...record,
      environment: { ...record.environment, machineId: "machine-attacker" },
    };
    fixture.evidence = { contractVersion: 2, records: [copied] };
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/signature does not verify|belongs to machine/);
  });

  it("rejects evidence naming the wrong Windows build", () => {
    const fixture = liveFixture();
    const record = fixture.promote(LIVE_GATE);
    const altered = { ...record, environment: { ...record.environment, osBuild: "10.0.19045" } };
    fixture.evidence = { contractVersion: 2, records: [altered] };
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/signature does not verify/);
  });

  it("rejects evidence recorded against the wrong source commit", () => {
    const fixture = liveFixture();
    fixture.promote(LIVE_GATE, { exactCommit: "e".repeat(40) });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/is not the baseline commit/);
  });

  it("rejects a Field generation edited after signing", () => {
    const fixture = liveFixture();
    const record = fixture.promote(LIVE_GATE);
    const replayed = {
      ...record,
      environment: { ...record.environment, fieldGeneration: 99 },
    };
    fixture.evidence = { contractVersion: 2, records: [replayed] };
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/signature does not verify/);
  });

  it("rejects a guest boot id edited after signing", () => {
    const fixture = liveFixture();
    const record = fixture.promote(LIVE_GATE);
    const replayed = {
      ...record,
      environment: { ...record.environment, fieldBootId: "boot-someone-else" },
    };
    fixture.evidence = { contractVersion: 2, records: [replayed] };
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/signature does not verify/);
  });

  it("rejects Field-bound evidence with no generation at all", () => {
    const fixture = liveFixture();
    const record = fixture.addEvidence({ testId: LIVE_GATE });
    const stripped = {
      ...record,
      environment: {
        machineId: MACHINE_ID,
        osEdition: record.environment.osEdition,
        osBuild: record.environment.osBuild,
      },
    };
    fixture.evidence = { contractVersion: 2, records: [stripped] };
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/must name fieldId, fieldGeneration, and fieldBootId|signature does not verify/);
  });

  it("rejects future-dated live evidence", () => {
    const fixture = liveFixture();
    fixture.promote(LIVE_GATE, { observedAt: "2099-01-01T00:00:00.000Z" });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/dated in the future/);
  });

  it("rejects expired live evidence", () => {
    const fixture = liveFixture();
    fixture.promote(LIVE_GATE);
    // hyperv_host_guest evidence expires after 90 days.
    const result = fixture.evaluate("personal_mvp", "2027-01-01T00:00:00.000Z");
    expect(allFailures(result)).toMatch(/freshness window/);
  });

  it("rejects a revoked host key via a root-signed revocation", () => {
    const fixture = liveFixture();
    fixture.promote(LIVE_GATE);
    const revocationCore = {
      keyId: "k-host",
      revokedAt: "2026-08-05T00:00:00.000Z",
      reason: "laptop lost",
      rootKeyId: "fixture-root",
    };
    const revocation: KeyRevocation = {
      ...revocationCore,
      signature: signRecord(revocationCore, fixture.rootPem),
    };
    fixture.registry = fixture.sealRegistry({ keys: fixture.registry.keys, revocations: [revocation] });
    const result = fixture.evaluate("personal_mvp");
    expect(allFailures(result)).toMatch(/k-host is revoked \(laptop lost\)/);
    expect(provenLiveGate(result)).toBe(false);
  });

  it("rejects a development-registry key presented as live", () => {
    const fixture = liveFixture();
    fixture.promote(LIVE_GATE);
    fixture.registry = fixture.sealRegistry({
      keys: fixture.registry.keys,
      purpose: "development",
    });
    const result = fixture.evaluate("personal_mvp");
    expect(allFailures(result))
      .toMatch(/has purpose development; live evidence cannot be attested by it/);
    expect(provenLiveGate(result)).toBe(false);
  });

  it("rejects the issuer also acting as reviewer on a live gate", () => {
    const fixture = liveFixture();
    const record = fixture.addEvidence({ testId: LIVE_GATE });
    fixture.addTransition({ testId: LIVE_GATE, from: "planned", to: "source_validated" });
    fixture.addTransition({ testId: LIVE_GATE, from: "source_validated", to: "ready_for_live" });
    fixture.addTransition({
      testId: LIVE_GATE,
      from: "ready_for_live",
      to: "passed",
      evidenceIds: [record.evidenceId],
      issuer: "one-person",
      reviewer: "one-person",
      reviewerRole: "technical_review",
    });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/reviewer and issuer must be different principals/);
  });

  it("rejects a registry edited without the offline root signature", () => {
    const fixture = liveFixture();
    fixture.promote(LIVE_GATE);
    // Add a key the attacker controls, keeping the old envelope signature.
    fixture.registry = {
      ...fixture.registry,
      keys: [...fixture.registry.keys, {
        keyId: "k-attacker",
        algorithm: "ed25519",
        publicKey: fixture.registry.keys[0]!.publicKey,
        roles: ["host"],
        machineId: MACHINE_ID,
        notBefore: "2026-01-01T00:00:00.000Z",
        notAfter: "2027-01-01T00:00:00.000Z",
      }],
    };
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/registry envelope signature does not verify against the root key/);
  });

  it("rejects a registry sealed by an unpinned root key", () => {
    const fixture = liveFixture();
    fixture.promote(LIVE_GATE);
    // Valid self-consistent envelope, but the evaluator pins a different root.
    const result = fixture.evaluate("personal_mvp");
    expect(result.integrityFailures).toEqual([]);

    const rogue = createCompletionFixture();
    rogue.promote("SRC-001");
    const rogueResult = evaluateWithForeignPin(rogue, fixture.rootFingerprint);
    expect(rogueResult).toMatch(/is not pinned/);
  });

  it("rejects replay of a whole ledger after restart with a rewritten tail", () => {
    const fixture = liveFixture();
    fixture.promote(LIVE_GATE);
    // Drop the promoting event and re-append it out of order, as a crash-replay
    // might; contiguity and the hash chain both catch it.
    const events = fixture.ledger.events;
    fixture.ledger = {
      contractVersion: 2,
      events: [...events.slice(0, -1), { ...events.at(-1)!, sequence: events.length + 5 }],
    };
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/breaks contiguity|chain broken/);
  });

  it("requires owner acceptance, not engineering review, on owner gates", () => {
    expect(requiredApprovalRole("OWN-001")).toBe("owner_acceptance");
    expect(requiredApprovalRole("HYP-001")).toBe("technical_review");
    expect(requiredApprovalRole("REL-001")).toBe("release_approval");

    const fixture = liveFixture();
    const record = fixture.addEvidence({ testId: "OWN-001" });
    fixture.addTransition({ testId: "OWN-001", from: "planned", to: "source_validated" });
    fixture.addTransition({ testId: "OWN-001", from: "source_validated", to: "ready_for_live" });
    fixture.addTransition({
      testId: "OWN-001",
      from: "ready_for_live",
      to: "passed",
      evidenceIds: [record.evidenceId],
      issuer: "engineer",
      reviewer: "another-engineer",
      reviewerRole: "technical_review",
    });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/gate OWN-001 requires owner_acceptance but the transition claims technical_review/);
  });
});

/** Evaluates a fixture against someone else's pinned root fingerprint. */
function evaluateWithForeignPin(
  fixture: ReturnType<typeof createCompletionFixture>,
  foreignFingerprint: string,
): string {
  const result = evaluateBuildCompletion({
    manifest: fixture.manifest,
    ledger: fixture.ledger,
    evidence: fixture.evidence,
    registry: fixture.registry,
    artifacts: artifactSourceFromMap(fixture.artifacts),
    target: "personal_mvp",
    now: "2026-08-04T18:00:00.000Z",
    acceptedRootFingerprints: [foreignFingerprint],
  });
  return result.integrityFailures.join(" | ");
}

describe("M0.5 — approval authority must be independently signed", () => {
  it("rejects a promotion with no reviewer co-signature", () => {
    const fixture = createCompletionFixture();
    const record = fixture.addEvidence({ testId: "SRC-001" });
    fixture.addTransition({ testId: "SRC-001", from: "planned", to: "source_validated" });
    fixture.addTransition({ testId: "SRC-001", from: "source_validated", to: "ready_for_live" });
    fixture.addTransition({
      testId: "SRC-001",
      from: "ready_for_live",
      to: "passed",
      evidenceIds: [record.evidenceId],
      issuer: "ci",
      reviewer: "a-human",
      reviewerRole: requiredApprovalRole("SRC-001"),
      reviewerSigns: false,
    });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/requires an independent reviewer signature/);
  });

  it("rejects the ledger key approving its own transition", () => {
    const fixture = createCompletionFixture();
    const record = fixture.addEvidence({ testId: "SRC-001" });
    fixture.addTransition({ testId: "SRC-001", from: "planned", to: "source_validated" });
    fixture.addTransition({ testId: "SRC-001", from: "source_validated", to: "ready_for_live" });
    fixture.addTransition({
      testId: "SRC-001",
      from: "ready_for_live",
      to: "passed",
      evidenceIds: [record.evidenceId],
      issuer: "ci",
      reviewer: "a-human",
      reviewerRole: requiredApprovalRole("SRC-001"),
      reviewerKeyId: "k-ledger",
    });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/approval key must not be the key that seals the transition/);
  });

  it("rejects an approval key that does not hold the claimed authority", () => {
    const fixture = createCompletionFixture();
    for (const testId of ["SRC-001", "SRC-002", "SRC-003", "HYP-001", "CHN-001", "SCN-001", "ACT-001"]) {
      fixture.promote(testId);
    }
    // TCH-001 demands owner acceptance; sign the approval with the engineering key.
    fixture.promote("TCH-001", {});
    const events = fixture.ledger.events.map((event) =>
      event.testId === "TCH-001" && event.newStatus === "passed"
        ? { ...event, reviewerKeyId: "k-tech-review" }
        : event);
    fixture.ledger = { contractVersion: 2, events };
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/not authorised for role owner_acceptance|reviewer signature does not verify/);
  });

  it("rejects an approval forged with the ledger key under a reviewer key id", () => {
    const fixture = createCompletionFixture();
    const record = fixture.addEvidence({ testId: "SRC-001" });
    fixture.addTransition({ testId: "SRC-001", from: "planned", to: "source_validated" });
    fixture.addTransition({ testId: "SRC-001", from: "source_validated", to: "ready_for_live" });
    fixture.addTransition({
      testId: "SRC-001",
      from: "ready_for_live",
      to: "passed",
      evidenceIds: [record.evidenceId],
      issuer: "ci",
      reviewer: "a-human",
      reviewerRole: requiredApprovalRole("SRC-001"),
      // Names the real approval key, but the automation signs it itself.
      reviewerKeyId: "k-tech-review",
      reviewerSigns: false,
    });
    const events = [...fixture.ledger.events];
    const last = events.at(-1)!;
    events[events.length - 1] = {
      ...last,
      reviewerSignature: signRecord({ ...last, signature: undefined }, fixture.secrets["k-ledger"]!),
    };
    fixture.ledger = { contractVersion: 2, events };
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/reviewer signature does not verify against the named approval key/);
  });
});

describe("M0.5 — superseded boot and generation replay", () => {
  it("rejects evidence replayed from a superseded guest boot", () => {
    const fixture = createCompletionFixture();
    for (const testId of ["SRC-001", "SRC-002", "SRC-003"]) fixture.promote(testId);
    // Boot ids are opaque, so the detectable signal is overlap: one boot of a
    // generation still producing evidence after a different boot of the same
    // generation has already started. Two boots cannot run at once.
    fixture.addEvidence({
      testId: "CHN-001",
      observedAt: "2026-08-04T12:10:00.000Z",
      fieldBootId: "boot-first",
    });
    fixture.addEvidence({
      testId: "SCN-001",
      observedAt: "2026-08-04T12:30:00.000Z",
      fieldBootId: "boot-second",
    });
    fixture.promote(LIVE_GATE, {
      observedAt: "2026-08-04T12:50:00.000Z",
      fieldBootId: "boot-first",
    });
    const result = fixture.evaluate("personal_mvp");
    expect(allFailures(result)).toMatch(/replayed from superseded guest boot boot-first/);
    expect(provenLiveGate(result)).toBe(false);
  });

  it("rejects evidence recorded against a superseded Field generation", () => {
    const fixture = createCompletionFixture();
    for (const testId of ["SRC-001", "SRC-002", "SRC-003"]) fixture.promote(testId);
    fixture.addEvidence({
      testId: "CHN-001",
      fieldGeneration: 2,
      observedAt: "2026-08-04T12:20:00.000Z",
    });
    fixture.promote(LIVE_GATE, {
      fieldGeneration: 1,
      observedAt: "2026-08-04T12:50:00.000Z",
    });
    const result = fixture.evaluate("personal_mvp");
    expect(allFailures(result)).toMatch(/generation 1, which generation 2 had already superseded/);
    expect(provenLiveGate(result)).toBe(false);
  });

  it("accepts sequential boots that do not overlap", () => {
    const fixture = createCompletionFixture();
    for (const testId of ["SRC-001", "SRC-002", "SRC-003"]) fixture.promote(testId);
    // Honest sequence: the earlier boot's evidence precedes the later boot.
    fixture.promote(LIVE_GATE, {
      observedAt: "2026-08-04T12:10:00.000Z",
      fieldBootId: "boot-first",
    });
    fixture.addEvidence({
      testId: "CHN-001",
      observedAt: "2026-08-04T12:40:00.000Z",
      fieldBootId: "boot-second",
    });
    const result = fixture.evaluate("personal_mvp");
    expect(allFailures(result)).not.toMatch(/superseded/);
    expect(provenLiveGate(result)).toBe(true);
  });
});
