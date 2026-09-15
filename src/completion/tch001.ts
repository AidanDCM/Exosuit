import { z } from "zod";

const canonicalTimestamp = z.string().datetime().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  "TCH-001 timestamps must use canonical UTC milliseconds.",
);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Phase-correct proof for TCH-001.12. This deliberately contains metadata and
 * content addresses only; demonstration bytes, screenshots, UI text, and
 * credentials are forbidden from the completion artifact.
 */
export const tch001RecordingStopProofSchema = z.object({
  contractVersion: z.literal(1),
  testId: z.literal("TCH-001"),
  testCaseId: z.literal("TCH-001.12"),
  exactCommit: z.string().regex(/^[a-f0-9]{40}$/),
  machineId: z.string().min(1).max(200),
  field: z.object({
    fieldId: z.string().uuid(),
    fieldGeneration: z.number().int().positive(),
  }).strict(),
  vmGuid: z.string().uuid(),
  consent: z.object({
    receiptSha256: sha256,
    grantedAt: canonicalTimestamp,
    activeAtTrigger: z.literal(true),
  }).strict(),
  indicator: z.object({
    observationSha256: sha256,
    observedAt: canonicalTimestamp,
    visibleAtTrigger: z.literal(true),
  }).strict(),
  triggeredAt: canonicalTimestamp,
  recordingStoppedAt: canonicalTimestamp,
  fieldStoppedAt: canonicalTimestamp,
  latencyMs: z.number().int().nonnegative().max(5_000),
  channelIndependent: z.literal(true),
  modelIndependent: z.literal(true),
  inputHooksStopped: z.literal(true),
  pendingInputInvalidated: z.literal(true),
  recordingStopped: z.literal(true),
  fieldState: z.literal("Off"),
  sourceArtifactSha256: sha256,
}).strict();

export type Tch001RecordingStopProof = z.infer<typeof tch001RecordingStopProofSchema>;

export function validateTch001RecordingStopProof(candidate: unknown): readonly string[] {
  const parsed = tch001RecordingStopProofSchema.safeParse(candidate);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  const proof = parsed.data;
  const triggeredAt = Date.parse(proof.triggeredAt);
  const recordingStoppedAt = Date.parse(proof.recordingStoppedAt);
  const fieldStoppedAt = Date.parse(proof.fieldStoppedAt);
  const failures: string[] = [];
  if (Date.parse(proof.consent.grantedAt) > triggeredAt) failures.push("recording-stop consent was granted after the stop trigger.");
  const indicatorObservedAt = Date.parse(proof.indicator.observedAt);
  if (indicatorObservedAt > triggeredAt || triggeredAt - indicatorObservedAt > 30_000) {
    failures.push("recording indicator was not observed within 30 seconds before the stop trigger.");
  }
  if (recordingStoppedAt < triggeredAt) failures.push("recording stopped before the emergency-stop trigger.");
  if (fieldStoppedAt < triggeredAt) failures.push("Field stopped before the emergency-stop trigger.");
  if (recordingStoppedAt > fieldStoppedAt) failures.push("recording hooks were not stopped by the time the Field reached Off.");
  const actualLatencyMs = Math.max(recordingStoppedAt, fieldStoppedAt) - triggeredAt;
  if (actualLatencyMs !== proof.latencyMs) failures.push("recording-stop latency does not match canonical timestamps.");
  return failures;
}
