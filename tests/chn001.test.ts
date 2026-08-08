import { describe, expect, it } from "vitest";
import { chn001InjectionIds, chn001RunSchema, validateChn001Run, type Chn001Run } from "../src/completion/chn001.js";

const FIELD_ID = "11111111-1111-4111-8111-111111111111";
const VM_GUID = "22222222-2222-4222-8222-222222222222";
const BOOT_ID = "33333333-3333-4333-8333-333333333333";
const HASH = "a".repeat(64);

function timestamp(second: number): string {
  return `2026-08-08T20:00:${String(second).padStart(2, "0")}.000Z`;
}

function makeRun(): Chn001Run {
  const messageTypes = ["handshake", "bootstrap_status", "heartbeat", "heartbeat", "heartbeat"] as const;
  const modeById = {
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
  } as const;
  return chn001RunSchema.parse({
    contractVersion: 1,
    testId: "CHN-001",
    stage: "run",
    runId: "chn001-test-run",
    exactCommit: "b".repeat(40),
    machineId: "machine-test",
    field: { fieldId: FIELD_ID, fieldGeneration: 1 },
    vmGuid: VM_GUID,
    baseImageId: "exosuit-field-base-v25",
    baseDigestBefore: HASH,
    baseDigestAfter: HASH,
    channelKeyId: "channel-test-1",
    productionConfiguration: {
      developmentAccessEnabled: false,
      developmentUnattendedSetupEnabled: false,
      networkMode: "isolated",
      hostLanAccess: false,
      inboundConnections: false,
      hostInputInjection: false,
    },
    startedAt: timestamp(0),
    completedAt: timestamp(59),
    verifiedMessages: messageTypes.map((messageType, index) => ({
      messageId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      nonce: Buffer.alloc(16, index + 1).toString("base64url"),
      messageType,
      field: { fieldId: FIELD_ID, fieldGeneration: 1 },
      bootId: BOOT_ID,
      keyId: "channel-test-1",
      sequence: 100 + index,
      replayLastSequence: 100 + index,
      sentAt: timestamp(5 + index * 3),
      expiresAt: timestamp(25 + index * 3),
      verifiedAt: timestamp(6 + index * 3),
      status: "verified",
      payloadHash: HASH,
      payloadHashValid: true,
      transport: "hyperv_kvp",
    })),
    failureInjections: chn001InjectionIds.map((id, index) => ({
      id,
      verdict: "passed",
      evidenceMode: modeById[id],
      observedAt: timestamp(30 + index),
      expectedCode: `expected-${index}`,
      actualCode: `actual-${index}`,
      artifactSha256: String((index % 9) + 1).repeat(64),
    })),
    emergencyStops: ["healthy", "degraded", "recording"].map((scenario, index) => ({
      scenario,
      triggeredAt: timestamp(45 + index * 2),
      stoppedAt: timestamp(46 + index * 2),
      latencyMs: 1_000,
      channelIndependent: true,
      modelIndependent: true,
      inputStopped: true,
      recordingStopped: scenario === "recording",
      fieldState: "Off",
      artifactSha256: "f".repeat(64),
    })),
    cleanup: {
      exactGenerationDestroyed: true,
      vmAbsent: true,
      generationRootAbsent: true,
      baseUnchanged: true,
    },
    sourceMutationCountDuringRun: 0,
  });
}

describe("CHN-001 acceptance contract", () => {
  it("accepts a complete production-configured live run", () => {
    expect(validateChn001Run(makeRun())).toEqual([]);
  });

  it("requires all three authenticated message types and three heartbeats", () => {
    const run = makeRun();
    run.verifiedMessages[1]!.messageType = "heartbeat";
    expect(validateChn001Run(run).join("\n")).toMatch(/bootstrap_status/);
  });

  it("rejects duplicate message IDs, nonces, and rolled-back sequences", () => {
    const run = makeRun();
    run.verifiedMessages[1]!.messageId = run.verifiedMessages[0]!.messageId;
    run.verifiedMessages[1]!.nonce = run.verifiedMessages[0]!.nonce;
    run.verifiedMessages[1]!.sequence = run.verifiedMessages[0]!.sequence;
    const failures = validateChn001Run(run).join("\n");
    expect(failures).toMatch(/accepted twice/);
    expect(failures).toMatch(/increase strictly/);
  });

  it("rejects cross-generation, cross-key, and cross-boot acceptance", () => {
    const run = makeRun();
    run.verifiedMessages[1]!.field.fieldGeneration = 2;
    run.verifiedMessages[2]!.keyId = "wrong-key";
    run.verifiedMessages[3]!.bootId = "44444444-4444-4444-8444-444444444444";
    const failures = validateChn001Run(run).join("\n");
    expect(failures).toMatch(/different Field generation/);
    expect(failures).toMatch(/wrong channel key/);
    expect(failures).toMatch(/boot-ID boundary/);
  });

  it("requires verification inside the signed validity and run windows", () => {
    const run = makeRun();
    run.verifiedMessages[0]!.verifiedAt = run.verifiedMessages[0]!.expiresAt;
    expect(validateChn001Run(run).join("\n")).toMatch(/validity window/);
  });

  it("requires every injection once and with its live evidence mode", () => {
    const run = makeRun();
    run.failureInjections[11] = { ...run.failureInjections[10]!, id: "CHN-001.11" };
    run.failureInjections[7]!.evidenceMode = "mutated_live_capture";
    const failures = validateChn001Run(run).join("\n");
    expect(failures).toMatch(/duplicated/);
    expect(failures).toMatch(/CHN-001\.12.*missing/);
    expect(failures).toMatch(/CHN-001\.8 requires live_windows_guest/);
  });

  it("requires three independent emergency-stop scenarios", () => {
    const run = makeRun();
    run.emergencyStops[2] = { ...run.emergencyStops[1]!, scenario: "degraded" };
    const failures = validateChn001Run(run).join("\n");
    expect(failures).toMatch(/recording.*missing/);
  });

  it("rejects a changed immutable base", () => {
    const run = makeRun();
    run.baseDigestAfter = "c".repeat(64);
    expect(validateChn001Run(run).join("\n")).toMatch(/immutable base digest changed/);
  });

  it("rejects partial and development-configured records at schema validation", () => {
    const run = makeRun() as unknown as Record<string, unknown>;
    run.productionConfiguration = {
      ...(run.productionConfiguration as object),
      developmentAccessEnabled: true,
    };
    expect(validateChn001Run(run).join("\n")).toMatch(/developmentAccessEnabled/);
  });
});
