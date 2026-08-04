/**
 * Adversarial suite for the completion gate contract, version 2.
 *
 * Every case here is an attack that SUCCEEDED against contract 1 during the
 * 2026-08-04 adversarial review, plus the failure-injection classes that
 * contract 1 could not even express. Each test asserts how the gate fails, not
 * merely that a valid fixture passes.
 *
 * The fixture deliberately holds the private signing keys, so these attacks are
 * strictly stronger than a real attacker's: an attacker without the keys fails
 * at the signature check before reaching most of these paths.
 */

import { describe, expect, it } from "vitest";
import {
  buildCompletionManifestSchema,
  signRecord,
  type BuildCompletionEvaluation,
} from "../../src/completion/index.js";
import {
  createCompletionFixture,
  trialBundleArtifact,
  type CompletionFixture,
} from "../support/completionFixture.js";

function gateOf(result: BuildCompletionEvaluation, testId: string) {
  return result.gates.find((gate) => gate.testId === testId);
}

function allFailures(result: BuildCompletionEvaluation): string {
  return [...result.integrityFailures, ...result.gates.flatMap((gate) => gate.failures)].join(" | ");
}

/** Re-signs the manifest after a mutation, simulating a fully-privileged edit. */
function resignManifest(fixture: CompletionFixture): void {
  const { signature: _signature, ...core } = fixture.manifest;
  fixture.manifest = buildCompletionManifestSchema.parse({
    ...core,
    signature: signRecord(core, fixture.secrets["k-manifest"]!),
  });
}

describe("v2 adversarial — evidence substitution and binding", () => {
  it("A2: refuses a higher-trust but unrelated evidence class", () => {
    const fixture = createCompletionFixture();
    // owner_acceptance is not proof of Hyper-V host/guest lifecycle.
    fixture.promote("HYP-001", { evidenceClass: "owner_acceptance" });
    const result = fixture.evaluate("personal_mvp");
    expect(gateOf(result, "HYP-001")?.proven).toBe(false);
    expect(allFailures(result)).toMatch(/owner_acceptance is not accepted by gate HYP-001/);
    expect(result.promotionAllowed).toBe(false);
  });

  it("A3: refuses evidence recorded against a different commit", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001", { exactCommit: "d".repeat(40) });
    const result = fixture.evaluate("personal_mvp");
    expect(gateOf(result, "SRC-001")?.proven).toBe(false);
    expect(allFailures(result)).toMatch(/is not the baseline commit/);
  });

  it("A4: refuses one artifact bound to more than one gate", () => {
    const fixture = createCompletionFixture();
    const shared = Buffer.from("one artifact for every gate", "utf8");
    fixture.promote("SRC-001", { artifact: shared });
    fixture.promote("SRC-002", { artifact: shared });
    const result = fixture.evaluate("personal_mvp");
    expect(allFailures(result)).toMatch(/already bound to evidence/);
    expect(gateOf(result, "SRC-002")?.proven).toBe(false);
  });

  it("A5a: refuses evidence dated in the future", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001", { observedAt: "2099-01-01T00:00:00.000Z" });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/dated in the future/);
  });

  it("A5b: refuses evidence predating the baseline it claims to validate", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001", { observedAt: "1999-01-01T00:00:00.000Z" });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/predates the baseline commit/);
  });

  it("A5c: refuses evidence outside its freshness window", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001");
    // Same evidence, evaluated two years later.
    const result = fixture.evaluate("personal_mvp", "2028-08-04T18:00:00.000Z");
    expect(allFailures(result)).toMatch(/freshness window/);
  });

  it("A13: refuses evidence whose artifact is absent from the store", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001", { storeArtifact: false });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/not present in the evidence store/);
  });

  it("refuses evidence bound to a different test than the citing gate", () => {
    const fixture = createCompletionFixture();
    const foreign = fixture.addEvidence({ testId: "SRC-002" });
    fixture.addTransition({ testId: "SRC-001", from: "planned", to: "source_validated" });
    fixture.addTransition({ testId: "SRC-001", from: "source_validated", to: "ready_for_live" });
    fixture.addTransition({
      testId: "SRC-001",
      from: "ready_for_live",
      to: "passed",
      evidenceIds: [foreign.evidenceId],
      issuer: "a",
      reviewer: "b",
    });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/bound to SRC-002, not SRC-001/);
  });
});

describe("v2 adversarial — prerequisites and graph", () => {
  it("A6: refuses a downstream gate whose prerequisite is unproven", () => {
    const fixture = createCompletionFixture();
    fixture.promote("CHN-001"); // prerequisite HYP-001 left at planned
    const result = fixture.evaluate("personal_mvp");
    expect(gateOf(result, "CHN-001")?.status).toBe("passed");
    expect(gateOf(result, "CHN-001")?.proven).toBe(false);
    expect(allFailures(result)).toMatch(/prerequisite HYP-001 is not proven/);
  });

  it("propagates a revoked prerequisite to every downstream gate", () => {
    const fixture = createCompletionFixture();
    for (const testId of ["SRC-001", "SRC-002", "SRC-003"]) fixture.promote(testId);
    fixture.promote("HYP-001");
    expect(gateOf(fixture.evaluate("personal_mvp"), "HYP-001")?.proven).toBe(true);

    fixture.addTransition({ testId: "SRC-003", from: "passed", to: "revoked" });
    const result = fixture.evaluate("personal_mvp");
    expect(gateOf(result, "SRC-003")?.status).toBe("revoked");
    expect(gateOf(result, "HYP-001")?.proven).toBe(false);
    expect(allFailures(result)).toMatch(/prerequisite SRC-003 is revoked/);
  });

  it("A7: rejects a test prerequisite cycle", () => {
    const fixture = createCompletionFixture();
    const tests = fixture.manifest.tests.map((test) => {
      if (test.id === "HYP-001") return { ...test, prerequisites: ["CHN-001"] };
      if (test.id === "CHN-001") return { ...test, prerequisites: ["HYP-001"] };
      return test;
    });
    fixture.manifest = { ...fixture.manifest, tests };
    resignManifest(fixture);
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/test dependency cycle/);
  });

  it("A8: rejects a prerequisite scheduled in a later phase", () => {
    const fixture = createCompletionFixture();
    const tests = fixture.manifest.tests.map((test) =>
      test.id === "HYP-001" ? { ...test, prerequisites: ["OWN-001"] } : test);
    fixture.manifest = { ...fixture.manifest, tests };
    resignManifest(fixture);
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/HYP-001 \(M1\) depends on OWN-001 in the later phase M6/);
  });
});

describe("v2 adversarial — status transitions and the ledger", () => {
  it("A9: rejects a direct planned to passed jump", () => {
    const fixture = createCompletionFixture();
    const record = fixture.addEvidence({ testId: "SRC-001" });
    fixture.addTransition({
      testId: "SRC-001",
      from: "planned",
      to: "passed",
      evidenceIds: [record.evidenceId],
      issuer: "a",
      reviewer: "b",
    });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/planned -> passed is not a permitted transition/);
  });

  it("A10: cannot erase an earlier failure by appending a new promotion", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001");
    fixture.addTransition({ testId: "SRC-001", from: "passed", to: "failed" });
    // Attempt to pretend the failure never happened.
    const record = fixture.addEvidence({ testId: "SRC-001" });
    fixture.addTransition({
      testId: "SRC-001",
      from: "ready_for_live",
      to: "passed",
      evidenceIds: [record.evidenceId],
      issuer: "a",
      reviewer: "b",
    });
    const result = fixture.evaluate("personal_mvp");
    expect(allFailures(result)).toMatch(/declares previous status ready_for_live but SRC-001 is failed/);
    expect(result.promotionAllowed).toBe(false);
  });

  it("requires remediation before a failed gate can be promoted again", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001");
    fixture.addTransition({ testId: "SRC-001", from: "passed", to: "failed" });
    fixture.addTransition({ testId: "SRC-001", from: "failed", to: "remediated" });
    fixture.addTransition({ testId: "SRC-001", from: "remediated", to: "ready_for_live" });
    const record = fixture.addEvidence({ testId: "SRC-001" });
    fixture.addTransition({
      testId: "SRC-001",
      from: "ready_for_live",
      to: "passed",
      evidenceIds: [record.evidenceId],
      issuer: "a",
      reviewer: "b",
      reviewerRole: "technical_review",
    });
    const result = fixture.evaluate("personal_mvp");
    expect(result.integrityFailures).toEqual([]);
    expect(gateOf(result, "SRC-001")?.proven).toBe(true);
  });

  it("rejects self-review: issuer and reviewer must differ", () => {
    const fixture = createCompletionFixture();
    const record = fixture.addEvidence({ testId: "SRC-001" });
    fixture.addTransition({ testId: "SRC-001", from: "planned", to: "source_validated" });
    fixture.addTransition({ testId: "SRC-001", from: "source_validated", to: "ready_for_live" });
    fixture.addTransition({
      testId: "SRC-001",
      from: "ready_for_live",
      to: "passed",
      evidenceIds: [record.evidenceId],
      issuer: "same-principal",
      reviewer: "same-principal",
    });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/reviewer and issuer must be different principals/);
  });

  it("rejects promotion that cites no evidence at all", () => {
    const fixture = createCompletionFixture();
    fixture.addTransition({ testId: "SRC-001", from: "planned", to: "source_validated" });
    fixture.addTransition({ testId: "SRC-001", from: "source_validated", to: "ready_for_live" });
    fixture.addTransition({
      testId: "SRC-001",
      from: "ready_for_live",
      to: "passed",
      issuer: "a",
      reviewer: "b",
    });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/promotion to passed cites no evidence/);
  });

  it("partial ledger write: a dropped middle event breaks the chain", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001");
    const events = fixture.ledger.events.filter((event) => event.sequence !== 1);
    fixture.ledger = { contractVersion: 2, events };
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/chain broken or an event was removed/);
  });

  it("partial ledger write: a truncated tail event is detected by contiguity", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001");
    fixture.promote("SRC-002");
    // Simulate a crash that lost the middle of the file but kept the tail.
    fixture.ledger = {
      contractVersion: 2,
      events: fixture.ledger.events.slice(3),
    };
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/breaks contiguity|chain broken/);
  });

  it("clock rollback: refuses a transition recorded before its predecessor", () => {
    const fixture = createCompletionFixture();
    fixture.addTransition({
      testId: "SRC-001",
      from: "planned",
      to: "source_validated",
      recordedAt: "2026-08-04T13:00:00.000Z",
    });
    fixture.addTransition({
      testId: "SRC-001",
      from: "source_validated",
      to: "ready_for_live",
      recordedAt: "2026-08-04T11:00:00.000Z",
    });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/recordedAt runs backwards/);
  });

  it("refuses a promotion citing evidence observed after the transition", () => {
    const fixture = createCompletionFixture();
    const record = fixture.addEvidence({ testId: "SRC-001", observedAt: "2026-08-04T17:00:00.000Z" });
    fixture.addTransition({ testId: "SRC-001", from: "planned", to: "source_validated" });
    fixture.addTransition({ testId: "SRC-001", from: "source_validated", to: "ready_for_live" });
    fixture.addTransition({
      testId: "SRC-001",
      from: "ready_for_live",
      to: "passed",
      evidenceIds: [record.evidenceId],
      issuer: "a",
      reviewer: "b",
      recordedAt: "2026-08-04T14:00:00.000Z",
    });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/cites evidence observed after the transition was recorded/);
  });
});

describe("v2 adversarial — signatures, keys, and tampering", () => {
  it("A12: a tampered manifest no longer verifies", () => {
    const fixture = createCompletionFixture();
    fixture.manifest = { ...fixture.manifest, branch: "attacker-controlled" };
    // No re-signing: the attacker does not hold the manifest key.
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/manifest: signature does not verify/);
  });

  it("A12b: a manifest signed by the wrong role is rejected", () => {
    const fixture = createCompletionFixture();
    const { signature: _signature, ...core } = fixture.manifest;
    const forged = { ...core, branch: "attacker-controlled", signingKeyId: "k-ledger" };
    fixture.manifest = buildCompletionManifestSchema.parse({
      ...forged,
      signature: signRecord(forged, fixture.secrets["k-ledger"]!),
    });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/is not authorised for role manifest/);
  });

  it("corrupt evidence blob: mutated artifact fails its content address", () => {
    const fixture = createCompletionFixture();
    const record = fixture.promote("SRC-001");
    fixture.artifacts.set(record.artifactSha256, Buffer.from("corrupted content", "utf8"));
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/artifact hash mismatch/);
  });

  it("truncated artifact write is caught by the byte-length commitment", () => {
    const fixture = createCompletionFixture();
    const artifact = Buffer.from("a complete evidence artifact", "utf8");
    const record = fixture.addEvidence({ testId: "SRC-001", artifact });
    // Same hash recorded, but the stored blob was cut short mid-write.
    fixture.artifacts.set(record.artifactSha256, artifact.subarray(0, 5));
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/artifact hash mismatch|size mismatch/);
  });

  it("revoked key: every record it signed is rejected", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001");
    fixture.registry = fixture.sealRegistry({
      keys: fixture.registry.keys.map((key) => key.keyId === "k-evidence"
        ? { ...key, revokedAt: "2026-08-05T00:00:00.000Z", revocationReason: "compromised" }
        : key),
    });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/is revoked \(compromised\)/);
  });

  it("key rotation: a record signed outside the key validity window is rejected", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001");
    fixture.registry = fixture.sealRegistry({
      keys: fixture.registry.keys.map((key) => key.keyId === "k-evidence"
        ? { ...key, notAfter: "2026-08-02T00:00:00.000Z" }
        : key),
    });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/used after notAfter/);
  });

  it("unknown signing key is rejected rather than ignored", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001");
    fixture.registry = fixture.sealRegistry({
      keys: fixture.registry.keys.filter((key) => key.keyId !== "k-evidence"),
    });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/unknown signing key k-evidence/);
  });

  it("cross-machine reuse: live evidence must come from the key's own machine", () => {
    const fixture = createCompletionFixture();
    fixture.promote("HYP-001", { machineId: "machine-someone-elses" });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/host-bound key k-host belongs to machine .* but the record names machine-someone-elses/);
  });

  it("live gates cannot be satisfied by an evidence-role key", () => {
    const fixture = createCompletionFixture();
    fixture.promote("HYP-001", { signingKeyId: "k-evidence" });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/k-evidence is not authorised for role host/);
  });

  it("live gates reject evidence self-designated as synthetic", () => {
    const fixture = createCompletionFixture();
    fixture.promote("HYP-001", { designation: "synthetic" });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/requires live evidence but record is designated synthetic/);
  });
});

describe("v2 adversarial — replay and duplication", () => {
  it("replay after restart: a reused nonce is rejected", () => {
    const fixture = createCompletionFixture();
    const nonce = "a".repeat(32);
    fixture.promote("SRC-001", { nonce });
    fixture.promote("SRC-002", { nonce });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/nonce replayed from evidence/);
  });

  it("duplicate evidence ids are rejected", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001", { evidenceId: "shared-id" });
    fixture.promote("SRC-002", { evidenceId: "shared-id" });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/duplicate evidence id shared-id/);
  });

  it("duplicate ledger event ids are rejected", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001");
    const duplicated = fixture.ledger.events[0]!;
    fixture.ledger = {
      contractVersion: 2,
      events: [...fixture.ledger.events, { ...duplicated, sequence: fixture.ledger.events.length }],
    };
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/duplicate event id/);
  });

  it("cross-generation replay: Field-bound evidence must name its generation", () => {
    const fixture = createCompletionFixture();
    const record = fixture.addEvidence({ testId: "HYP-001" });
    const stripped = { ...record, environment: { ...record.environment, fieldGeneration: undefined } };
    fixture.evidence = { contractVersion: 2, records: [stripped as typeof record] };
    fixture.addTransition({ testId: "HYP-001", from: "planned", to: "source_validated" });
    fixture.addTransition({ testId: "HYP-001", from: "source_validated", to: "ready_for_live" });
    fixture.addTransition({
      testId: "HYP-001",
      from: "ready_for_live",
      to: "passed",
      evidenceIds: [record.evidenceId],
      issuer: "a",
      reviewer: "b",
    });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/must name fieldId, fieldGeneration, and fieldBootId/);
  });

  it("stale test definitions: evidence from an older definition set is rejected", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001", { testDefinitionVersion: "2026.01.01" });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/produced against test definitions 2026\.01\.01/);
  });
});

describe("v2 adversarial — benchmark gates cannot be asserted", () => {
  it("A11: mass self-declaration raises readiness but never proven completion", () => {
    const fixture = createCompletionFixture();
    for (const test of fixture.manifest.tests) {
      fixture.addTransition({ testId: test.id, from: "planned", to: "source_validated" });
      fixture.addTransition({ testId: test.id, from: "source_validated", to: "ready_for_live" });
    }
    const result = fixture.evaluate("personal_mvp");
    expect(result.metrics.implementationReadinessPercent).toBe(60);
    expect(result.metrics.provenCompletionPercent).toBe(0);
    expect(result.metrics.liveCompletionPercent).toBe(0);
    expect(result.promotionAllowed).toBe(false);
  });

  it("refuses OWN-001 with too few trials", () => {
    const fixture = createCompletionFixture();
    fixture.promote("OWN-001", { artifact: trialBundleArtifact({ testId: "OWN-001", trials: 9 }) });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/only 9 trials recorded, 10 required/);
  });

  it("refuses OWN-001 when the five recipes are not all covered", () => {
    const fixture = createCompletionFixture();
    fixture.promote("OWN-001", {
      artifact: trialBundleArtifact({ testId: "OWN-001", trials: 10, recipes: 3 }),
    });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/3 distinct recipes covered, exactly 5 required/);
  });

  it("refuses OWN-001 when any emergency stop failed", () => {
    const fixture = createCompletionFixture();
    fixture.promote("OWN-001", {
      artifact: trialBundleArtifact({ testId: "OWN-001", trials: 10, stopRate: 0.9 }),
    });
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/emergency stop succeeded in 90%/);
  });

  it("refuses OWN-001 after a single unapproved consequential action", () => {
    const fixture = createCompletionFixture();
    fixture.promote("OWN-001", {
      artifact: trialBundleArtifact({ testId: "OWN-001", trials: 10, unapproved: 1 }),
    });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/1 unapproved consequential actions occurred/);
  });

  it("refuses OWN-001 when interventions exceed the per-trial budget", () => {
    const fixture = createCompletionFixture();
    fixture.promote("OWN-001", {
      artifact: trialBundleArtifact({ testId: "OWN-001", trials: 10, interventions: 5 }),
    });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/unnecessary interventions per trial exceeds 0\.3/);
  });

  it("trial-record manipulation after signing breaks the content address", () => {
    const fixture = createCompletionFixture();
    const record = fixture.promote("OWN-001", {
      artifact: trialBundleArtifact({ testId: "OWN-001", trials: 10 }),
    });
    // Edit the trials to look better, keeping the same evidence record.
    fixture.artifacts.set(
      record.artifactSha256,
      trialBundleArtifact({ testId: "OWN-001", trials: 100 }),
    );
    expect(allFailures(fixture.evaluate("personal_mvp"))).toMatch(/artifact hash mismatch/);
  });

  it("refuses a trial bundle bound to a different gate", () => {
    const fixture = createCompletionFixture();
    fixture.promote("OWN-001", {
      artifact: trialBundleArtifact({ testId: "PERF-001", trials: 10 }),
    });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/trial bundle is bound to PERF-001, not OWN-001/);
  });

  it("refuses a trial bundle recorded against a different commit", () => {
    const fixture = createCompletionFixture();
    fixture.promote("OWN-001", {
      artifact: trialBundleArtifact({ testId: "OWN-001", trials: 10, exactCommit: "c".repeat(40) }),
    });
    expect(allFailures(fixture.evaluate("personal_mvp")))
      .toMatch(/trial bundle was recorded against a different commit/);
  });
});

describe("v2 adversarial — the total forgery from the v1 review", () => {
  it("cannot declare full MVP completion without real evidence", () => {
    const fixture = createCompletionFixture();
    // The v1 break: every gate flipped to passed citing one fabricated file.
    const shared = Buffer.from("one-fake-file.json", "utf8");
    for (const test of fixture.manifest.tests) {
      fixture.promote(test.id, { artifact: shared, evidenceClass: "release_operations" });
    }
    const result = fixture.evaluate("personal_mvp");
    expect(result.metrics.provenCompletionPercent).toBeLessThan(100);
    expect(result.promotionAllowed).toBe(false);
    expect(result.integrityFailures.length).toBeGreaterThan(0);
  });
});
