/**
 * Wire contracts for the completion gate system (version 2).
 *
 * Structural change from version 1: a test definition no longer carries a
 * mutable `status` or an inline `evidence` array. Authoritative status is
 * folded from an append-only, hash-chained, signed transition ledger, and
 * evidence is content-addressed in a separate store. Editing the manifest
 * therefore cannot promote a gate.
 */

import { z } from "zod";
import {
  approvalRoles,
  COMPLETION_CONTRACT_VERSION,
  completionEvidenceClasses,
  completionStatuses,
  completionTargets,
  keyProtectionBackends,
  registryPurposes,
} from "./policy.js";

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);
const commitSha = z.string().regex(/^[a-f0-9]{40}$/);
const signatureValue = z.string().regex(/^[A-Za-z0-9_-]{16,512}$/);
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const testId = z.string().regex(/^[A-Z]{2,5}-[0-9]{3}$/);
const phaseId = z.string().regex(/^[MP][0-9]+$/);

export const completionTargetSchema = z.enum(completionTargets);
export const completionEvidenceClassSchema = z.enum(completionEvidenceClasses);
export const completionStatusSchema = z.enum(completionStatuses);

/* ------------------------------------------------------------------ keys */

export const signingKeyRoleSchema = z.enum([
  "manifest",
  "ledger",
  "evidence",
  "host",
  // Approval authorities. These are held by people, never by host automation,
  // so a transition's approval cannot be minted by whoever holds the ledger key.
  "technical_review",
  "owner_acceptance",
  "release_approval",
]);
export type SigningKeyRole = z.infer<typeof signingKeyRoleSchema>;

/**
 * Public half of a signing key. Only public material is ever committed; the
 * private half is held outside the repository, and host-bound keys are held
 * by the machine that produces live evidence.
 */
export const signingKeySchema = z.object({
  keyId: identifier,
  algorithm: z.literal("ed25519"),
  publicKey: z.string().min(1).max(1000),
  roles: z.array(signingKeyRoleSchema).min(1),
  /** Present for host-bound keys; live evidence must be signed by the machine it names. */
  machineId: identifier.optional(),
  notBefore: z.string().datetime(),
  notAfter: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
  revocationReason: z.string().min(1).max(300).optional(),
}).strict();
export type SigningKey = z.infer<typeof signingKeySchema>;

/**
 * A revocation, signed by the offline root key. Stronger than the `revokedAt`
 * marker on a key: a registry editor cannot un-revoke by deleting a field,
 * because the revocation carries its own root signature.
 */
export const keyRevocationSchema = z.object({
  keyId: identifier,
  revokedAt: z.string().datetime(),
  reason: z.string().min(1).max(300),
  rootKeyId: identifier,
  signature: signatureValue,
}).strict();
export type KeyRevocation = z.infer<typeof keyRevocationSchema>;

/**
 * The key registry envelope, signed by the offline root key.
 *
 * `purpose` separates development fixtures from live attestation authority;
 * live evidence is rejected unless it is signed under a `live` registry.
 * `version` and `previousRegistryHash` chain registry changes, so a registry
 * cannot be silently rolled back to an earlier key set.
 */
export const keyRegistrySchema = z.object({
  contractVersion: z.literal(COMPLETION_CONTRACT_VERSION),
  registryId: identifier,
  purpose: z.enum(registryPurposes),
  version: z.number().int().positive(),
  previousRegistryHash: sha256Hex,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  keys: z.array(signingKeySchema).min(1),
  revocations: z.array(keyRevocationSchema),
  rootKeyId: identifier,
  /** DER SPKI, base64. Its SHA-256 must match a pinned root fingerprint. */
  rootPublicKey: z.string().min(1).max(1000),
  signature: signatureValue,
}).strict();
export type KeyRegistry = z.infer<typeof keyRegistrySchema>;

/* -------------------------------------------------------------- evidence */

/**
 * Environment binding. Live evidence must identify the real machine and OS it
 * was produced on; Field-bound classes must additionally identify the exact
 * Field generation and boot, so evidence cannot be replayed from an earlier
 * generation or a different machine.
 */
export const executionEnvironmentSchema = z.object({
  machineId: identifier,
  osEdition: z.string().min(1).max(120),
  osBuild: z.string().min(1).max(60),
  fieldId: identifier.optional(),
  fieldGeneration: z.number().int().positive().optional(),
  fieldBootId: identifier.optional(),
}).strict();
export type ExecutionEnvironment = z.infer<typeof executionEnvironmentSchema>;

export const evidenceDesignationSchema = z.enum(["live", "synthetic"]);

/**
 * Key custody binding (contract v2.3), shared by every signed record.
 *
 * These say how the signing key was protected when the record was made, and
 * point at the custody event that independently attests it. The signature
 * covers them, so they cannot be edited onto an existing record.
 *
 * They are **optional in the schema and mandatory for live records**, enforced
 * in the verifier rather than here. Making them structurally required would
 * invalidate every record signed under v2.2 — including the recorded M0
 * attestation — turning a protection improvement into a forced re-attestation
 * of unrelated evidence. A live record that omits them is rejected, so the
 * looser schema costs nothing: omission fails closed.
 */
export const keyCustodyBindingShape = {
  /** The backend that actually opened the signing key. Live records must say `tpm`. */
  keyProtectionBackend: z.enum(keyProtectionBackends).optional(),
  /** The custody event attesting that backend for that key. */
  keyCustodyEventId: identifier.optional(),
  /** The purpose of the registry the signing key was used under. */
  registryPurpose: z.enum(registryPurposes).optional(),
  /** Present only when the key was opened under an explicit recovery grant. */
  recoveryGrantId: identifier.optional(),
  /**
   * The TPM participation proof for this signing event.
   *
   * Without it, `keyProtectionBackend: tpm` rests on the custody event — which
   * is signed by the same Ed25519 key it describes, so a holder of that key
   * could mint record and custody event together and have them agree. The proof
   * is produced by a separate non-exportable TPM key, so it cannot be.
   */
  tpmProofId: identifier.optional(),
} as const;

/**
 * Signed, content-addressed evidence record. The record describes an artifact;
 * the artifact itself lives in the evidence store and is located by its own
 * SHA-256. A record is bound to exactly one test.
 */
export const completionEvidenceSchema = z.object({
  evidenceId: identifier,
  boundTestId: testId,
  evidenceClass: completionEvidenceClassSchema,
  artifactSha256: sha256Hex,
  artifactBytes: z.number().int().positive().max(1_000_000_000),
  mediaType: z.string().min(1).max(120),
  exactCommit: commitSha,
  runId: identifier,
  environment: executionEnvironmentSchema,
  testDefinitionVersion: z.string().min(1).max(40),
  issuer: identifier,
  reviewer: identifier.optional(),
  observedAt: z.string().datetime(),
  nonce: z.string().regex(/^[a-f0-9]{32}$/),
  designation: evidenceDesignationSchema,
  signingKeyId: identifier,
  ...keyCustodyBindingShape,
  signature: signatureValue,
}).strict();
export type CompletionEvidence = z.infer<typeof completionEvidenceSchema>;

export const evidenceStoreSchema = z.object({
  contractVersion: z.literal(COMPLETION_CONTRACT_VERSION),
  records: z.array(completionEvidenceSchema),
}).strict();
export type EvidenceStore = z.infer<typeof evidenceStoreSchema>;

/* ---------------------------------------------------------- trial records */

/** One live trial of one recipe, as recorded by the harness. */
export const completionTrialSchema = z.object({
  trialId: identifier,
  recipeId: identifier,
  completed: z.boolean(),
  emergencyStopAttempted: z.boolean(),
  emergencyStopSucceeded: z.boolean(),
  resumeAttempted: z.boolean(),
  resumeSucceeded: z.boolean(),
  unapprovedConsequentialActions: z.number().int().nonnegative(),
  unnecessaryInterventions: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  environment: executionEnvironmentSchema,
}).strict();
export type CompletionTrial = z.infer<typeof completionTrialSchema>;

/**
 * The artifact behind a benchmark gate's evidence record. Its SHA-256 is what
 * the evidence record commits to, so trial data cannot be edited after the
 * fact without invalidating the evidence.
 */
export const completionTrialBundleSchema = z.object({
  contractVersion: z.literal(COMPLETION_CONTRACT_VERSION),
  boundTestId: testId,
  exactCommit: commitSha,
  testDefinitionVersion: z.string().min(1).max(40),
  trials: z.array(completionTrialSchema).min(1),
}).strict();
export type CompletionTrialBundle = z.infer<typeof completionTrialBundleSchema>;

/* ------------------------------------------------------- field lifecycle */

/**
 * A Field generation and each of its boots have a lifetime. Without a record of
 * that lifetime, evidence can name a boot of a generation that was destroyed
 * hours earlier and nothing detects it — a gap found during M0.5 reboot
 * verification on 2026-08-05.
 *
 * These events are observed and signed by the host, because only the host sees
 * a Field being created, booted, stopped, and destroyed.
 */
export const fieldLifecycleKindSchema = z.enum(["created", "booted", "stopped", "destroyed"]);
export type FieldLifecycleKind = z.infer<typeof fieldLifecycleKindSchema>;

export const fieldLifecycleEventSchema = z.object({
  eventId: identifier,
  sequence: z.number().int().nonnegative(),
  fieldId: identifier,
  generation: z.number().int().positive(),
  kind: fieldLifecycleKindSchema,
  /** Required for `booted` and `stopped`; identifies the boot session. */
  bootId: identifier.optional(),
  /** Required for `created`; binds the generation to its immutable base. */
  baseImageSha256: sha256Hex.optional(),
  vmGuid: identifier.optional(),
  previousEventHash: sha256Hex,
  machineId: identifier,
  recordedAt: z.string().datetime(),
  signingKeyId: identifier,
  signature: signatureValue,
}).strict();
export type FieldLifecycleEvent = z.infer<typeof fieldLifecycleEventSchema>;

export const fieldLifecycleLedgerSchema = z.object({
  contractVersion: z.literal(COMPLETION_CONTRACT_VERSION),
  events: z.array(fieldLifecycleEventSchema),
}).strict();
export type FieldLifecycleLedger = z.infer<typeof fieldLifecycleLedgerSchema>;

/* ---------------------------------------------------------------- ledger */

/**
 * One status transition. `previousEventHash` chains every event to the one
 * before it, so a later write cannot erase an earlier failure or revocation
 * without breaking the chain.
 */
export const completionLedgerEventSchema = z.object({
  eventId: identifier,
  sequence: z.number().int().nonnegative(),
  testId,
  previousStatus: completionStatusSchema,
  newStatus: completionStatusSchema,
  previousEventHash: sha256Hex,
  exactCommit: commitSha,
  evidenceIds: z.array(identifier),
  issuer: identifier,
  /** Promotion into `passed` requires a reviewer distinct from the issuer. */
  reviewer: identifier.optional(),
  /**
   * Which authority the reviewer exercised. Engineering review, owner
   * acceptance, and release approval are distinct and never interchangeable;
   * policy decides which one a given gate demands.
   */
  reviewerRole: z.enum(approvalRoles).optional(),
  /**
   * The reviewer's own key, which must be distinct from `signingKeyId` and
   * must itself hold the approval role being claimed. Without this the holder
   * of the ledger key could name any reviewer and claim any authority.
   */
  reviewerKeyId: identifier.optional(),
  /**
   * The reviewer's independent signature, taken over the approval content
   * before the issuer seals the event. The issuer signature covers this value,
   * so the issuer cannot alter an approval after it is given.
   */
  reviewerSignature: signatureValue.optional(),
  reason: z.string().min(1).max(500),
  recordedAt: z.string().datetime(),
  signingKeyId: identifier,
  ...keyCustodyBindingShape,
  signature: signatureValue,
}).strict();
export type CompletionLedgerEvent = z.infer<typeof completionLedgerEventSchema>;

export const completionLedgerSchema = z.object({
  contractVersion: z.literal(COMPLETION_CONTRACT_VERSION),
  events: z.array(completionLedgerEventSchema),
}).strict();
export type CompletionLedger = z.infer<typeof completionLedgerSchema>;

/* -------------------------------------------------------------- manifest */

export const completionPhaseSchema = z.object({
  id: phaseId,
  order: z.number().int().nonnegative(),
  name: z.string().min(1).max(160),
  objective: z.string().min(1).max(1000),
  dependencies: z.array(phaseId),
  deliverables: z.array(z.string().min(1).max(500)).min(1),
  exitCriteria: z.array(z.string().min(1).max(500)).min(1),
}).strict();
export type CompletionPhase = z.infer<typeof completionPhaseSchema>;

/**
 * A test definition. Note the absence of `status` and `evidence`: neither is
 * expressible here, by design. `requiredEvidenceClass` is also absent — the
 * per-gate allowlist lives in policy, so the manifest cannot widen it.
 */
export const completionTestSchema = z.object({
  id: testId,
  phaseId,
  title: z.string().min(1).max(240),
  capability: z.string().min(1).max(120),
  severity: z.enum(["critical", "high", "medium", "low"]),
  requiredFor: z.array(completionTargetSchema).min(1),
  prerequisites: z.array(testId),
  acceptanceCriteria: z.array(z.string().min(1).max(500)).min(1),
  rollbackOrContainment: z.string().min(1).max(1000),
  automatedCommand: z.string().min(1).max(500).optional(),
}).strict();
export type CompletionTest = z.infer<typeof completionTestSchema>;

export const buildCompletionManifestSchema = z.object({
  contractVersion: z.literal(COMPLETION_CONTRACT_VERSION),
  generatedAt: z.string().datetime(),
  branch: z.string().min(1).max(200),
  baselineCommit: commitSha,
  /** Evidence claiming to predate the baseline it validates is rejected. */
  baselineCommittedAt: z.string().datetime(),
  testDefinitionVersion: z.string().min(1).max(40),
  productionDecision: z.literal("denied"),
  phases: z.array(completionPhaseSchema).min(1),
  tests: z.array(completionTestSchema).min(1),
  signingKeyId: identifier,
  signature: signatureValue,
}).strict();
export type BuildCompletionManifest = z.infer<typeof buildCompletionManifestSchema>;

/* ------------------------------------------------------------ evaluation */

export const gateEvaluationSchema = z.object({
  testId,
  phaseId,
  status: completionStatusSchema,
  /** True only when status is `passed` and every check below held. */
  proven: z.boolean(),
  requiresLiveEvidence: z.boolean(),
  qualifyingEvidenceIds: z.array(z.string()),
  failures: z.array(z.string()),
}).strict();
export type GateEvaluation = z.infer<typeof gateEvaluationSchema>;

export const completionMetricsSchema = z.object({
  /** Weighted share of required gates that are proven passed. */
  provenCompletionPercent: z.number().finite().min(0).max(100),
  /** Weighted share including partial credit for prepared, unproven work. */
  implementationReadinessPercent: z.number().finite().min(0).max(100),
  /** Weighted share of the live-evidence gates that are proven passed. */
  liveCompletionPercent: z.number().finite().min(0).max(100),
}).strict();
export type CompletionMetrics = z.infer<typeof completionMetricsSchema>;

export const buildCompletionEvaluationSchema = z.object({
  contractVersion: z.literal(COMPLETION_CONTRACT_VERSION),
  target: completionTargetSchema,
  evaluatedAt: z.string().datetime(),
  metrics: completionMetricsSchema,
  headline: z.string().min(1).max(300),
  requiredTestCount: z.number().int().nonnegative(),
  provenTestCount: z.number().int().nonnegative(),
  liveEvidenceRequiredCount: z.number().int().nonnegative(),
  gates: z.array(gateEvaluationSchema),
  phaseStates: z.array(z.object({
    phaseId: z.string(),
    complete: z.boolean(),
    blocked: z.boolean(),
    blockingTestIds: z.array(z.string()),
  }).strict()),
  nextPhaseIds: z.array(z.string()),
  blockingTestIds: z.array(z.string()),
  integrityFailures: z.array(z.string()),
  promotionAllowed: z.boolean(),
  productionAllowed: z.boolean(),
  resultHash: sha256Hex,
}).strict();
export type BuildCompletionEvaluation = z.infer<typeof buildCompletionEvaluationSchema>;
