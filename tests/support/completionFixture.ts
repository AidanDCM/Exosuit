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
  fieldBoundEvidenceClasses,
  liveEvidenceClasses,
  nextLedgerEvent,
  nextLifecycleEvent,
  verifyFieldLifecycle,
  signAsReviewer,
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
  type FieldLifecycleLedger,
  type ApprovalRole,
  type KeyRegistry,
  type KeyRevocation,
  type RegistryPurpose,
  type SigningKey,
} from "../../src/completion/index.js";
import { artifactSourceFromMap } from "../../src/completion/evidence.js";
import { nextCustodyEvent, type KeyCustodyLedger } from "../../src/completion/keyCustody.js";
import {
  attestationKeyFingerprint,
  recordDigest,
  recoveryStateDigest,
  registryHash,
  signChallengeWithPrivateKey,
  type TpmProof,
} from "../../src/completion/tpmAttestation.js";

export const FIXTURE_COMMIT = "de52ad72b11ddafe969e5923f16c946e49cf04f4";
export const BASELINE_AT = "2026-08-01T00:00:00.000Z";
export const OBSERVED_AT = "2026-08-04T12:00:00.000Z";
export const LEDGER_START = "2026-08-04T13:00:00.000Z";
export const LIFECYCLE_START = "2026-08-04T11:00:00.000Z";
export const NOW = "2026-08-04T18:00:00.000Z";
export const MACHINE_ID = "machine-fixture0000000a";

const KEY_SPECS = [
  { keyId: "k-manifest", roles: ["manifest"] as const },
  { keyId: "k-ledger", roles: ["ledger"] as const },
  { keyId: "k-evidence", roles: ["evidence"] as const },
  { keyId: "k-host", roles: ["host"] as const, machineId: MACHINE_ID },
  // Approval authorities are separate keys, held by people rather than by the
  // automation that seals transitions.
  { keyId: "k-tech-review", roles: ["technical_review"] as const },
  { keyId: "k-owner", roles: ["owner_acceptance"] as const },
  { keyId: "k-release", roles: ["release_approval"] as const },
];

/** The approval key that holds each authority. */
const APPROVAL_KEYS: Record<string, string> = {
  technical_review: "k-tech-review",
  owner_acceptance: "k-owner",
  release_approval: "k-release",
};

export interface CompletionFixture {
  registry: KeyRegistry;
  manifest: BuildCompletionManifest;
  ledger: CompletionLedger;
  evidence: EvidenceStore;
  /** Host-signed Field lifecycle; Field-bound evidence is invalid without it. */
  fieldLifecycle: FieldLifecycleLedger;
  /** Key custody chain (v2.3); live evidence is invalid without a matching event. */
  keyCustody: KeyCustodyLedger;
  /** TPM participation proofs (v2.3), one per live signing event. */
  tpmProofs: TpmProof[];
  /** Fingerprint of the fixture attestation key the evaluator is told to trust. */
  attestationFingerprint: string;
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
  addLifecycle(input: {
    fieldId: string;
    generation: number;
    kind: "created" | "booted" | "stopped" | "destroyed";
    bootId?: string;
    recordedAt?: string;
    machineId?: string;
  }): void;
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
  fieldBootId?: string;
  fieldId?: string;
  /** Set true to deliberately omit lifecycle registration. */
  skipLifecycle?: boolean;
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
  reviewerKeyId?: string;
  /** Set false to omit the reviewer co-signature entirely. */
  reviewerSigns?: boolean;
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

  // Software stand-in for the TPM attestation key, exactly as the fixture
  // stands in a software root for the offline root. Structurally identical to
  // a real proof; only the key custodian differs.
  const attestation = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const attestationParams = attestation.publicKey.export({ format: "jwk" }) as { n: string; e: string };
  const attestationPublicKey = {
    modulus: Buffer.from(attestationParams.n, "base64url").toString("base64"),
    exponent: Buffer.from(attestationParams.e, "base64url").toString("base64"),
  };
  const attestationPem = attestation.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const attestationFp = attestationKeyFingerprint(attestationPublicKey);

  const source = JSON.parse(readFileSync(manifestPath, "utf8")) as BuildCompletionManifest;
  let ledgerClock = Date.parse(LEDGER_START);
  let lifecycleClock = Date.parse(LIFECYCLE_START);
  const createdGenerations = new Set<string>();
  const openBoots = new Map<string, string>();
  const seenBoots = new Set<string>();

  let custodyClock = Date.parse(LIFECYCLE_START);

  /**
   * Appends a custody attestation for a signing key and returns the binding a
   * record must carry (v2.3). Modelled on the real path in `cli.ts`: the event
   * is written first, then the record references it and the signature covers
   * the reference.
   */
  const addCustody = (keyId: string): {
    recordVersion: "2.3";
    keyProtectionBackend: "tpm";
    keyCustodyEventId: string;
    registryPurpose: RegistryPurpose;
    recoveryGrantId: null;
  } => {
    const purpose = fixture.registry.purpose;
    const unsigned = nextCustodyEvent({
      ledger: fixture.keyCustody,
      eventId: `custody-${keyId}-${fixture.keyCustody.events.length}`,
      keyId,
      backend: "tpm",
      registryPurpose: purpose,
      machineId: MACHINE_ID,
      recordedAt: new Date((custodyClock += 1000)).toISOString(),
    });
    fixture.keyCustody = {
      contractVersion: 2,
      events: [...fixture.keyCustody.events, {
        ...unsigned,
        signature: signRecord(unsigned, fixture.secrets[keyId] ?? fixture.secrets["k-evidence"]!),
      }],
    };
    return {
      recordVersion: "2.3",
      keyProtectionBackend: "tpm",
      keyCustodyEventId: unsigned.eventId,
      registryPurpose: purpose,
      // Explicit null, not omission: "no grant was open" is a fact the
      // signature should cover.
      recoveryGrantId: null,
    };
  };

  /**
   * Issues a TPM participation proof for a record. Mirrors the real path: the
   * challenge names the exact record, key, registry, machine, custody event and
   * recovery state, so nothing about it can be reused elsewhere.
   */
  const addProof = (record: Record<string, unknown>, custodyEventId: string): string => {
    const challenge = {
      recordDigest: recordDigest(record),
      completionKeyId: String(record["signingKeyId"]),
      registryHash: registryHash(fixture.registry),
      machineId: MACHINE_ID,
      custodyEventId,
      recoveryStateDigest: recoveryStateDigest([]),
      nonce: randomBytes(16).toString("hex"),
      timestamp: new Date((custodyClock += 1000)).toISOString(),
    };
    const proofId = `proof-${fixture.tpmProofs.length}-${randomBytes(3).toString("hex")}`;
    fixture.tpmProofs.push({
      proofId,
      challenge,
      attestationKeyName: "fixture-attestation",
      attestationKeyFingerprint: attestationFp,
      attestationPublicKey,
      signature: signChallengeWithPrivateKey(challenge, attestationPem),
    });
    return proofId;
  };

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
    fieldLifecycle: { contractVersion: 2, events: [] },
    keyCustody: { contractVersion: 2, events: [] },
    tpmProofs: [],
    attestationFingerprint: attestationFp,
    artifacts: new Map<string, Uint8Array>(),
    secrets,

    addLifecycle(input: {
      fieldId: string;
      generation: number;
      kind: "created" | "booted" | "stopped" | "destroyed";
      bootId?: string;
      recordedAt?: string;
      machineId?: string;
    }): void {
      const unsigned = nextLifecycleEvent({
        ledger: fixture.fieldLifecycle,
        eventId: `lc-${input.kind}-${fixture.fieldLifecycle.events.length}`,
        fieldId: input.fieldId,
        generation: input.generation,
        kind: input.kind,
        ...(input.bootId === undefined ? {} : { bootId: input.bootId }),
        ...(input.kind === "created" ? { baseImageSha256: "a".repeat(64) } : {}),
        machineId: input.machineId ?? MACHINE_ID,
        recordedAt: input.recordedAt ?? new Date((lifecycleClock += 1000)).toISOString(),
        signingKeyId: "k-host",
      });
      fixture.fieldLifecycle = {
        contractVersion: 2,
        events: [...fixture.fieldLifecycle.events, {
          ...unsigned,
          signature: signRecord(unsigned, secrets["k-host"]!),
        }],
      };
    },

    addEvidence(input: EvidenceInput): CompletionEvidence {
      const evidenceClass = input.evidenceClass
        ?? gateEvidenceAllowlist[input.testId]?.[0]
        ?? "unit";
      const isLive = liveEvidenceClasses.has(evidenceClass);
      // Field-bound evidence needs a recorded generation and an open boot, or
      // the contract rejects it. Registration is chronological: a boot that is
      // still open is stopped before a different one starts, which is what the
      // real host would record.
      if (isLive && fieldBoundEvidenceClasses.has(evidenceClass) && input.skipLifecycle !== true) {
        const fieldId = input.fieldId ?? "field-fixture-1";
        const generation = input.fieldGeneration ?? 1;
        const bootId = input.fieldBootId ?? "boot-fixture-1";
        const observedMs = Date.parse(input.observedAt ?? OBSERVED_AT);
        const key = `${fieldId}#${generation}`;

        if (!createdGenerations.has(key)) {
          createdGenerations.add(key);
          fixture.addLifecycle({
            fieldId, generation, kind: "created",
            recordedAt: new Date(observedMs - 60_000).toISOString(),
          });
        }
        const open = openBoots.get(key);
        if (open !== undefined && open !== bootId) {
          fixture.addLifecycle({
            fieldId, generation, kind: "stopped", bootId: open,
            recordedAt: new Date(observedMs - 2_000).toISOString(),
          });
          openBoots.delete(key);
        }
        if (!seenBoots.has(`${key}#${bootId}`)) {
          seenBoots.add(`${key}#${bootId}`);
          openBoots.set(key, bootId);
          fixture.addLifecycle({
            fieldId, generation, kind: "booted", bootId,
            recordedAt: new Date(observedMs - 1_000).toISOString(),
          });
        }
      }
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
              fieldId: input.fieldId ?? "field-fixture-1",
              fieldGeneration: input.fieldGeneration ?? 1,
              fieldBootId: input.fieldBootId ?? "boot-fixture-1",
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

      // Custody binding (v2.3). Emitted for live records so the fixture models
      // the real signing path, where the backend is reported by whatever opened
      // the key rather than asserted by the caller.
      // The proof binds to the record content, then the record references the
      // proof, then the signature covers both — same nesting as the real path.
      let bound: Record<string, unknown> = { ...unsigned };
      if (unsigned.designation === "live") {
        const bindingFields = addCustody(unsigned.signingKeyId);
        const withCustody = { ...unsigned, ...bindingFields };
        bound = { ...withCustody, tpmProofId: addProof(withCustody, bindingFields.keyCustodyEventId) };
      } else {
        // Synthetic records stay on the legacy shape: no custody fields, so
        // `.strict()` on the 2.2 member is what keeps them honest.
      }

      const record = {
        ...bound,
        signature: signRecord(bound, secrets[unsigned.signingKeyId] ?? secrets["k-evidence"]!),
      } as CompletionEvidence;
      fixture.evidence = { contractVersion: 2, records: [...fixture.evidence.records, record] };
      return record;
    },

    addTransition(input: TransitionInput): void {
      const reviewerKeyId = input.reviewerKeyId
        ?? (input.reviewerRole === undefined ? undefined : APPROVAL_KEYS[input.reviewerRole]);
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
        ...(reviewerKeyId === undefined ? {} : { reviewerKeyId }),
        reason: `fixture transition to ${input.to}`,
        recordedAt: input.recordedAt ?? new Date((ledgerClock += 1000)).toISOString(),
        signingKeyId: "k-ledger",
      });

      // The reviewer signs first; the issuer's signature then covers that
      // approval, matching the real two-party flow.
      const approved = reviewerKeyId !== undefined && input.reviewerSigns !== false
        ? {
          ...unsigned,
          reviewerSignature: signAsReviewer(unsigned, secrets[reviewerKeyId] ?? secrets["k-tech-review"]!),
        }
        : unsigned;

      fixture.ledger = {
        contractVersion: 2,
        events: [...fixture.ledger.events, {
          ...approved,
          signature: signRecord(approved, secrets["k-ledger"]!),
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
        fieldLifecycle: fixture.fieldLifecycle,
        keyCustody: fixture.keyCustody,
        tpmProofs: fixture.tpmProofs,
        acceptedAttestationFingerprints: [fixture.attestationFingerprint],
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
