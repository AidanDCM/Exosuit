/**
 * Completion gate CLI (contract version 2).
 *
 * Subcommands:
 *   keys       generate an Ed25519 key set; public registry into the repo,
 *              private material into a directory outside it
 *   migrate    build the v2 manifest and seed the ledger from the v1 plan
 *   record     run a command, store its output as a content-addressed
 *              artifact, and emit a signed evidence record
 *   transition append a signed status transition to the ledger
 *   evaluate   report proven / implementation-ready / live-validated
 *
 * Private keys are read from EXOSUIT_COMPLETION_KEY_DIR, which must live
 * outside the repository. Nothing here can promote a gate without them.
 */

import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, release, type as osType } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCompletionManifestSchema,
  completionLedgerSchema,
  evidenceStoreSchema,
  fieldLifecycleLedgerSchema,
  keyRegistrySchema,
  type BuildCompletionManifest,
  type CompletionEvidence,
  type CompletionLedger,
  type EvidenceStore,
  type FieldLifecycleLedger,
  type KeyRegistry,
  type SigningKeyRole,
} from "./contracts.js";
import {
  completionTargets,
  liveEvidenceClasses,
  requiredApprovalRole,
  TEST_DEFINITION_VERSION,
  type ApprovalRole,
  type CompletionEvidenceClass,
  type CompletionStatus,
  type CompletionTarget,
  type RegistryPurpose,
} from "./policy.js";
import { rootKeyFingerprint, signAsReviewer, signRecord } from "./signing.js";
import { nextLedgerEvent } from "./ledger.js";
import { nextLifecycleEvent } from "./fieldLifecycle.js";
import { evaluateBuildCompletion } from "./evaluate.js";
import type { EvidenceArtifactSource } from "./evidence.js";
import { loadPrivateKey, type LoadedPrivateKey } from "./keyProtection.js";
import {
  EMPTY_RECOVERY_LEDGER,
  foldRecoveryLedger,
  keyRecoveryLedgerSchema,
  nextRecoveryEvent,
  recoveryConfirmation,
  type KeyRecoveryLedger,
} from "./keyRecovery.js";
import {
  EMPTY_CUSTODY_LEDGER,
  keyCustodyLedgerSchema,
  nextCustodyEvent,
  type KeyCustodyLedger,
} from "./keyCustody.js";
import {
  EMPTY_TPM_PROOF_STORE,
  ensureAttestationKey,
  attestationKeyFingerprint,
  recordDigest,
  recoveryStateDigest,
  registryHash,
  signTpmChallenge,
  tpmAttestationStatus,
  tpmProofStoreSchema,
  TPM_ATTESTATION_KEY_NAME,
  type TpmProofStore,
} from "./tpmAttestation.js";
import type { KeyProtectionBackend } from "./policy.js";

const ROOT = resolve(process.cwd());
/**
 * Completion state directory. Overridable so a separate evaluation context —
 * such as the M0.5 live-attestation smoke test — can be recorded without
 * disturbing the development-signed state that the recorded M0 result depends
 * on. Overwriting the development registry would invalidate every record its
 * keys signed.
 */
const DIR = process.env["EXOSUIT_COMPLETION_DIR"] === undefined
  ? join(ROOT, "docs", "qa", "completion")
  : resolve(process.env["EXOSUIT_COMPLETION_DIR"]);
const ARTIFACTS = join(DIR, "artifacts");
const PATHS = {
  keys: join(DIR, "keys.json"),
  manifest: join(DIR, "manifest.json"),
  ledger: join(DIR, "ledger.json"),
  evidence: join(DIR, "evidence.json"),
  lifecycle: join(DIR, "field-lifecycle.json"),
  recovery: join(DIR, "key-recovery.json"),
  custody: join(DIR, "key-custody.json"),
  tpmProofs: join(DIR, "tpm-proofs.json"),
};

/* ------------------------------------------------------------------ util */

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function privateKeyDir(): string {
  const dir = process.env["EXOSUIT_COMPLETION_KEY_DIR"];
  if (dir === undefined || dir.trim() === "") {
    throw new Error("EXOSUIT_COMPLETION_KEY_DIR must point at a private key directory outside the repository.");
  }
  const resolved = resolve(dir);
  if (resolved.startsWith(ROOT)) {
    throw new Error("Private signing keys must not live inside the repository.");
  }
  return resolved;
}

/**
 * The purpose of the registry this state directory is signed under. It decides
 * whether the TPM is a requirement or a preference, so it is read from the
 * registry rather than passed in by a caller who could get it wrong.
 */
function registryPurpose(): RegistryPurpose {
  return readJson<KeyRegistry>(PATHS.keys).purpose;
}

function readRecoveryLedger(): KeyRecoveryLedger {
  return existsSync(PATHS.recovery)
    ? keyRecoveryLedgerSchema.parse(readJson(PATHS.recovery))
    : EMPTY_RECOVERY_LEDGER;
}

/**
 * Opens a private key under the protection boundary in `keyProtection.ts`.
 *
 * On a live registry this requires the TPM vault and will not fall back. That
 * is the whole point: with an automatic DPAPI fallback, a live signature proved
 * nothing about where the key came from, and deleting a vault was enough to
 * silently downgrade the protection.
 *
 * Returns the backend that actually opened the key so callers can bind it into
 * what they sign — computed, never asserted.
 */
function privateKeyWithBackend(keyId: string): LoadedPrivateKey {
  const state = foldRecoveryLedger(readRecoveryLedger());
  if (state.failures.length > 0) {
    // A malformed recovery ledger is treated as "something is wrong with the
    // key custody record", never as "no grants are open".
    throw new Error(`Key recovery ledger is not verifiable: ${state.failures.join("; ")}`);
  }
  return loadPrivateKey({
    keyDir: privateKeyDir(),
    keyId,
    registryPurpose: registryPurpose(),
    recoveryGrant: state.openKeyIds.includes(keyId),
    dpapiUnprotect,
  });
}

function privateKey(keyId: string): string {
  return privateKeyWithBackend(keyId).pem;
}

function readCustodyLedger(): KeyCustodyLedger {
  return existsSync(PATHS.custody)
    ? keyCustodyLedgerSchema.parse(readJson(PATHS.custody))
    : EMPTY_CUSTODY_LEDGER;
}

/**
 * Opens a key and appends a custody attestation for that use (contract v2.3).
 *
 * Emitting the event here, at the moment the key is actually opened, is what
 * makes the record's `keyProtectionBackend` a report rather than a claim: the
 * value comes from `loadPrivateKey`, not from a caller's argument, and the same
 * value is written to an append-only chain the verifier reads independently.
 *
 * Returns everything a signed record needs to bind itself to that event.
 */
function attestCustody(keyId: string): {
  readonly pem: string;
  readonly binding: {
    readonly recordVersion: "2.3";
    readonly keyProtectionBackend: KeyProtectionBackend;
    readonly keyCustodyEventId: string;
    readonly registryPurpose: RegistryPurpose;
    readonly recoveryGrantId: string | null;
  };
} {
  const material = privateKeyWithBackend(keyId);
  const purpose = registryPurpose();
  const ledger = readCustodyLedger();
  const last = [...ledger.events].sort((a, b) => a.sequence - b.sequence).at(-1);
  const recordedAt = new Date(
    Math.max(Date.now(), last === undefined ? 0 : Date.parse(last.recordedAt) + 1),
  ).toISOString();

  const grantId = material.underRecoveryGrant === true ? `grant-${keyId}` : undefined;
  const unsigned = nextCustodyEvent({
    ledger,
    eventId: `custody-${keyId}-${Date.now()}`,
    keyId,
    backend: material.backend,
    registryPurpose: purpose,
    ...(grantId === undefined ? {} : { recoveryGrantId: grantId }),
    machineId: machineIdentity(),
    recordedAt,
  });
  writeJson(PATHS.custody, keyCustodyLedgerSchema.parse({
    contractVersion: 2,
    events: [...ledger.events, { ...unsigned, signature: signRecord(unsigned, material.pem) }],
  }));

  return {
    pem: material.pem,
    binding: {
      recordVersion: "2.3",
      keyProtectionBackend: material.backend,
      keyCustodyEventId: unsigned.eventId,
      registryPurpose: purpose,
      // Explicit null rather than an omitted field: an absent value is
      // indistinguishable from one someone stripped.
      recoveryGrantId: grantId ?? null,
    },
  };
}

/**
 * Attestation keys this host trusts. Derived from the key currently in the TPM
 * rather than pinned in the repository: pinning would make the file a second
 * trust root that code review alone protects, which is the weakness already
 * recorded against the key registry. The verifier still refuses any proof from
 * a key this host cannot produce.
 */
function acceptedAttestationFingerprints(): readonly string[] {
  const status = tpmAttestationStatus();
  return status.publicKey === undefined ? [] : [attestationKeyFingerprint(status.publicKey)];
}

function readTpmProofs(): TpmProofStore {
  return existsSync(PATHS.tpmProofs)
    ? tpmProofStoreSchema.parse(readJson(PATHS.tpmProofs))
    : EMPTY_TPM_PROOF_STORE;
}

/**
 * Issues a TPM participation proof for an assembled-but-unsigned record.
 *
 * Ordering matters and is not incidental: the proof commits to the record's
 * content, the record then references the proof id, and the Ed25519 signature
 * covers both. Signing first would let a proof be swapped afterwards; proving
 * first without referencing would leave the proof unattached.
 */
function issueTpmProof(record: Record<string, unknown>, custodyEventId: string): string {
  const store = readTpmProofs();
  const publicKey = ensureAttestationKey();
  const state = foldRecoveryLedger(readRecoveryLedger());
  const challenge = {
    recordDigest: recordDigest(record),
    completionKeyId: String(record["signingKeyId"]),
    registryHash: registryHash(readJson<KeyRegistry>(PATHS.keys)),
    machineId: machineIdentity(),
    custodyEventId,
    recoveryStateDigest: recoveryStateDigest(state.openKeyIds),
    nonce: randomBytes(16).toString("hex"),
    timestamp: new Date().toISOString(),
  };
  const proofId = `proof-${Date.now()}-${randomBytes(3).toString("hex")}`;
  writeJson(PATHS.tpmProofs, tpmProofStoreSchema.parse({
    contractVersion: 2,
    proofs: [...store.proofs, {
      proofId,
      challenge,
      attestationKeyName: TPM_ATTESTATION_KEY_NAME,
      attestationKeyFingerprint: attestationKeyFingerprint(publicKey),
      attestationPublicKey: publicKey,
      signature: signTpmChallenge(challenge),
    }],
  }));
  return proofId;
}

function powershell(script: string): string {
  return execFileSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
}

function psPath(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function dpapiProtect(plaintextPath: string, vaultPath: string): void {
  powershell(
    "Add-Type -AssemblyName System.Security; "
    + `$b=[IO.File]::ReadAllBytes(${psPath(plaintextPath)}); `
    + "$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,'CurrentUser'); "
    + `[IO.File]::WriteAllBytes(${psPath(vaultPath)},$p)`,
  );
}

function dpapiUnprotect(vaultPath: string): string {
  const output = powershell(
    "Add-Type -AssemblyName System.Security; "
    + `$b=[IO.File]::ReadAllBytes(${psPath(vaultPath)}); `
    + "$u=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'); "
    + "[Console]::Out.Write([Convert]::ToBase64String($u))",
  );
  return Buffer.from(output.trim(), "base64").toString("utf8");
}

/**
 * Moves a plaintext private key into the DPAPI vault and removes the plaintext.
 * Used immediately after generating the provisional live root.
 */
function commandProtectKey(): void {
  const keyId = requireArg("--key-id");
  const dir = privateKeyDir();
  const plaintextPath = join(dir, `${keyId}.pem`);
  const vaultPath = join(dir, `${keyId}.pem.dpapi`);
  if (!existsSync(plaintextPath)) throw new Error(`No plaintext key at ${plaintextPath}`);

  dpapiProtect(plaintextPath, vaultPath);
  // Verify the vault round-trips before destroying the only plaintext copy.
  if (dpapiUnprotect(vaultPath).trim() !== readFileSync(plaintextPath, "utf8").trim()) {
    throw new Error("DPAPI vault did not round-trip; refusing to delete the plaintext key.");
  }
  rmSync(plaintextPath, { force: true });
  console.log(`Protected ${keyId} to ${vaultPath} and removed the plaintext copy.`);
}

export function machineIdentity(): string {
  return `machine-${createHash("sha256").update(hostname()).digest("hex").slice(0, 16)}`;
}

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireArg(flag: string): string {
  const value = arg(flag);
  if (value === undefined) throw new Error(`Missing required argument ${flag}`);
  return value;
}

export function filesystemArtifactSource(directory = ARTIFACTS): EvidenceArtifactSource {
  return {
    read(artifactSha256: string): Uint8Array | undefined {
      const path = join(directory, artifactSha256);
      return existsSync(path) ? readFileSync(path) : undefined;
    },
  };
}

/* ------------------------------------------------------------------ keys */

/**
 * Key-name prefix. The development fixture set uses `completion-`; a live
 * registry generated by the offline setup script uses `live-`. Keeping the
 * prefix configurable lets one CLI drive both without either set having to
 * impersonate the other.
 */
const KEY_PREFIX = process.env["EXOSUIT_COMPLETION_KEY_PREFIX"] ?? "completion-";
const KEY = {
  manifest: () => `${KEY_PREFIX}manifest-1`,
  ledger: () => `${KEY_PREFIX}ledger-1`,
  evidence: () => `${KEY_PREFIX}evidence-1`,
  host: () => `${KEY_PREFIX}host-1`,
};

const KEY_ROLES: Readonly<Record<string, readonly SigningKeyRole[]>> = {
  "completion-manifest-1": ["manifest"],
  "completion-ledger-1": ["ledger"],
  "completion-evidence-1": ["evidence"],
  "completion-host-1": ["host"],
  // Approval authorities. Held by people; the host automation must never hold
  // these, or it could approve its own transitions.
  "completion-technical-review-1": ["technical_review"],
  "completion-owner-1": ["owner_acceptance"],
  "completion-release-1": ["release_approval"],
};

/** Maps an approval authority to the key expected to hold it. */
const APPROVAL_KEY_IDS: Readonly<Record<ApprovalRole, string>> = {
  technical_review: `${KEY_PREFIX}technical-review-1`,
  owner_acceptance: `${KEY_PREFIX}owner-1`,
  release_approval: `${KEY_PREFIX}release-1`,
};

/**
 * Generates the offline root key. Run once, on an offline machine if possible.
 * The printed fingerprint must be added to `pinnedRootKeyFingerprints`, which is
 * what makes a substituted root visible as a reviewable diff.
 */
function commandRootKey(): void {
  const outDir = privateKeyDir();
  mkdirSync(outDir, { recursive: true });
  const keyId = arg("--root-key-id") ?? "completion-root-1";
  const { publicKey, privateKey: secret } = generateKeyPairSync("ed25519");
  writeFileSync(join(outDir, `${keyId}.pem`), secret.export({ format: "pem", type: "pkcs8" }).toString(), {
    encoding: "utf8",
    mode: 0o600,
  });
  const publicBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  console.log(`Root key ${keyId} written to ${outDir} — keep this offline.`);
  console.log(`Root public key (base64 DER):\n${publicBase64}`);
  console.log(`\nPin this fingerprint in src/completion/policy.ts:\n${rootKeyFingerprint(publicBase64)}`);
}

function commandKeys(): void {
  const outDir = privateKeyDir();
  mkdirSync(outDir, { recursive: true });
  const purpose = (arg("--purpose") ?? "development") as RegistryPurpose;
  if (purpose !== "development" && purpose !== "live") {
    throw new Error("--purpose must be development or live");
  }
  const registryId = arg("--registry-id") ?? `${purpose}-${new Date().toISOString().slice(0, 10)}`;
  const rootKeyId = arg("--root-key-id") ?? "completion-root-1";
  const now = new Date();
  // Live registries are deliberately short-lived; development fixtures are not.
  const lifetimeDays = purpose === "live" ? 365 : 3 * 365;
  const notAfter = new Date(now.getTime() + lifetimeDays * 86_400_000);

  // Preserve the validity window of any key already in the registry. Moving
  // notBefore forward would invalidate every record that key already signed.
  const previousRegistry = existsSync(PATHS.keys)
    ? readJson<KeyRegistry>(PATHS.keys)
    : undefined;

  const keys = Object.entries(KEY_ROLES).map(([keyId, roles]) => {
    // Never regenerate a key that already exists: the development set is a
    // reproducible fixture, and rotating it would invalidate recorded state.
    const existingPath = join(outDir, `${keyId}.pem`);
    if (existsSync(existingPath)) {
      const secret = createPrivateKey(readFileSync(existingPath, "utf8"));
      const previous = previousRegistry?.keys.find((candidate) => candidate.keyId === keyId);
      return {
        keyId,
        algorithm: "ed25519" as const,
        publicKey: createPublicKey(secret).export({ format: "der", type: "spki" }).toString("base64"),
        roles: [...roles],
        ...(roles.includes("host") ? { machineId: machineIdentity() } : {}),
        notBefore: previous?.notBefore ?? now.toISOString(),
        notAfter: previous?.notAfter ?? notAfter.toISOString(),
      };
    }
    const { publicKey, privateKey: secret } = generateKeyPairSync("ed25519");
    writeFileSync(
      join(outDir, `${keyId}.pem`),
      secret.export({ format: "pem", type: "pkcs8" }).toString(),
      { encoding: "utf8", mode: 0o600 },
    );
    return {
      keyId,
      algorithm: "ed25519" as const,
      publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
      roles: [...roles],
      // The host key is bound to the machine allowed to attest live evidence.
      ...(roles.includes("host") ? { machineId: machineIdentity() } : {}),
      notBefore: now.toISOString(),
      notAfter: notAfter.toISOString(),
    };
  });

  const rootPem = privateKey(rootKeyId);
  const rootPublicKey = createPublicKey(rootPem).export({ format: "der", type: "spki" }).toString("base64");
  const previous = existsSync(PATHS.keys)
    ? (readJson<KeyRegistry>(PATHS.keys))
    : undefined;

  const core = {
    contractVersion: 2 as const,
    registryId,
    purpose,
    // Registry versions chain, so a key set cannot be silently rolled back.
    version: previous === undefined || previous.registryId !== registryId ? 1 : previous.version + 1,
    previousRegistryHash: previous === undefined
      ? "0".repeat(64)
      : createHash("sha256").update(JSON.stringify(previous)).digest("hex"),
    issuedAt: now.toISOString(),
    expiresAt: notAfter.toISOString(),
    keys,
    revocations: [],
    rootKeyId,
    rootPublicKey,
  };

  writeJson(PATHS.keys, keyRegistrySchema.parse({
    ...core,
    signature: signRecord(core, rootPem),
  }));
  console.log(`Wrote ${purpose} registry ${registryId} (v${core.version}) to ${PATHS.keys}`);
  console.log(`Wrote ${keys.length} private keys to ${outDir} (keep outside the repository).`);
  if (purpose === "development") {
    console.log("This is a DEVELOPMENT registry: it can never attest live evidence.");
  }
}

/**
 * Wraps an EXISTING key set in the signed envelope without regenerating any
 * keypair. Used to bring a pre-envelope registry forward, so signatures already
 * made by those keys keep verifying.
 */
function commandSealRegistry(): void {
  const existing = readJson<Record<string, unknown>>(PATHS.keys);
  const keys = existing["keys"];
  if (!Array.isArray(keys)) throw new Error("Existing registry has no key array to seal.");

  const purpose = (arg("--purpose") ?? "development") as RegistryPurpose;
  const registryId = arg("--registry-id") ?? `${purpose}-sealed`;
  const rootKeyId = arg("--root-key-id") ?? "completion-root-1";
  const rootPem = privateKey(rootKeyId);
  const now = new Date();

  const core = {
    contractVersion: 2 as const,
    registryId,
    purpose,
    version: typeof existing["version"] === "number" ? existing["version"] + 1 : 1,
    previousRegistryHash: existing["signature"] === undefined
      ? "0".repeat(64)
      : createHash("sha256").update(JSON.stringify(existing)).digest("hex"),
    issuedAt: typeof existing["issuedAt"] === "string" ? existing["issuedAt"] : now.toISOString(),
    expiresAt: arg("--expires")
      ?? new Date(now.getTime() + (purpose === "live" ? 365 : 3 * 365) * 86_400_000).toISOString(),
    keys,
    revocations: Array.isArray(existing["revocations"]) ? existing["revocations"] : [],
    rootKeyId,
    rootPublicKey: createPublicKey(rootPem).export({ format: "der", type: "spki" }).toString("base64"),
  };

  writeJson(PATHS.keys, keyRegistrySchema.parse({
    ...core,
    signature: signRecord(core, rootPem),
  }));
  console.log(`Sealed existing ${keys.length}-key set as ${purpose} registry ${registryId} (v${core.version}).`);
  console.log("No keypair was regenerated; existing signatures remain valid.");
}

/** Revokes a key with a root-signed record, so deleting a field cannot undo it. */
function commandRevoke(): void {
  const keyId = requireArg("--key");
  const registry = readJson<KeyRegistry>(PATHS.keys);
  const rootPem = privateKey(registry.rootKeyId);
  const revocationCore = {
    keyId,
    revokedAt: new Date().toISOString(),
    reason: requireArg("--reason"),
    rootKeyId: registry.rootKeyId,
  };
  const { signature: _signature, ...core } = registry;
  const updated = {
    ...core,
    version: registry.version + 1,
    previousRegistryHash: createHash("sha256").update(JSON.stringify(registry)).digest("hex"),
    revocations: [...registry.revocations, {
      ...revocationCore,
      signature: signRecord(revocationCore, rootPem),
    }],
  };
  writeJson(PATHS.keys, keyRegistrySchema.parse({
    ...updated,
    signature: signRecord(updated, rootPem),
  }));
  console.log(`Revoked ${keyId} in registry ${registry.registryId} (now v${updated.version}).`);
}

/* --------------------------------------------------------------- migrate */

interface LegacyTest {
  id: string;
  phaseId: string;
  title: string;
  capability: string;
  severity: "critical" | "high" | "medium" | "low";
  requiredFor: CompletionTarget[];
  status: string;
  prerequisites: string[];
  acceptanceCriteria: string[];
  rollbackOrContainment: string;
  automatedCommand?: string;
}

interface LegacyManifest {
  branch: string;
  phases: BuildCompletionManifest["phases"];
  tests: LegacyTest[];
}

/** Statuses reachable without evidence. `passed` is deliberately not among them. */
const MIGRATABLE: readonly CompletionStatus[] = ["source_validated", "ready_for_live"];

function commandMigrate(): void {
  const legacy = readJson<LegacyManifest>(join(ROOT, "docs", "qa", "build-completion-manifest.json"));
  // --baseline keeps an existing evidence set valid across a ledger reissue.
  const baselineCommit = arg("--baseline") ?? git("rev-parse", "HEAD");
  const baselineCommittedAt = new Date(git("show", "-s", "--format=%cI", baselineCommit)).toISOString();
  const generatedAt = new Date().toISOString();

  const unsigned = {
    contractVersion: 2 as const,
    generatedAt,
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    baselineCommit,
    baselineCommittedAt,
    testDefinitionVersion: TEST_DEFINITION_VERSION,
    productionDecision: "denied" as const,
    phases: legacy.phases,
    // status, evidence, and requiredEvidenceClass are intentionally dropped:
    // status now comes from the ledger and the evidence allowlist from policy.
    tests: legacy.tests.map((test) => ({
      id: test.id,
      phaseId: test.phaseId,
      title: test.title,
      capability: test.capability,
      severity: test.severity,
      requiredFor: test.requiredFor,
      prerequisites: test.prerequisites,
      acceptanceCriteria: test.acceptanceCriteria,
      rollbackOrContainment: test.rollbackOrContainment,
      ...(test.automatedCommand === undefined ? {} : { automatedCommand: test.automatedCommand }),
    })),
    signingKeyId: KEY.manifest(),
  };

  const manifest = buildCompletionManifestSchema.parse({
    ...unsigned,
    signature: signRecord(unsigned, privateKey(KEY.manifest())),
  });
  writeJson(PATHS.manifest, manifest);

  // Seed the ledger. v1 asserted `passed` for the M0 gates on evidence that
  // does not meet the v2 bar, so migration caps every gate at ready_for_live;
  // reaching `passed` requires freshly recorded evidence and a reviewer.
  let ledger: CompletionLedger = { contractVersion: 2, events: [] };
  let clock = Date.parse(generatedAt);

  for (const test of legacy.tests) {
    const target = test.status === "planned"
      ? "planned"
      : test.status === "source_validated"
        ? "source_validated"
        : "ready_for_live";
    if (target === "planned") continue;

    let current: CompletionStatus = "planned";
    for (const step of MIGRATABLE) {
      const unsignedEvent = nextLedgerEvent({
        ledger,
        eventId: `migrate-${test.id}-${step}`,
        testId: test.id,
        previousStatus: current,
        newStatus: step,
        exactCommit: baselineCommit,
        evidenceIds: [],
        issuer: "completion-migration",
        reason: `Migrated v1 implementation-readiness claim (${test.status}); not evidence-backed under contract 2.`,
        recordedAt: new Date((clock += 1000)).toISOString(),
        signingKeyId: KEY.ledger(),
      });
      ledger = {
        contractVersion: 2,
        events: [...ledger.events, {
          ...unsignedEvent,
          signature: signRecord(unsignedEvent, privateKey(KEY.ledger())),
        }],
      };
      current = step;
      if (step === target) break;
    }
  }

  writeJson(PATHS.ledger, completionLedgerSchema.parse(ledger));
  if (!existsSync(PATHS.evidence)) {
    writeJson(PATHS.evidence, evidenceStoreSchema.parse({ contractVersion: 2, records: [] }));
  }
  mkdirSync(ARTIFACTS, { recursive: true });

  console.log(`Wrote ${PATHS.manifest}`);
  console.log(`Wrote ${PATHS.ledger} with ${ledger.events.length} migrated transitions.`);
  console.log("No gate was migrated to `passed`: v1 evidence does not satisfy contract 2.");
}

/* ---------------------------------------------------------------- record */

function commandRecord(): void {
  const testId = requireArg("--test");
  const evidenceClass = requireArg("--class") as CompletionEvidenceClass;
  const command = requireArg("--command");
  const manifest = readJson<BuildCompletionManifest>(PATHS.manifest);
  const store = readJson<EvidenceStore>(PATHS.evidence);

  const isLive = liveEvidenceClasses.has(evidenceClass);
  const keyId = isLive ? KEY.host() : KEY.evidence();
  const startedAt = new Date().toISOString();

  let stdout = "";
  let exitCode = 0;
  try {
    stdout = execFileSync(process.env["ComSpec"] ?? "sh", [process.platform === "win32" ? "/c" : "-c", command], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    exitCode = failure.status ?? 1;
    stdout = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`;
  }
  const endedAt = new Date().toISOString();

  if (exitCode !== 0) {
    console.error(`Command failed with exit code ${exitCode}; refusing to record passing evidence.`);
    console.error(stdout.slice(-4000));
    process.exitCode = 1;
    return;
  }

  const environment = {
    machineId: machineIdentity(),
    osEdition: `${osType()} ${process.platform}`,
    osBuild: release(),
    ...(arg("--field-id") === undefined ? {} : { fieldId: requireArg("--field-id") }),
    ...(arg("--field-generation") === undefined
      ? {}
      : { fieldGeneration: Number.parseInt(requireArg("--field-generation"), 10) }),
    ...(arg("--field-boot-id") === undefined ? {} : { fieldBootId: requireArg("--field-boot-id") }),
  };

  const artifact = Buffer.from(`${JSON.stringify({
    command,
    exitCode,
    startedAt,
    endedAt,
    environment,
    testId,
    evidenceClass,
    output: stdout.slice(-200_000),
  }, null, 2)}\n`, "utf8");
  const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
  mkdirSync(ARTIFACTS, { recursive: true });
  writeFileSync(join(ARTIFACTS, artifactSha256), artifact);

  const unsigned = {
    evidenceId: `${testId.toLowerCase()}-${artifactSha256.slice(0, 12)}`,
    boundTestId: testId,
    evidenceClass,
    artifactSha256,
    artifactBytes: artifact.byteLength,
    mediaType: "application/json",
    exactCommit: manifest.baselineCommit,
    runId: arg("--run-id") ?? `local-${Date.now()}`,
    environment,
    testDefinitionVersion: TEST_DEFINITION_VERSION,
    issuer: arg("--issuer") ?? "completion-harness",
    ...(arg("--reviewer") === undefined ? {} : { reviewer: requireArg("--reviewer") }),
    observedAt: endedAt,
    nonce: randomBytes(16).toString("hex"),
    designation: (isLive ? "live" : "synthetic") as "live" | "synthetic",
    signingKeyId: keyId,
  };

  const custody = attestCustody(keyId);
  const withCustody = { ...unsigned, ...custody.binding };
  const bound = {
    ...withCustody,
    tpmProofId: isLive ? issueTpmProof(withCustody, custody.binding.keyCustodyEventId) : null,
  };
  const record: CompletionEvidence = {
    ...bound,
    signature: signRecord(bound, custody.pem),
  };
  writeJson(PATHS.evidence, evidenceStoreSchema.parse({
    contractVersion: 2,
    records: [...store.records, record],
  }));
  console.log(`Recorded evidence ${record.evidenceId} (artifact ${artifactSha256.slice(0, 12)}).`);
}

/* ------------------------------------------------- record an artifact */

/**
 * Records evidence for an artifact that already exists, rather than running a
 * command and capturing its output. Live evidence works this way: a host or
 * Field attestation is produced by a collector, then attested here.
 */
function commandRecordArtifact(): void {
  const testId = requireArg("--test");
  const evidenceClass = requireArg("--class") as CompletionEvidenceClass;
  const file = resolve(requireArg("--file"));
  const manifest = readJson<BuildCompletionManifest>(PATHS.manifest);
  const store = readJson<EvidenceStore>(PATHS.evidence);

  const artifact = readFileSync(file);
  const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
  mkdirSync(ARTIFACTS, { recursive: true });
  writeFileSync(join(ARTIFACTS, artifactSha256), artifact);

  const isLive = liveEvidenceClasses.has(evidenceClass);
  const keyId = isLive ? KEY.host() : KEY.evidence();
  const environment = {
    machineId: machineIdentity(),
    osEdition: `${osType()} ${process.platform}`,
    osBuild: release(),
    ...(arg("--field-id") === undefined ? {} : { fieldId: requireArg("--field-id") }),
    ...(arg("--field-generation") === undefined
      ? {}
      : { fieldGeneration: Number.parseInt(requireArg("--field-generation"), 10) }),
    ...(arg("--field-boot-id") === undefined ? {} : { fieldBootId: requireArg("--field-boot-id") }),
  };

  const unsigned = {
    evidenceId: arg("--evidence-id") ?? `${testId.toLowerCase()}-${artifactSha256.slice(0, 12)}`,
    boundTestId: testId,
    evidenceClass,
    artifactSha256,
    artifactBytes: artifact.byteLength,
    mediaType: arg("--media-type") ?? "application/json",
    exactCommit: manifest.baselineCommit,
    runId: arg("--run-id") ?? `m05-${Date.now()}`,
    environment,
    testDefinitionVersion: TEST_DEFINITION_VERSION,
    issuer: arg("--issuer") ?? "m05-collector",
    observedAt: arg("--observed-at") ?? new Date().toISOString(),
    nonce: arg("--nonce") ?? randomBytes(16).toString("hex"),
    designation: (isLive ? "live" : "synthetic") as "live" | "synthetic",
    signingKeyId: keyId,
  };

  // Custody is attested before the record is sealed, so the signature covers
  // the binding and it cannot be attached to an existing record afterwards.
  const custody = attestCustody(keyId);
  const withCustody = { ...unsigned, ...custody.binding };
  const bound = {
    ...withCustody,
    tpmProofId: isLive ? issueTpmProof(withCustody, custody.binding.keyCustodyEventId) : null,
  };
  const record: CompletionEvidence = { ...bound, signature: signRecord(bound, custody.pem) };
  writeJson(PATHS.evidence, evidenceStoreSchema.parse({
    contractVersion: 2,
    records: [...store.records, record],
  }));
  console.log(`Recorded ${record.evidenceId} (${evidenceClass}, artifact ${artifactSha256.slice(0, 12)}).`);
}

/* ------------------------------------------------------------ transition */

function commandTransition(): void {
  const testId = requireArg("--test");
  const from = requireArg("--from") as CompletionStatus;
  const to = requireArg("--to") as CompletionStatus;
  const manifest = readJson<BuildCompletionManifest>(PATHS.manifest);
  const ledger = readJson<CompletionLedger>(PATHS.ledger);
  const evidenceIds = (arg("--evidence") ?? "").split(",").map((value) => value.trim()).filter(Boolean);

  const last = [...ledger.events].sort((left, right) => left.sequence - right.sequence).at(-1);
  const recordedAt = new Date(
    Math.max(Date.now(), last === undefined ? 0 : Date.parse(last.recordedAt) + 1000),
  ).toISOString();

  const unsigned = nextLedgerEvent({
    ledger,
    eventId: arg("--event-id") ?? `${testId.toLowerCase()}-${to}-${Date.now()}`,
    testId,
    previousStatus: from,
    newStatus: to,
    exactCommit: manifest.baselineCommit,
    evidenceIds,
    issuer: requireArg("--issuer"),
    ...(arg("--reviewer") === undefined ? {} : { reviewer: requireArg("--reviewer") }),
    ...(arg("--reviewer-role") === undefined
      ? { reviewerRole: requiredApprovalRole(testId) }
      : { reviewerRole: requireArg("--reviewer-role") as ApprovalRole }),
    ...(to === "passed"
      ? {
        reviewerKeyId: arg("--reviewer-key")
          ?? APPROVAL_KEY_IDS[
            (arg("--reviewer-role") as ApprovalRole | undefined) ?? requiredApprovalRole(testId)
          ],
      }
      : {}),
    reason: requireArg("--reason"),
    recordedAt,
    signingKeyId: KEY.ledger(),
  });

  // Custody of the ledger key is attested first, so the binding is part of the
  // content the reviewer approves.
  //
  // Order is load-bearing. Adding custody fields *after* the reviewer signed
  // silently invalidated their signature: the verifier recomputes the approval
  // over the event minus its two signatures, and that now includes these
  // fields. The reviewer must approve what actually gets sealed, not a prefix.
  const custody = attestCustody(KEY.ledger());
  const withCustody = { ...unsigned, ...custody.binding, tpmProofId: null };

  // The reviewer signs the approval; the issuer's signature then seals the
  // event including that approval.
  const bound = to === "passed"
    ? {
      ...withCustody,
      reviewerSignature: signAsReviewer(
        withCustody,
        privateKey(unsigned.reviewerKeyId ?? APPROVAL_KEY_IDS[requiredApprovalRole(testId)]),
      ),
    }
    : withCustody;

  writeJson(PATHS.ledger, completionLedgerSchema.parse({
    contractVersion: 2,
    events: [...ledger.events, {
      ...bound,
      signature: signRecord(bound, custody.pem),
    }],
  }));
  console.log(`Recorded ${testId}: ${from} -> ${to} (key backend: ${custody.binding.keyProtectionBackend})`);
}

/* ------------------------------------------------------ field lifecycle */

function readLifecycle(): FieldLifecycleLedger {
  return existsSync(PATHS.lifecycle)
    ? readJson<FieldLifecycleLedger>(PATHS.lifecycle)
    : { contractVersion: 2, events: [] };
}

/**
 * Records one Field lifecycle event. Only the host observes a Field being
 * created, booted, stopped, and destroyed, so these are signed by the
 * host-bound key.
 */
function commandFieldLifecycle(): void {
  const ledger = readLifecycle();
  const kind = requireArg("--kind") as "created" | "booted" | "stopped" | "destroyed";
  const last = [...ledger.events].sort((a, b) => a.sequence - b.sequence).at(-1);
  const recordedAt = new Date(
    Math.max(Date.now(), last === undefined ? 0 : Date.parse(last.recordedAt) + 1000),
  ).toISOString();

  const unsigned = nextLifecycleEvent({
    ledger,
    eventId: arg("--event-id") ?? `lc-${kind}-${Date.now()}`,
    fieldId: requireArg("--field-id"),
    generation: Number.parseInt(requireArg("--generation"), 10),
    kind,
    ...(arg("--boot-id") === undefined ? {} : { bootId: requireArg("--boot-id") }),
    ...(arg("--base-image-sha256") === undefined
      ? {}
      : { baseImageSha256: requireArg("--base-image-sha256") }),
    ...(arg("--vm-guid") === undefined ? {} : { vmGuid: requireArg("--vm-guid") }),
    machineId: machineIdentity(),
    recordedAt,
    signingKeyId: KEY.host(),
  });

  writeJson(PATHS.lifecycle, fieldLifecycleLedgerSchema.parse({
    contractVersion: 2,
    events: [...ledger.events, { ...unsigned, signature: signRecord(unsigned, privateKey(KEY.host())) }],
  }));
  console.log(`Recorded Field lifecycle: ${unsigned.fieldId} gen ${unsigned.generation} ${kind}`);
}

/* -------------------------------------------------------------- evaluate */

function commandEvaluate(): void {
  const registry = readJson<KeyRegistry>(PATHS.keys);
  const manifest = readJson<BuildCompletionManifest>(PATHS.manifest);
  const ledger = readJson<CompletionLedger>(PATHS.ledger);
  const evidence = readJson<EvidenceStore>(PATHS.evidence);
  const requestedTarget = arg("--target");
  const targets: readonly CompletionTarget[] = requestedTarget === undefined
    ? completionTargets
    : [requestedTarget as CompletionTarget];
  const requirePromotion = process.argv.includes("--require-promotion");

  for (const target of targets) {
    const result = evaluateBuildCompletion({
      manifest,
      ledger,
      evidence,
      registry,
      artifacts: filesystemArtifactSource(),
      target,
      fieldLifecycle: readLifecycle(),
      keyCustody: readCustodyLedger(),
      keyRecovery: readRecoveryLedger(),
      tpmProofs: readTpmProofs().proofs,
      acceptedAttestationFingerprints: acceptedAttestationFingerprints(),
    });
    console.log(`\n${result.headline}`);
    console.log(`- proven gates: ${result.provenTestCount}/${result.requiredTestCount}`);
    console.log(`- gates needing live evidence: ${result.liveEvidenceRequiredCount}`);
    console.log(`- next phase: ${result.nextPhaseIds.join(", ") || "none"}`);
    console.log(`- promotion allowed: ${result.promotionAllowed}`);
    if (result.integrityFailures.length > 0) {
      console.error(`- integrity failures (${result.integrityFailures.length}):`);
      for (const failure of result.integrityFailures.slice(0, 20)) console.error(`    ${failure}`);
      // Integrity is the CI gate. Incompleteness is expected and does not fail
      // the build; an unverifiable manifest, ledger, or evidence store does.
      process.exitCode = 1;
    }
    const unproven = result.gates.filter((gate) => !gate.proven);
    if (unproven.length > 0) {
      console.log(`- unproven gates (${unproven.length}):`);
      for (const gate of unproven) {
        console.log(`    ${gate.testId} [${gate.status}] ${gate.failures[0] ?? ""}`);
      }
    }
    if (requirePromotion && !result.promotionAllowed) process.exitCode = 1;
  }
}

/* -------------------------------------------------------- key recovery */

/**
 * Opens or closes a DPAPI recovery grant for one key.
 *
 * This is the only way DPAPI is reachable on a live registry. It is deliberately
 * awkward: an exact typed confirmation, a mandatory written reason, a signed
 * append-only event, and live attestation blocked until the key is sealed again.
 *
 *   recover-key --key-id <id> --reason "<why>" --confirm "RECOVER KEY <id> WITHOUT TPM"
 *   recover-key --key-id <id> --close --reason "<why>"
 */
function commandRecoverKey(): void {
  const keyId = requireArg("--key-id");
  const reason = requireArg("--reason");
  const close = process.argv.includes("--close");
  const ledger = readRecoveryLedger();
  const state = foldRecoveryLedger(ledger);
  if (state.failures.length > 0) {
    throw new Error(`Key recovery ledger is not verifiable: ${state.failures.join("; ")}`);
  }

  if (close) {
    if (!state.openKeyIds.includes(keyId)) throw new Error(`${keyId} has no open recovery grant.`);
    // Closing means the key is sealed again, so require that to be true rather
    // than taking the operator's word for it.
    const probe = loadPrivateKey({
      keyDir: privateKeyDir(),
      keyId,
      registryPurpose: registryPurpose(),
      recoveryGrant: false,
      dpapiUnprotect,
    });
    if (probe.backend !== "tpm") {
      throw new Error(`${keyId} did not load from the TPM; re-seal it before closing the grant.`);
    }
  } else {
    if (state.openKeyIds.includes(keyId)) throw new Error(`${keyId} already has an open recovery grant.`);
    if (requireArg("--confirm") !== recoveryConfirmation(keyId)) {
      throw new Error(`Opening a grant requires exact typed confirmation: ${recoveryConfirmation(keyId)}`);
    }
  }

  const last = [...ledger.events].sort((a, b) => a.sequence - b.sequence).at(-1);
  const recordedAt = new Date(
    Math.max(Date.now(), last === undefined ? 0 : Date.parse(last.recordedAt) + 1000),
  ).toISOString();
  const unsigned = nextRecoveryEvent({
    ledger,
    eventId: arg("--event-id") ?? `recovery-${close ? "closed" : "opened"}-${Date.now()}`,
    keyId,
    kind: close ? "closed" : "opened",
    reason,
    machineId: machineIdentity(),
    recordedAt,
    signingKeyId: keyId,
  });

  // Signed with the key being recovered: it proves the operator actually
  // recovered it rather than merely asserting a failure.
  const grantOpen = close ? false : true;
  const material = loadPrivateKey({
    keyDir: privateKeyDir(),
    keyId,
    registryPurpose: registryPurpose(),
    recoveryGrant: grantOpen,
    dpapiUnprotect,
  });

  writeJson(PATHS.recovery, keyRecoveryLedgerSchema.parse({
    contractVersion: 2,
    events: [...ledger.events, { ...unsigned, signature: signRecord(unsigned, material.pem) }],
  }));

  if (close) {
    console.log(`Closed the recovery grant for ${keyId}; it loads from the TPM again.`);
  } else {
    console.error(`Opened a DPAPI recovery grant for ${keyId} (backend: ${material.backend}).`);
    console.error("Live attestation is blocked while any grant is open.");
    console.error("Re-seal the key, then close the grant with --close.");
  }
}

/* ------------------------------------------------------------------ main */

function main(): void {
  const command = process.argv[2];
  switch (command) {
    case "recover-key": return commandRecoverKey();
    case "root-key": return commandRootKey();
    case "protect-key": return commandProtectKey();
    case "keys": return commandKeys();
    case "seal-registry": return commandSealRegistry();
    case "revoke": return commandRevoke();
    case "migrate": return commandMigrate();
    case "record": return commandRecord();
    case "record-artifact": return commandRecordArtifact();
    case "field-lifecycle": return commandFieldLifecycle();
    case "transition": return commandTransition();
    case "evaluate": return commandEvaluate();
    default:
      console.error("Usage: completion-gate <root-key|keys|seal-registry|revoke|migrate|record|transition|evaluate> [options]");
      process.exitCode = 2;
  }
}

const entryPoint = process.argv[1];
const stripExtension = (path: string): string => path.replace(/\.[cm]?[jt]s$/, "");
if (entryPoint !== undefined
  && stripExtension(resolve(entryPoint)) === stripExtension(fileURLToPath(import.meta.url))) {
  main();
}
