/**
 * The completion evaluator (version 2).
 *
 * Reports three separate numbers. Proven completion counts only gates that are
 * `passed` on the ledger with valid, bound, fresh, signed evidence and fully
 * proven prerequisites. Implementation readiness carries partial credit for
 * prepared but unproven work and is never described as completion. Live
 * completion covers only the gates that require real-system evidence.
 */

import { sha256Canonical } from "../fieldContracts.js";
import {
  benchmarkGates,
  disqualifyingStatuses,
  gateEvidenceAllowlist,
  implementationStatusScore,
  isBenchmarkGate,
  requiredGateIds,
  requiredPhaseIds,
  satisfyingStatuses,
  severityWeight,
  TEST_DEFINITION_VERSION,
  type CompletionStatus,
  type CompletionTarget,
} from "./policy.js";
import {
  buildCompletionEvaluationSchema,
  buildCompletionManifestSchema,
  completionLedgerSchema,
  evidenceStoreSchema,
  type BuildCompletionEvaluation,
  type BuildCompletionManifest,
  type CompletionLedger,
  type CompletionTest,
  type EvidenceStore,
  type GateEvaluation,
  type KeyRegistry,
} from "./contracts.js";
import {
  gateRequiresLiveEvidence,
  qualifyingEvidenceForGate,
  verifyEvidenceStore,
  type EvidenceArtifactSource,
} from "./evidence.js";
import { verifyCompletionLedger } from "./ledger.js";
import { verifyFieldLifecycle } from "./fieldLifecycle.js";
import { fieldLifecycleLedgerSchema, type FieldLifecycleLedger } from "./contracts.js";
import { evaluateBenchmark, parseTrialBundle } from "./benchmark.js";
import { verifyKeyRegistry, verifyRecordSignature } from "./signing.js";
import { EMPTY_CUSTODY_LEDGER, verifyKeyCustodyLedger, type KeyCustodyLedger } from "./keyCustody.js";
import { EMPTY_RECOVERY_LEDGER, foldRecoveryLedger, type KeyRecoveryLedger } from "./keyRecovery.js";
import type { TpmProof } from "./tpmAttestation.js";

export interface CompletionEvaluationRequest {
  readonly manifest: BuildCompletionManifest;
  readonly ledger: CompletionLedger;
  readonly evidence: EvidenceStore;
  readonly registry: KeyRegistry;
  readonly artifacts: EvidenceArtifactSource;
  readonly target: CompletionTarget;
  /** Host-signed Field lifecycle. Required for any Field-bound live evidence. */
  readonly fieldLifecycle?: FieldLifecycleLedger;
  /** Key custody chain. Live evidence fails closed without it. */
  readonly keyCustody?: KeyCustodyLedger;
  /** Recovery grants. A key with an open grant cannot produce live evidence. */
  readonly keyRecovery?: KeyRecoveryLedger;
  /** TPM participation proofs, one per live signing event. */
  readonly tpmProofs?: readonly TpmProof[];
  /** Attestation keys this deployment trusts. */
  readonly acceptedAttestationFingerprints?: readonly string[];
  readonly now?: string;
  /** Overrides the in-repo pinned root fingerprints. Used by fixtures. */
  readonly acceptedRootFingerprints?: readonly string[];
}

const targetLabels: Record<CompletionTarget, string> = {
  personal_mvp: "personal MVP",
  daily_driver: "daily driver",
  production: "production",
};

export function evaluateBuildCompletion(request: CompletionEvaluationRequest): BuildCompletionEvaluation {
  const manifest = buildCompletionManifestSchema.parse(structuredClone(request.manifest));
  const ledger = completionLedgerSchema.parse(structuredClone(request.ledger));
  const evidence = evidenceStoreSchema.parse(structuredClone(request.evidence));
  const now = request.now ?? new Date().toISOString();

  const integrityFailures: string[] = [];

  // ---- the key registry must be sealed by the pinned offline root key ----
  integrityFailures.push(...verifyKeyRegistry(request.registry, now, request.acceptedRootFingerprints)
    .map((reason) => `key registry: ${reason}`));

  // ---- the manifest itself must be signed by a manifest-role key ----
  integrityFailures.push(...verifyRecordSignature(manifest, {
    registry: request.registry,
    keyId: manifest.signingKeyId,
    role: "manifest",
    signedAt: manifest.generatedAt,
  }).map((reason) => `manifest: ${reason}`));

  if (manifest.testDefinitionVersion !== TEST_DEFINITION_VERSION) {
    integrityFailures.push(
      `manifest: test definitions ${manifest.testDefinitionVersion} do not match the policy version ${TEST_DEFINITION_VERSION}`,
    );
  }

  integrityFailures.push(...validateCompletionGraph(manifest));

  const lifecycleResult = request.fieldLifecycle === undefined
    ? undefined
    : verifyFieldLifecycle({
      ledger: fieldLifecycleLedgerSchema.parse(structuredClone(request.fieldLifecycle)),
      registry: request.registry,
    });
  if (lifecycleResult !== undefined) {
    integrityFailures.push(...lifecycleResult.failures.map((reason) => `field lifecycle: ${reason}`));
  }

  // Key custody (v2.3). A malformed custody or recovery chain is an integrity
  // failure in its own right, and separately leaves live records with nothing
  // trustworthy to bind their backend claim to.
  const custodyResult = verifyKeyCustodyLedger(request.keyCustody ?? EMPTY_CUSTODY_LEDGER);
  integrityFailures.push(...custodyResult.failures.map((reason) => `key custody: ${reason}`));

  const recoveryState = foldRecoveryLedger(request.keyRecovery ?? EMPTY_RECOVERY_LEDGER);
  integrityFailures.push(...recoveryState.failures.map((reason) => `key recovery: ${reason}`));

  const evidenceResult = verifyEvidenceStore({
    records: evidence.records,
    manifest,
    registry: request.registry,
    artifacts: request.artifacts,
    now,
    custody: custodyResult,
    openRecoveryKeyIds: recoveryState.openKeyIds,
    tpmProofs: request.tpmProofs ?? [],
    acceptedAttestationFingerprints: request.acceptedAttestationFingerprints ?? [],
    ...(lifecycleResult === undefined ? {} : { lifecycle: lifecycleResult }),
  });
  integrityFailures.push(...evidenceResult.storeFailures.map((reason) => `evidence store: ${reason}`));
  for (const [evidenceId, reasons] of evidenceResult.failures) {
    for (const reason of reasons) integrityFailures.push(`evidence ${evidenceId}: ${reason}`);
  }

  const ledgerResult = verifyCompletionLedger({
    ledger,
    registry: request.registry,
    validEvidence: evidenceResult.valid,
    knownTestIds: new Set(manifest.tests.map((test) => test.id)),
    now,
  });
  integrityFailures.push(...ledgerResult.failures);

  // A broken chain or a bad signature makes the whole fold untrustworthy.
  const ledgerTrusted = ledgerResult.failures.length === 0;

  const testsById = new Map(manifest.tests.map((test) => [test.id, test]));
  const statusOf = (testId: string): CompletionStatus => ledgerResult.statuses.get(testId) ?? "planned";

  // ---- per-gate evaluation, with memoised transitive prerequisite proof ----
  const gateCache = new Map<string, GateEvaluation>();
  const inProgress = new Set<string>();

  const evaluateGate = (testId: string): GateEvaluation => {
    const cached = gateCache.get(testId);
    if (cached !== undefined) return cached;

    const test = testsById.get(testId);
    if (test === undefined) {
      const missing: GateEvaluation = {
        testId,
        phaseId: "M0",
        status: "planned",
        proven: false,
        requiresLiveEvidence: false,
        qualifyingEvidenceIds: [],
        failures: [`unknown test ${testId}`],
      };
      gateCache.set(testId, missing);
      return missing;
    }

    if (inProgress.has(testId)) {
      // Guarded by graph validation; treated as unproven rather than recursing.
      const cyclic: GateEvaluation = {
        testId,
        phaseId: test.phaseId,
        status: statusOf(testId),
        proven: false,
        requiresLiveEvidence: false,
        qualifyingEvidenceIds: [],
        failures: ["prerequisite cycle"],
      };
      return cyclic;
    }
    inProgress.add(testId);

    const allowed = gateEvidenceAllowlist[test.id] ?? [];
    const requiresLive = gateRequiresLiveEvidence(allowed);
    const status = statusOf(test.id);
    const failures: string[] = [];

    if (allowed.length === 0) failures.push(`gate ${test.id} has no evidence allowlist in policy`);

    const qualifying = qualifyingEvidenceForGate(test.id, evidenceResult.valid);
    const qualifyingIds = qualifying.map((record) => record.evidenceId);

    if (satisfyingStatuses.has(status)) {
      if (!ledgerTrusted) failures.push("ledger integrity failure prevents trusting this status");
      if (qualifying.length === 0) failures.push("no valid evidence in an accepted class");

      const cited = ledgerResult.citedEvidence.get(test.id) ?? [];
      if (!cited.some((evidenceId) => qualifyingIds.includes(evidenceId))) {
        failures.push("the promoting ledger event cites no valid qualifying evidence");
      }

      // ---- benchmark gates are computed, never asserted ----
      if (isBenchmarkGate(test.id)) {
        const thresholds = benchmarkGates[test.id];
        const bundleEvidence = qualifying.find((record) => cited.includes(record.evidenceId));
        if (bundleEvidence === undefined) {
          failures.push("benchmark gate cites no trial bundle");
        } else {
          const artifact = request.artifacts.read(bundleEvidence.artifactSha256);
          if (artifact === undefined) {
            failures.push("benchmark trial bundle artifact is absent");
          } else {
            try {
              const bundle = parseTrialBundle(artifact);
              const outcome = evaluateBenchmark(bundle, test.id, thresholds, manifest.baselineCommit);
              failures.push(...outcome.failures.map((reason) => `benchmark: ${reason}`));
            } catch (error) {
              failures.push(`benchmark trial bundle is unreadable: ${(error as Error).message.slice(0, 120)}`);
            }
          }
        }
      }
    } else {
      failures.push(`status is ${status}, not passed`);
    }

    // ---- prerequisites must themselves be proven ----
    for (const prerequisiteId of test.prerequisites) {
      const prerequisiteStatus = statusOf(prerequisiteId);
      if (disqualifyingStatuses.has(prerequisiteStatus)) {
        failures.push(`prerequisite ${prerequisiteId} is ${prerequisiteStatus}`);
        continue;
      }
      const prerequisite = evaluateGate(prerequisiteId);
      if (!prerequisite.proven) {
        failures.push(`prerequisite ${prerequisiteId} is not proven`);
      }
    }

    inProgress.delete(testId);

    const evaluation: GateEvaluation = {
      testId: test.id,
      phaseId: test.phaseId,
      status,
      proven: failures.length === 0,
      requiresLiveEvidence: requiresLive,
      qualifyingEvidenceIds: qualifyingIds,
      failures,
    };
    gateCache.set(testId, evaluation);
    return evaluation;
  };

  for (const test of manifest.tests) evaluateGate(test.id);

  const requiredTests = manifest.tests.filter((test) => test.requiredFor.includes(request.target));
  const gates = requiredTests.map((test) => evaluateGate(test.id));

  // ---- three metrics ----
  const totalWeight = requiredTests.reduce((sum, test) => sum + severityWeight(test.severity), 0);
  const provenWeight = requiredTests.reduce(
    (sum, test) => sum + (evaluateGate(test.id).proven ? severityWeight(test.severity) : 0),
    0,
  );
  const implementationWeight = requiredTests.reduce(
    (sum, test) => sum + severityWeight(test.severity) * implementationStatusScore[statusOf(test.id)],
    0,
  );
  const liveTests = requiredTests.filter((test) => gateRequiresLiveEvidence(gateEvidenceAllowlist[test.id] ?? []));
  const liveTotalWeight = liveTests.reduce((sum, test) => sum + severityWeight(test.severity), 0);
  const liveProvenWeight = liveTests.reduce(
    (sum, test) => sum + (evaluateGate(test.id).proven ? severityWeight(test.severity) : 0),
    0,
  );

  const metrics = {
    provenCompletionPercent: ratio(provenWeight, totalWeight),
    implementationReadinessPercent: ratio(implementationWeight, totalWeight),
    liveCompletionPercent: ratio(liveProvenWeight, liveTotalWeight),
  };

  // ---- phases ----
  const phaseCompletion = new Map<string, boolean>();
  const phaseStates = [...manifest.phases]
    .sort((left, right) => left.order - right.order)
    .map((phase) => {
      const phaseTests = requiredTests.filter((test) => test.phaseId === phase.id);
      const dependenciesComplete = phase.dependencies.every((dependency) => phaseCompletion.get(dependency) === true);
      const blockingTestIds = phaseTests.filter((test) => !evaluateGate(test.id).proven).map((test) => test.id);
      const complete = dependenciesComplete && phaseTests.length > 0 && blockingTestIds.length === 0;
      const blocked = !dependenciesComplete
        || phaseTests.some((test) => disqualifyingStatuses.has(statusOf(test.id)));
      phaseCompletion.set(phase.id, complete);
      return { phaseId: phase.id, complete, blocked, blockingTestIds };
    });

  const nextPhaseIds = phaseStates
    .filter((state) => !state.complete)
    .filter((state) => {
      const phase = manifest.phases.find((candidate) => candidate.id === state.phaseId);
      return phase !== undefined
        && phase.dependencies.every((dependency) => phaseCompletion.get(dependency) === true);
    })
    .map((state) => state.phaseId)
    .slice(0, 1);

  const blockingTestIds = gates.filter((gate) => !gate.proven).map((gate) => gate.testId);
  const promotionAllowed = requiredTests.length > 0
    && blockingTestIds.length === 0
    && integrityFailures.length === 0;

  const label = targetLabels[request.target];
  const core = {
    contractVersion: 2 as const,
    target: request.target,
    evaluatedAt: now,
    metrics,
    headline: `Exosuit ${label}: ${metrics.provenCompletionPercent}% proven complete, `
      + `${metrics.implementationReadinessPercent}% implementation-ready, `
      + `${metrics.liveCompletionPercent}% live-validated.`,
    requiredTestCount: requiredTests.length,
    provenTestCount: gates.filter((gate) => gate.proven).length,
    liveEvidenceRequiredCount: liveTests.length,
    gates,
    phaseStates,
    nextPhaseIds,
    blockingTestIds,
    integrityFailures,
    promotionAllowed,
    // Production still requires an explicit contract change; it is computed
    // rather than hardcoded so a future decision does not break the schema.
    productionAllowed: promotionAllowed
      && request.target === "production"
      && manifest.productionDecision !== "denied",
  };

  return buildCompletionEvaluationSchema.parse({ ...core, resultHash: sha256Canonical(core) });
}

function validateCompletionGraph(manifest: BuildCompletionManifest): string[] {
  const failures: string[] = [];
  const phaseIds = new Set<string>();
  const orders = new Set<number>();

  for (const phase of manifest.phases) {
    if (phaseIds.has(phase.id)) failures.push(`duplicate phase ${phase.id}`);
    if (orders.has(phase.order)) failures.push(`duplicate phase order ${phase.order}`);
    phaseIds.add(phase.id);
    orders.add(phase.order);
  }
  for (const required of requiredPhaseIds) {
    if (!phaseIds.has(required)) failures.push(`missing required phase ${required}`);
  }
  for (const phase of manifest.phases) {
    for (const dependency of phase.dependencies) {
      if (!phaseIds.has(dependency)) failures.push(`${phase.id}: unknown phase dependency ${dependency}`);
      if (dependency === phase.id) failures.push(`${phase.id}: self dependency`);
    }
  }
  failures.push(...detectCycles(
    manifest.phases.map((phase) => [phase.id, phase.dependencies] as const),
    "phase",
  ));

  const testIds = new Set<string>();
  const phaseOrder = new Map(manifest.phases.map((phase) => [phase.id, phase.order]));
  for (const test of manifest.tests) {
    if (testIds.has(test.id)) failures.push(`duplicate test ${test.id}`);
    testIds.add(test.id);
    if (!phaseIds.has(test.phaseId)) failures.push(`${test.id}: unknown phase ${test.phaseId}`);
    if (gateEvidenceAllowlist[test.id] === undefined) {
      failures.push(`${test.id}: no evidence allowlist in policy`);
    }
  }
  for (const required of requiredGateIds) {
    if (!testIds.has(required)) failures.push(`missing required gate ${required}`);
  }
  for (const phase of manifest.phases) {
    if (!manifest.tests.some((test) => test.phaseId === phase.id)) {
      failures.push(`${phase.id}: no completion test`);
    }
  }

  for (const test of manifest.tests) {
    const order = phaseOrder.get(test.phaseId);
    for (const prerequisite of test.prerequisites) {
      if (!testIds.has(prerequisite)) {
        failures.push(`${test.id}: unknown prerequisite ${prerequisite}`);
        continue;
      }
      if (prerequisite === test.id) failures.push(`${test.id}: self prerequisite`);
      // A gate may not depend on work scheduled in a later phase.
      const prerequisitePhase = manifest.tests.find((candidate) => candidate.id === prerequisite)?.phaseId;
      const prerequisiteOrder = prerequisitePhase === undefined ? undefined : phaseOrder.get(prerequisitePhase);
      if (order !== undefined && prerequisiteOrder !== undefined && prerequisiteOrder > order) {
        failures.push(
          `${test.id} (${test.phaseId}) depends on ${prerequisite} in the later phase ${prerequisitePhase}`,
        );
      }
    }
  }
  failures.push(...detectCycles(
    manifest.tests.map((test) => [test.id, test.prerequisites] as const),
    "test",
  ));

  return failures;
}

function detectCycles(
  nodes: readonly (readonly [string, readonly string[]])[],
  label: string,
): string[] {
  const failures: string[] = [];
  const edges = new Map(nodes);
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visiting.has(id)) {
      failures.push(`${label} dependency cycle detected at ${id}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of edges.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };

  for (const [id] of nodes) visit(id);
  return failures;
}

function ratio(earned: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((earned / total) * 10_000) / 100;
}
