/**
 * Evidence verification.
 *
 * Evidence is content-addressed: a record commits to the SHA-256 of an
 * artifact that must actually be present in the store and hash to exactly that
 * value. Each artifact, evidence id, and nonce may be used once, by one test,
 * so a single file cannot satisfy unrelated gates, be replayed from an earlier
 * Field generation, or be carried across machines.
 */

import { createHash } from "node:crypto";
import {
  evidenceMaximumAgeDays,
  evidenceClassAllowedForGate,
  fieldBoundEvidenceClasses,
  liveEvidenceClasses,
  maximumClockSkewSeconds,
  TEST_DEFINITION_VERSION,
  type CompletionEvidenceClass,
} from "./policy.js";
import { requiredRoleForLiveEvidence, verifyRecordSignature } from "./signing.js";
import type { BuildCompletionManifest, CompletionEvidence, KeyRegistry } from "./contracts.js";

/** Read an artifact by its content address. Returns undefined when absent. */
export interface EvidenceArtifactSource {
  read(artifactSha256: string): Uint8Array | undefined;
}

export function artifactSourceFromMap(entries: ReadonlyMap<string, Uint8Array>): EvidenceArtifactSource {
  return { read: (hash) => entries.get(hash) };
}

export interface EvidenceVerificationRequest {
  readonly records: readonly CompletionEvidence[];
  readonly manifest: BuildCompletionManifest;
  readonly registry: KeyRegistry;
  readonly artifacts: EvidenceArtifactSource;
  readonly now: string;
}

export interface EvidenceVerificationResult {
  /** Evidence that survived every check, keyed by evidence id. */
  readonly valid: ReadonlyMap<string, CompletionEvidence>;
  /** Per-evidence-id reasons for rejection. */
  readonly failures: ReadonlyMap<string, string[]>;
  /** Store-wide failures not attributable to a single record. */
  readonly storeFailures: readonly string[];
}

export function verifyEvidenceStore(request: EvidenceVerificationRequest): EvidenceVerificationResult {
  const valid = new Map<string, CompletionEvidence>();
  const failures = new Map<string, string[]>();
  const storeFailures: string[] = [];

  const seenEvidenceIds = new Set<string>();
  const seenArtifacts = new Map<string, string>();
  const seenNonces = new Map<string, string>();
  const knownTestIds = new Set(request.manifest.tests.map((test) => test.id));

  const nowMs = Date.parse(request.now);
  const baselineMs = Date.parse(request.manifest.baselineCommittedAt);

  for (const record of request.records) {
    const reasons: string[] = [];

    // ---- uniqueness: one artifact, one evidence id, one nonce, one use ----
    if (seenEvidenceIds.has(record.evidenceId)) {
      storeFailures.push(`duplicate evidence id ${record.evidenceId}`);
      reasons.push("duplicate evidence id");
    }
    seenEvidenceIds.add(record.evidenceId);

    const artifactOwner = seenArtifacts.get(record.artifactSha256);
    if (artifactOwner !== undefined) {
      reasons.push(`artifact ${record.artifactSha256.slice(0, 12)} already bound to evidence ${artifactOwner}`);
    } else {
      seenArtifacts.set(record.artifactSha256, record.evidenceId);
    }

    const nonceOwner = seenNonces.get(record.nonce);
    if (nonceOwner !== undefined) {
      reasons.push(`nonce replayed from evidence ${nonceOwner}`);
    } else {
      seenNonces.set(record.nonce, record.evidenceId);
    }

    // ---- binding to a real gate and an allowed proof domain ----
    if (!knownTestIds.has(record.boundTestId)) {
      reasons.push(`bound to unknown test ${record.boundTestId}`);
    } else if (!evidenceClassAllowedForGate(record.boundTestId, record.evidenceClass)) {
      reasons.push(
        `evidence class ${record.evidenceClass} is not accepted by gate ${record.boundTestId}`,
      );
    }

    // ---- binding to the exact source baseline and test definition ----
    if (record.exactCommit !== request.manifest.baselineCommit) {
      reasons.push(`evidence commit ${record.exactCommit.slice(0, 12)} is not the baseline commit`);
    }
    if (record.testDefinitionVersion !== TEST_DEFINITION_VERSION) {
      reasons.push(
        `evidence produced against test definitions ${record.testDefinitionVersion}, current is ${TEST_DEFINITION_VERSION}`,
      );
    }

    // ---- live evidence must describe a real execution environment ----
    const isLiveClass = liveEvidenceClasses.has(record.evidenceClass);
    if (isLiveClass) {
      if (record.designation !== "live") {
        reasons.push(`gate requires live evidence but record is designated ${record.designation}`);
      }
      if (fieldBoundEvidenceClasses.has(record.evidenceClass)) {
        const { fieldId, fieldGeneration, fieldBootId } = record.environment;
        if (fieldId === undefined || fieldGeneration === undefined || fieldBootId === undefined) {
          reasons.push("Field-bound evidence must name fieldId, fieldGeneration, and fieldBootId");
        }
      }
    }

    // ---- freshness and clock sanity ----
    const observedMs = Date.parse(record.observedAt);
    if (Number.isNaN(observedMs)) {
      reasons.push("unparseable observedAt");
    } else {
      if (observedMs > nowMs + maximumClockSkewSeconds * 1000) {
        reasons.push("evidence is dated in the future");
      }
      if (observedMs < baselineMs) {
        reasons.push("evidence predates the baseline commit it claims to validate");
      }
      const maximumAgeMs = evidenceMaximumAgeDays[record.evidenceClass] * 86_400_000;
      if (nowMs - observedMs > maximumAgeMs) {
        reasons.push(`evidence is older than the ${evidenceMaximumAgeDays[record.evidenceClass]}-day freshness window`);
      }
    }

    // ---- the artifact must exist and hash to its content address ----
    const artifact = request.artifacts.read(record.artifactSha256);
    if (artifact === undefined) {
      reasons.push(`artifact ${record.artifactSha256.slice(0, 12)} is not present in the evidence store`);
    } else {
      const actual = createHash("sha256").update(artifact).digest("hex");
      if (actual !== record.artifactSha256) {
        reasons.push(`artifact hash mismatch: store holds ${actual.slice(0, 12)}`);
      }
      if (artifact.byteLength !== record.artifactBytes) {
        reasons.push(`artifact size mismatch: expected ${record.artifactBytes}, found ${artifact.byteLength}`);
      }
    }

    // ---- signature, by a key authorised for this kind of claim ----
    reasons.push(...verifyRecordSignature(record, {
      registry: request.registry,
      keyId: record.signingKeyId,
      role: isLiveClass ? requiredRoleForLiveEvidence() : "evidence",
      signedAt: record.observedAt,
      machineId: record.environment.machineId,
    }));

    if (reasons.length === 0) valid.set(record.evidenceId, record);
    else failures.set(record.evidenceId, reasons);
  }

  return { valid, failures, storeFailures };
}

/** Qualifying evidence for a gate: valid, bound to it, and in an accepted class. */
export function qualifyingEvidenceForGate(
  testId: string,
  valid: ReadonlyMap<string, CompletionEvidence>,
): CompletionEvidence[] {
  return [...valid.values()].filter(
    (record) => record.boundTestId === testId
      && evidenceClassAllowedForGate(testId, record.evidenceClass),
  );
}

export function gateRequiresLiveEvidence(allowed: readonly CompletionEvidenceClass[]): boolean {
  return allowed.some((evidenceClass) => liveEvidenceClasses.has(evidenceClass));
}
