import { describe, expect, it } from "vitest";
import { chn001InjectionIds, chn001RunSchema, type Chn001Run } from "../src/completion/chn001.js";
import {
  buildChn001Run,
  buildChn001Preparation,
  chn001HarnessConfigSchema,
  chn001InjectionArtifactSchema,
  chn001StopArtifactSchema,
  mergeVerifiedMessages,
  type Chn001Session,
} from "../src/completion/chn001Harness.js";

const field = { fieldId: "6e090827-1642-45a8-b4ef-bfda4ca90b02", fieldGeneration: 2 };
const bootId = "c40269d1-6c62-49fa-aaba-461a65a55af5";
const commit = "a".repeat(40);
const digest = "b".repeat(64);

function message(index: number, messageType: "handshake" | "bootstrap_status" | "heartbeat"): Chn001Run["verifiedMessages"][number] {
  const second = String(index + 1).padStart(2, "0");
  return {
    messageId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    nonce: `abcdefghijklmnopqrstu${String(index % 10)}`,
    messageType,
    field,
    bootId,
    keyId: "field-key-1",
    sequence: index + 1,
    replayLastSequence: index + 1,
    sentAt: `2026-08-08T20:00:${second}.000Z`,
    expiresAt: `2026-08-08T20:01:${second}.000Z`,
    verifiedAt: `2026-08-08T20:00:${second}.500Z`,
    status: "verified",
    payloadHash: String(index + 1).repeat(64).slice(0, 64),
    payloadHashValid: true,
    transport: "hyperv_kvp",
  };
}

function completeSession(): Chn001Session {
  const messages = [message(0, "handshake"), message(1, "bootstrap_status"), message(2, "heartbeat"), message(3, "heartbeat"), message(4, "heartbeat")];
  return {
    contractVersion: 1,
    stage: "acquiring",
    runId: "chn001-unit",
    exactCommit: commit,
    machineId: "machine-test",
    startedAt: "2026-08-08T20:00:00.000Z",
    config: {
      contractVersion: 1,
      vmName: "Exosuit-Field-test-G2",
      vmGuid: "4e1596ad-0946-4ec4-9965-8cd11410139b",
      field,
      baseImageId: "base-v26",
      baseImagePath: "C:\\ProgramData\\Exosuit\\Images\\base-v26.vhdx",
      baseDigest: digest,
      channelKeyId: "field-key-1",
      planPath: "C:\\ProgramData\\Exosuit\\Fields\\plan.json",
      hostConfigPath: "C:\\ProgramData\\Exosuit\\field-host-config.json",
      runtimeConfigPath: "C:\\ProgramData\\Exosuit\\Fields\\runtime.json",
      agentPath: "C:\\ProgramData\\Exosuit\\bin\\Exosuit.Agent.exe",
      productionConfiguration: {
        developmentAccessEnabled: false,
        developmentUnattendedSetupEnabled: false,
        networkMode: "isolated",
        hostLanAccess: false,
        inboundConnections: false,
        hostInputInjection: false,
      },
    },
    captures: 3,
    verifiedMessages: messages,
    failureInjections: chn001InjectionIds.map((id, index) => ({
      id,
      verdict: "passed" as const,
      evidenceMode: (["mutated_live_capture", "mutated_live_capture", "mutated_live_capture", "mutated_live_capture", "live_reboot", "live_heartbeat_loss", "live_windows_guest", "live_windows_guest", "live_windows_guest", "live_host_stop", "live_host_stop", "live_teach_stop"] as const)[index],
      observedAt: "2026-08-08T20:02:00.000Z",
      expectedCode: `expected-${index}`,
      actualCode: `expected-${index}`,
      artifactSha256: String((index + 1) % 10).repeat(64),
    })),
    emergencyStops: (["healthy", "degraded", "recording"] as const).map((scenario, index) => ({
      scenario,
      triggeredAt: `2026-08-08T20:03:0${index}.000Z`,
      stoppedAt: `2026-08-08T20:03:0${index}.500Z`,
      latencyMs: 500,
      channelIndependent: true as const,
      modelIndependent: true as const,
      inputStopped: true as const,
      recordingStopped: scenario === "recording",
      fieldState: "Off" as const,
      artifactSha256: String(index + 6).repeat(64),
    })),
  };
}

describe("CHN-001 acquisition harness", () => {
  it("builds an isolated production plan and exact four-file guest contract", () => {
    const prepared = buildChn001Preparation({
      exactCommit: commit,
      fieldId: field.fieldId,
      fieldGeneration: field.fieldGeneration,
      baseImageId: "exosuit-field-base-v26",
      baseDigest: digest,
      guestAgentDigest: "c".repeat(64),
      policyHash: "d".repeat(64),
      hostSecretPath: "C:\\private\\field-channel-secret.protected.json",
      createdAt: "2026-08-09T06:00:00.000Z",
      expiresAt: "2026-08-10T06:00:00.000Z",
    });
    expect(prepared.plan.network).toMatchObject({ mode: "isolated", hostLanAccess: false, inboundConnections: false });
    expect(prepared.plan.hostIntegrations.hostInputInjection).toBe(false);
    expect(prepared.plan).not.toHaveProperty("developmentAccess");
    expect(prepared.manifest.identity.windowsSessionId).toBe("0");
    expect(prepared.guestRuntime.secretPath).toBe("C:\\Exosuit\\Config\\channel-secret.txt");
    expect(prepared.hostRuntime.secretPath).toMatch(/field-channel-secret\.protected\.json$/);
    expect(Object.keys({
      "bootstrap-manifest.json": prepared.manifest,
      "guest-runtime.json": prepared.guestRuntime,
      "guest-launch.json": prepared.guestLaunch,
      "channel-secret.txt": "private",
    })).toHaveLength(4);
  });

  it("deduplicates unchanged snapshots and orders new messages by channel sequence", () => {
    const handshake = message(0, "handshake");
    const heartbeat = message(2, "heartbeat");
    expect(mergeVerifiedMessages([heartbeat], [handshake, heartbeat])).toEqual([handshake, heartbeat]);
  });

  it("rejects a reused nonce and a changed message under the same ID", () => {
    const first = message(0, "handshake");
    expect(() => mergeVerifiedMessages([first], [{ ...message(1, "bootstrap_status"), nonce: first.nonce }])).toThrow(/nonce/);
    expect(() => mergeVerifiedMessages([first], [{ ...first, sequence: 99 }])).toThrow(/changed/);
  });

  it("builds a complete candidate without recording or promoting it", () => {
    const run = buildChn001Run(completeSession(), "2026-08-08T20:04:00.000Z", digest, {
      exactGenerationDestroyed: true,
      vmAbsent: true,
      generationRootAbsent: true,
      baseUnchanged: true,
    });
    expect(chn001RunSchema.parse(run).testId).toBe("CHN-001");
  });

  it("refuses development access in the acquisition configuration", () => {
    const config = completeSession().config;
    expect(() => chn001HarnessConfigSchema.parse({
      ...config,
      productionConfiguration: { ...config.productionConfiguration, developmentAccessEnabled: true },
    })).toThrow();
  });

  it("requires closed, exact-bound injection and stop artifacts", () => {
    const binding = { exactCommit: commit, machineId: "machine-test", field, vmGuid: "4e1596ad-0946-4ec4-9965-8cd11410139b" };
    expect(chn001InjectionArtifactSchema.parse({
      contractVersion: 1, testId: "CHN-001", injectionId: "CHN-001.1", ...binding,
      evidenceMode: "mutated_live_capture", observedAt: "2026-08-08T20:02:00.000Z",
      expectedCode: "signature_invalid", actualCode: "signature_invalid", passed: true,
      sourceArtifactSha256: "c".repeat(64),
    }).injectionId).toBe("CHN-001.1");
    expect(() => chn001StopArtifactSchema.parse({
      contractVersion: 1, testId: "CHN-001", scenario: "healthy", ...binding,
      triggeredAt: "2026-08-08T20:03:00.000Z", stoppedAt: "2026-08-08T20:03:06.000Z",
      latencyMs: 6_000, channelIndependent: true, modelIndependent: true, inputStopped: true,
      recordingStopped: false, fieldState: "Off", sourceArtifactSha256: "d".repeat(64), extra: true,
    })).toThrow();
  });
});
