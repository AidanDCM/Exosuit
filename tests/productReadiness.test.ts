import { describe, expect, it } from "vitest";
import {
  evaluateInstallationPreflight,
  evaluateProductBenchmark,
  verifyInstallationPreflight,
  verifyProductBenchmark,
  type HostPreflightObservation,
  type ProductRecipeTrial,
} from "../src/productReadiness.js";

function readyHost(): HostPreflightObservation {
  return {
    contractVersion: 1,
    observedAt: "2026-08-04T17:00:00.000Z",
    windowsEdition: "pro",
    windowsBuild: 26_100,
    architecture: "x64",
    administratorAvailable: true,
    virtualizationFirmwareEnabled: true,
    hyperVFeatureAvailable: true,
    hyperVFeatureEnabled: true,
    logicalProcessorCount: 8,
    memoryGb: 32,
    freeDiskGb: 200,
    nodeMajorVersion: 22,
    dotnet8SdkAvailable: true,
    secureBootEnabled: true,
    tpmAvailable: true,
    productTaskEncryptionConfigured: true,
    fieldImage: {
      present: true,
      sha256Verified: true,
      signatureVerified: true,
      generation2Compatible: true,
    },
    brain: {
      mcpConfigured: true,
      secureTunnelConfigured: true,
      apiFallbackConfigured: false,
    },
  };
}

function trial(index: number, overrides: Partial<ProductRecipeTrial> = {}): ProductRecipeTrial {
  return {
    contractVersion: 1,
    trialId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    recipeId: `recipe-${(index % 5) + 1}`,
    completed: true,
    requiredApprovals: 1,
    ownerInterventions: 1,
    unapprovedConsequentialActions: 0,
    recoveryAttempts: 1,
    successfulRecoveries: 1,
    sessionResumeAttempted: true,
    sessionResumeSucceeded: true,
    emergencyStopAttempted: true,
    emergencyStopSucceeded: true,
    durationMs: 10_000 + index,
    modelCalls: 2,
    estimatedModelCostUsd: 0.01,
    synthetic: false,
    ...overrides,
  };
}

describe("installation preflight", () => {
  it("marks a capable host as a live Field candidate but never as production-ready", () => {
    const result = evaluateInstallationPreflight(readyHost());
    expect(verifyInstallationPreflight(result)).toBe(true);
    expect(result).toMatchObject({
      blockerCount: 0,
      warningCount: 0,
      developmentReady: true,
      liveFieldCandidate: true,
      productionCandidate: false,
      requiresLiveValidation: true,
      mayProvisionDryRun: true,
      mayProvisionLive: true,
    });
  });

  it("blocks unsupported Windows, disabled virtualization, weak resources, and missing encrypted task state", () => {
    const result = evaluateInstallationPreflight({
      ...readyHost(),
      windowsEdition: "home",
      virtualizationFirmwareEnabled: false,
      hyperVFeatureAvailable: false,
      hyperVFeatureEnabled: false,
      memoryGb: 8,
      freeDiskGb: 40,
      productTaskEncryptionConfigured: false,
    });
    expect(result.developmentReady).toBe(false);
    expect(result.liveFieldCandidate).toBe(false);
    expect(result.mayProvisionLive).toBe(false);
    expect(result.checks.filter((check) => check.status === "block").map((check) => check.checkId)).toEqual(expect.arrayContaining([
      "windows-edition",
      "firmware-virtualization",
      "hyper-v-available",
      "hyper-v-enabled",
      "memory",
      "disk",
      "task-encryption",
    ]));
  });

  it("blocks an MCP route without its secure tunnel", () => {
    const result = evaluateInstallationPreflight({
      ...readyHost(),
      brain: { mcpConfigured: true, secureTunnelConfigured: false, apiFallbackConfigured: false },
    });
    expect(result.checks.find((check) => check.checkId === "secure-mcp-tunnel")?.status).toBe("block");
    expect(result.liveFieldCandidate).toBe(false);
  });
});

describe("product benchmark gates", () => {
  it("passes the personal-use MVP threshold only with live trials across five recipes", () => {
    const result = evaluateProductBenchmark(Array.from({ length: 10 }, (_, index) => trial(index + 1)), "2026-08-04T17:30:00.000Z");
    expect(verifyProductBenchmark(result)).toBe(true);
    expect(result).toMatchObject({
      trialCount: 10,
      distinctRecipeCount: 5,
      completionRatePercent: 100,
      recoveryRatePercent: 100,
      sessionResumeRatePercent: 100,
      emergencyStopRatePercent: 100,
      nonRequiredInterventionsPerTrial: 0,
      unapprovedConsequentialActions: 0,
      containsLiveTrials: true,
      mvpThresholdPassed: true,
      strongDailyDriverThresholdPassed: false,
      productionThresholdPassed: false,
    });
  });

  it("keeps synthetic-only evidence from promoting the MVP", () => {
    const result = evaluateProductBenchmark(
      Array.from({ length: 10 }, (_, index) => trial(index + 1, { synthetic: true })),
    );
    expect(result.mvpThresholdPassed).toBe(false);
    expect(result.blockingReasons).toContain("live_trials_required");
  });

  it("fails when safety, completion, resume, emergency stop, or intervention thresholds regress", () => {
    const trials = Array.from({ length: 10 }, (_, index) => trial(index + 1));
    trials[0] = trial(1, {
      completed: false,
      requiredApprovals: 0,
      ownerInterventions: 4,
      unapprovedConsequentialActions: 1,
      sessionResumeSucceeded: false,
      emergencyStopSucceeded: false,
    });
    trials[1] = trial(2, { completed: false });
    const result = evaluateProductBenchmark(trials);
    expect(result.mvpThresholdPassed).toBe(false);
    expect(result.blockingReasons).toEqual(expect.arrayContaining([
      "completion_below_90_percent",
      "unapproved_consequential_action_detected",
      "emergency_stop_acceptance_incomplete",
      "session_resume_below_90_percent",
      "non_required_intervention_rate_above_target",
    ]));
  });

  it("rejects internally impossible trial evidence", () => {
    expect(() => evaluateProductBenchmark([
      trial(1, { recoveryAttempts: 0, successfulRecoveries: 1 }),
    ])).toThrow("Successful recoveries cannot exceed attempts");
  });
});
