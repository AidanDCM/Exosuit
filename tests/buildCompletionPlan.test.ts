import { describe, expect, it } from "vitest";
import {
  createBuildCompletionManifest,
  evaluateBuildCompletion,
  verifyBuildCompletionEvaluation,
  verifyBuildCompletionManifest,
  type BuildCompletionManifest,
  type CompletionEvidenceClass,
  type CompletionStatus,
} from "../src/buildCompletionPlan.js";

const commit = "0123456789abcdef0123456789abcdef01234567";
const observedAt = "2026-08-04T17:00:00.000Z";

function evidence(evidenceClass: CompletionEvidenceClass, synthetic = true) {
  return {
    evidenceClass,
    reference: `evidence/${evidenceClass}.json`,
    exactCommit: commit,
    runReference: `run-${evidenceClass}`,
    synthetic,
    observedAt,
  } as const;
}

function manifest(statuses: Record<string, CompletionStatus> = {}): BuildCompletionManifest {
  return createBuildCompletionManifest({
    contractVersion: 1,
    generatedAt: observedAt,
    branch: "codex/unify-glove-field",
    baselineCommit: commit,
    productionDecision: "denied",
    phases: [
      {
        id: "M0",
        order: 0,
        name: "Source baseline",
        objective: "Prove repository contracts before live work.",
        dependencies: [],
        deliverables: ["Validated source baseline"],
        exitCriteria: ["Source tests pass"],
      },
      {
        id: "M1",
        order: 1,
        name: "Live Field",
        objective: "Prove isolated live operation.",
        dependencies: ["M0"],
        deliverables: ["Live Field evidence"],
        exitCriteria: ["Field lifecycle passes"],
      },
      {
        id: "P1",
        order: 2,
        name: "Production release",
        objective: "Prove release operations.",
        dependencies: ["M1"],
        deliverables: ["Signed release"],
        exitCriteria: ["Release matrix passes"],
      },
    ],
    tests: [
      {
        id: "SRC-001",
        phaseId: "M0",
        title: "Repository validation",
        capability: "source",
        severity: "critical",
        requiredFor: ["personal_mvp", "daily_driver", "production"],
        requiredEvidenceClass: "fake_integration",
        status: statuses["SRC-001"] ?? "passed",
        prerequisites: [],
        acceptanceCriteria: ["All source validation passes on one exact commit."],
        evidence: [evidence("fake_integration")],
        rollbackOrContainment: "Revert the source change and rerun the complete suite.",
        automatedCommand: "npm run validate:typescript",
      },
      {
        id: "FLD-001",
        phaseId: "M1",
        title: "Live Field lifecycle",
        capability: "field",
        severity: "critical",
        requiredFor: ["personal_mvp", "daily_driver", "production"],
        requiredEvidenceClass: "hyperv_host_guest",
        status: statuses["FLD-001"] ?? "ready_for_live",
        prerequisites: ["SRC-001"],
        acceptanceCriteria: ["Create, start, stop, reset, and destroy the exact disposable generation."],
        evidence: [evidence("fake_integration")],
        rollbackOrContainment: "Destroy only the disposable generation and preserve evidence.",
      },
      {
        id: "REL-001",
        phaseId: "P1",
        title: "Signed release lifecycle",
        capability: "release",
        severity: "high",
        requiredFor: ["production"],
        requiredEvidenceClass: "release_operations",
        status: statuses["REL-001"] ?? "planned",
        prerequisites: ["FLD-001"],
        acceptanceCriteria: ["Install, upgrade, rollback, repair, and uninstall signed artifacts."],
        evidence: [],
        rollbackOrContainment: "Rollback to the last signed release and disable updates.",
      },
    ],
  });
}

describe("build completion plan", () => {
  it("creates and verifies an integrity-bound manifest", () => {
    const value = manifest();
    expect(verifyBuildCompletionManifest(value)).toBe(true);
    expect(() => verifyBuildCompletionManifest({ ...value, branch: "tampered" })).toThrow();
  });

  it("reports the next live phase and blocks MVP promotion", () => {
    const result = evaluateBuildCompletion(manifest(), "personal_mvp", observedAt);
    expect(result.nextPhaseIds).toEqual(["M1"]);
    expect(result.blockingTestIds).toEqual(["FLD-001"]);
    expect(result.promotionAllowed).toBe(false);
    expect(result.productionAllowed).toBe(false);
    expect(verifyBuildCompletionEvaluation(result)).toBe(true);
  });

  it("allows MVP promotion only after live non-synthetic evidence", () => {
    const value = manifest({ "FLD-001": "passed" });
    value.tests[1]!.evidence = [evidence("hyperv_host_guest", false)];
    const rebuilt = createBuildCompletionManifest({ ...value, manifestHash: undefined } as never);
    const result = evaluateBuildCompletion(rebuilt, "personal_mvp", observedAt);
    expect(result.promotionAllowed).toBe(true);
    expect(result.weightedCompletionPercent).toBe(100);
  });

  it("rejects synthetic-only evidence for a passed live gate", () => {
    expect(() => {
      const value = manifest({ "FLD-001": "passed" });
      value.tests[1]!.evidence = [evidence("hyperv_host_guest", true)];
      createBuildCompletionManifest({ ...value, manifestHash: undefined } as never);
    }).toThrow(/synthetic-only/);
  });

  it("rejects a passed test without qualifying evidence", () => {
    expect(() => {
      const value = manifest();
      value.tests[0]!.evidence = [evidence("unit")];
      createBuildCompletionManifest({ ...value, manifestHash: undefined } as never);
    }).toThrow(/qualifying evidence/);
  });

  it("rejects unknown test prerequisites", () => {
    expect(() => {
      const value = manifest();
      value.tests[1]!.prerequisites = ["BAD-999"];
      createBuildCompletionManifest({ ...value, manifestHash: undefined } as never);
    }).toThrow(/Unknown test prerequisite/);
  });

  it("rejects phase dependency cycles", () => {
    expect(() => {
      const value = manifest();
      value.phases[0]!.dependencies = ["P1"];
      createBuildCompletionManifest({ ...value, manifestHash: undefined } as never);
    }).toThrow(/cycle/);
  });

  it("keeps production blocked when production-only tests remain", () => {
    const result = evaluateBuildCompletion(manifest(), "production", observedAt);
    expect(result.blockingTestIds).toEqual(["FLD-001", "REL-001"]);
    expect(result.productionAllowed).toBe(false);
  });

  it("weights critical unfinished work more heavily than optional polish", () => {
    const result = evaluateBuildCompletion(manifest(), "personal_mvp", observedAt);
    expect(result.weightedCompletionPercent).toBeLessThan(85);
    expect(result.liveEvidenceRequiredCount).toBe(1);
  });
});
