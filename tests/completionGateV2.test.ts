import { describe, expect, it } from "vitest";
import {
  createCompletionFixture,
  trialBundleArtifact,
} from "./support/completionFixture.js";
import {
  benchmarkGates,
  evaluateBenchmark,
  isTransitionAllowed,
  parseTrialBundle,
  TEST_DEFINITION_VERSION,
} from "../src/completion/index.js";

describe("completion gate v2 — contract behaviour", () => {
  it("accepts a well-formed state with no integrity failures", () => {
    const fixture = createCompletionFixture();
    const result = fixture.evaluate("personal_mvp");
    expect(result.integrityFailures).toEqual([]);
    expect(result.contractVersion).toBe(2);
  });

  it("reports zero proven completion before any gate is promoted", () => {
    const result = createCompletionFixture().evaluate("personal_mvp");
    expect(result.metrics.provenCompletionPercent).toBe(0);
    expect(result.metrics.liveCompletionPercent).toBe(0);
    expect(result.provenTestCount).toBe(0);
    expect(result.promotionAllowed).toBe(false);
  });

  it("separates proven completion from implementation readiness", () => {
    const fixture = createCompletionFixture();
    // Prepared but unproven: readiness rises, proven completion does not.
    for (const test of fixture.manifest.tests) {
      fixture.addTransition({ testId: test.id, from: "planned", to: "source_validated" });
    }
    const result = fixture.evaluate("personal_mvp");
    expect(result.metrics.provenCompletionPercent).toBe(0);
    expect(result.metrics.implementationReadinessPercent).toBe(45);
    expect(result.metrics.liveCompletionPercent).toBe(0);
  });

  it("states all three numbers in the headline", () => {
    const result = createCompletionFixture().evaluate("personal_mvp");
    expect(result.headline).toBe(
      "Exosuit personal MVP: 0% proven complete, 0% implementation-ready, 0% live-validated.",
    );
  });

  it("proves a gate only through evidence, review, and a full transition chain", () => {
    const fixture = createCompletionFixture();
    fixture.promote("SRC-001");
    const gate = fixture.evaluate("personal_mvp").gates.find((entry) => entry.testId === "SRC-001");
    expect(gate?.status).toBe("passed");
    expect(gate?.proven).toBe(true);
    expect(gate?.failures).toEqual([]);
  });

  it("reaches full promotion only when every required gate is proven", () => {
    const fixture = createCompletionFixture();
    fixture.promoteAllFor("personal_mvp");
    const result = fixture.evaluate("personal_mvp");
    expect(result.integrityFailures).toEqual([]);
    expect(result.blockingTestIds).toEqual([]);
    expect(result.metrics.provenCompletionPercent).toBe(100);
    expect(result.metrics.liveCompletionPercent).toBe(100);
    expect(result.promotionAllowed).toBe(true);
  });

  it("keeps production denied even at full production completion", () => {
    const fixture = createCompletionFixture();
    fixture.promoteAllFor("production");
    const result = fixture.evaluate("production");
    expect(result.metrics.provenCompletionPercent).toBe(100);
    expect(result.promotionAllowed).toBe(true);
    expect(result.productionAllowed).toBe(false);
  });

  it("advances the next phase only as earlier phases are proven", () => {
    const fixture = createCompletionFixture();
    expect(fixture.evaluate("personal_mvp").nextPhaseIds).toEqual(["M0"]);
    for (const testId of ["SRC-001", "SRC-002", "SRC-003"]) fixture.promote(testId);
    expect(fixture.evaluate("personal_mvp").nextPhaseIds).toEqual(["M1"]);
  });

  it("permits only the defined status transitions", () => {
    expect(isTransitionAllowed("ready_for_live", "passed")).toBe(true);
    expect(isTransitionAllowed("planned", "passed")).toBe(false);
    expect(isTransitionAllowed("planned", "ready_for_live")).toBe(false);
    expect(isTransitionAllowed("failed", "passed")).toBe(false);
    expect(isTransitionAllowed("failed", "remediated")).toBe(true);
    expect(isTransitionAllowed("passed", "revoked")).toBe(true);
  });

  it("computes a benchmark outcome from trial records", () => {
    const bundle = parseTrialBundle(trialBundleArtifact({ testId: "OWN-001", trials: 10 }));
    const outcome = evaluateBenchmark(
      bundle,
      "OWN-001",
      benchmarkGates["OWN-001"],
      "de52ad72b11ddafe969e5923f16c946e49cf04f4",
    );
    expect(outcome.trialCount).toBe(10);
    expect(outcome.uniqueRecipeCount).toBe(5);
    expect(outcome.failures).toEqual([]);
  });

  it("pins the test definition version into evaluated evidence", () => {
    const fixture = createCompletionFixture();
    const record = fixture.promote("SRC-001");
    expect(record.testDefinitionVersion).toBe(TEST_DEFINITION_VERSION);
    expect(fixture.manifest.testDefinitionVersion).toBe(TEST_DEFINITION_VERSION);
  });
});
