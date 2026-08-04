/**
 * Builds a fully valid contract-2 completion state, so a test can invalidate
 * exactly one thing and observe the result. The fixture holds the private keys
 * that the real system keeps outside the repository, which is what lets the
 * adversarial suite forge records a genuine attacker could not.
 */

import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  benchmarkGates,
  buildCompletionManifestSchema,
  evaluateBuildCompletion,
  gateEvidenceAllowlist,
  isBenchmarkGate,
  requiredApprovalRole,
  rootKeyFingerprint,
  liveEvidenceClasses,
  nextLedgerEvent,
  signRecord,
  TEST_DEFINITION_VERSION,
  type BuildCompletionEvaluation,
  type BuildCompletionManifest,
  type CompletionEvidence,
  type CompletionEvidenceClass,
  type CompletionLedger,
  type CompletionStatus,
  type CompletionTarget,
  type EvidenceStore,
  type ApprovalRole,
  type KeyRegistry,
  type KeyRevocation,
  type RegistryPurpose,
  type SigningKey,
} from "../../src/completion/index.js";
import { artifactSourceFromMap } from "../../src/completion/evidence.js";

export const FIXTURE_COMMIT = "de52ad72b11ddafe969e5923f16c946e49cf04f4";
export const BASELINE_AT = "2026-08-01T00:00:00.000Z";
export const OBSERVED_AT = "2026-08-04T12:00:00.000Z";
export const LEDGER_START = "2026-08-04T13:00:00.000Z";
export const NOW = "2026-08-04T18:00:00.000Z";
export const MACHINE_ID = "machine-fixture0000000a";

const KEY_SPECS = [
  { keyId: "k-manifest", roles: ["manifest"] as const },
  { keyId: "k-ledger", roles: ["ledger"] as const },
  { keyId: "k-evidence", roles: ["evidence"] as const },
  { keyId: "k-host", roles: ["host"] as const, machineId: MACHINE_ID },
];

export interface CompletionFixture {
  registry: KeyRegistry;
  manifest: BuildCompletionManifest;
  ledger: CompletionLedger;
  evidence: EvidenceStore;
  artifacts: Map<string, Uint8Array>;
  secrets: Record<string, string>;
  /** PEM of the fixture's offline root key. */
  rootPem: string;
  /** Fingerprint the evaluator is told to accept for this fixture. */
  rootFingerprint: string;
  /** Rebuilds and root-seals the registry after a mutation. */
  sealRegistry(input: { keys: SigningKey[]; revocations?: KeyRevocation[]; purpose?: RegistryPurpose }): KeyRegistry;
  /** Signs and appends an evidence record, storing its artifact. */
  addEvidence(input: EvidenceInput): CompletionEvidence;
  /** Signs and appends one ledger transition. */
  addTransition(input: TransitionInput): void;
  /** Drives a gate from planned to passed with valid evidence. */
  promote(testId: string, overrides?: Partial<EvidenceInput>): CompletionEvidence;
  /** Drives every gate required for a target to passed. */
  promoteAllFor(target: CompletionTarget): void;
  resign(): void;
  evaluate(target?: CompletionTarget, now?: string): BuildCompletionEvaluation;
}

export interface EvidenceInput {
  testId: string;
  evidenceClass?: CompletionEvidenceClass;
  artifact?: Uint8Array;
  designation?: "live" | "synthetic";
  exactCommit?: string;
  observedAt?: string;
  testDefinitionVersion?: string;
  signingKeyId?: string;
  evidenceId?: string;
  nonce?: string;
  machineId?: string;
  fieldGeneration?: number;
  artifactBytes?: number;
  storeArtifact?: boolean;
}

export interface TransitionInput {
  testId: string;
  from: CompletionStatus;
  to: CompletionStatus;
  evidenceIds?: string[];
  issuer?: string;
  reviewer?: string;
  reviewerRole?: ApprovalRole;
  recordedAt?: string;
}

export function createCompletionFixture(manifestPath = "docs/qa/completion/manifest.json"): CompletionFixture {
  const secrets: Record<string, string> = {};
  // The fixture mints its own offline root so tests never depend on the
  // repository's pinned production root.
  const root = generateKeyPairSync("ed25519");
  const rootPublicKey = root.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const rootPem = root.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const keys: SigningKey[] = KEY_SPECS.map((spec) => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    secrets[spec.keyId] = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    return {
      keyId: spec.keyId,
      algorithm: "ed25519",
      publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
      roles: [...spec.roles],
      ...("machineId" in spec ? { machineId: spec.machineId } : {}),
      notBefore: "2026-01-01T00:00:00.000Z",
      notAfter: "2027-01-01T00:00:00.000Z",
    };
  });

  const source = JSON.parse(readFileSync(manifestPath, "utf8")) as BuildCompletionManifest;
  let ledgerClock = Date.parse(LEDGER_START);

  const sealRegistry = (input: { keys: SigningKey[]; revocations?: KeyRevocation[]; purpose?: RegistryPurpose }): KeyRegistry => {
    const core = {
      contractVersion: 2 as const,
      registryId: "fixture-registry",
      purpose: input.purpose ?? ("live" as RegistryPurpose),
      version: 1,
      previousRegistryHash: "0".repeat(64),
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      keys: input.keys,
      revocations: input.revocations ?? [],
      rootKeyId: "fixture-root",
      rootPublicKey,
    };
    return { ...core, signature: signRecord(core, rootPem) } as KeyRegistry;
  };

  const fixture: CompletionFixture = {
    registry: sealRegistry({ keys }),
    rootPem,
    rootFingerprint: rootKeyFingerprint(rootPublicKey),
    sealRegistry,
    manifest: buildCompletionManifestSchema.parse({ ...source }),
    ledger: { contractVersion: 2, events: [] },
    evidence: { contractVersion: 2, records: [] },
    artifacts: new Map<string, Uint8Array>(),
    secrets,

    addEvidence(input: EvidenceInput): CompletionEvidence {
      const evidenceClass = input.evidenceClass
        ?? gateEvidenceAllowlist[input.testId]?.[0]
        ?? "unit";
      const isLive = liveEvidenceClasses.has(evidenceClass);
      const artifact = input.artifact
        ?? Buffer.from(`artifact for ${input.testId} ${randomBytes(8).toString("hex")}`, "utf8");
      const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
      if (input.storeArtifact !== false) fixture.artifacts.set(artifactSha256, artifact);

      const unsigned = {
        evidenceId: input.evidenceId ?? `ev-${input.testId.toLowerCase()}-${artifactSha256.slice(0, 8)}`,
        boundTestId: input.testId,
        evidenceClass,
        artifactSha256,
        artifactBytes: input.artifactBytes ?? artifact.byteLength,
        mediaType: "application/json",
        exactCommit: input.exactCommit ?? FIXTURE_COMMIT,
        runId: `run-${randomBytes(4).toString("hex")}`,
        environment: {
          machineId: input.machineId ?? MACHINE_ID,
          osEdition: "Windows_NT win32",
          osBuild: "10.0.26200",
          ...(isLive
            ? {
              fieldId: "field-fixture-1",
              fieldGeneration: input.fieldGeneration ?? 1,
              fieldBootId: "boot-fixture-1",
            }
            : {}),
        },
        testDefinitionVersion: input.testDefinitionVersion ?? TEST_DEFINITION_VERSION,
        issuer: "fixture-harness",
        observedAt: input.observedAt ?? OBSERVED_AT,
        nonce: input.nonce ?? randomBytes(16).toString("hex"),
        designation: input.designation ?? (isLive ? "live" : "synthetic"),
        signingKeyId: input.signingKeyId ?? (isLive ? "k-host" : "k-evidence"),
      };

      const record = {
        ...unsigned,
        signature: signRecord(unsigned, secrets[unsigned.signingKeyId] ?? secrets["k-evidence"]!),
      } as CompletionEvidence;
      fixture.evidence = { contractVersion: 2, records: [...fixture.evidence.records, record] };
      return record;
    },

    addTransition(input: TransitionInput): void {
      const unsigned = nextLedgerEvent({
        ledger: fixture.ledger,
        eventId: `ev-${input.testId}-${input.to}-${fixture.ledger.events.length}`,
        testId: input.testId,
        previousStatus: input.from,
        newStatus: input.to,
        exactCommit: FIXTURE_COMMIT,
        evidenceIds: input.evidenceIds ?? [],
        issuer: input.issuer ?? "fixture-issuer",
        ...(input.reviewer === undefined ? {} : { reviewer: input.reviewer }),
        ...(input.reviewerRole === undefined ? {} : { reviewerRole: input.reviewerRole }),
        reason: `fixture transition to ${input.to}`,
        recordedAt: input.recordedAt ?? new Date((ledgerClock += 1000)).toISOString(),
        signingKeyId: "k-ledger",
      });
      fixture.ledger = {
        contractVersion: 2,
        events: [...fixture.ledger.events, {
          ...unsigned,
          signature: signRecord(unsigned, secrets["k-ledger"]!),
        }],
      };
    },

    promote(testId: string, overrides: Partial<EvidenceInput> = {}): CompletionEvidence {
      // Benchmark gates are computed from trial records, so they need a real bundle.
      const withBundle = isBenchmarkGate(testId) && overrides.artifact === undefined
        ? {
          ...overrides,
          artifact: trialBundleArtifact({
            testId,
            trials: benchmarkGates[testId].minimumTrials,
          }),
        }
        : overrides;
      const record = fixture.addEvidence({ testId, ...withBundle });
      fixture.addTransition({ testId, from: "planned", to: "source_validated" });
      fixture.addTransition({ testId, from: "source_validated", to: "ready_for_live" });
      fixture.addTransition({
        testId,
        from: "ready_for_live",
        to: "passed",
        evidenceIds: [record.evidenceId],
        issuer: "fixture-issuer",
        reviewer: "fixture-reviewer",
        reviewerRole: requiredApprovalRole(testId),
      });
      return record;
    },

    promoteAllFor(target: CompletionTarget): void {
      for (const test of fixture.manifest.tests) {
        if (!test.requiredFor.includes(target)) continue;
        fixture.promote(test.id);
      }
    },

    resign(): void {
      const { signature: _signature, ...core } = fixture.manifest;
      fixture.manifest = buildCompletionManifestSchema.parse({
        ...core,
        signature: signRecord(core, secrets["k-manifest"]!),
      });
    },

    evaluate(target: CompletionTarget = "personal_mvp", now: string = NOW): BuildCompletionEvaluation {
      return evaluateBuildCompletion({
        manifest: fixture.manifest,
        ledger: fixture.ledger,
        evidence: fixture.evidence,
        registry: fixture.registry,
        artifacts: artifactSourceFromMap(fixture.artifacts),
        target,
        now,
        acceptedRootFingerprints: [fixture.rootFingerprint],
      });
    },
  };

  // Re-point the manifest at the fixture's own baseline and keys, then sign.
  const { signature: _signature, ...core } = fixture.manifest;
  const rebased = {
    ...core,
    baselineCommit: FIXTURE_COMMIT,
    baselineCommittedAt: BASELINE_AT,
    generatedAt: BASELINE_AT,
    testDefinitionVersion: TEST_DEFINITION_VERSION,
    signingKeyId: "k-manifest",
  };
  fixture.manifest = buildCompletionManifestSchema.parse({
    ...rebased,
    signature: signRecord(rebased, secrets["k-manifest"]!),
  });

  return fixture;
}

/** Builds a trial bundle artifact that clears (or deliberately misses) the benchmark. */
export function trialBundleArtifact(options: {
  testId: string;
  trials: number;
  recipes?: number;
  completedRate?: number;
  resumeRate?: number;
  stopRate?: number;
  unapproved?: number;
  interventions?: number;
  exactCommit?: string;
} ): Uint8Array {
  const recipes = options.recipes ?? 5;
  const completed = Math.round(options.trials * (options.completedRate ?? 1));
  const resumed = Math.round(options.trials * (options.resumeRate ?? 1));
  const stopped = Math.round(options.trials * (options.stopRate ?? 1));
  const trials = Array.from({ length: options.trials }, (_value, index) => ({
    trialId: `trial-${index + 1}`,
    recipeId: `recipe-${(index % recipes) + 1}`,
    completed: index < completed,
    emergencyStopAttempted: true,
    emergencyStopSucceeded: index < stopped,
    resumeAttempted: true,
    resumeSucceeded: index < resumed,
    unapprovedConsequentialActions: index === 0 ? (options.unapproved ?? 0) : 0,
    unnecessaryInterventions: index === 0 ? (options.interventions ?? 0) : 0,
    startedAt: "2026-08-04T10:00:00.000Z",
    endedAt: "2026-08-04T10:30:00.000Z",
    environment: {
      machineId: MACHINE_ID,
      osEdition: "Windows_NT win32",
      osBuild: "10.0.26200",
      fieldId: "field-fixture-1",
      fieldGeneration: 1,
      fieldBootId: "boot-fixture-1",
    },
  }));
  return Buffer.from(`${JSON.stringify({
    contractVersion: 2,
    boundTestId: options.testId,
    exactCommit: options.exactCommit ?? FIXTURE_COMMIT,
    testDefinitionVersion: TEST_DEFINITION_VERSION,
    trials,
  })}\n`, "utf8");
}
