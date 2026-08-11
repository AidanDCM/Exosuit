import { describe, expect, it } from "vitest";
import {
  assertCeremonyExpectation,
  buildScn001Run,
  scn001CeremonyArtifactSchema,
  scn001ConfigSchema,
} from "../src/completion/scn001Harness.js";
import { scn001CeremonyIds, scn001Expectations, validateScn001Run } from "../src/completion/scn001.js";

const FIELD_ID = "11111111-1111-4111-8111-111111111111";
const VM_GUID = "22222222-2222-4222-8222-222222222222";
const BOOT_ID = "33333333-3333-4333-8333-333333333333";
const NEW_BOOT_ID = "44444444-4444-4444-8444-444444444444";
const HASH = "a".repeat(64);
const COMMIT = "b".repeat(40);
const SESSION_ID = "2";
const USER_SID = "S-1-5-21-1111111111-2222222222-3333333333-1001";
const PRODUCER_PATH = "C:\\Exosuit\\Agent\\Exosuit.Agent.exe";

function timestamp(minute: number): string {
  return new Date(Date.UTC(2026, 7, 12, 14, 0, 0) + minute * 60_000).toISOString();
}

function digest(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

function config() {
  return scn001ConfigSchema.parse({
    contractVersion: 1,
    vmName: "Exosuit-Field-test",
    vmGuid: VM_GUID,
    field: { fieldId: FIELD_ID, fieldGeneration: 4 },
    bootId: BOOT_ID,
    agentId: "agent-test-1",
    channelKeyId: "channel-test-1",
    baseImageId: "exosuit-field-base-v26",
    baseImagePath: "C:\\ProgramData\\Exosuit\\Images\\base.vhdx",
    baseDigest: HASH,
    guestSession: {
      expectedSessionId: SESSION_ID,
      interactiveUserSid: USER_SID,
      producerPath: PRODUCER_PATH,
      producerExecutableSha256: digest("c"),
    },
    channelVerifiedForGeneration: {
      channelVerifiedFieldId: FIELD_ID,
      channelVerifiedGeneration: 4,
      channelVerificationRunId: "chnverify-test-run",
      result: "verified",
      verifiedAt: timestamp(-30),
      evidenceSha256: digest("e"),
    },
  });
}

function session() {
  return {
    contractVersion: 1 as const,
    stage: "acquiring" as const,
    runId: "scn001-harness-test",
    exactCommit: COMMIT,
    machineId: "machine-test",
    startedAt: timestamp(0),
    config: config(),
    acceptedScenes: [
      {
        sceneId: "55555555-5555-4555-8555-555555555551", sequence: 1, transport: "kvp_inline", chunkCount: 1,
        field: { fieldId: FIELD_ID, fieldGeneration: 4 }, bootId: BOOT_ID, agentId: "agent-test-1",
        windowsSessionId: SESSION_ID, keyId: "channel-test-1", capturedAt: timestamp(10), acceptedAt: timestamp(11),
        payloadBytes: 3_200, payloadHash: digest("1"), windowCount: 9, elementCount: 14,
        textPolicy: "structural_only", screenshotIncluded: false, artifactSha256: digest("2"),
      },
      {
        sceneId: "55555555-5555-4555-8555-555555555552", sequence: 2, transport: "kvp_chunked", chunkCount: 3,
        field: { fieldId: FIELD_ID, fieldGeneration: 4 }, bootId: BOOT_ID, agentId: "agent-test-1",
        windowsSessionId: SESSION_ID, keyId: "channel-test-1", capturedAt: timestamp(15), acceptedAt: timestamp(16),
        payloadBytes: 9_600, payloadHash: digest("3"), windowCount: 9, elementCount: 31,
        textPolicy: "structural_only", screenshotIncluded: false, artifactSha256: digest("4"),
      },
    ] as Record<string, unknown>[],
    ceremonies: scn001CeremonyIds.map((id, index) => ({
      id,
      verdict: "passed",
      evidenceMode: scn001Expectations[id].evidenceMode,
      hostState: scn001Expectations[id].hostState,
      observedAt: timestamp(20 + index * 5),
      expectedCodes: [...scn001Expectations[id].expectedCodes],
      actualCodes: scn001Expectations[id].expectedCodes.map((code) =>
        scn001Expectations[id].codeMatch === "exact" ? code : `${code}observed cause`,
      ),
      rawArtifactSha256: digest(String((index % 9) + 1)),
      artifactSha256: digest(String(((index + 4) % 9) + 1)),
    })) as Record<string, unknown>[],
    proofs: {
      launch: {
        pid: 4_100, launchedAt: timestamp(5), sessionId: SESSION_ID, userSid: USER_SID,
        producerPath: PRODUCER_PATH, producerExecutableSha256: digest("c"), artifactSha256: digest("5"),
      },
      unlock: {
        lockedAt: timestamp(40), unlockedAt: timestamp(45),
        staleScene: {
          sequence: 8, capturedAt: timestamp(38), presentedAt: timestamp(46), signatureValid: true,
          bootMatched: true, sessionMatched: true, sequenceAccepted: true, verdict: "invalidated",
          reason: "scene was captured before the guest desktop stopped being observable",
          artifactSha256: digest("6"),
        },
        freshScene: {
          sequence: 9, capturedAt: timestamp(47), presentedAt: timestamp(48), verdict: "ready",
          artifactSha256: digest("7"),
        },
        readinessBetweenUnlockAndFreshScene: "invalidated",
        artifactSha256: digest("0"),
      },
      relaunch: {
        killedPid: 4_100, killedAt: timestamp(60), readinessClearedAt: timestamp(61),
        relaunchedPid: 4_260, relaunchedAt: timestamp(62), supervisorRelaunched: true, artifactSha256: digest("8"),
      },
      reboot: {
        priorBootId: BOOT_ID, newBootId: NEW_BOOT_ID, rebootedAt: timestamp(75), priorSceneInvalidated: true,
        bootChangeTerminal: true, newSessionRequired: true, artifactSha256: digest("9"),
      },
      "stale-generation": {
        expectedFieldGeneration: 4, presentedFieldGeneration: 3, rejected: true, artifactSha256: digest("1"),
      },
      teardown: {
        producerPid: 4_260, producerExitedAt: timestamp(110), fieldStoppedAt: timestamp(111),
        orphanProcessCount: 0, fieldState: "Off", artifactSha256: digest("2"),
      },
    } as Record<string, Record<string, unknown>>,
  };
}

const cleanup = {
  exactGenerationDestroyed: true,
  vmAbsent: true,
  generationRootAbsent: true,
  baseUnchanged: true,
  sceneSessionFileRemoved: true,
} as const;

describe("SCN-001 harness", () => {
  it("assembles a candidate the contract accepts", () => {
    const run = buildScn001Run(session(), timestamp(120), HASH, cleanup);
    expect(validateScn001Run(run)).toEqual([]);
  });

  it("refuses to assemble a candidate with a missing proof", () => {
    const incomplete = session();
    delete incomplete.proofs["unlock"];
    expect(() => buildScn001Run(incomplete, timestamp(120), HASH, cleanup))
      .toThrow(/missing the unlock proof/);
  });

  it("carries the run's own commit as the contract evaluation commit", () => {
    const run = buildScn001Run(session(), timestamp(120), HASH, cleanup) as Record<string, unknown>;
    expect(run["contractEvaluationCommit"]).toBe(COMMIT);
    expect(run["exactCommit"]).toBe(COMMIT);
  });

  describe("ceremony expectation gate", () => {
    it("accepts a ceremony that observed the intended reason", () => {
      expect(() => assertCeremonyExpectation("SCN-001.L4", {
        evidenceMode: "live_desktop_ceremony",
        hostState: "invalidated",
        actualCodes: ["guest session locked"],
      })).not.toThrow();
    });

    it("rejects a real invalidation that is nonetheless the wrong reason", () => {
      expect(() => assertCeremonyExpectation("SCN-001.L4", {
        evidenceMode: "live_desktop_ceremony",
        hostState: "invalidated",
        actualCodes: ["guest Secure Desktop active"],
      })).toThrow(/A right answer for the wrong reason is a failure/);
    });

    it("rejects a ceremony that left the host ready", () => {
      expect(() => assertCeremonyExpectation("SCN-001.L4", {
        evidenceMode: "live_desktop_ceremony",
        hostState: "ready",
        actualCodes: ["guest session locked"],
      })).toThrow(/must leave the host invalidated/);
    });

    it("requires both halves of the missing-and-corrupt case, in order", () => {
      expect(() => assertCeremonyExpectation("SCN-001.L10", {
        evidenceMode: "live_scene_corruption",
        hostState: "invalidated",
        actualCodes: ["no scene value is published"],
      })).toThrow(/requires 2 observed reason\(s\)/);

      expect(() => assertCeremonyExpectation("SCN-001.L10", {
        evidenceMode: "live_scene_corruption",
        hostState: "invalidated",
        actualCodes: ["scene transport failed: truncated", "no scene value is published"],
      })).toThrow(/not the intended reason/);
    });

    it("requires a prefix-matched reason to carry a cause", () => {
      expect(() => assertCeremonyExpectation("SCN-001.L9", {
        evidenceMode: "live_scene_rejection",
        hostState: "invalidated",
        actualCodes: ["scene rejected: "],
      })).toThrow(/not the intended reason/);

      expect(() => assertCeremonyExpectation("SCN-001.L9", {
        evidenceMode: "live_scene_rejection",
        hostState: "invalidated",
        actualCodes: ["scene rejected: Field scene receiver accepts only scene_observation messages."],
      })).not.toThrow();
    });
  });

  it("does not let a ceremony artifact supply its own expectation", () => {
    const artifact = scn001CeremonyArtifactSchema.parse({
      exactCommit: COMMIT,
      machineId: "machine-test",
      field: { fieldId: FIELD_ID, fieldGeneration: 4 },
      vmGuid: VM_GUID,
      ceremonyId: "SCN-001.L4",
      evidenceMode: "live_desktop_ceremony",
      hostState: "invalidated",
      observedAt: timestamp(30),
      actualCodes: ["guest session locked"],
      rawArtifactSha256: digest("1"),
    });
    // There is nowhere in the artifact schema to state what was expected.
    expect(Object.keys(artifact)).not.toContain("expectedCodes");
  });

  it("carries the channel verification through to the candidate unchanged", () => {
    const run = buildScn001Run(session(), timestamp(120), HASH, cleanup) as Record<string, unknown>;
    expect(run["channelVerifiedForGeneration"]).toEqual(config().channelVerifiedForGeneration);
  });

  it("refuses a configuration pointed at a generation whose channel was not verified", () => {
    const drifted = session();
    drifted.config = {
      ...drifted.config,
      channelVerifiedForGeneration: {
        ...drifted.config.channelVerifiedForGeneration,
        channelVerifiedGeneration: 3,
      },
    };
    const failures = validateScn001Run(buildScn001Run(drifted, timestamp(120), HASH, cleanup));
    expect(failures.some((failure) =>
      failure.includes("only generation 3 has a verified channel"))).toBe(true);
  });

  it("has no configuration field that asserts a global CHN-001 pass", () => {
    expect(Object.keys(config())).not.toContain("chn001PassedGeneration");
    expect(Object.keys(config().channelVerifiedForGeneration)).not.toContain("chn001Passed");
  });
});
