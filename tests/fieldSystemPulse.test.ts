import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FieldArtifactBroker } from "../src/fieldArtifactBroker.js";
import {
  FieldBootstrapEvaluator,
  REQUIRED_FIELD_DIRECTORIES,
  fieldBootstrapCheckNameSchema,
  fieldBootstrapManifestSchema,
  fieldBootstrapReportSchema,
} from "../src/fieldBootstrap.js";
import { FieldChannelReplayGuard, createFieldChannelEnvelope } from "../src/fieldChannel.js";
import { createFieldAttestation, fieldDisplayContractSchema, fieldIdentitySchema, fieldPolicySchema, sha256Canonical } from "../src/fieldContracts.js";
import { EncryptedFileDemonstrationStore } from "../src/encryptedDemonstrationStore.js";
import { FieldHeartbeatMonitor, fieldHeartbeatSchema } from "../src/fieldHeartbeat.js";
import { FakeFieldProvisioner, FieldManager } from "../src/fieldManager.js";
import { FieldRecoveryPlanner, fieldFailureReportSchema } from "../src/fieldRecovery.js";
import { createShadowPrediction, compareShadowPrediction, shadowActualSchema } from "../src/shadowLearning.js";
import { createFieldSupportBundle, hashFieldPrivateIdentifier, verifyFieldSupportBundle } from "../src/fieldSupportBundle.js";
import { TeachRecorderSession } from "../src/teachRecorder.js";
import { VisualRetentionLedger, visualCapturePolicySchema, visualFrameReferenceSchema } from "../src/visualRetention.js";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

const secret = "field-system-pulse-secret-that-is-long-enough-for-attestation";
const channelSecret = "field-system-pulse-channel-secret-that-is-long-enough";

describe("Field full-chain fake system pulse", () => {
  it("plans attests bootstraps teaches stores observes compares transfers diagnoses recovers stops and destroys", async () => {
    const fieldId = randomUUID();
    const field = { fieldId, fieldGeneration: 1 };
    const identity = fieldIdentitySchema.parse({
      subsystem: "field",
      ...field,
      agentId: "field-agent-a",
      machineId: "vm-a",
      windowsSessionId: "session-a",
      baseImageDigest: "a".repeat(64),
      personalStateDigest: "b".repeat(64),
      taskDiskId: "task-disk-a",
      createdAt: "2026-07-21T18:00:00.000Z",
    });
    const display = fieldDisplayContractSchema.parse({
      monitorCount: 1,
      width: 1920,
      height: 1080,
      scalePercent: 100,
      browserZoomPercent: 100,
      keyboardLayout: "en-US",
      dynamicResolutionAllowed: false,
    });
    const policy = fieldPolicySchema.parse({
      contractVersion: 1,
      policyId: randomUUID(),
      field,
      mode: "teach",
      allowedProcesses: ["notepad"],
      allowedCapabilities: ["observe_desktop", "record_demonstration", "file_workspace", "artifact_export"],
      allowedOrigins: [],
      maximumRuntimeSeconds: 3_600,
      maximumActions: 100,
      recordingConsent: "granted",
      allowHostDesktopAccess: false,
      allowHostDriveWrite: false,
      allowPrivilegeEscalation: false,
      allowSecurityControlChanges: false,
      issuedAt: "2026-07-21T18:00:00.000Z",
      expiresAt: "2026-07-21T19:00:00.000Z",
    });
    const attestation = createFieldAttestation({
      identity,
      display,
      policy,
      issuerKeyId: "pulse-key",
      secret,
      issuedAt: "2026-07-21T18:00:00.000Z",
      ttlSeconds: 600,
    });

    const manager = new FieldManager({ provisioner: new FakeFieldProvisioner() });
    manager.plan({ identity, gloveAgentId: "glove-agent-a", actor: "owner", now: new Date("2026-07-21T18:00:00.000Z") });
    expect((await manager.provision({
      field,
      policy,
      attestation,
      attestationSecret: secret,
      actor: "field-manager",
      now: new Date("2026-07-21T18:00:01.000Z"),
    })).lifecycle).toBe("ready");

    const bootstrapManifest = fieldBootstrapManifestSchema.parse({
      contractVersion: 1,
      identity,
      display,
      policyHash: sha256Canonical(policy),
      agentBinaryDigest: "d".repeat(64),
      channelKeyId: "field-channel-key-1",
      requiredDirectories: [...REQUIRED_FIELD_DIRECTORIES],
      createdAt: "2026-07-21T18:00:01.000Z",
      expiresAt: "2026-07-21T18:10:00.000Z",
    });
    const bootstrap = new FieldBootstrapEvaluator({ manifest: bootstrapManifest, manifestDigest: sha256Canonical(bootstrapManifest) });
    const bootstrapReport = fieldBootstrapReportSchema.parse({
      contractVersion: 1,
      identity,
      manifestDigest: sha256Canonical(bootstrapManifest),
      reportedAt: "2026-07-21T18:00:03.000Z",
      checks: fieldBootstrapCheckNameSchema.options.map((name) => ({
        name,
        passed: true,
        observedAt: "2026-07-21T18:00:02.000Z",
        summary: `${name} passed`,
        evidence: {},
      })),
    });
    expect(bootstrap.evaluate(bootstrapReport, new Date("2026-07-21T18:00:03.000Z")).status).toBe("ready");

    const channel = new FieldChannelReplayGuard({ field, direction: "guest_to_host", expectedKeyId: "field-channel-key-1" });
    const heartbeatEnvelope = createFieldChannelEnvelope({
      field,
      direction: "guest_to_host",
      sequence: 0,
      messageType: "heartbeat",
      payload: { agentId: identity.agentId, bootId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" },
      keyId: "field-channel-key-1",
      secret: channelSecret,
      sentAt: "2026-07-21T18:00:03.000Z",
      ttlSeconds: 30,
    });
    expect(channel.accept({ envelope: heartbeatEnvelope, secret: channelSecret, now: new Date("2026-07-21T18:00:04.000Z") }).sequence).toBe(0);

    const heartbeatMonitor = new FieldHeartbeatMonitor({ field, agentId: identity.agentId });
    heartbeatMonitor.accept(fieldHeartbeatSchema.parse({
      contractVersion: 1,
      field,
      agentId: identity.agentId,
      bootId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      sequence: 0,
      observedAt: "2026-07-21T18:00:03.000Z",
      lifecycle: "ready",
      desktopReady: true,
      sessionLocked: false,
      secureDesktopActive: false,
      inputQueueDepth: 0,
      pendingCommandCount: 0,
      workingSetBytes: 100_000_000,
    }), new Date("2026-07-21T18:00:03.000Z"));
    expect(heartbeatMonitor.assess(new Date("2026-07-21T18:00:04.000Z")).state).toBe("healthy");

    expect(manager.enterMode({ field, policy, actor: "owner", now: new Date("2026-07-21T18:00:04.000Z") }).lifecycle).toBe("teaching");
    const recorder = new TeachRecorderSession({
      field,
      operatorId: "aidan",
      goal: "Create a fixture output.",
      successCriteria: ["fixture output created"],
      consentGrantedAt: "2026-07-21T18:00:00.000Z",
    });
    recorder.start("2026-07-21T18:00:04.000Z");
    recorder.append({ source: "input", kind: "type_text", payload: { textLength: 5 }, occurredAt: "2026-07-21T18:00:04.100Z" });
    recorder.append({ source: "annotation", kind: "reason", payload: { text: "Fixture instruction" }, occurredAt: "2026-07-21T18:00:04.200Z" });
    const episode = recorder.complete({ successful: true, summary: "Fixture output created.", endedAt: "2026-07-21T18:00:05.000Z" });

    const storeDirectory = await mkdtemp(join(tmpdir(), "exosuit-field-pulse-"));
    directories.push(storeDirectory);
    const store = new EncryptedFileDemonstrationStore({ directory: storeDirectory, key: randomBytes(32) });
    await store.save(episode);
    expect((await store.load(episode.episodeId))?.status).toBe("completed");
    expect(manager.returnReady({ field, actor: "owner", reason: "Teaching complete.", now: new Date("2026-07-21T18:00:05.000Z") }).lifecycle).toBe("ready");

    const prediction = createShadowPrediction({
      field,
      observationId: "observation-a",
      predictedAt: "2026-07-21T18:00:06.000Z",
      action: { intent: "Save output", targetKey: "save", method: "keyboard", delayMs: 400, expectedResult: "Output is saved" },
      confidence: 0.8,
      sourceEpisodeIds: [episode.episodeId],
      modelVersion: "pulse-shadow-v1",
    });
    const actual = shadowActualSchema.parse({
      actualId: randomUUID(),
      field,
      observationId: "observation-a",
      occurredAt: "2026-07-21T18:00:06.450Z",
      action: { intent: "save output", targetKey: "SAVE", method: "keyboard", delayMs: 450, expectedResult: "output is saved" },
      operatorId: "aidan",
    });
    expect(compareShadowPrediction({ prediction, actual, comparedAt: "2026-07-21T18:00:07.000Z" })).toMatchObject({ intentMatch: true, targetMatch: true, methodMatch: true, timingAbsoluteErrorMs: 50 });
    expect(prediction.executionAllowed).toBe(false);

    const visualPolicy = visualCapturePolicySchema.parse({
      contractVersion: 1,
      policyId: randomUUID(),
      field,
      enabled: true,
      consentGranted: true,
      captureMode: "change_only",
      approvedRegions: [],
      redactSensitiveControls: true,
      storeInlineBytes: false,
      maximumFrameBytes: 10_000,
      maximumSessionBytes: 20_000,
      maximumFrameCount: 2,
      retentionSeconds: 60,
      issuedAt: "2026-07-21T18:00:00.000Z",
      expiresAt: "2026-07-21T18:10:00.000Z",
    });
    const visual = new VisualRetentionLedger(visualPolicy);
    visual.register(visualFrameReferenceSchema.parse({
      contractVersion: 1,
      frameId: randomUUID(),
      field,
      policyId: visualPolicy.policyId,
      capturedAt: "2026-07-21T18:00:06.000Z",
      expiresAt: "2026-07-21T18:01:06.000Z",
      blobId: "frame-a",
      sha256: "f".repeat(64),
      byteLength: 1_000,
      mediaType: "image/webp",
      changeScore: 0.6,
      sensitiveRegionsRedacted: true,
      classification: "demonstration",
    }), new Date("2026-07-21T18:00:07.000Z"));
    expect(visual.usage()).toMatchObject({ frameCount: 1, totalBytes: 1_000 });

    const bytes = Buffer.from("fixture-output", "utf8");
    const broker = new FieldArtifactBroker({ field, maximumTransferBytes: 1_000_000 });
    const transfer = broker.prepare({
      direction: "field_to_host",
      directory: "Outbox",
      relativePath: "fixture/output.txt",
      displayName: "output.txt",
      mediaType: "text/plain",
      classification: "internal",
      expectedBytes: bytes.byteLength,
      expectedSha256: createHash("sha256").update(bytes).digest("hex"),
      now: "2026-07-21T18:00:07.000Z",
    });
    expect(broker.verifyBytes(transfer.transferId, bytes).status).toBe("verified");
    expect(broker.complete(transfer.transferId, "2026-07-21T18:00:08.000Z").status).toBe("completed");

    const recovery = new FieldRecoveryPlanner({ field });
    expect(recovery.decide(fieldFailureReportSchema.parse({
      failureId: randomUUID(),
      field,
      code: "artifact_hash_mismatch",
      operationId: "bad-transfer",
      occurredAt: "2026-07-21T18:00:08.000Z",
      idempotent: false,
      externalEffect: "none",
      details: {},
    }))).toMatchObject({ retryAllowed: false, requiresOwnerReview: true });

    const support = createFieldSupportBundle({
      generatedAt: "2026-07-21T18:00:09.000Z",
      exosuitVersion: "0.1.0",
      fieldIdHash: hashFieldPrivateIdentifier(field.fieldId),
      fieldGeneration: field.fieldGeneration,
      lifecycle: manager.get(field)!.lifecycle,
      health: heartbeatMonitor.assess(new Date("2026-07-21T18:00:04.000Z")).state,
      bootstrapStatus: "ready",
      recorderState: recorder.status().state,
      visualCaptureEnabled: true,
      visualUsage: visual.usage(),
      artifactSummary: { prepared: 0, verified: 0, completed: 1, cancelled: 0, failed: 0, quarantined: 1 },
      channelSummary: { authenticated: true, inboundSequence: channel.lastSequence(), outboundSequence: -1, replayDenials: 0, authenticationDenials: 0 },
      auditSummary: { eventCount: manager.auditTail().length, chainValid: manager.verifyAudit(), eventTypes: Object.fromEntries(manager.auditTail().map((event) => [event.eventType, 1])) },
      recoverySummary: { decisions: 1, retriesAllowed: 0, ownerReviewsRequired: 1, generationIncrementsRequired: 0 },
      recentErrorCodes: ["artifact_hash_mismatch"],
      configurationFlags: { hostDesktopAccess: false, hostDriveWrite: false },
    });
    expect(() => verifyFieldSupportBundle(support)).not.toThrow();

    expect((await manager.stop({ field, actor: "owner", reason: "Pulse complete.", now: new Date("2026-07-21T18:00:10.000Z") })).lifecycle).toBe("stopped");
    expect((await manager.destroy({ field, actor: "field-manager", now: new Date("2026-07-21T18:00:11.000Z") })).lifecycle).toBe("destroyed");
    expect(manager.verifyAudit()).toBe(true);
  });
});
