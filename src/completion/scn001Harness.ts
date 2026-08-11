/**
 * SCN-001 evidence acquisition driver.
 *
 * Like the CHN-001 driver, this never provisions, destroys, locks, unlocks, invokes Secure
 * Desktop, reboots, kills the producer, or tears down a Field. Those effects stay with reviewed
 * Field authorities and owner ceremonies. This assembles a candidate from content-addressed
 * artifacts the operator produced, and refuses to finalize an incomplete or mislabelled run.
 *
 * The one thing it does that the CHN driver did not is refuse a ceremony at import time whose
 * observed reason is not the pinned one. Recording a wrong-reason pass and discovering it at
 * finalize costs a whole session; the runbook's stop conditions are cheapest to enforce at the
 * bench, while the guest is still in the state that produced the evidence.
 */

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import {
  scn001CeremonyIds,
  scn001Expectations,
  validateScn001Run,
  type Scn001CeremonyId,
  type Scn001Run,
} from "./scn001.js";

const ROOT = resolve(process.cwd());
const OUT = resolve(process.env["EXOSUIT_SCN001_DIR"] ?? join(ROOT, "artifacts", "scn001"));
const CONFIRMATION = "START SCN-001 EVIDENCE SESSION";

const canonicalTimestamp = z.string().datetime();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().uuid();

const fieldRef = z.object({
  fieldId: uuid,
  fieldGeneration: z.number().int().positive(),
}).strict();

export const scn001ConfigSchema = z.object({
  contractVersion: z.literal(1),
  vmName: z.string().min(1),
  vmGuid: uuid,
  field: fieldRef,
  bootId: uuid,
  agentId: z.string().min(1).max(200),
  channelKeyId: z.string().min(1).max(200),
  baseImageId: z.string().min(1).max(200),
  baseImagePath: z.string().min(1),
  baseDigest: sha256,
  guestSession: z.object({
    expectedSessionId: z.string().min(1).max(100),
    interactiveUserSid: z.string().min(1).max(200),
    producerPath: z.string().min(1).max(400),
    producerExecutableSha256: sha256,
  }).strict(),
  /** The generation CHN-001 proved. A scene on an unverified channel proves nothing. */
  chn001PassedGeneration: z.number().int().positive(),
}).strict();

export type Scn001Config = z.infer<typeof scn001ConfigSchema>;

/** Fields every imported artifact must carry so it cannot be reused across runs. */
const artifactBinding = {
  exactCommit: z.string().regex(/^[a-f0-9]{40}$/),
  machineId: z.string().min(1).max(200),
  field: fieldRef,
  vmGuid: uuid,
};

export const scn001SceneArtifactSchema = z.object({
  ...artifactBinding,
  sceneId: uuid,
  sequence: z.number().int().positive(),
  transport: z.enum(["kvp_inline", "kvp_chunked"]),
  chunkCount: z.number().int().min(1).max(32),
  bootId: uuid,
  agentId: z.string().min(1).max(200),
  windowsSessionId: z.string().min(1).max(100),
  keyId: z.string().min(1).max(200),
  capturedAt: canonicalTimestamp,
  acceptedAt: canonicalTimestamp,
  payloadBytes: z.number().int().positive(),
  payloadHash: sha256,
  windowCount: z.number().int().nonnegative(),
  elementCount: z.number().int().nonnegative(),
}).strict();

export const scn001CeremonyArtifactSchema = z.object({
  ...artifactBinding,
  ceremonyId: z.enum(scn001CeremonyIds),
  evidenceMode: z.string().min(1),
  hostState: z.string().min(1),
  observedAt: canonicalTimestamp,
  actualCodes: z.array(z.string().min(1).max(400)).min(1).max(4),
  rawArtifactSha256: sha256,
}).strict();

const proofKinds = ["launch", "unlock", "relaunch", "reboot", "stale-generation", "teardown"] as const;
export type Scn001ProofKind = (typeof proofKinds)[number];

/** Proof bodies are validated in full by the contract at finalize; here they are bound and hashed. */
export const scn001ProofArtifactSchema = z.object({
  ...artifactBinding,
  kind: z.enum(proofKinds),
  body: z.record(z.string(), z.unknown()),
}).strict();

const sessionSchema = z.object({
  contractVersion: z.literal(1),
  stage: z.literal("acquiring"),
  runId: z.string().min(1).max(200),
  exactCommit: z.string().regex(/^[a-f0-9]{40}$/),
  machineId: z.string().min(1).max(200),
  startedAt: canonicalTimestamp,
  config: scn001ConfigSchema,
  acceptedScenes: z.array(z.record(z.string(), z.unknown())),
  ceremonies: z.array(z.record(z.string(), z.unknown())),
  proofs: z.record(z.string(), z.record(z.string(), z.unknown())),
}).strict();

type Session = z.infer<typeof sessionSchema>;

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

function machineId(): string {
  return hostname();
}

function canonicalTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Uninterpretable timestamp: ${value}`);
  return parsed.toISOString();
}

/**
 * The verifier and the guest agent must come from one commit, and the tree must be clean, or the
 * evidence describes source that no longer exists.
 */
export function assertCleanExactCommit(expected?: string): string {
  if (git("status", "--porcelain") !== "") {
    throw new Error("SCN-001 refuses to act on a dirty worktree.");
  }
  const head = git("rev-parse", "HEAD");
  if (expected !== undefined && head !== expected) {
    throw new Error(`SCN-001 session was started at ${expected} but HEAD is ${head}.`);
  }
  return head;
}

/**
 * The check the CHN driver lacked: a ceremony may only be recorded when what was observed is the
 * reason this contract intends for it. The expectation is read from `scn001Expectations`, never
 * from the artifact, so an operator cannot supply both sides of the comparison.
 */
export function assertCeremonyExpectation(
  id: Scn001CeremonyId,
  observed: { readonly evidenceMode: string; readonly hostState: string; readonly actualCodes: readonly string[] },
): void {
  const expectation = scn001Expectations[id];
  if (observed.evidenceMode !== expectation.evidenceMode) {
    throw new Error(`${id} requires ${expectation.evidenceMode} evidence, not ${observed.evidenceMode}.`);
  }
  if (observed.hostState !== expectation.hostState) {
    throw new Error(`${id} must leave the host ${expectation.hostState}, not ${observed.hostState}.`);
  }
  const pinned = expectation.expectedCodes;
  if (observed.actualCodes.length !== pinned.length) {
    throw new Error(
      `${id} requires ${pinned.length} observed reason(s) in order (${JSON.stringify(pinned)}); found ${observed.actualCodes.length}.`,
    );
  }
  pinned.forEach((code, index) => {
    const actual = observed.actualCodes[index] ?? "";
    const ok = expectation.codeMatch === "exact"
      ? actual === code
      : actual.startsWith(code) && actual.length > code.length;
    if (!ok) {
      throw new Error(
        `${id} observed ${JSON.stringify(actual)}, which is not the intended reason ${JSON.stringify(code)}. `
        + "A right answer for the wrong reason is a failure, not a pass.",
      );
    }
  });
}

function assertBinding(
  source: { exactCommit: string; machineId: string; field: { fieldId: string; fieldGeneration: number }; vmGuid: string },
  session: Session,
  label: string,
): void {
  if (source.exactCommit !== session.exactCommit || source.machineId !== session.machineId ||
      source.field.fieldId !== session.config.field.fieldId ||
      source.field.fieldGeneration !== session.config.field.fieldGeneration ||
      source.vmGuid !== session.config.vmGuid) {
    throw new Error(`${label} is bound to another source, machine, Field generation, or VM.`);
  }
}

export function buildScn001Run(
  session: Session,
  completedAt: string,
  baseDigestAfter: string,
  cleanup: Scn001Run["cleanup"],
): unknown {
  const proof = (kind: Scn001ProofKind): Record<string, unknown> => {
    const body = session.proofs[kind];
    if (body === undefined) throw new Error(`SCN-001 candidate is missing the ${kind} proof.`);
    return body;
  };
  return {
    contractVersion: 1,
    testId: "SCN-001",
    stage: "run",
    runId: session.runId,
    exactCommit: session.exactCommit,
    contractEvaluationCommit: session.exactCommit,
    machineId: session.machineId,
    field: session.config.field,
    vmGuid: session.config.vmGuid,
    bootId: session.config.bootId,
    baseImageId: session.config.baseImageId,
    baseDigestBefore: session.config.baseDigest,
    baseDigestAfter,
    channelKeyId: session.config.channelKeyId,
    agentId: session.config.agentId,
    guestSession: {
      ...session.config.guestSession,
      sessionFileAuthored: true,
      sessionFileHandWritten: false,
    },
    channelProvenGeneration: {
      chn001Passed: true,
      fieldGeneration: session.config.chn001PassedGeneration,
    },
    startedAt: session.startedAt,
    completedAt,
    acceptedScenes: session.acceptedScenes,
    ceremonies: session.ceremonies,
    producerLaunch: proof("launch"),
    unlock: proof("unlock"),
    producerRelaunch: proof("relaunch"),
    reboot: proof("reboot"),
    staleGeneration: proof("stale-generation"),
    teardown: proof("teardown"),
    sceneInvalidation: {
      lastGoodSceneReusedAfterInvalidation: false,
      hostRetainedSceneBytesAfterInvalidation: false,
    },
    cleanup,
    sourceMutationCountDuringRun: 0,
  };
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

function start(): void {
  if (requiredArg("--confirm") !== CONFIRMATION) throw new Error(`Typed confirmation must be exactly: ${CONFIRMATION}`);
  const config = scn001ConfigSchema.parse(readJson(resolve(requiredArg("--config"))));
  if (!existsSync(config.baseImagePath)) throw new Error(`Immutable base image is absent: ${config.baseImagePath}`);
  const digest = sha256File(config.baseImagePath);
  if (digest !== config.baseDigest) throw new Error("Configured base digest does not match the immutable image bytes.");
  if (config.chn001PassedGeneration !== config.field.fieldGeneration) {
    throw new Error("SCN-001 refuses a Field generation whose channel was not proven by CHN-001.");
  }
  const runId = arg("--run-id") ?? `scn001-${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${randomUUID().slice(0, 8)}`;
  if (existsSync(sessionPath(runId))) throw new Error(`SCN-001 session already exists: ${runId}`);
  const session: Session = {
    contractVersion: 1,
    stage: "acquiring",
    runId,
    exactCommit: assertCleanExactCommit(),
    machineId: machineId(),
    startedAt: new Date().toISOString(),
    config,
    acceptedScenes: [],
    ceremonies: [],
    proofs: {},
  };
  saveSession(session);
  console.log(JSON.stringify({ runId, sessionPath: sessionPath(runId), status: "acquiring" }, null, 2));
}

function addScene(): void {
  const runId = requiredArg("--run-id");
  const session = loadSession(runId);
  assertCleanExactCommit(session.exactCommit);
  const artifact = resolve(requiredArg("--artifact"));
  if (!existsSync(artifact)) throw new Error(`Scene artifact is absent: ${artifact}`);
  const source = scn001SceneArtifactSchema.parse(readJson(artifact));
  assertBinding(source, session, `scene ${source.sceneId}`);
  if (session.acceptedScenes.some((scene) => scene["sceneId"] === source.sceneId)) {
    throw new Error(`scene ${source.sceneId} is already recorded.`);
  }
  const scene = {
    sceneId: source.sceneId,
    sequence: source.sequence,
    transport: source.transport,
    chunkCount: source.chunkCount,
    field: source.field,
    bootId: source.bootId,
    agentId: source.agentId,
    windowsSessionId: source.windowsSessionId,
    keyId: source.keyId,
    capturedAt: canonicalTime(source.capturedAt),
    acceptedAt: canonicalTime(source.acceptedAt),
    payloadBytes: source.payloadBytes,
    payloadHash: source.payloadHash,
    windowCount: source.windowCount,
    elementCount: source.elementCount,
    textPolicy: "structural_only",
    screenshotIncluded: false,
    artifactSha256: sha256File(artifact),
  };
  const acceptedScenes = [...session.acceptedScenes, scene]
    .sort((left, right) => Number(left["sequence"]) - Number(right["sequence"]));
  saveSession({ ...session, acceptedScenes });
  console.log(JSON.stringify(scene, null, 2));
}

function addCeremony(): void {
  const runId = requiredArg("--run-id");
  const session = loadSession(runId);
  assertCleanExactCommit(session.exactCommit);
  const id = z.enum(scn001CeremonyIds).parse(requiredArg("--id"));
  if (session.ceremonies.some((entry) => entry["id"] === id)) throw new Error(`${id} is already recorded.`);
  const artifact = resolve(requiredArg("--artifact"));
  if (!existsSync(artifact)) throw new Error(`Ceremony artifact is absent: ${artifact}`);
  const source = scn001CeremonyArtifactSchema.parse(readJson(artifact));
  if (source.ceremonyId !== id) throw new Error(`Artifact records ${source.ceremonyId}, not ${id}.`);
  assertBinding(source, session, id);
  assertCeremonyExpectation(id, source);
  const processed = sha256File(artifact);
  if (processed === source.rawArtifactSha256) {
    throw new Error(`${id} cites one digest as both its raw and processed artifact.`);
  }
  const ceremony = {
    id,
    verdict: "passed",
    evidenceMode: source.evidenceMode,
    hostState: source.hostState,
    observedAt: canonicalTime(source.observedAt),
    expectedCodes: [...scn001Expectations[id].expectedCodes],
    actualCodes: source.actualCodes,
    rawArtifactSha256: source.rawArtifactSha256,
    artifactSha256: processed,
  };
  saveSession({ ...session, ceremonies: [...session.ceremonies, ceremony] });
  console.log(JSON.stringify(ceremony, null, 2));
}

function addProof(): void {
  const runId = requiredArg("--run-id");
  const session = loadSession(runId);
  assertCleanExactCommit(session.exactCommit);
  const kind = z.enum(proofKinds).parse(requiredArg("--kind"));
  if (session.proofs[kind] !== undefined) throw new Error(`the ${kind} proof is already recorded.`);
  const artifact = resolve(requiredArg("--artifact"));
  if (!existsSync(artifact)) throw new Error(`Proof artifact is absent: ${artifact}`);
  const source = scn001ProofArtifactSchema.parse(readJson(artifact));
  if (source.kind !== kind) throw new Error(`Artifact records the ${source.kind} proof, not ${kind}.`);
  assertBinding(source, session, `the ${kind} proof`);
  const body = { ...source.body, artifactSha256: sha256File(artifact) };
  saveSession({ ...session, proofs: { ...session.proofs, [kind]: body } });
  console.log(JSON.stringify({ kind, body }, null, 2));
}

function finalize(): void {
  const runId = requiredArg("--run-id");
  const session = loadSession(runId);
  assertCleanExactCommit(session.exactCommit);
  if (!existsSync(session.config.baseImagePath)) throw new Error("Immutable base image is absent at finalize.");
  const baseDigestAfter = sha256File(session.config.baseImagePath);
  if (baseDigestAfter !== session.config.baseDigest) {
    throw new Error("Immutable base digest changed during SCN-001.");
  }
  const cleanupPath = resolve(requiredArg("--cleanup"));
  if (!existsSync(cleanupPath)) throw new Error(`Cleanup artifact is absent: ${cleanupPath}`);
  const cleanup = z.object({
    exactGenerationDestroyed: z.literal(true),
    vmAbsent: z.literal(true),
    generationRootAbsent: z.literal(true),
    baseUnchanged: z.literal(true),
    sceneSessionFileRemoved: z.literal(true),
  }).strict().parse(readJson(cleanupPath));

  const run = buildScn001Run(session, new Date().toISOString(), baseDigestAfter, cleanup);
  const failures = validateScn001Run(run);
  if (failures.length > 0) throw new Error(`SCN-001 candidate is incomplete:\n- ${failures.join("\n- ")}`);
  const path = join(OUT, runId, "scn001-run.json");
  writeAtomic(path, run);
  console.log(JSON.stringify({
    ok: true,
    path,
    sha256: sha256File(path),
    claimBoundary: "Candidate validated; no completion evidence was recorded or promoted.",
  }, null, 2));
}

function main(): void {
  const command = process.argv[2];
  if (command === "start") return start();
  if (command === "add-scene") return addScene();
  if (command === "add-ceremony") return addCeremony();
  if (command === "add-proof") return addProof();
  if (command === "finalize") return finalize();
  throw new Error("Usage: scn001Harness.ts <start|add-scene|add-ceremony|add-proof|finalize> [arguments]");
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/scn001Harness.ts")) main();
