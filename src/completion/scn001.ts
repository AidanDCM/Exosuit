import { z } from "zod";

/**
 * SCN-001 evidence contract.
 *
 * The runbook's stop condition is that "a rejection occurs for a reason other than the intended
 * one. A right answer for the wrong reason is a failure, not a pass." CHN-001 carried
 * `expectedCode` and `actualCode` as free operator text and never compared them, so that rule
 * held by review rather than by contract. Here the expected reason for every ceremony is pinned
 * in this file, and the operator supplies only what was observed. An operator who cannot choose
 * the expectation cannot satisfy it by relabelling the outcome.
 *
 * The pinned strings for the negative cases are the runtime's own messages, copied from
 * `FieldSceneHostMonitor` and `readSceneFromKvp`. That coupling is deliberate: if someone rewords
 * an invalidation reason, this contract fails and the evidence has to be re-earned rather than
 * quietly matching a reason that no longer means what it did.
 */

const canonicalTimestamp = z.string().datetime().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  "SCN-001 timestamps must use canonical UTC milliseconds.",
);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().uuid();
const commit = z.string().regex(/^[a-f0-9]{40}$/);

export const scn001CeremonyIds = [
  "SCN-001.L1", "SCN-001.L2", "SCN-001.L3", "SCN-001.L4",
  "SCN-001.L5", "SCN-001.L6", "SCN-001.L7", "SCN-001.L8",
  "SCN-001.L9", "SCN-001.L10", "SCN-001.L11",
] as const;

export type Scn001CeremonyId = (typeof scn001CeremonyIds)[number];

/** The structural byte bound the scene receiver enforces (`maximumPayloadBytes`). */
export const SCN001_MAXIMUM_SCENE_PAYLOAD_BYTES = 12 * 1_024;

const evidenceModes = [
  "live_producer_launch",
  "live_scene",
  "live_desktop_ceremony",
  "live_producer_kill",
  "live_reboot",
  "live_scene_rejection",
  "live_scene_corruption",
  "live_lifecycle",
] as const;

const hostStates = ["no_scene", "ready", "invalidated"] as const;

/**
 * What each ceremony must observe. `codeMatch` is `prefix` only where the runtime appends a
 * specific cause to a fixed stem, so the stem is pinned and the cause stays visible in evidence.
 */
interface Scn001Expectation {
  readonly evidenceMode: (typeof evidenceModes)[number];
  readonly hostState: (typeof hostStates)[number];
  readonly expectedCodes: readonly string[];
  readonly codeMatch: "exact" | "prefix";
}

export const scn001Expectations: Readonly<Record<Scn001CeremonyId, Scn001Expectation>> = {
  "SCN-001.L1": {
    evidenceMode: "live_producer_launch",
    hostState: "no_scene",
    expectedCodes: ["producer_running_in_approved_session_from_pinned_image"],
    codeMatch: "exact",
  },
  "SCN-001.L2": {
    evidenceMode: "live_scene",
    hostState: "ready",
    expectedCodes: ["scene_accepted_bound_to_exact_field_generation_boot_session"],
    codeMatch: "exact",
  },
  "SCN-001.L3": {
    evidenceMode: "live_scene",
    hostState: "ready",
    expectedCodes: ["chunked_scene_reassembled_and_accepted"],
    codeMatch: "exact",
  },
  "SCN-001.L4": {
    evidenceMode: "live_desktop_ceremony",
    hostState: "invalidated",
    expectedCodes: ["guest session locked"],
    codeMatch: "exact",
  },
  "SCN-001.L5": {
    evidenceMode: "live_desktop_ceremony",
    hostState: "invalidated",
    expectedCodes: ["scene was captured before the guest desktop stopped being observable"],
    codeMatch: "exact",
  },
  "SCN-001.L6": {
    evidenceMode: "live_desktop_ceremony",
    hostState: "invalidated",
    expectedCodes: ["guest Secure Desktop active"],
    codeMatch: "exact",
  },
  "SCN-001.L7": {
    evidenceMode: "live_producer_kill",
    hostState: "invalidated",
    expectedCodes: ["no scene value is published"],
    codeMatch: "exact",
  },
  "SCN-001.L8": {
    evidenceMode: "live_reboot",
    hostState: "invalidated",
    expectedCodes: ["boot identity changed; the previous scene belongs to a boot that has ended"],
    codeMatch: "exact",
  },
  "SCN-001.L9": {
    evidenceMode: "live_scene_rejection",
    hostState: "invalidated",
    expectedCodes: ["scene rejected: "],
    codeMatch: "prefix",
  },
  // Both halves of the case, in the order the runbook states them: clear the value, then damage
  // it. One code would let a run prove the easier half and claim the other.
  "SCN-001.L10": {
    evidenceMode: "live_scene_corruption",
    hostState: "invalidated",
    expectedCodes: ["no scene value is published", "scene transport failed: "],
    codeMatch: "prefix",
  },
  "SCN-001.L11": {
    evidenceMode: "live_lifecycle",
    hostState: "invalidated",
    expectedCodes: ["exact_producer_terminated_no_orphan"],
    codeMatch: "exact",
  },
};

const fieldRef = z.object({
  fieldId: uuid,
  fieldGeneration: z.number().int().positive(),
}).strict();

const acceptedScene = z.object({
  sceneId: uuid,
  sequence: z.number().int().positive(),
  transport: z.enum(["kvp_inline", "kvp_chunked"]),
  chunkCount: z.number().int().min(1).max(32),
  field: fieldRef,
  bootId: uuid,
  agentId: z.string().min(1).max(200),
  windowsSessionId: z.string().min(1).max(100),
  keyId: z.string().min(1).max(200),
  capturedAt: canonicalTimestamp,
  acceptedAt: canonicalTimestamp,
  payloadBytes: z.number().int().positive().max(SCN001_MAXIMUM_SCENE_PAYLOAD_BYTES),
  payloadHash: sha256,
  windowCount: z.number().int().nonnegative().max(1_000),
  elementCount: z.number().int().nonnegative().max(2_000),
  textPolicy: z.literal("structural_only"),
  screenshotIncluded: z.literal(false),
  artifactSha256: sha256,
}).strict();

const ceremony = z.object({
  id: z.enum(scn001CeremonyIds),
  verdict: z.literal("passed"),
  evidenceMode: z.enum(evidenceModes),
  hostState: z.enum(hostStates),
  observedAt: canonicalTimestamp,
  /** Echoed from `scn001Expectations` so the artifact is readable standalone; still verified. */
  expectedCodes: z.array(z.string().min(1).max(200)).min(1).max(4),
  actualCodes: z.array(z.string().min(1).max(400)).min(1).max(4),
  rawArtifactSha256: sha256,
  artifactSha256: sha256,
}).strict();

/**
 * L5, the case both halves of the channel were originally wrong about.
 *
 * The runbook warns that L5 can pass trivially: if the "stale" scene was in fact captured after
 * the unlock, its rejection proves nothing. So the proof carries the timings and the contract
 * checks that the rejected scene genuinely predates the lock and that the accepting scene
 * genuinely postdates the unlock. The literal `true`s record that the stale scene was valid by
 * every check other than freshness — a scene rejected because its signature was bad would also
 * be the wrong evidence here.
 */
const unlockProof = z.object({
  lockedAt: canonicalTimestamp,
  unlockedAt: canonicalTimestamp,
  staleScene: z.object({
    sequence: z.number().int().positive(),
    capturedAt: canonicalTimestamp,
    presentedAt: canonicalTimestamp,
    signatureValid: z.literal(true),
    bootMatched: z.literal(true),
    sessionMatched: z.literal(true),
    sequenceAccepted: z.literal(true),
    verdict: z.literal("invalidated"),
    reason: z.literal("scene was captured before the guest desktop stopped being observable"),
    artifactSha256: sha256,
  }).strict(),
  freshScene: z.object({
    sequence: z.number().int().positive(),
    capturedAt: canonicalTimestamp,
    presentedAt: canonicalTimestamp,
    verdict: z.literal("ready"),
    artifactSha256: sha256,
  }).strict(),
  readinessBetweenUnlockAndFreshScene: z.literal("invalidated"),
  artifactSha256: sha256,
}).strict();

const producerLaunchProof = z.object({
  pid: z.number().int().positive(),
  launchedAt: canonicalTimestamp,
  sessionId: z.string().min(1).max(100),
  userSid: z.string().min(1).max(200),
  producerPath: z.string().min(1).max(400),
  producerExecutableSha256: sha256,
  artifactSha256: sha256,
}).strict();

const producerRelaunchProof = z.object({
  killedPid: z.number().int().positive(),
  killedAt: canonicalTimestamp,
  readinessClearedAt: canonicalTimestamp,
  relaunchedPid: z.number().int().positive(),
  relaunchedAt: canonicalTimestamp,
  supervisorRelaunched: z.literal(true),
  artifactSha256: sha256,
}).strict();

const rebootProof = z.object({
  priorBootId: uuid,
  newBootId: uuid,
  rebootedAt: canonicalTimestamp,
  priorSceneInvalidated: z.literal(true),
  bootChangeTerminal: z.literal(true),
  newSessionRequired: z.literal(true),
  artifactSha256: sha256,
}).strict();

const staleGenerationProof = z.object({
  expectedFieldGeneration: z.number().int().positive(),
  presentedFieldGeneration: z.number().int().positive(),
  rejected: z.literal(true),
  artifactSha256: sha256,
}).strict();

const teardownProof = z.object({
  producerPid: z.number().int().positive(),
  producerExitedAt: canonicalTimestamp,
  fieldStoppedAt: canonicalTimestamp,
  orphanProcessCount: z.literal(0),
  fieldState: z.literal("Off"),
  artifactSha256: sha256,
}).strict();

export const scn001RunSchema = z.object({
  contractVersion: z.literal(1),
  testId: z.literal("SCN-001"),
  stage: z.literal("run"),
  runId: z.string().min(1).max(200),
  exactCommit: commit,
  contractEvaluationCommit: commit,
  machineId: z.string().min(1).max(200),
  field: fieldRef,
  vmGuid: uuid,
  bootId: uuid,
  baseImageId: z.string().min(1).max(200),
  baseDigestBefore: sha256,
  baseDigestAfter: sha256,
  channelKeyId: z.string().min(1).max(200),
  agentId: z.string().min(1).max(200),
  guestSession: z.object({
    expectedSessionId: z.string().min(1).max(100),
    interactiveUserSid: z.string().min(1).max(200),
    producerPath: z.string().min(1).max(400),
    producerExecutableSha256: sha256,
    sessionFileAuthored: z.literal(true),
    sessionFileHandWritten: z.literal(false),
  }).strict(),
  channelProvenGeneration: z.object({
    chn001Passed: z.literal(true),
    fieldGeneration: z.number().int().positive(),
  }).strict(),
  startedAt: canonicalTimestamp,
  completedAt: canonicalTimestamp,
  acceptedScenes: z.array(acceptedScene).min(2).max(10_000),
  ceremonies: z.array(ceremony).length(scn001CeremonyIds.length),
  producerLaunch: producerLaunchProof,
  unlock: unlockProof,
  producerRelaunch: producerRelaunchProof,
  reboot: rebootProof,
  staleGeneration: staleGenerationProof,
  teardown: teardownProof,
  sceneInvalidation: z.object({
    lastGoodSceneReusedAfterInvalidation: z.literal(false),
    hostRetainedSceneBytesAfterInvalidation: z.literal(false),
  }).strict(),
  cleanup: z.object({
    exactGenerationDestroyed: z.literal(true),
    vmAbsent: z.literal(true),
    generationRootAbsent: z.literal(true),
    baseUnchanged: z.literal(true),
    sceneSessionFileRemoved: z.literal(true),
  }).strict(),
  sourceMutationCountDuringRun: z.literal(0),
}).strict();

export type Scn001Run = z.infer<typeof scn001RunSchema>;

function matches(actual: string, expected: string, mode: "exact" | "prefix"): boolean {
  return mode === "exact" ? actual === expected : actual.startsWith(expected) && actual.length > expected.length;
}

export function validateScn001Run(candidate: unknown): readonly string[] {
  const parsed = scn001RunSchema.safeParse(candidate);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  const run = parsed.data;
  const failures: string[] = [];
  const startedAt = Date.parse(run.startedAt);
  const completedAt = Date.parse(run.completedAt);
  const inWindow = (at: string): boolean => {
    const value = Date.parse(at);
    return value >= startedAt && value <= completedAt;
  };

  if (completedAt <= startedAt) failures.push("SCN-001 run must complete after it starts.");
  if (run.contractEvaluationCommit !== run.exactCommit) {
    failures.push("SCN-001 evidence and contract commits differ; the verifier and the guest agent must come from one commit.");
  }
  if (run.baseDigestBefore !== run.baseDigestAfter || !run.cleanup.baseUnchanged) {
    failures.push("SCN-001 immutable base digest changed during the run.");
  }
  if (run.channelProvenGeneration.fieldGeneration !== run.field.fieldGeneration) {
    failures.push("SCN-001 rides a Field generation whose channel was never proven by CHN-001.");
  }

  // ---- accepted scenes ----
  const sceneIds = new Set<string>();
  const sequences = new Set<number>();
  let lastSequence = 0;
  let lastCapturedAt = Number.NEGATIVE_INFINITY;
  let inlineCount = 0;
  let chunkedCount = 0;
  for (const scene of run.acceptedScenes) {
    const label = `scene ${scene.sceneId}`;
    if (scene.field.fieldId !== run.field.fieldId || scene.field.fieldGeneration !== run.field.fieldGeneration) {
      failures.push(`${label} is bound to a different Field generation.`);
    }
    if (scene.bootId !== run.bootId) failures.push(`${label} is bound to a different boot.`);
    if (scene.agentId !== run.agentId) failures.push(`${label} carries the wrong agent identity.`);
    if (scene.windowsSessionId !== run.guestSession.expectedSessionId) {
      failures.push(`${label} was produced in a session other than the approved one.`);
    }
    if (scene.keyId !== run.channelKeyId) failures.push(`${label} uses the wrong channel key.`);
    if (sceneIds.has(scene.sceneId)) failures.push(`${label} was accepted twice.`);
    sceneIds.add(scene.sceneId);
    if (sequences.has(scene.sequence)) failures.push(`${label} reuses channel sequence ${scene.sequence}.`);
    sequences.add(scene.sequence);
    if (scene.sequence <= lastSequence) failures.push("accepted scene sequences do not increase strictly.");
    lastSequence = scene.sequence;

    const capturedAt = Date.parse(scene.capturedAt);
    const acceptedAt = Date.parse(scene.acceptedAt);
    if (capturedAt < lastCapturedAt) failures.push(`${label} capture time moves backwards.`);
    lastCapturedAt = capturedAt;
    if (acceptedAt < capturedAt) failures.push(`${label} was accepted before it was captured.`);
    if (!inWindow(scene.acceptedAt)) failures.push(`${label} falls outside the run window.`);

    if (scene.transport === "kvp_inline") {
      inlineCount += 1;
      if (scene.chunkCount !== 1) failures.push(`${label} is inline but declares ${scene.chunkCount} chunks.`);
    } else {
      chunkedCount += 1;
      if (scene.chunkCount < 2) failures.push(`${label} is chunked but declares only ${scene.chunkCount} chunk.`);
    }
  }
  if (inlineCount < 1) failures.push("SCN-001.L2 requires at least one inline scene.");
  if (chunkedCount < 1) failures.push("SCN-001.L3 requires at least one chunked scene.");

  // ---- ceremonies ----
  const seen = new Set<string>();
  for (const result of run.ceremonies) {
    const expectation = scn001Expectations[result.id];
    if (seen.has(result.id)) failures.push(`ceremony ${result.id} is duplicated.`);
    seen.add(result.id);
    if (result.evidenceMode !== expectation.evidenceMode) {
      failures.push(`${result.id} requires ${expectation.evidenceMode} evidence, not ${result.evidenceMode}.`);
    }
    if (result.hostState !== expectation.hostState) {
      failures.push(`${result.id} must leave the host ${expectation.hostState}, not ${result.hostState}.`);
    }
    // The operator does not get to choose the expectation. A run that echoes a different one is
    // asserting against a rule this contract does not hold.
    const pinned = expectation.expectedCodes;
    if (result.expectedCodes.length !== pinned.length ||
        pinned.some((code, index) => result.expectedCodes[index] !== code)) {
      failures.push(`${result.id} echoes expected reasons that are not the pinned ones: ${JSON.stringify(pinned)}.`);
    }
    if (result.actualCodes.length !== pinned.length) {
      failures.push(`${result.id} requires ${pinned.length} observed reason(s); found ${result.actualCodes.length}.`);
    } else {
      pinned.forEach((code, index) => {
        const actual = result.actualCodes[index] ?? "";
        if (!matches(actual, code, expectation.codeMatch)) {
          failures.push(`${result.id} observed ${JSON.stringify(actual)}, which is not the intended reason ${JSON.stringify(code)}.`);
        }
      });
    }
    if (result.rawArtifactSha256 === result.artifactSha256) {
      failures.push(`${result.id} cites one digest as both its raw and processed artifact.`);
    }
    if (!inWindow(result.observedAt)) failures.push(`${result.id} falls outside the run window.`);
  }
  for (const id of scn001CeremonyIds) if (!seen.has(id)) failures.push(`required ceremony ${id} is missing.`);

  // ---- L1: the producer that ran is the approved one ----
  const launch = run.producerLaunch;
  if (launch.sessionId !== run.guestSession.expectedSessionId) {
    failures.push("the producer launched in a session other than the approved interactive session.");
  }
  if (launch.userSid !== run.guestSession.interactiveUserSid) {
    failures.push("the producer launched as a user other than the approved interactive user.");
  }
  if (launch.producerPath !== run.guestSession.producerPath) failures.push("the producer launched from an unapproved path.");
  if (launch.producerExecutableSha256 !== run.guestSession.producerExecutableSha256) {
    failures.push("the launched producer image does not match the digest the session file pinned.");
  }
  if (!inWindow(launch.launchedAt)) failures.push("the producer launch falls outside the run window.");

  // ---- L5: the unlock case must not have passed trivially ----
  const unlock = run.unlock;
  const lockedAt = Date.parse(unlock.lockedAt);
  const unlockedAt = Date.parse(unlock.unlockedAt);
  const staleCapturedAt = Date.parse(unlock.staleScene.capturedAt);
  const freshCapturedAt = Date.parse(unlock.freshScene.capturedAt);
  if (unlockedAt <= lockedAt) failures.push("the unlock ceremony did not follow its lock.");
  if (staleCapturedAt > lockedAt) {
    failures.push(
      "the scene SCN-001.L5 rejected was captured after the lock, so its rejection proves nothing about staleness.",
    );
  }
  if (freshCapturedAt <= unlockedAt) {
    failures.push("the scene that restored readiness was not captured after the unlock.");
  }
  if (Date.parse(unlock.staleScene.presentedAt) <= unlockedAt) {
    failures.push("the stale scene was presented before the unlock, so it did not test post-unlock readiness.");
  }
  if (unlock.freshScene.sequence <= unlock.staleScene.sequence) {
    failures.push("the fresh scene does not follow the stale scene in channel sequence.");
  }
  if (unlock.staleScene.artifactSha256 === unlock.freshScene.artifactSha256) {
    failures.push("SCN-001.L5 cites one artifact for both the stale and the fresh scene.");
  }
  for (const [label, at] of [
    ["lock", unlock.lockedAt], ["unlock", unlock.unlockedAt],
    ["stale scene presentation", unlock.staleScene.presentedAt],
    ["fresh scene presentation", unlock.freshScene.presentedAt],
  ] as const) {
    if (!inWindow(at)) failures.push(`the SCN-001.L5 ${label} falls outside the run window.`);
  }

  // ---- L7: the supervisor relaunched a genuinely different process ----
  const relaunch = run.producerRelaunch;
  if (relaunch.killedPid !== launch.pid) {
    failures.push("SCN-001.L7 killed a process other than the producer SCN-001.L1 launched.");
  }
  if (relaunch.relaunchedPid === relaunch.killedPid) {
    failures.push("the relaunched producer reuses the killed process ID, so no relaunch was observed.");
  }
  const killedAt = Date.parse(relaunch.killedAt);
  if (Date.parse(relaunch.readinessClearedAt) < killedAt) failures.push("readiness cleared before the producer was killed.");
  if (Date.parse(relaunch.relaunchedAt) < Date.parse(relaunch.readinessClearedAt)) {
    failures.push("the producer relaunched before readiness cleared.");
  }
  for (const [label, at] of [["kill", relaunch.killedAt], ["relaunch", relaunch.relaunchedAt]] as const) {
    if (!inWindow(at)) failures.push(`the SCN-001.L7 ${label} falls outside the run window.`);
  }

  // ---- L8 / L9 ----
  if (run.reboot.priorBootId !== run.bootId) failures.push("the reboot proof names a prior boot that is not the run's boot.");
  if (run.reboot.newBootId === run.reboot.priorBootId) failures.push("the reboot proof shows an unchanged boot identity.");
  if (!inWindow(run.reboot.rebootedAt)) failures.push("the SCN-001.L8 reboot falls outside the run window.");
  if (run.staleGeneration.expectedFieldGeneration !== run.field.fieldGeneration) {
    failures.push("the stale-generation proof expects a generation other than the run's.");
  }
  if (run.staleGeneration.presentedFieldGeneration === run.field.fieldGeneration) {
    failures.push("the stale-generation proof presented the run's own generation, so nothing stale was tested.");
  }

  // ---- L11: the exact producer, gone before the Field reported Off ----
  const teardown = run.teardown;
  if (teardown.producerPid !== relaunch.relaunchedPid) {
    failures.push("teardown terminated a process other than the producer that was running at the end of the run.");
  }
  if (Date.parse(teardown.producerExitedAt) > Date.parse(teardown.fieldStoppedAt)) {
    failures.push("the producer outlived the Field reaching Off.");
  }
  for (const [label, at] of [["producer exit", teardown.producerExitedAt], ["Field stop", teardown.fieldStoppedAt]] as const) {
    if (!inWindow(at)) failures.push(`the SCN-001.L11 ${label} falls outside the run window.`);
  }

  return failures;
}
