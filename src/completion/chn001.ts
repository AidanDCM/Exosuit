import { z } from "zod";

const canonicalTimestamp = z.string().datetime().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  "CHN-001 timestamps must use canonical UTC milliseconds.",
);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().uuid();

export const chn001InjectionIds = [
  "CHN-001.1", "CHN-001.2", "CHN-001.3", "CHN-001.4",
  "CHN-001.5", "CHN-001.6", "CHN-001.7", "CHN-001.8",
  "CHN-001.9", "CHN-001.10", "CHN-001.11", "CHN-001.12",
] as const;

const fieldRef = z.object({
  fieldId: uuid,
  fieldGeneration: z.number().int().positive(),
}).strict();

const verifiedMessage = z.object({
  messageId: uuid,
  nonce: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  messageType: z.enum(["handshake", "bootstrap_status", "heartbeat"]),
  field: fieldRef,
  bootId: uuid,
  keyId: z.string().min(1).max(200),
  sequence: z.number().int().nonnegative(),
  replayLastSequence: z.number().int().nonnegative(),
  sentAt: canonicalTimestamp,
  expiresAt: canonicalTimestamp,
  verifiedAt: canonicalTimestamp,
  status: z.literal("verified"),
  payloadHash: sha256,
  payloadHashValid: z.literal(true),
  transport: z.literal("hyperv_kvp"),
}).strict();

const injection = z.object({
  id: z.enum(chn001InjectionIds),
  verdict: z.literal("passed"),
  evidenceMode: z.enum([
    "mutated_live_capture",
    "live_reboot",
    "live_heartbeat_loss",
    "live_windows_guest",
    "live_host_stop",
    "live_teach_stop",
  ]),
  observedAt: canonicalTimestamp,
  expectedCode: z.string().min(1).max(120),
  actualCode: z.string().min(1).max(120),
  artifactSha256: sha256,
}).strict();

const stopProof = z.object({
  scenario: z.enum(["healthy", "degraded", "recording"]),
  triggeredAt: canonicalTimestamp,
  stoppedAt: canonicalTimestamp,
  latencyMs: z.number().int().nonnegative().max(5_000),
  channelIndependent: z.literal(true),
  modelIndependent: z.literal(true),
  inputStopped: z.literal(true),
  recordingStopped: z.boolean(),
  fieldState: z.literal("Off"),
  artifactSha256: sha256,
}).strict();

export const chn001RunSchema = z.object({
  contractVersion: z.literal(1),
  testId: z.literal("CHN-001"),
  stage: z.literal("run"),
  runId: z.string().min(1).max(200),
  exactCommit: z.string().regex(/^[a-f0-9]{40}$/),
  machineId: z.string().min(1).max(200),
  field: fieldRef,
  vmGuid: uuid,
  baseImageId: z.string().min(1).max(200),
  baseDigestBefore: sha256,
  baseDigestAfter: sha256,
  channelKeyId: z.string().min(1).max(200),
  productionConfiguration: z.object({
    developmentAccessEnabled: z.literal(false),
    developmentUnattendedSetupEnabled: z.literal(false),
    networkMode: z.literal("isolated"),
    hostLanAccess: z.literal(false),
    inboundConnections: z.literal(false),
    hostInputInjection: z.literal(false),
  }).strict(),
  startedAt: canonicalTimestamp,
  completedAt: canonicalTimestamp,
  verifiedMessages: z.array(verifiedMessage).min(5).max(10_000),
  failureInjections: z.array(injection).length(chn001InjectionIds.length),
  emergencyStops: z.array(stopProof).length(3),
  cleanup: z.object({
    exactGenerationDestroyed: z.literal(true),
    vmAbsent: z.literal(true),
    generationRootAbsent: z.literal(true),
    baseUnchanged: z.literal(true),
  }).strict(),
  sourceMutationCountDuringRun: z.literal(0),
}).strict();

export type Chn001Run = z.infer<typeof chn001RunSchema>;

const expectedInjectionModes: Readonly<Record<(typeof chn001InjectionIds)[number], Chn001Run["failureInjections"][number]["evidenceMode"]>> = {
  "CHN-001.1": "mutated_live_capture",
  "CHN-001.2": "mutated_live_capture",
  "CHN-001.3": "mutated_live_capture",
  "CHN-001.4": "mutated_live_capture",
  "CHN-001.5": "live_reboot",
  "CHN-001.6": "live_heartbeat_loss",
  "CHN-001.7": "live_windows_guest",
  "CHN-001.8": "live_windows_guest",
  "CHN-001.9": "live_windows_guest",
  "CHN-001.10": "live_host_stop",
  "CHN-001.11": "live_host_stop",
  "CHN-001.12": "live_teach_stop",
};

export function validateChn001Run(candidate: unknown): readonly string[] {
  const parsed = chn001RunSchema.safeParse(candidate);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  const run = parsed.data;
  const failures: string[] = [];
  const startedAt = Date.parse(run.startedAt);
  const completedAt = Date.parse(run.completedAt);
  if (completedAt <= startedAt) failures.push("CHN-001 run must complete after it starts.");
  if (run.baseDigestBefore !== run.baseDigestAfter || !run.cleanup.baseUnchanged) {
    failures.push("CHN-001 immutable base digest changed during the run.");
  }

  const messageIds = new Set<string>();
  const nonces = new Set<string>();
  let lastSequence = -1;
  let bootId: string | undefined;
  let heartbeatCount = 0;
  const messageTypes = new Set<string>();
  for (const message of run.verifiedMessages) {
    messageTypes.add(message.messageType);
    if (message.messageType === "heartbeat") heartbeatCount += 1;
    if (message.field.fieldId !== run.field.fieldId || message.field.fieldGeneration !== run.field.fieldGeneration) {
      failures.push(`message ${message.messageId} is bound to a different Field generation.`);
    }
    if (message.keyId !== run.channelKeyId) failures.push(`message ${message.messageId} uses the wrong channel key.`);
    if (bootId === undefined) bootId = message.bootId;
    else if (message.bootId !== bootId) failures.push("accepted messages cross a boot-ID boundary.");
    if (messageIds.has(message.messageId)) failures.push(`message ID ${message.messageId} was accepted twice.`);
    if (nonces.has(message.nonce)) failures.push(`nonce ${message.nonce} was accepted twice.`);
    messageIds.add(message.messageId);
    nonces.add(message.nonce);
    if (message.sequence <= lastSequence) failures.push("accepted channel sequences do not increase strictly.");
    if (message.replayLastSequence !== message.sequence) failures.push(`message ${message.messageId} replay high-water mark is inconsistent.`);
    lastSequence = message.sequence;
    const sentAt = Date.parse(message.sentAt);
    const expiresAt = Date.parse(message.expiresAt);
    const verifiedAt = Date.parse(message.verifiedAt);
    const ttlMs = expiresAt - sentAt;
    if (ttlMs < 1_000 || ttlMs > 300_000) failures.push(`message ${message.messageId} TTL is outside 1-300 seconds.`);
    if (verifiedAt < sentAt || verifiedAt >= expiresAt) failures.push(`message ${message.messageId} was not verified inside its validity window.`);
    if (verifiedAt < startedAt || verifiedAt > completedAt) failures.push(`message ${message.messageId} falls outside the run window.`);
  }
  for (const required of ["handshake", "bootstrap_status", "heartbeat"] as const) {
    if (!messageTypes.has(required)) failures.push(`CHN-001 requires a verified ${required} message.`);
  }
  if (heartbeatCount < 3) failures.push(`CHN-001 requires at least 3 verified heartbeats; found ${heartbeatCount}.`);

  const injectionIds = new Set<string>();
  for (const result of run.failureInjections) {
    if (injectionIds.has(result.id)) failures.push(`failure injection ${result.id} is duplicated.`);
    injectionIds.add(result.id);
    if (result.evidenceMode !== expectedInjectionModes[result.id]) {
      failures.push(`${result.id} requires ${expectedInjectionModes[result.id]} evidence, not ${result.evidenceMode}.`);
    }
    const observedAt = Date.parse(result.observedAt);
    if (observedAt < startedAt || observedAt > completedAt) failures.push(`${result.id} falls outside the run window.`);
  }
  for (const id of chn001InjectionIds) if (!injectionIds.has(id)) failures.push(`required failure injection ${id} is missing.`);

  const stopScenarios = new Set(run.emergencyStops.map((proof) => proof.scenario));
  for (const scenario of ["healthy", "degraded", "recording"] as const) {
    if (!stopScenarios.has(scenario)) failures.push(`emergency-stop scenario ${scenario} is missing.`);
  }
  for (const proof of run.emergencyStops) {
    if (Date.parse(proof.stoppedAt) < Date.parse(proof.triggeredAt)) failures.push(`${proof.scenario} emergency stop ended before it started.`);
    if (proof.scenario === "recording" && !proof.recordingStopped) failures.push("recording emergency stop did not stop recording.");
    if (proof.scenario !== "recording" && proof.recordingStopped) failures.push(`${proof.scenario} stop falsely claims a recording was active.`);
  }
  return failures;
}
