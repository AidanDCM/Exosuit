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
  keyRegistrySchema,
  type BuildCompletionManifest,
  type CompletionEvidence,
  type CompletionLedger,
  type EvidenceStore,
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
import { evaluateBuildCompletion } from "./evaluate.js";
import type { EvidenceArtifactSource } from "./evidence.js";

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
 * Reads a private key, preferring a DPAPI-protected vault file over plaintext.
 *
 * DPAPI binds the ciphertext to this Windows user on this machine, so a copied
 * vault file is useless elsewhere. It is a local-vault fallback for the case
 * where no BitLocker removable drive is available; it is not equivalent to an
 * offline root held off the signing machine.
 */
function privateKey(keyId: string): string {
  const dir = privateKeyDir();
  const vaultPath = join(dir, `${keyId}.pem.dpapi`);
  if (existsSync(vaultPath)) return dpapiUnprotect(vaultPath);
  return readFileSync(join(dir, `${keyId}.pem`), "utf8");
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

  const record: CompletionEvidence = {
    ...unsigned,
    signature: signRecord(unsigned, privateKey(keyId)),
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

  const record: CompletionEvidence = { ...unsigned, signature: signRecord(unsigned, privateKey(keyId)) };
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

  // The reviewer signs the approval first; the issuer's signature then seals
  // the event including that approval.
  const approved = to === "passed"
    ? {
      ...unsigned,
      reviewerSignature: signAsReviewer(
        unsigned,
        privateKey(unsigned.reviewerKeyId ?? APPROVAL_KEY_IDS[requiredApprovalRole(testId)]),
      ),
    }
    : unsigned;

  writeJson(PATHS.ledger, completionLedgerSchema.parse({
    contractVersion: 2,
    events: [...ledger.events, {
      ...approved,
      signature: signRecord(approved, privateKey(KEY.ledger())),
    }],
  }));
  console.log(`Recorded ${testId}: ${from} -> ${to}`);
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

/* ------------------------------------------------------------------ main */

function main(): void {
  const command = process.argv[2];
  switch (command) {
    case "root-key": return commandRootKey();
    case "protect-key": return commandProtectKey();
    case "keys": return commandKeys();
    case "seal-registry": return commandSealRegistry();
    case "revoke": return commandRevoke();
    case "migrate": return commandMigrate();
    case "record": return commandRecord();
    case "record-artifact": return commandRecordArtifact();
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
