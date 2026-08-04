/**
 * Single authoritative policy for the completion gate contract (version 2).
 *
 * Weights, status scores, evidence rules, transition rules, and benchmark
 * thresholds live here and nowhere else. The CI validator executes the
 * compiled form of this module rather than reimplementing any of it, so the
 * TypeScript evaluator and the shipped validator cannot silently diverge.
 */

export const COMPLETION_CONTRACT_VERSION = 2 as const;

/**
 * Version of the test definitions themselves. Evidence produced against an
 * older definition set is rejected: the acceptance criteria may have changed
 * underneath it.
 */
export const TEST_DEFINITION_VERSION = "2026.08.04" as const;

export const completionTargets = ["personal_mvp", "daily_driver", "production"] as const;
export type CompletionTarget = (typeof completionTargets)[number];

export const completionEvidenceClasses = [
  "source",
  "unit",
  "fake_integration",
  "windows_guest",
  "hyperv_host_guest",
  "chatgpt_mcp",
  "owner_acceptance",
  "security_review",
  "release_operations",
] as const;
export type CompletionEvidenceClass = (typeof completionEvidenceClasses)[number];

/**
 * Evidence classes that can only be produced by exercising a real system.
 * These require host, OS, and (where applicable) Field bindings.
 */
export const liveEvidenceClasses: ReadonlySet<CompletionEvidenceClass> = new Set([
  "windows_guest",
  "hyperv_host_guest",
  "chatgpt_mcp",
  "owner_acceptance",
  "security_review",
  "release_operations",
]);

/** Evidence classes that must additionally name the Field they ran against. */
export const fieldBoundEvidenceClasses: ReadonlySet<CompletionEvidenceClass> = new Set([
  "windows_guest",
  "hyperv_host_guest",
]);

export const completionStatuses = [
  "planned",
  "source_validated",
  "ready_for_live",
  "passed",
  "failed",
  "remediated",
  "revoked",
] as const;
export type CompletionStatus = (typeof completionStatuses)[number];

/**
 * Legal status transitions. There is deliberately no edge into `passed` except
 * from `ready_for_live`: a gate cannot jump from `planned` to `passed`.
 */
export const allowedStatusTransitions: Readonly<Record<CompletionStatus, readonly CompletionStatus[]>> = {
  planned: ["source_validated", "failed"],
  source_validated: ["ready_for_live", "failed"],
  ready_for_live: ["passed", "failed"],
  passed: ["revoked", "failed"],
  failed: ["remediated"],
  remediated: ["ready_for_live", "failed"],
  revoked: ["remediated"],
};

/** Statuses that represent a gate currently satisfying its acceptance criteria. */
export const satisfyingStatuses: ReadonlySet<CompletionStatus> = new Set(["passed"]);

/** Statuses that must block every downstream gate that depends on them. */
export const disqualifyingStatuses: ReadonlySet<CompletionStatus> = new Set([
  "failed",
  "revoked",
]);

/**
 * Partial credit toward *implementation readiness only*. These scores never
 * contribute to proven completion or live completion.
 */
export const implementationStatusScore: Readonly<Record<CompletionStatus, number>> = {
  planned: 0,
  source_validated: 0.45,
  ready_for_live: 0.6,
  passed: 1,
  failed: 0,
  remediated: 0.45,
  revoked: 0,
};

export const severityWeights = {
  critical: 5,
  high: 3,
  medium: 2,
  low: 1,
} as const;
export type CompletionSeverity = keyof typeof severityWeights;

export function severityWeight(severity: CompletionSeverity): number {
  return severityWeights[severity];
}

/**
 * Per-gate evidence allowlist. Evidence classes are distinct proof domains,
 * not a trust ranking: an owner acceptance signature is not a substitute for
 * Hyper-V host/guest evidence, and vice versa. There is no implicit
 * substitution and no ordering between classes.
 */
export const gateEvidenceAllowlist: Readonly<Record<string, readonly CompletionEvidenceClass[]>> = {
  "SRC-001": ["fake_integration"],
  "SRC-002": ["fake_integration"],
  "SRC-003": ["unit"],
  "HYP-001": ["hyperv_host_guest"],
  "CHN-001": ["hyperv_host_guest"],
  "SCN-001": ["windows_guest"],
  "ACT-001": ["windows_guest"],
  "TCH-001": ["owner_acceptance"],
  "SHD-001": ["security_review"],
  "AST-001": ["windows_guest"],
  "RCP-001": ["owner_acceptance"],
  "MCP-001": ["chatgpt_mcp"],
  "CPK-001": ["owner_acceptance"],
  "INS-001": ["release_operations"],
  "OWN-001": ["owner_acceptance"],
  "PERF-001": ["owner_acceptance"],
  "COMP-001": ["release_operations"],
  "SEC-001": ["security_review"],
  "REL-001": ["release_operations"],
  "PRD-001": ["release_operations"],
};

export const requiredPhaseIds = ["M0", "M1", "M2", "M3", "M4", "M5", "M6", "P1", "P2", "P3"] as const;
export const requiredGateIds = Object.keys(gateEvidenceAllowlist);

/**
 * Gates whose pass state is computed from signed trial records rather than
 * asserted by a human editing a status field.
 */
export const benchmarkGates = {
  "OWN-001": {
    minimumTrials: 10,
    requiredRecipeCount: 5,
    minimumCompletionRate: 0.9,
    minimumResumeRate: 0.9,
    requiredEmergencyStopRate: 1,
    maximumUnapprovedConsequentialActions: 0,
    maximumInterventionsPerTrial: 0.3,
  },
  "PERF-001": {
    minimumTrials: 100,
    requiredRecipeCount: 5,
    minimumCompletionRate: 0.97,
    minimumResumeRate: 0.99,
    requiredEmergencyStopRate: 1,
    maximumUnapprovedConsequentialActions: 0,
    maximumInterventionsPerTrial: 0.1,
  },
} as const;
export type BenchmarkGateId = keyof typeof benchmarkGates;
export type BenchmarkThresholds = (typeof benchmarkGates)[BenchmarkGateId];

export function isBenchmarkGate(testId: string): testId is BenchmarkGateId {
  return Object.hasOwn(benchmarkGates, testId);
}

/**
 * Registry purpose. Development registries exist so the adversarial suite has
 * reproducible fixtures; they may never attest live evidence.
 */
export const registryPurposes = ["development", "live"] as const;
export type RegistryPurpose = (typeof registryPurposes)[number];

/**
 * SHA-256 fingerprints of the DER public halves of accepted offline root keys.
 *
 * The root PRIVATE key is held offline and never touches the repository. Only
 * the fingerprint is pinned here, so substituting a different root registry is
 * visible in review as a diff to this list. A verifier may additionally pin the
 * root public key outside the repository via EXOSUIT_COMPLETION_ROOT_PUBKEY.
 */
export const pinnedRootKeyFingerprints: readonly string[] = [
  // development root — fixtures only, may never sign a live registry
  "95ec3b180ab30f94d5dc86f28c439b2f7f366e87a1b89c938463c7eac66ba426",
];

/**
 * Approval kinds. These are distinct authorities and are never interchangeable:
 * an engineering review is not owner acceptance, and neither is a release
 * approval.
 */
export const approvalRoles = ["technical_review", "owner_acceptance", "release_approval"] as const;
export type ApprovalRole = (typeof approvalRoles)[number];

/** Gates that only the owner can accept, and gates that require release sign-off. */
const ownerAcceptanceGates = new Set(["TCH-001", "RCP-001", "CPK-001", "OWN-001", "PERF-001"]);
const releaseApprovalGates = new Set(["INS-001", "COMP-001", "REL-001", "PRD-001"]);

export function requiredApprovalRole(testId: string): ApprovalRole {
  if (ownerAcceptanceGates.has(testId)) return "owner_acceptance";
  if (releaseApprovalGates.has(testId)) return "release_approval";
  return "technical_review";
}

/** Freshness policy, in days, by evidence class. */
export const evidenceMaximumAgeDays: Readonly<Record<CompletionEvidenceClass, number>> = {
  source: 180,
  unit: 180,
  fake_integration: 180,
  windows_guest: 90,
  hyperv_host_guest: 90,
  chatgpt_mcp: 90,
  owner_acceptance: 180,
  security_review: 365,
  release_operations: 180,
};

/** Tolerance for clock skew between the evidence producer and the evaluator. */
export const maximumClockSkewSeconds = 300;

export function evidenceClassAllowedForGate(testId: string, evidenceClass: CompletionEvidenceClass): boolean {
  const allowed = gateEvidenceAllowlist[testId];
  if (allowed === undefined) return false;
  return allowed.includes(evidenceClass);
}

export function isTransitionAllowed(from: CompletionStatus, to: CompletionStatus): boolean {
  return allowedStatusTransitions[from].includes(to);
}
