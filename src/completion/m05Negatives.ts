/**
 * M0.5 negative-case runner.
 *
 * The adversarial suite proves the verifier rejects these attacks against
 * fixtures. This runs the same attacks against the *real* M0.5 artifacts — the
 * live registry, the host attestation, and the Field attestation actually
 * produced on this machine — because a verifier that only works on synthetic
 * data has not been shown to work at all.
 *
 * Usage:
 *   EXOSUIT_COMPLETION_DIR=docs/qa/completion-m05 tsx src/completion/m05Negatives.ts
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildCompletionManifestSchema,
  evidenceStoreSchema,
  keyRegistrySchema,
  type BuildCompletionManifest,
  type CompletionEvidence,
  type EvidenceStore,
  type KeyRegistry,
} from "./contracts.js";
import { verifyEvidenceStore, type EvidenceArtifactSource } from "./evidence.js";
import { evaluateBuildCompletion } from "./evaluate.js";
import { completionLedgerSchema } from "./contracts.js";

const DIR = resolve(process.env["EXOSUIT_COMPLETION_DIR"] ?? "docs/qa/completion-m05");
const ARTIFACTS = join(DIR, "artifacts");

const registry = keyRegistrySchema.parse(JSON.parse(readFileSync(join(DIR, "keys.json"), "utf8")));
const manifest = buildCompletionManifestSchema.parse(JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8")));
const store = evidenceStoreSchema.parse(JSON.parse(readFileSync(join(DIR, "evidence.json"), "utf8")));

const NOW = new Date().toISOString();

function fileSource(overrides: Map<string, Uint8Array> = new Map()): EvidenceArtifactSource {
  return {
    read(hash) {
      if (overrides.has(hash)) return overrides.get(hash);
      const path = join(ARTIFACTS, hash);
      return existsSync(path) ? readFileSync(path) : undefined;
    },
  };
}

type CheckMode =
  /** the targeted evidence record must not survive store verification */
  | "record"
  /** the store must report a store-wide failure (e.g. duplicate ids) */
  | "store"
  /** the failure surfaces only at evaluation level (e.g. registry envelope) */
  | "evaluation";

interface Case {
  name: string;
  mode?: CheckMode;
  expectPattern?: RegExp;
  records?: CompletionEvidence[];
  registry?: KeyRegistry;
  artifacts?: EvidenceArtifactSource;
  now?: string;
  expectRejected: boolean;
}

const base = store.records;
const target = base.find((record) => record.evidenceId === "m05-field-attestation");
if (target === undefined) throw new Error("m05-field-attestation evidence not found");

/**
 * Records are a union of the 2.2 and 2.3 shapes, so `Partial<CompletionEvidence>`
 * collapses to a type that no longer assigns back to either member. This
 * harness exists to build deliberately malformed records, so it takes a loose
 * patch and casts: what matters is what the verifier does with the result, not
 * whether the mutation typechecks.
 */
function mutate(changes: Record<string, unknown>): CompletionEvidence[] {
  return base.map((record) => (
    record.evidenceId === target!.evidenceId ? { ...record, ...changes } as CompletionEvidence : record
  ));
}

const cases: Case[] = [
  { name: "control: unmodified real evidence", expectRejected: false },

  {
    name: "modified artifact bytes",
    artifacts: fileSource(new Map([[target.artifactSha256, Buffer.from("tampered attestation", "utf8")]])),
    expectRejected: true,
  },
  {
    name: "missing artifact",
    artifacts: { read: (hash) => hash === target.artifactSha256 ? undefined : fileSource().read(hash) },
    expectRejected: true,
  },
  {
    name: "reused nonce (replay of another record's nonce)",
    records: mutate({ nonce: base[0]!.nonce }),
    expectRejected: true,
  },
  {
    // Both records then share an id, so "did the target survive" is ambiguous;
    // the store-level duplicate report is the unambiguous signal.
    name: "reused evidence id",
    mode: "store",
    expectPattern: /duplicate evidence id/,
    records: mutate({ evidenceId: base[0]!.evidenceId }),
    expectRejected: true,
  },
  {
    name: "wrong machine in the envelope",
    records: mutate({ environment: { ...target.environment, machineId: "machine-someone-else" } }),
    expectRejected: true,
  },
  {
    name: "wrong Windows build in the envelope",
    records: mutate({ environment: { ...target.environment, osBuild: "1.0.0-not-this-machine" } }),
    expectRejected: true,
  },
  {
    name: "wrong source commit",
    records: mutate({ exactCommit: "c".repeat(40) }),
    expectRejected: true,
  },
  {
    name: "wrong Field generation in the envelope",
    records: mutate({ environment: { ...target.environment, fieldGeneration: 99 } }),
    expectRejected: true,
  },
  {
    name: "wrong guest boot id in the envelope",
    records: mutate({ environment: { ...target.environment, fieldBootId: "boot-not-this-one" } }),
    expectRejected: true,
  },
  {
    name: "future-dated evidence",
    records: mutate({ observedAt: "2099-01-01T00:00:00.000Z" }),
    expectRejected: true,
  },
  {
    name: "expired evidence (evaluated two years later)",
    now: "2028-08-05T00:00:00.000Z",
    expectRejected: true,
  },
  {
    name: "revoked host key",
    registry: {
      ...registry,
      keys: registry.keys.map((key) => key.keyId === "live-host-1"
        ? { ...key, revokedAt: NOW, revocationReason: "m05 negative case" }
        : key),
    } as KeyRegistry,
    expectRejected: true,
  },
  {
    name: "development-registry key presented as live",
    registry: { ...registry, purpose: "development" } as KeyRegistry,
    expectRejected: true,
  },
  {
    // The registry envelope is verified at evaluation level, not by the
    // evidence store, so this case must be checked there.
    name: "registry edited without the offline-root signature",
    mode: "evaluation",
    expectPattern: /key registry/,
    registry: { ...registry, registryId: "attacker-registry" } as KeyRegistry,
    expectRejected: true,
  },
  {
    name: "live evidence signed by a non-host key",
    records: mutate({ signingKeyId: "live-evidence-1" }),
    expectRejected: true,
  },
  {
    name: "live evidence self-designated synthetic",
    records: mutate({ designation: "synthetic" }),
    expectRejected: true,
  },
  {
    name: "evidence class not accepted by the gate",
    records: mutate({ evidenceClass: "owner_acceptance" }),
    expectRejected: true,
  },
];

let failures = 0;
console.log(`M0.5 negative cases against real artifacts in ${DIR}\n`);

for (const testCase of cases) {
  const records = testCase.records ?? base;
  const activeRegistry = testCase.registry ?? registry;
  const result = verifyEvidenceStore({
    records,
    manifest: manifest as BuildCompletionManifest,
    registry: activeRegistry,
    artifacts: testCase.artifacts ?? fileSource(),
    now: testCase.now ?? NOW,
  });

  const targetId = testCase.records
    ? (testCase.records.find((r) => r.artifactSha256 === target.artifactSha256)?.evidenceId ?? target.evidenceId)
    : target.evidenceId;

  let rejected: boolean;
  if (testCase.mode === "store") {
    rejected = result.storeFailures.some((reason) => testCase.expectPattern!.test(reason));
  } else if (testCase.mode === "evaluation") {
    const ledger = completionLedgerSchema.parse(JSON.parse(readFileSync(join(DIR, "ledger.json"), "utf8")));
    const evaluation = evaluateBuildCompletion({
      manifest: manifest as BuildCompletionManifest,
      ledger,
      evidence: { contractVersion: 2, records } as EvidenceStore,
      registry: activeRegistry,
      artifacts: testCase.artifacts ?? fileSource(),
      target: "personal_mvp",
      now: testCase.now ?? NOW,
    });
    rejected = evaluation.integrityFailures.some((reason) => testCase.expectPattern!.test(reason));
  } else {
    rejected = !result.valid.has(targetId);
  }
  const ok = rejected === testCase.expectRejected;
  if (!ok) failures += 1;

  const verdict = ok ? "  ok  " : " FAIL ";
  const action = rejected ? "rejected" : "ACCEPTED";
  console.log(`[${verdict}] ${action.padEnd(8)} ${testCase.name}`);
  if (!ok) {
    const reasons = result.failures.get(targetId) ?? [];
    console.log(`           expected ${testCase.expectRejected ? "rejection" : "acceptance"}; reasons: ${reasons.join("; ") || "(none)"}`);
  }
}

console.log(`\n${cases.length - failures}/${cases.length} cases behaved as expected.`);
if (failures > 0) {
  console.log("\nGaps found. These are real verifier weaknesses, not test bugs.");
  process.exitCode = 1;
}

// Report the store-level view too, so a store-wide failure is not missed.
const full = verifyEvidenceStore({
  records: base,
  manifest: manifest as BuildCompletionManifest,
  registry,
  artifacts: fileSource(),
  now: NOW,
});
console.log(`\nControl store: ${full.valid.size} valid, ${full.failures.size} rejected, ${full.storeFailures.length} store failures.`);
for (const [id, reasons] of full.failures) console.log(`  ${id}: ${reasons.join("; ")}`);
void createHash;
