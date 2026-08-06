/**
 * The frozen contract surface (v2.3).
 *
 * Freezing is only meaningful if a change is detected rather than merely
 * discouraged. This module reduces the parts of the contract that M1 evidence
 * will depend on — statuses, transitions, evidence classes and their per-gate
 * allowlists, weights, scores, benchmark thresholds, freshness windows,
 * approval authorities, and the field lists of every wire schema — to a single
 * canonical fingerprint, pinned below.
 *
 * `tests/completionContractFrozen.test.ts` recomputes it. If the fingerprint
 * moves, the contract moved, and evidence collected under the old one may no
 * longer mean what it did. Changing the pin is therefore a deliberate,
 * reviewable act: bump the label, state why, and re-attest.
 *
 * Frozen 2026-08-06 at v2.2, after M0.5 live attestation and reboot
 * verification passed 18/18 on a genuine restart.
 *
 * Re-frozen 2026-08-06 at v2.3, after key custody binding, TPM participation
 * proof, and versioned record schemas were added. The surface moved because
 * signed records gained `recordVersion` and the custody fields, and because
 * policy gained the protection backends and the legacy-live cutoff. M0 was
 * re-attested against this surface in the same change — see the commit.
 */

import { sha256Canonical } from "../fieldContracts.js";
import {
  allowedStatusTransitions,
  approvalRoles,
  benchmarkGates,
  COMPLETION_CONTRACT_VERSION,
  completionEvidenceClasses,
  completionStatuses,
  completionTargets,
  disqualifyingStatuses,
  evidenceMaximumAgeDays,
  fieldBoundEvidenceClasses,
  gateEvidenceAllowlist,
  implementationStatusScore,
  liveEvidenceClasses,
  maximumClockSkewSeconds,
  registryPurposes,
  requiredApprovalRole,
  requiredGateIds,
  requiredPhaseIds,
  satisfyingStatuses,
  severityWeights,
  TEST_DEFINITION_VERSION,
} from "./policy.js";
import {
  buildCompletionManifestSchema,
  completionEvidenceV22Schema,
  completionEvidenceV23Schema,
  completionLedgerEventV22Schema,
  completionLedgerEventV23Schema,
  completionTestSchema,
  completionTrialBundleSchema,
  completionTrialSchema,
  executionEnvironmentSchema,
  fieldLifecycleEventSchema,
  keyRegistrySchema,
  signingKeySchema,
} from "./contracts.js";

/** The human-facing label. `contractVersion` on the wire stays 2. */
export const FROZEN_CONTRACT_LABEL = "2.3" as const;

function fields(schema: { shape: Record<string, unknown> }): string[] {
  return Object.keys(schema.shape).sort();
}

/** Everything M1 evidence depends on for its meaning. */
export function frozenContractSurface(): Record<string, unknown> {
  return {
    label: FROZEN_CONTRACT_LABEL,
    wireContractVersion: COMPLETION_CONTRACT_VERSION,
    testDefinitionVersion: TEST_DEFINITION_VERSION,

    targets: [...completionTargets],
    statuses: [...completionStatuses],
    transitions: allowedStatusTransitions,
    satisfyingStatuses: [...satisfyingStatuses].sort(),
    disqualifyingStatuses: [...disqualifyingStatuses].sort(),

    evidenceClasses: [...completionEvidenceClasses],
    liveEvidenceClasses: [...liveEvidenceClasses].sort(),
    fieldBoundEvidenceClasses: [...fieldBoundEvidenceClasses].sort(),
    gateEvidenceAllowlist,
    evidenceMaximumAgeDays,
    maximumClockSkewSeconds,

    severityWeights,
    implementationStatusScore,
    benchmarkGates,

    approvalRoles: [...approvalRoles],
    approvalByGate: Object.fromEntries(
      requiredGateIds.map((gateId) => [gateId, requiredApprovalRole(gateId)]),
    ),

    registryPurposes: [...registryPurposes],
    requiredPhaseIds: [...requiredPhaseIds],
    requiredGateIds: [...requiredGateIds].sort(),

    schemaFields: {
      manifest: fields(buildCompletionManifestSchema),
      test: fields(completionTestSchema),
      evidence: fields(completionEvidenceV23Schema),
      environment: fields(executionEnvironmentSchema),
      ledgerEvent: fields(completionLedgerEventV23Schema),
      lifecycleEvent: fields(fieldLifecycleEventSchema),
      trial: fields(completionTrialSchema),
      trialBundle: fields(completionTrialBundleSchema),
      registry: fields(keyRegistrySchema),
      signingKey: fields(signingKeySchema),
    },
  };
}

export function frozenContractFingerprint(): string {
  return sha256Canonical(frozenContractSurface());
}

/**
 * Pinned fingerprint. Changing this value is a contract change: say why in the
 * commit, bump FROZEN_CONTRACT_LABEL, and re-attest anything that depended on
 * the old surface.
 */
export const FROZEN_CONTRACT_FINGERPRINT =
  "2d16a0c5bba40a424b001b770ef8988a0b178d764ba53e3606ecc11c1d322f67";
