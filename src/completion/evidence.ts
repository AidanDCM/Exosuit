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
import { checkAgainstLifecycle, type LifecycleVerificationResult } from "./fieldLifecycle.js";

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
  /**
   * Verified Field lifecycle. Field-bound live evidence fails closed without
   * it: with no record of when a generation existed or a boot ran, a record
   * naming a destroyed generation cannot be distinguished from a live one.
   */
  readonly lifecycle?: LifecycleVerificationResult;
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
        } else if (request.lifecycle === undefined) {
          reasons.push(
            "Field-bound evidence requires a verified Field lifecycle ledger; none was supplied",
          );
        } else {
          const observedMs = Date.parse(record.observedAt);
          if (!Number.isNaN(observedMs)) {
            reasons.push(...checkAgainstLifecycle({
              fieldId,
              generation: fieldGeneration,
              bootId: fieldBootId,
              observedAtMs: observedMs,
              lifecycle: request.lifecycle,
            }));
          }
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
      // Live evidence may only be attested under a live registry; the
      // development key set exists for fixtures and can never stand in for a
      // real host.
      ...(isLiveClass ? { requiredPurpose: "live" as const } : {}),
    }));

    if (reasons.length === 0) valid.set(record.evidenceId, record);
    else failures.set(record.evidenceId, reasons);
  }

  rejectSupersededFieldEvidence(valid, failures);

  return { valid, failures, storeFailures };
}

interface FieldBinding {
  readonly record: CompletionEvidence;
  readonly fieldId: string;
  readonly generation: number;
  readonly bootId: string;
  readonly observedMs: number;
}

/**
 * Rejects evidence that a later Field generation or a later guest boot has
 * superseded.
 *
 * Two distinct replays are caught here. A *stale generation* is evidence
 * attributed to generation N that was observed after generation N+1 had already
 * started producing evidence — the generation it names no longer existed. A
 * *superseded boot* is evidence carrying an older boot id that was observed
 * after a later boot of the same generation began, which is what replaying a
 * captured artifact after a restart looks like.
 *
 * Evidence recorded legitimately in an earlier boot or generation is untouched:
 * only records that overlap a later one in time are rejected.
 */
export function rejectSupersededFieldEvidence(
  valid: Map<string, CompletionEvidence>,
  failures: Map<string, string[]>,
): void {
  const bindings: FieldBinding[] = [];
  for (const record of valid.values()) {
    const { fieldId, fieldGeneration, fieldBootId } = record.environment;
    if (fieldId === undefined || fieldGeneration === undefined || fieldBootId === undefined) continue;
    const observedMs = Date.parse(record.observedAt);
    if (Number.isNaN(observedMs)) continue;
    bindings.push({ record, fieldId, generation: fieldGeneration, bootId: fieldBootId, observedMs });
  }

  const reject = (binding: FieldBinding, reason: string): void => {
    valid.delete(binding.record.evidenceId);
    failures.set(binding.record.evidenceId, [...(failures.get(binding.record.evidenceId) ?? []), reason]);
  };

  const groupBy = <K>(items: readonly FieldBinding[], key: (item: FieldBinding) => K): Map<K, FieldBinding[]> => {
    const map = new Map<K, FieldBinding[]>();
    for (const item of items) {
      const existing = map.get(key(item));
      if (existing === undefined) map.set(key(item), [item]);
      else existing.push(item);
    }
    return map;
  };

  for (const [fieldId, perField] of groupBy(bindings, (item) => item.fieldId)) {
    // ---- a later generation supersedes earlier ones from its first sighting ----
    const firstSeenByGeneration = new Map<number, number>();
    for (const item of perField) {
      const seen = firstSeenByGeneration.get(item.generation);
      if (seen === undefined || item.observedMs < seen) firstSeenByGeneration.set(item.generation, item.observedMs);
    }
    for (const item of perField) {
      for (const [generation, firstSeen] of firstSeenByGeneration) {
        if (generation > item.generation && item.observedMs > firstSeen) {
          reject(
            item,
            `recorded against Field ${fieldId} generation ${item.generation}, which generation ${generation} had already superseded`,
          );
          break;
        }
      }
    }

    // ---- within a generation, a later boot supersedes earlier boots ----
    for (const [, perGeneration] of groupBy(perField, (item) => item.generation)) {
      const firstSeenByBoot = new Map<string, number>();
      for (const item of perGeneration) {
        const seen = firstSeenByBoot.get(item.bootId);
        if (seen === undefined || item.observedMs < seen) firstSeenByBoot.set(item.bootId, item.observedMs);
      }
      for (const item of perGeneration) {
        if (!valid.has(item.record.evidenceId)) continue;
        const ownFirstSeen = firstSeenByBoot.get(item.bootId) ?? item.observedMs;
        for (const [bootId, firstSeen] of firstSeenByBoot) {
          if (bootId !== item.bootId && firstSeen > ownFirstSeen && item.observedMs > firstSeen) {
            reject(
              item,
              `replayed from superseded guest boot ${item.bootId}; boot ${bootId} had already started`,
            );
            break;
          }
        }
      }
    }
  }
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
