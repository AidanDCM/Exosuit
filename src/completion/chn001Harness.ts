/**
 * CHN-001 evidence acquisition driver.
 *
 * This driver never provisions, destroys, locks, unlocks, invokes Secure Desktop,
 * changes display settings, injects input, starts recording, or triggers emergency
 * stop. Those effects remain with reviewed Field/Glove authorities and explicit
 * owner ceremonies. The driver creates an exact-commit session, captures the
 * authenticated KVP snapshot through the compiled observer, imports content-addressed
 * ceremony artifacts, and refuses to finalize an incomplete run.
 */

import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { canonicalJson } from "../fieldContracts.js";
import { fieldBootstrapManifestSchema, REQUIRED_FIELD_DIRECTORIES } from "../fieldBootstrap.js";
import { createFieldProvisioningPlan, fieldProvisioningPlanSchema } from "../fieldProvisioningPlan.js";
import { chn001InjectionIds, chn001RunSchema, validateChn001Run, type Chn001Run } from "./chn001.js";
import {
  buildCompletionManifestSchema,
  fieldLifecycleLedgerSchema,
  keyRegistrySchema,
  type FieldLifecycleEvent,
  type FieldLifecycleLedger,
} from "./contracts.js";
import { checkAgainstLifecycle, verifyFieldLifecycle, type LifecycleVerificationResult } from "./fieldLifecycle.js";

const ROOT = resolve(process.cwd());
const OUT = resolve(process.env["EXOSUIT_CHN001_DIR"] ?? join(ROOT, "artifacts", "chn001"));
const CONFIRMATION = "START CHN-001 EVIDENCE SESSION";
const MIGRATION_CONFIRMATION = "MIGRATE CHN-001 V1 SESSION TO PHASE-CORRECT V2";
const RECORD_CONFIRMATION = "RECORD CHN-001 LIVE CANDIDATE";
const COMPLETION_DIR = resolve(process.env["EXOSUIT_COMPLETION_DIR"] ?? join(ROOT, "docs", "qa", "completion"));
const MIGRATION_ALLOWED_FILES = new Set([
  "docs/BUILD_COMPLETION_PLAN.md",
  "docs/FIELD_DEVELOPER_MANUAL.md",
  "docs/FIELD_OWNER_MANUAL.md",
  "docs/FIELD_TEST_PLAN.md",
  "docs/MASTER_SYSTEM_ROADMAP.md",
  "docs/TEST_PLAN.md",
  "docs/engineering_log/2026-08-10-phase-correct-stop-gates.md",
  "docs/logs/DECISION_LOG.md",
  "docs/project-driver/CHN001_SESSION_RUNBOOK.md",
  "docs/qa/ATOMIC_AUDIT_2026-08-10_PHASE_CORRECT_STOP_GATES.md",
  "docs/qa/BUILD_COMPLETION_TEST_MATRIX.md",
  "docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md",
  "docs/qa/FIELD_THREAT_MODEL.md",
  "docs/qa/GLOVE_FIELD_PARTS_TRACEABILITY.md",
  "package.json",
  "src/completion/chn001.ts",
  "src/completion/chn001Harness.ts",
  "src/completion/index.ts",
  "src/completion/tch001.ts",
  "tests/chn001.test.ts",
  "tests/chn001Harness.test.ts",
  "tests/tch001.test.ts",
]);
const MIGRATION_REQUIRED_FILES = [
  "src/completion/chn001.ts",
  "src/completion/chn001Harness.ts",
  "docs/MASTER_SYSTEM_ROADMAP.md",
  "docs/qa/BUILD_COMPLETION_TEST_MATRIX.md",
  "docs/qa/ATOMIC_AUDIT_2026-08-10_PHASE_CORRECT_STOP_GATES.md",
] as const;

export function validateChn001MigrationChangedFiles(changedFiles: readonly string[]): readonly string[] {
  const failures: string[] = [];
  const forbidden = changedFiles.filter((file) => !MIGRATION_ALLOWED_FILES.has(file));
  if (forbidden.length > 0) failures.push(`runtime or unreviewed files changed: ${forbidden.join(", ")}`);
  for (const required of MIGRATION_REQUIRED_FILES) {
    if (!changedFiles.includes(required)) failures.push(`required review file is missing: ${required}`);
  }
  return failures;
}

const configSchema = z.object({
  contractVersion: z.literal(1),
  vmName: z.string().min(1),
  vmGuid: z.string().uuid(),
  field: z.object({ fieldId: z.string().uuid(), fieldGeneration: z.number().int().positive() }).strict(),
  baseImageId: z.string().min(1),
  baseImagePath: z.string().min(1),
  baseDigest: z.string().regex(/^[a-f0-9]{64}$/),
  channelKeyId: z.string().min(1),
  planPath: z.string().min(1),
  hostConfigPath: z.string().min(1),
  runtimeConfigPath: z.string().min(1),
  agentPath: z.string().min(1),
  productionConfiguration: z.object({
    developmentAccessEnabled: z.literal(false),
    developmentUnattendedSetupEnabled: z.literal(false),
    networkMode: z.literal("isolated"),
    hostLanAccess: z.literal(false),
    inboundConnections: z.literal(false),
    hostInputInjection: z.literal(false),
  }).strict(),
}).strict();

type VerifiedMessage = Chn001Run["verifiedMessages"][number];
type Injection = Chn001Run["failureInjections"][number];
type StopProof = Chn001Run["emergencyStops"][number];

const verifiedCaptureSchema = z.object({
  status: z.literal("verified"),
  field: configSchema.shape.field,
  messageId: z.string().uuid(),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  sequence: z.number().int().nonnegative(),
  messageType: z.enum(["handshake", "bootstrapStatus", "heartbeat", "bootstrap_status"]),
  sentAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  keyId: z.string().min(1),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  payloadHashValid: z.literal(true),
  verifiedAt: z.string().datetime({ offset: true }),
  transport: z.literal("hyperv_kvp"),
  bootId: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
}).strict();

export const chn001CaptureFileSchema = z.object({
  contractVersion: z.literal(1),
  capturedAtUtc: z.string().datetime({ offset: true }),
  vmName: z.string().min(1),
  transport: z.literal("hyperv_kvp"),
  handshake: verifiedCaptureSchema,
  bootstrap: verifiedCaptureSchema,
  heartbeat: verifiedCaptureSchema,
}).strict();

export const chn001InjectionArtifactSchema = z.object({
  contractVersion: z.literal(1),
  testId: z.literal("CHN-001"),
  injectionId: z.enum(chn001InjectionIds),
  exactCommit: z.string().regex(/^[a-f0-9]{40}$/),
  machineId: z.string().min(1),
  field: configSchema.shape.field,
  vmGuid: z.string().uuid(),
  evidenceMode: z.enum(["mutated_live_capture", "live_reboot", "live_heartbeat_loss", "live_windows_guest", "live_host_stop"]),
  observedAt: z.string().datetime({ offset: true }),
  expectedCode: z.string().min(1).max(120),
  actualCode: z.string().min(1).max(120),
  passed: z.literal(true),
  sourceArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const chn001StopArtifactSchema = z.object({
  contractVersion: z.literal(1),
  testId: z.literal("CHN-001"),
  scenario: z.enum(["healthy", "degraded"]),
  exactCommit: z.string().regex(/^[a-f0-9]{40}$/),
  machineId: z.string().min(1),
  field: configSchema.shape.field,
  vmGuid: z.string().uuid(),
  triggeredAt: z.string().datetime({ offset: true }),
  stoppedAt: z.string().datetime({ offset: true }),
  latencyMs: z.number().int().nonnegative().max(5_000),
  channelIndependent: z.literal(true),
  modelIndependent: z.literal(true),
  inputStopped: z.literal(true),
  recordingStopped: z.boolean(),
  fieldState: z.literal("Off"),
  sourceArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const sessionSchema = z.object({
  contractVersion: z.literal(1),
  stage: z.literal("acquiring"),
  runId: z.string().min(1),
  exactCommit: z.string().regex(/^[a-f0-9]{40}$/),
  machineId: z.string().min(1),
  startedAt: z.string().datetime(),
  config: configSchema,
  captures: z.number().int().nonnegative(),
  verifiedMessages: z.array(z.unknown()),
  failureInjections: z.array(z.unknown()),
  emergencyStops: z.array(z.unknown()),
}).strict();

const preparationSchema = z.object({
  contractVersion: z.literal(1),
  exactCommit: z.string().regex(/^[a-f0-9]{40}$/),
  field: configSchema.shape.field,
  vmName: z.string().min(1),
  baseImageId: z.string().min(1),
  baseImagePath: z.string().min(1),
  baseDigest: z.string().regex(/^[a-f0-9]{64}$/),
  channelKeyId: z.string().min(1),
  planPath: z.string().min(1),
  guestSeedDirectory: z.string().min(1),
  hostRuntimeConfigPath: z.string().min(1),
  hostSecretPath: z.string().min(1),
  hostConfigPath: z.string().min(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  developmentAccessEnabled: z.literal(false),
}).strict();

type Session = z.infer<typeof sessionSchema>;

export const chn001HarnessConfigSchema = configSchema;
export const chn001SessionSchema = sessionSchema;
export type Chn001Session = Session;
export const chn001PreparationSchema = preparationSchema;

const injectionModes: Readonly<Record<(typeof chn001InjectionIds)[number], Injection["evidenceMode"]>> = {
  "CHN-001.1": "mutated_live_capture", "CHN-001.2": "mutated_live_capture",
  "CHN-001.3": "mutated_live_capture", "CHN-001.4": "mutated_live_capture",
  "CHN-001.5": "live_reboot", "CHN-001.6": "live_heartbeat_loss",
  "CHN-001.7": "live_windows_guest", "CHN-001.8": "live_windows_guest",
  "CHN-001.9": "live_windows_guest", "CHN-001.10": "live_host_stop",
  "CHN-001.11": "live_host_stop",
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function requiredArg(name: string): string {
  const value = arg(name);
  if (value === undefined) throw new Error(`Missing required argument ${name}.`);
  return value;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function writeAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temporary, path);
}

function sha256File(path: string): string {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  const descriptor = openSync(path, "r");
  try {
    let count = readSync(descriptor, buffer, 0, buffer.length, null);
    while (count > 0) {
      hash.update(buffer.subarray(0, count));
      count = readSync(descriptor, buffer, 0, buffer.length, null);
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function powershell(source: string): string {
  return execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", source], {
    encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function validateChn001LifecycleAppend(input: {
  readonly committed: FieldLifecycleLedger;
  readonly current: FieldLifecycleLedger;
  readonly registry: z.infer<typeof keyRegistrySchema>;
  readonly field: { readonly fieldId: string; readonly fieldGeneration: number };
  readonly machineId: string;
}): readonly string[] {
  const failures: string[] = [];
  const committedVerification = verifyFieldLifecycle({ ledger: input.committed, registry: input.registry });
  const currentVerification = verifyFieldLifecycle({ ledger: input.current, registry: input.registry });
  if (committedVerification.failures.length > 0) failures.push("committed lifecycle ledger is invalid");
  if (currentVerification.failures.length > 0) failures.push("current lifecycle ledger is invalid");
  if (input.current.events.length <= input.committed.events.length) {
    failures.push("lifecycle evidence change is not an append");
    return failures;
  }
  for (const [index, event] of input.committed.events.entries()) {
    if (canonicalJson(event) !== canonicalJson(input.current.events[index])) {
      failures.push(`committed lifecycle event ${index} was changed or removed`);
      break;
    }
  }
  for (const event of input.current.events.slice(input.committed.events.length)) {
    if (event.fieldId !== input.field.fieldId || event.generation !== input.field.fieldGeneration) {
      failures.push(`appended lifecycle event ${event.eventId} names another Field generation`);
    }
    if (event.machineId !== input.machineId) {
      failures.push(`appended lifecycle event ${event.eventId} names another machine`);
    }
  }
  return failures;
}

function assertCleanExactCommit(
  expected?: string,
  lifecycleScope?: { readonly fieldId: string; readonly fieldGeneration: number; readonly machineId: string },
): string {
  const commit = git("rev-parse", "HEAD");
  if (expected !== undefined && commit !== expected) throw new Error(`Session commit ${expected} differs from HEAD ${commit}.`);
  const changedFiles = git("diff", "--name-only", "HEAD", "--").split(/\r?\n/u).filter(Boolean).map((path) => path.replace(/\\/gu, "/"));
  if (changedFiles.length === 0) return commit;
  const lifecycleRelativePath = "docs/qa/completion/field-lifecycle.json";
  const lifecyclePath = join(COMPLETION_DIR, "field-lifecycle.json");
  const defaultLifecyclePath = join(ROOT, ...lifecycleRelativePath.split("/"));
  if (lifecycleScope === undefined || resolve(lifecyclePath) !== resolve(defaultLifecyclePath)
      || changedFiles.length !== 1 || changedFiles[0] !== lifecycleRelativePath) {
    throw new Error("CHN-001 acquisition requires a clean tracked worktree.");
  }
  const committed = fieldLifecycleLedgerSchema.parse(JSON.parse(git("show", `HEAD:${lifecycleRelativePath}`)));
  const current = fieldLifecycleLedgerSchema.parse(readJson(lifecyclePath));
  const registry = keyRegistrySchema.parse(readJson(join(COMPLETION_DIR, "keys.json")));
  const failures = validateChn001LifecycleAppend({ committed, current, registry, field: lifecycleScope, machineId: lifecycleScope.machineId });
  if (failures.length > 0) {
    throw new Error(`CHN-001 acquisition permits only a valid, signed, exact-generation lifecycle append:\n- ${failures.join("\n- ")}`);
  }
  return commit;
}

function assertFinalizationCommit(
  expected: string,
  migrationConfirmation: string | undefined,
  lifecycleScope: { readonly fieldId: string; readonly fieldGeneration: number; readonly machineId: string },
): {
  readonly evaluationCommit: string;
  readonly migration: Chn001Run["contractMigration"];
} {
  const evaluationCommit = assertCleanExactCommit(undefined, lifecycleScope);
  if (evaluationCommit === expected) return { evaluationCommit, migration: null };
  if (migrationConfirmation !== MIGRATION_CONFIRMATION) {
    throw new Error(`Session commit ${expected} differs from HEAD ${evaluationCommit}; typed contract-migration confirmation is required.`);
  }
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", expected, evaluationCommit], { cwd: ROOT, stdio: "ignore" });
  } catch {
    throw new Error("CHN-001 contract migration requires the evidence commit to be an ancestor of the evaluation commit.");
  }
  const changedFiles = git("diff", "--name-only", "--diff-filter=ACMRT", `${expected}..${evaluationCommit}`)
    .split(/\r?\n/u).filter(Boolean).sort();
  if (changedFiles.length === 0) throw new Error("CHN-001 contract migration has no reviewable source diff.");
  const migrationFailures = validateChn001MigrationChangedFiles(changedFiles);
  if (migrationFailures.length > 0) throw new Error(`CHN-001 contract migration rejected:\n- ${migrationFailures.join("\n- ")}`);
  return {
    evaluationCommit,
    migration: {
      fromContractVersion: 1,
      confirmation: MIGRATION_CONFIRMATION,
      changedFiles,
      changedFilesSha256: createHash("sha256").update(changedFiles.join("\n")).digest("hex"),
    },
  };
}

function machineId(): string {
  return `machine-${createHash("sha256").update(hostname()).digest("hex").slice(0, 16)}`;
}

function protectPreparationDirectory(path: string): void {
  const ownerSid = powershell("[Security.Principal.WindowsIdentity]::GetCurrent().User.Value");
  execFileSync("icacls.exe", [
    path, "/inheritance:r", "/grant:r",
    `*${ownerSid}:(OI)(CI)F`, "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F",
  ], { stdio: "ignore" });
}

export function buildChn001Preparation(input: {
  readonly exactCommit: string;
  readonly fieldId: string;
  readonly fieldGeneration: number;
  readonly baseImageId: string;
  readonly baseDigest: string;
  readonly guestAgentDigest: string;
  readonly policyHash: string;
  readonly hostSecretPath: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}) {
  const field = { fieldId: input.fieldId, fieldGeneration: input.fieldGeneration };
  const agentId = "chn001-field-agent";
  const channelKeyId = `chn001-${input.fieldId}-g${input.fieldGeneration}`;
  const display = {
    monitorCount: 1 as const, width: 1920, height: 1080, scalePercent: 100,
    browserZoomPercent: 100, keyboardLayout: "en-US", dynamicResolutionAllowed: false as const,
  };
  const identity = {
    subsystem: "field" as const,
    fieldId: input.fieldId,
    fieldGeneration: input.fieldGeneration,
    agentId,
    machineId: machineId(),
    windowsSessionId: "0",
    baseImageDigest: input.baseDigest,
    taskDiskId: `${input.fieldId}-g${input.fieldGeneration}-task`,
    createdAt: input.createdAt,
  };
  const plan = createFieldProvisioningPlan({
    identity, display, baseImageId: input.baseImageId, networkMode: "isolated",
    virtualProcessors: 4, startupMemoryMiB: 4096, minimumMemoryMiB: 4096,
    maximumMemoryMiB: 8192, dynamicMemory: true, viewerEnabled: true,
    createdAt: input.createdAt,
  });
  const manifest = fieldBootstrapManifestSchema.parse({
    contractVersion: 1, identity, display, policyHash: input.policyHash,
    agentBinaryDigest: input.guestAgentDigest, channelKeyId,
    requiredDirectories: [...REQUIRED_FIELD_DIRECTORIES],
    createdAt: input.createdAt, expiresAt: input.expiresAt,
  });
  const guestRuntime = {
    contractVersion: 1, field, agentId, keyId: channelKeyId,
    secretPath: "C:\\Exosuit\\Config\\channel-secret.txt",
    bootstrapReportPath: "C:\\Exosuit\\Diagnostics\\bootstrap-report.json",
    heartbeatIntervalMilliseconds: 1000,
  };
  const guestLaunch = {
    contractVersion: 1,
    manifestPath: "C:\\Exosuit\\Config\\bootstrap-manifest.json",
    runtimeConfigPath: "C:\\Exosuit\\Config\\guest-runtime.json",
  };
  const hostRuntime = { ...guestRuntime, secretPath: input.hostSecretPath };
  return { field, agentId, channelKeyId, plan, manifest, guestRuntime, guestLaunch, hostRuntime };
}

function prepare(): void {
  const exactCommit = assertCleanExactCommit();
  const fieldId = arg("--field-id") ?? randomUUID();
  const fieldGeneration = Number.parseInt(arg("--generation") ?? "1", 10);
  const baseImageId = requiredArg("--base-image-id");
  const baseImagePath = resolve(requiredArg("--base-image"));
  const expectedBaseDigest = requiredArg("--base-digest");
  const guestAgentPath = resolve(requiredArg("--guest-agent"));
  const hostConfigPath = resolve(requiredArg("--host-config"));
  const policyPath = resolve(requiredArg("--policy"));
  for (const path of [baseImagePath, guestAgentPath, hostConfigPath, policyPath]) {
    if (!existsSync(path)) throw new Error(`CHN-001 preparation input is absent: ${path}`);
  }
  const baseDigest = sha256File(baseImagePath);
  if (baseDigest !== expectedBaseDigest) throw new Error("CHN-001 base digest does not match the preparation authorization.");
  const hostConfig = z.object({ baseImages: z.array(z.object({ imageId: z.string(), path: z.string(), digest: z.string() })) }).passthrough().parse(readJson(hostConfigPath));
  const registered = hostConfig.baseImages.filter((item) => item.imageId === baseImageId);
  if (registered.length !== 1 || resolve(registered[0]!.path) !== baseImagePath || registered[0]!.digest !== baseDigest) {
    throw new Error("CHN-001 base is not uniquely registered in the host configuration.");
  }
  const preparationRoot = resolve(arg("--out") ?? join(OUT, "preparation", fieldId, `generation-${fieldGeneration}`));
  if (existsSync(preparationRoot)) throw new Error(`CHN-001 preparation already exists: ${preparationRoot}`);
  const guestSeedDirectory = join(preparationRoot, "guest-seed");
  const privateDirectory = join(preparationRoot, "private");
  mkdirSync(guestSeedDirectory, { recursive: true });
  mkdirSync(privateDirectory, { recursive: true });
  protectPreparationDirectory(preparationRoot);
  const hostSecretPath = join(privateDirectory, "field-channel-secret.protected.json");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1000).toISOString();
  const bundle = buildChn001Preparation({
    exactCommit, fieldId, fieldGeneration, baseImageId, baseDigest,
    guestAgentDigest: sha256File(guestAgentPath), policyHash: sha256File(policyPath),
    hostSecretPath, createdAt, expiresAt,
  });
  const secret = randomBytes(48).toString("base64url");
  writeAtomic(join(preparationRoot, "plan.json"), bundle.plan);
  writeAtomic(join(guestSeedDirectory, "bootstrap-manifest.json"), bundle.manifest);
  writeAtomic(join(guestSeedDirectory, "guest-runtime.json"), bundle.guestRuntime);
  writeAtomic(join(guestSeedDirectory, "guest-launch.json"), bundle.guestLaunch);
  writeFileSync(join(guestSeedDirectory, "channel-secret.txt"), `${secret}\n`, { encoding: "ascii", flag: "wx" });
  writeAtomic(join(privateDirectory, "host-runtime.json"), bundle.hostRuntime);
  writeFileSync(hostSecretPath, `${secret}\n`, { encoding: "ascii", flag: "wx" });
  const metadata = preparationSchema.parse({
    contractVersion: 1, exactCommit, field: bundle.field,
    vmName: `Exosuit-Field-${fieldId}-G${fieldGeneration}`,
    baseImageId, baseImagePath, baseDigest, channelKeyId: bundle.channelKeyId,
    planPath: join(preparationRoot, "plan.json"), guestSeedDirectory,
    hostRuntimeConfigPath: join(privateDirectory, "host-runtime.json"), hostSecretPath,
    hostConfigPath, createdAt, expiresAt, developmentAccessEnabled: false,
  });
  writeAtomic(join(preparationRoot, "preparation.json"), metadata);
  console.log(JSON.stringify({
    ok: true, preparationPath: join(preparationRoot, "preparation.json"),
    field: metadata.field, vmName: metadata.vmName,
    claimBoundary: "Prepared local private inputs only; no Field was provisioned or promoted.",
  }, null, 2));
}

function bind(): void {
  const preparationPath = resolve(requiredArg("--preparation"));
  const observerAgent = resolve(requiredArg("--observer-agent"));
  const preparation = preparationSchema.parse(readJson(preparationPath));
  assertCleanExactCommit(preparation.exactCommit);
  if (!existsSync(observerAgent)) throw new Error("CHN-001 compiled observer is absent.");
  const vm = JSON.parse(powershell(
    `$vm=Get-VM -Name ${psLiteral(preparation.vmName)} -ErrorAction Stop; [ordered]@{id=$vm.Id.Guid;state=$vm.State.ToString()} | ConvertTo-Json -Compress`,
  )) as { id: string; state: string };
  if (vm.state !== "Running") throw new Error("Prepared CHN-001 Field is not running.");
  const config = configSchema.parse({
    contractVersion: 1, vmName: preparation.vmName, vmGuid: vm.id,
    field: preparation.field, baseImageId: preparation.baseImageId,
    baseImagePath: preparation.baseImagePath, baseDigest: preparation.baseDigest,
    channelKeyId: preparation.channelKeyId, planPath: preparation.planPath,
    hostConfigPath: preparation.hostConfigPath,
    runtimeConfigPath: preparation.hostRuntimeConfigPath, agentPath: observerAgent,
    productionConfiguration: {
      developmentAccessEnabled: false, developmentUnattendedSetupEnabled: false,
      networkMode: "isolated", hostLanAccess: false, inboundConnections: false,
      hostInputInjection: false,
    },
  });
  const outputPath = join(dirname(preparationPath), "harness-config.json");
  writeAtomic(outputPath, config);
  console.log(JSON.stringify({ ok: true, configPath: outputPath, vmGuid: vm.id }, null, 2));
}

function sessionPath(runId: string): string {
  return join(OUT, runId, "session.json");
}

function loadSession(runId: string): Session {
  return sessionSchema.parse(readJson(sessionPath(runId)));
}

function saveSession(session: Session): void {
  writeAtomic(sessionPath(session.runId), session);
}

function canonicalTime(value: string): string {
  return new Date(value).toISOString();
}

function normalizeMessage(raw: z.infer<typeof verifiedCaptureSchema>): VerifiedMessage {
  return {
    messageId: raw.messageId,
    nonce: raw.nonce,
    messageType: raw.messageType === "bootstrapStatus" ? "bootstrap_status" : raw.messageType,
    field: raw.field,
    bootId: raw.bootId,
    keyId: raw.keyId,
    sequence: raw.sequence,
    replayLastSequence: raw.sequence,
    sentAt: canonicalTime(raw.sentAt),
    expiresAt: canonicalTime(raw.expiresAt),
    verifiedAt: canonicalTime(raw.verifiedAt),
    status: "verified",
    payloadHash: raw.payloadHash,
    payloadHashValid: true,
    transport: "hyperv_kvp",
  };
}

export function mergeVerifiedMessages(existing: readonly VerifiedMessage[], incoming: readonly VerifiedMessage[]): VerifiedMessage[] {
  const byId = new Map(existing.map((message) => [message.messageId, message]));
  const nonces = new Map(existing.map((message) => [message.nonce, message.messageId]));
  for (const message of incoming) {
    const prior = byId.get(message.messageId);
    if (prior !== undefined) {
      const { verifiedAt: _priorVerifiedAt, ...priorEnvelope } = prior;
      const { verifiedAt: _incomingVerifiedAt, ...incomingEnvelope } = message;
      if (JSON.stringify(priorEnvelope) !== JSON.stringify(incomingEnvelope)) {
        throw new Error(`Captured message ID ${message.messageId} changed between observations.`);
      }
    }
    const nonceOwner = nonces.get(message.nonce);
    if (nonceOwner !== undefined && nonceOwner !== message.messageId) {
      throw new Error(`Captured nonce ${message.nonce} was reused by another message.`);
    }
    if (prior === undefined) byId.set(message.messageId, message);
    nonces.set(message.nonce, message.messageId);
  }
  return [...byId.values()].sort((left, right) => left.sequence - right.sequence);
}

export function selectRecordableChn001Heartbeat(
  run: Chn001Run,
  lifecycle: LifecycleVerificationResult,
): VerifiedMessage | undefined {
  return [...run.verifiedMessages]
    .filter((message) => message.messageType === "heartbeat")
    .sort((left, right) => Date.parse(right.verifiedAt) - Date.parse(left.verifiedAt))
    .find((message) => checkAgainstLifecycle({
      fieldId: run.field.fieldId,
      generation: run.field.fieldGeneration,
      bootId: message.bootId,
      observedAtMs: Date.parse(message.verifiedAt),
      lifecycle,
    }).length === 0);
}

export function buildChn001Run(
  session: Session,
  completedAt: string,
  baseDigestAfter: string,
  cleanup: Chn001Run["cleanup"],
  evaluation: Pick<Chn001Run, "contractEvaluationCommit" | "contractMigration"> = {
    contractEvaluationCommit: session.exactCommit,
    contractMigration: null,
  },
): Chn001Run {
  return chn001RunSchema.parse({
    contractVersion: 2,
    testId: "CHN-001",
    stage: "run",
    runId: session.runId,
    exactCommit: session.exactCommit,
    machineId: session.machineId,
    field: session.config.field,
    vmGuid: session.config.vmGuid,
    baseImageId: session.config.baseImageId,
    baseDigestBefore: session.config.baseDigest,
    baseDigestAfter,
    channelKeyId: session.config.channelKeyId,
    productionConfiguration: session.config.productionConfiguration,
    startedAt: canonicalTime(session.startedAt),
    completedAt: canonicalTime(completedAt),
    verifiedMessages: session.verifiedMessages,
    failureInjections: session.failureInjections,
    emergencyStops: session.emergencyStops,
    cleanup,
    sourceMutationCountDuringRun: 0,
    ...evaluation,
  });
}

function plan(): void {
  const config = configSchema.parse(readJson(resolve(requiredArg("--config"))));
  console.log(JSON.stringify({
    contractVersion: 1,
    mutatesHost: false,
    config,
    commands: ["start", "signed lifecycle events at every transition", "capture (repeat until >=3 distinct heartbeats)", "add-injection (11)", "add-stop (2)", "finalize", "independent review", "record"],
    ownerCeremonies: ["guest reboot", "heartbeat loss", "session lock", "Secure Desktop", "display mismatch", "healthy/degraded emergency stop", "exact-generation destruction"],
    claimBoundary: "Planning and acquisition do not promote CHN-001; finalize only validates a candidate artifact.",
  }, null, 2));
}

function completionCli(args: readonly string[]): void {
  execFileSync("npx", ["tsx", join(ROOT, "src", "completion", "cli.ts"), ...args], {
    stdio: "inherit",
    cwd: ROOT,
    shell: process.platform === "win32",
  });
}

function assertAncestor(ancestor: string, descendant: string, label: string): void {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: ROOT, stdio: "ignore" });
  } catch {
    throw new Error(`${label} ${descendant} does not descend from completion baseline ${ancestor}.`);
  }
}

export function validateChn001RecordLifecycle(
  run: Chn001Run,
  lifecycle: LifecycleVerificationResult,
  events: readonly FieldLifecycleEvent[],
): readonly string[] {
  const failures = [...lifecycle.failures];
  const matching = events.filter((event) => event.fieldId === run.field.fieldId
    && event.generation === run.field.fieldGeneration);
  if (matching.some((event) => event.machineId !== run.machineId)) {
    failures.push("CHN-001 lifecycle events name another machine.");
  }
  const created = matching.filter((event) => event.kind === "created");
  const destroyed = matching.filter((event) => event.kind === "destroyed");
  if (created.length !== 1) failures.push(`CHN-001 recording requires exactly one signed created event; found ${created.length}.`);
  if (created.length === 1) {
    if (created[0]!.vmGuid?.toLowerCase() !== run.vmGuid.toLowerCase()) failures.push("CHN-001 created lifecycle event names another VM GUID.");
    if (created[0]!.baseImageSha256 !== run.baseDigestBefore) failures.push("CHN-001 created lifecycle event names another immutable base digest.");
  }
  if (destroyed.length !== 1) failures.push(`CHN-001 recording requires exactly one signed destroyed event; found ${destroyed.length}.`);
  if (selectRecordableChn001Heartbeat(run, lifecycle) === undefined) {
    failures.push("CHN-001 recording requires a verified heartbeat inside a signed boot window.");
  }
  return failures;
}

function record(): void {
  if (requiredArg("--confirm") !== RECORD_CONFIRMATION) {
    throw new Error(`Typed confirmation must be exactly: ${RECORD_CONFIRMATION}`);
  }
  const runId = requiredArg("--run-id");
  const path = join(OUT, runId, "chn001-run.json");
  if (!existsSync(path)) throw new Error(`Finalized CHN-001 candidate is absent: ${path}`);
  const run = chn001RunSchema.parse(readJson(path));
  if (run.runId !== runId) throw new Error("CHN-001 candidate runId does not match its requested artifact path.");
  if (run.machineId !== machineId()) throw new Error("CHN-001 candidate was produced on another machine.");
  const runFailures = validateChn001Run(run);
  if (runFailures.length > 0) throw new Error(`CHN-001 candidate is not recordable:\n- ${runFailures.join("\n- ")}`);

  const manifest = buildCompletionManifestSchema.parse(readJson(join(COMPLETION_DIR, "manifest.json")));
  const registry = keyRegistrySchema.parse(readJson(join(COMPLETION_DIR, "keys.json")));
  const ledgerPath = join(COMPLETION_DIR, "field-lifecycle.json");
  const ledger: FieldLifecycleLedger = fieldLifecycleLedgerSchema.parse(readJson(ledgerPath));
  const lifecycle = verifyFieldLifecycle({ ledger, registry });
  const lifecycleFailures = validateChn001RecordLifecycle(run, lifecycle, ledger.events);
  if (lifecycleFailures.length > 0) {
    throw new Error(`CHN-001 lifecycle is not recordable:\n- ${lifecycleFailures.join("\n- ")}`);
  }
  assertAncestor(manifest.baselineCommit, run.exactCommit, "CHN-001 evidence commit");
  assertAncestor(manifest.baselineCommit, run.contractEvaluationCommit, "CHN-001 evaluation commit");
  const heartbeat = selectRecordableChn001Heartbeat(run, lifecycle)!;
  const artifactSha256 = sha256File(path);
  const evidenceId = `chn001-run-${artifactSha256.slice(0, 12)}`;
  completionCli([
    "record-artifact",
    "--test", "CHN-001",
    "--class", "hyperv_host_guest",
    "--file", path,
    "--field-id", run.field.fieldId,
    "--field-generation", String(run.field.fieldGeneration),
    "--field-boot-id", heartbeat.bootId,
    "--observed-at", heartbeat.verifiedAt,
    "--run-id", run.runId,
    "--issuer", "chn001-harness",
    "--evidence-id", evidenceId,
  ]);
  console.log(JSON.stringify({
    recorded: true,
    evidenceId,
    artifactSha256,
    lifecycleHeartbeatId: heartbeat.messageId,
    claimBoundary: "Evidence recorded; CHN-001 remains unpromoted until an independent reviewer authorizes a signed transition.",
  }, null, 2));
}

function start(): void {
  if (requiredArg("--confirm") !== CONFIRMATION) throw new Error(`Typed confirmation must be exactly: ${CONFIRMATION}`);
  const config = configSchema.parse(readJson(resolve(requiredArg("--config"))));
  for (const path of [config.baseImagePath, config.planPath, config.hostConfigPath, config.runtimeConfigPath, config.agentPath]) {
    if (!existsSync(path)) throw new Error(`Required CHN-001 path is absent: ${path}`);
  }
  const plan = fieldProvisioningPlanSchema.parse(readJson(config.planPath));
  if (plan.identity.fieldId !== config.field.fieldId || plan.identity.fieldGeneration !== config.field.fieldGeneration) {
    throw new Error("Provisioning plan names another Field generation.");
  }
  if (plan.storage.baseImage.imageId !== config.baseImageId || plan.storage.baseImage.digest !== config.baseDigest || !plan.storage.baseImage.readOnly) {
    throw new Error("Provisioning plan does not bind the configured immutable base.");
  }
  if ("developmentAccess" in plan) throw new Error("CHN-001 refuses a plan containing development access.");
  if (plan.network.mode !== "isolated" || plan.network.hostLanAccess || plan.network.inboundConnections || plan.hostIntegrations.hostInputInjection) {
    throw new Error("Provisioning plan does not satisfy the production isolation contract.");
  }
  const runtime = z.object({
    contractVersion: z.literal(1), field: configSchema.shape.field, keyId: z.string().min(1),
    secretPath: z.string().min(1),
  }).passthrough().parse(readJson(config.runtimeConfigPath));
  if (runtime.field.fieldId !== config.field.fieldId || runtime.field.fieldGeneration !== config.field.fieldGeneration || runtime.keyId !== config.channelKeyId) {
    throw new Error("Guest runtime configuration names another Field generation or channel key.");
  }
  if (!runtime.secretPath.toLowerCase().endsWith("field-channel-secret.protected.json")) {
    throw new Error("Guest runtime configuration does not require the protected channel secret.");
  }
  const vm = JSON.parse(powershell(
    `$vm=Get-VM -Name ${psLiteral(config.vmName)} -ErrorAction Stop; `
    + `[ordered]@{id=$vm.Id.Guid;state=$vm.State.ToString()} | ConvertTo-Json -Compress`,
  )) as { id: string; state: string };
  if (vm.id.toLowerCase() !== config.vmGuid.toLowerCase() || vm.state !== "Running") {
    throw new Error("Configured VM GUID does not identify the one running Field.");
  }
  const digest = sha256File(config.baseImagePath);
  if (digest !== config.baseDigest) throw new Error("Configured base digest does not match the immutable image bytes.");
  const runId = arg("--run-id") ?? `chn001-${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${randomUUID().slice(0, 8)}`;
  if (existsSync(sessionPath(runId))) throw new Error(`CHN-001 session already exists: ${runId}`);
  const session: Session = {
    contractVersion: 1, stage: "acquiring", runId,
    exactCommit: assertCleanExactCommit(), machineId: machineId(), startedAt: new Date().toISOString(), config,
    captures: 0, verifiedMessages: [], failureInjections: [], emergencyStops: [],
  };
  saveSession(session);
  console.log(JSON.stringify({ runId, sessionPath: sessionPath(runId), status: "acquiring" }, null, 2));
}

function capture(): void {
  const runId = requiredArg("--run-id");
  const session = loadSession(runId);
  assertCleanExactCommit(session.exactCommit, { ...session.config.field, machineId: session.machineId });
  const captureNumber = session.captures + 1;
  const captureDirectory = join(OUT, runId, "captures", String(captureNumber).padStart(4, "0"));
  const observationState = join(OUT, runId, "guest-to-host-observation.json");
  const output = execFileSync("powershell", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
    join(ROOT, "scripts", "windows", "Read-ExosuitFieldGuestKvp.ps1"),
    "-VmName", session.config.vmName,
    "-RuntimeConfigPath", session.config.runtimeConfigPath,
    "-AgentPath", session.config.agentPath,
    "-EvidenceDirectory", captureDirectory,
    "-ObservationStatePath", observationState,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const captured = chn001CaptureFileSchema.parse(JSON.parse(output.replace(/^\uFEFF/, "")));
  if (captured.vmName !== session.config.vmName) throw new Error("Captured KVP snapshot names another VM.");
  const incoming = [captured.handshake, captured.bootstrap, captured.heartbeat].map(normalizeMessage);
  const messages = mergeVerifiedMessages(session.verifiedMessages as VerifiedMessage[], incoming);
  saveSession({ ...session, captures: captureNumber, verifiedMessages: messages });
  console.log(JSON.stringify({ runId, captureNumber, distinctMessages: messages.length, heartbeats: messages.filter((item) => item.messageType === "heartbeat").length }, null, 2));
}

function addInjection(): void {
  const runId = requiredArg("--run-id");
  const session = loadSession(runId);
  assertCleanExactCommit(session.exactCommit, { ...session.config.field, machineId: session.machineId });
  const id = z.enum(chn001InjectionIds).parse(requiredArg("--id"));
  if ((session.failureInjections as Injection[]).some((item) => item.id === id)) throw new Error(`${id} is already recorded.`);
  const artifact = resolve(requiredArg("--artifact"));
  if (!existsSync(artifact)) throw new Error(`Injection artifact is absent: ${artifact}`);
  const source = chn001InjectionArtifactSchema.parse(readJson(artifact));
  if (source.injectionId !== id || source.evidenceMode !== injectionModes[id]) {
    throw new Error(`${id} artifact has the wrong injection identity or evidence mode.`);
  }
  if (source.exactCommit !== session.exactCommit || source.machineId !== session.machineId ||
      source.field.fieldId !== session.config.field.fieldId || source.field.fieldGeneration !== session.config.field.fieldGeneration ||
      source.vmGuid !== session.config.vmGuid) {
    throw new Error(`${id} artifact is bound to another source, machine, Field generation, or VM.`);
  }
  const item: Injection = {
    id, verdict: "passed", evidenceMode: source.evidenceMode, observedAt: canonicalTime(source.observedAt),
    expectedCode: source.expectedCode, actualCode: source.actualCode, artifactSha256: sha256File(artifact),
  };
  saveSession({ ...session, failureInjections: [...session.failureInjections, item] });
  console.log(JSON.stringify(item, null, 2));
}

function addStop(): void {
  const runId = requiredArg("--run-id");
  const session = loadSession(runId);
  assertCleanExactCommit(session.exactCommit, { ...session.config.field, machineId: session.machineId });
  const scenario = z.enum(["healthy", "degraded"]).parse(requiredArg("--scenario"));
  if ((session.emergencyStops as StopProof[]).some((item) => item.scenario === scenario)) throw new Error(`${scenario} stop is already recorded.`);
  const artifact = resolve(requiredArg("--artifact"));
  if (!existsSync(artifact)) throw new Error(`Stop artifact is absent: ${artifact}`);
  const source = chn001StopArtifactSchema.parse(readJson(artifact));
  if (source.scenario !== scenario || source.exactCommit !== session.exactCommit || source.machineId !== session.machineId ||
      source.field.fieldId !== session.config.field.fieldId || source.field.fieldGeneration !== session.config.field.fieldGeneration ||
      source.vmGuid !== session.config.vmGuid) {
    throw new Error(`${scenario} stop artifact is bound to another scenario, source, machine, Field generation, or VM.`);
  }
  const triggeredAt = canonicalTime(source.triggeredAt);
  const stoppedAt = canonicalTime(source.stoppedAt);
  const latencyMs = Date.parse(stoppedAt) - Date.parse(triggeredAt);
  if (latencyMs !== source.latencyMs || latencyMs < 0 || source.recordingStopped) {
    throw new Error(`${scenario} stop artifact has inconsistent timing or recording state.`);
  }
  const proof: StopProof = {
    scenario, triggeredAt, stoppedAt, latencyMs,
    channelIndependent: source.channelIndependent, modelIndependent: source.modelIndependent, inputStopped: source.inputStopped,
    recordingStopped: source.recordingStopped, fieldState: source.fieldState, artifactSha256: sha256File(artifact),
  };
  saveSession({ ...session, emergencyStops: [...session.emergencyStops, proof] });
  console.log(JSON.stringify(proof, null, 2));
}

function finalize(): void {
  const runId = requiredArg("--run-id");
  const session = loadSession(runId);
  const evaluation = assertFinalizationCommit(
    session.exactCommit,
    arg("--confirm-contract-migration"),
    { ...session.config.field, machineId: session.machineId },
  );
  if (existsSync(session.config.baseImagePath) === false) throw new Error("Immutable base image is absent at finalize.");
  const baseDigestAfter = sha256File(session.config.baseImagePath);
  const hostConfig = z.object({ storageRoot: z.string().min(1) }).passthrough().parse(readJson(session.config.hostConfigPath));
  const generationRoot = join(hostConfig.storageRoot, session.config.field.fieldId, `generation-${session.config.field.fieldGeneration}`);
  const cleanupFacts = JSON.parse(powershell(
    `$vmAbsent=$null -eq (Get-VM -Name ${psLiteral(session.config.vmName)} -ErrorAction SilentlyContinue); `
    + `$rootAbsent=-not (Test-Path -LiteralPath ${psLiteral(generationRoot)}); `
    + `[ordered]@{vmAbsent=$vmAbsent;generationRootAbsent=$rootAbsent} | ConvertTo-Json -Compress`,
  )) as { vmAbsent: boolean; generationRootAbsent: boolean };
  if (!cleanupFacts.vmAbsent || !cleanupFacts.generationRootAbsent) {
    throw new Error("Exact Field generation cleanup is incomplete.");
  }
  const run = buildChn001Run(session, new Date().toISOString(), baseDigestAfter, {
    exactGenerationDestroyed: true,
    vmAbsent: true,
    generationRootAbsent: true,
    baseUnchanged: baseDigestAfter === session.config.baseDigest
      ? true
      : (() => { throw new Error("Immutable base digest changed during CHN-001."); })(),
  }, { contractEvaluationCommit: evaluation.evaluationCommit, contractMigration: evaluation.migration });
  const failures = validateChn001Run(run);
  if (failures.length > 0) throw new Error(`CHN-001 candidate is incomplete:\n- ${failures.join("\n- ")}`);
  const path = join(OUT, runId, "chn001-run.json");
  writeAtomic(path, run);
  console.log(JSON.stringify({ ok: true, path, sha256: sha256File(path), claimBoundary: "Candidate validated; no completion evidence was recorded or promoted." }, null, 2));
}

function main(): void {
  const command = process.argv[2];
  if (command === "prepare") return prepare();
  if (command === "bind") return bind();
  if (command === "plan") return plan();
  if (command === "start") return start();
  if (command === "capture") return capture();
  if (command === "add-injection") return addInjection();
  if (command === "add-stop") return addStop();
  if (command === "finalize") return finalize();
  if (command === "record") return record();
  throw new Error("Usage: chn001Harness.ts <prepare|bind|plan|start|capture|add-injection|add-stop|finalize|record> [arguments]");
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/chn001Harness.ts")) main();
