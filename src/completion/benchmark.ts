/**
 * Benchmark gate computation.
 *
 * OWN-001 and PERF-001 do not pass because someone edits a status. They pass
 * only when the numbers computed from signed, hashed trial records clear every
 * threshold in policy.
 */

import { completionTrialBundleSchema, type CompletionTrialBundle } from "./contracts.js";
import { TEST_DEFINITION_VERSION, type BenchmarkThresholds } from "./policy.js";

export interface BenchmarkOutcome {
  readonly trialCount: number;
  readonly uniqueRecipeCount: number;
  readonly completionRate: number;
  readonly resumeRate: number;
  readonly emergencyStopRate: number;
  readonly unapprovedConsequentialActions: number;
  readonly interventionsPerTrial: number;
  readonly failures: readonly string[];
}

export function parseTrialBundle(artifact: Uint8Array): CompletionTrialBundle {
  return completionTrialBundleSchema.parse(JSON.parse(Buffer.from(artifact).toString("utf8")));
}

export function evaluateBenchmark(
  bundle: CompletionTrialBundle,
  testId: string,
  thresholds: BenchmarkThresholds,
  baselineCommit: string,
): BenchmarkOutcome {
  const failures: string[] = [];

  if (bundle.boundTestId !== testId) {
    failures.push(`trial bundle is bound to ${bundle.boundTestId}, not ${testId}`);
  }
  if (bundle.exactCommit !== baselineCommit) {
    failures.push("trial bundle was recorded against a different commit than the baseline");
  }
  if (bundle.testDefinitionVersion !== TEST_DEFINITION_VERSION) {
    failures.push(
      `trial bundle used test definitions ${bundle.testDefinitionVersion}, current is ${TEST_DEFINITION_VERSION}`,
    );
  }

  const trialIds = new Set<string>();
  for (const trial of bundle.trials) {
    if (trialIds.has(trial.trialId)) failures.push(`duplicate trial id ${trial.trialId}`);
    trialIds.add(trial.trialId);
    if (Date.parse(trial.endedAt) < Date.parse(trial.startedAt)) {
      failures.push(`trial ${trial.trialId} ends before it starts`);
    }
    if (trial.emergencyStopSucceeded && !trial.emergencyStopAttempted) {
      failures.push(`trial ${trial.trialId} records a stop success without an attempt`);
    }
    if (trial.resumeSucceeded && !trial.resumeAttempted) {
      failures.push(`trial ${trial.trialId} records a resume success without an attempt`);
    }
  }

  const trialCount = bundle.trials.length;
  const uniqueRecipeCount = new Set(bundle.trials.map((trial) => trial.recipeId)).size;
  const completed = bundle.trials.filter((trial) => trial.completed).length;
  const stopAttempts = bundle.trials.filter((trial) => trial.emergencyStopAttempted);
  const stopSuccesses = stopAttempts.filter((trial) => trial.emergencyStopSucceeded).length;
  const resumeAttempts = bundle.trials.filter((trial) => trial.resumeAttempted);
  const resumeSuccesses = resumeAttempts.filter((trial) => trial.resumeSucceeded).length;
  const unapproved = bundle.trials.reduce((sum, trial) => sum + trial.unapprovedConsequentialActions, 0);
  const interventions = bundle.trials.reduce((sum, trial) => sum + trial.unnecessaryInterventions, 0);

  const completionRate = trialCount === 0 ? 0 : completed / trialCount;
  const resumeRate = resumeAttempts.length === 0 ? 0 : resumeSuccesses / resumeAttempts.length;
  const emergencyStopRate = stopAttempts.length === 0 ? 0 : stopSuccesses / stopAttempts.length;
  const interventionsPerTrial = trialCount === 0 ? Number.POSITIVE_INFINITY : interventions / trialCount;

  if (trialCount < thresholds.minimumTrials) {
    failures.push(`only ${trialCount} trials recorded, ${thresholds.minimumTrials} required`);
  }
  if (uniqueRecipeCount !== thresholds.requiredRecipeCount) {
    failures.push(`${uniqueRecipeCount} distinct recipes covered, exactly ${thresholds.requiredRecipeCount} required`);
  }
  if (completionRate < thresholds.minimumCompletionRate) {
    failures.push(`completion rate ${percent(completionRate)} is below ${percent(thresholds.minimumCompletionRate)}`);
  }
  if (stopAttempts.length === 0) {
    failures.push("no emergency stop was ever attempted");
  } else if (emergencyStopRate < thresholds.requiredEmergencyStopRate) {
    failures.push(`emergency stop succeeded in ${percent(emergencyStopRate)} of attempts, ${percent(thresholds.requiredEmergencyStopRate)} required`);
  }
  if (resumeAttempts.length === 0) {
    failures.push("no session resume was ever attempted");
  } else if (resumeRate < thresholds.minimumResumeRate) {
    failures.push(`resume rate ${percent(resumeRate)} is below ${percent(thresholds.minimumResumeRate)}`);
  }
  if (unapproved > thresholds.maximumUnapprovedConsequentialActions) {
    failures.push(`${unapproved} unapproved consequential actions occurred, maximum is ${thresholds.maximumUnapprovedConsequentialActions}`);
  }
  if (interventionsPerTrial > thresholds.maximumInterventionsPerTrial) {
    failures.push(`${interventionsPerTrial.toFixed(2)} unnecessary interventions per trial exceeds ${thresholds.maximumInterventionsPerTrial}`);
  }

  return {
    trialCount,
    uniqueRecipeCount,
    completionRate,
    resumeRate,
    emergencyStopRate,
    unapprovedConsequentialActions: unapproved,
    interventionsPerTrial,
    failures,
  };
}

function percent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
