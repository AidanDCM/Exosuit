import { describe, expect, it } from "vitest";
import {
  scn001CeremonyIds,
  scn001Expectations,
  scn001RunSchema,
  validateScn001Run,
  type Scn001Run,
} from "../src/completion/scn001.js";

const FIELD_ID = "11111111-1111-4111-8111-111111111111";
const VM_GUID = "22222222-2222-4222-8222-222222222222";
const BOOT_ID = "33333333-3333-4333-8333-333333333333";
const NEW_BOOT_ID = "44444444-4444-4444-8444-444444444444";
const HASH = "a".repeat(64);
const PRODUCER_HASH = "c".repeat(64);
const SESSION_ID = "2";
const USER_SID = "S-1-5-21-1111111111-2222222222-3333333333-1001";
const PRODUCER_PATH = "C:\\Exosuit\\Agent\\Exosuit.Agent.exe";

/** Minutes into the run window, so ordering is readable at a glance. */
function timestamp(minute: number): string {
  const base = Date.UTC(2026, 7, 12, 14, 0, 0) + minute * 60_000;
  return new Date(base).toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

function digest(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

function makeRun(): Scn001Run {
  return scn001RunSchema.parse({
    contractVersion: 1,
    testId: "SCN-001",
    stage: "run",
    runId: "scn001-test-run",
    exactCommit: "b".repeat(40),
    contractEvaluationCommit: "b".repeat(40),
    machineId: "machine-test",
    field: { fieldId: FIELD_ID, fieldGeneration: 4 },
    vmGuid: VM_GUID,
    bootId: BOOT_ID,
    baseImageId: "exosuit-field-base-v26",
    baseDigestBefore: HASH,
    baseDigestAfter: HASH,
    channelKeyId: "channel-test-1",
    agentId: "agent-test-1",
    guestSession: {
      expectedSessionId: SESSION_ID,
      interactiveUserSid: USER_SID,
      producerPath: PRODUCER_PATH,
      producerExecutableSha256: PRODUCER_HASH,
      sessionFileAuthored: true,
      sessionFileHandWritten: false,
    },
    channelVerifiedForGeneration: {
      channelVerifiedFieldId: FIELD_ID,
      channelVerifiedGeneration: 4,
      channelVerificationRunId: "chnverify-test-run",
      result: "verified",
      verifiedAt: timestamp(-30),
      evidenceSha256: digest("e"),
    },
    startedAt: timestamp(0),
    completedAt: timestamp(120),
    acceptedScenes: [
      {
        sceneId: "55555555-5555-4555-8555-555555555551",
        sequence: 1,
        transport: "kvp_inline",
        chunkCount: 1,
        field: { fieldId: FIELD_ID, fieldGeneration: 4 },
        bootId: BOOT_ID,
        agentId: "agent-test-1",
        windowsSessionId: SESSION_ID,
        keyId: "channel-test-1",
        capturedAt: timestamp(10),
        acceptedAt: timestamp(11),
        payloadBytes: 3_200,
        payloadHash: digest("1"),
        windowCount: 9,
        elementCount: 14,
        textPolicy: "structural_only",
        screenshotIncluded: false,
        artifactSha256: digest("2"),
      },
      {
        sceneId: "55555555-5555-4555-8555-555555555552",
        sequence: 2,
        transport: "kvp_chunked",
        chunkCount: 3,
        field: { fieldId: FIELD_ID, fieldGeneration: 4 },
        bootId: BOOT_ID,
        agentId: "agent-test-1",
        windowsSessionId: SESSION_ID,
        keyId: "channel-test-1",
        capturedAt: timestamp(15),
        acceptedAt: timestamp(16),
        payloadBytes: 9_600,
        payloadHash: digest("3"),
        windowCount: 9,
        elementCount: 31,
        textPolicy: "structural_only",
        screenshotIncluded: false,
        artifactSha256: digest("4"),
      },
    ],
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
    })),
    producerLaunch: {
      pid: 4_100,
      launchedAt: timestamp(5),
      sessionId: SESSION_ID,
      userSid: USER_SID,
      producerPath: PRODUCER_PATH,
      producerExecutableSha256: PRODUCER_HASH,
      artifactSha256: digest("5"),
    },
    unlock: {
      lockedAt: timestamp(40),
      unlockedAt: timestamp(45),
      staleScene: {
        sequence: 8,
        capturedAt: timestamp(38),
        presentedAt: timestamp(46),
        signatureValid: true,
        bootMatched: true,
        sessionMatched: true,
        sequenceAccepted: true,
        verdict: "invalidated",
        reason: "scene was captured before the guest desktop stopped being observable",
        artifactSha256: digest("6"),
      },
      freshScene: {
        sequence: 9,
        capturedAt: timestamp(47),
        presentedAt: timestamp(48),
        verdict: "ready",
        artifactSha256: digest("7"),
      },
      readinessBetweenUnlockAndFreshScene: "invalidated",
      artifactSha256: digest("0"),
    },
    producerRelaunch: {
      killedPid: 4_100,
      killedAt: timestamp(60),
      readinessClearedAt: timestamp(61),
      relaunchedPid: 4_260,
      relaunchedAt: timestamp(62),
      supervisorRelaunched: true,
      artifactSha256: digest("8"),
    },
    reboot: {
      priorBootId: BOOT_ID,
      newBootId: NEW_BOOT_ID,
      rebootedAt: timestamp(75),
      priorSceneInvalidated: true,
      bootChangeTerminal: true,
      newSessionRequired: true,
      artifactSha256: digest("9"),
    },
    staleGeneration: {
      expectedFieldGeneration: 4,
      presentedFieldGeneration: 3,
      rejected: true,
      artifactSha256: digest("1"),
    },
    teardown: {
      producerPid: 4_260,
      producerExitedAt: timestamp(110),
      fieldStoppedAt: timestamp(111),
      orphanProcessCount: 0,
      fieldState: "Off",
      artifactSha256: digest("2"),
    },
    sceneInvalidation: {
      lastGoodSceneReusedAfterInvalidation: false,
      hostRetainedSceneBytesAfterInvalidation: false,
    },
    cleanup: {
      exactGenerationDestroyed: true,
      vmAbsent: true,
      generationRootAbsent: true,
      baseUnchanged: true,
      sceneSessionFileRemoved: true,
    },
    sourceMutationCountDuringRun: 0,
  });
}

/** Structured edit that keeps the fixture readonly-safe without `any` at each call site. */
function mutate(change: (draft: Record<string, unknown>) => void): unknown {
  const draft = structuredClone(makeRun()) as unknown as Record<string, unknown>;
  change(draft);
  return draft;
}

describe("SCN-001 evidence contract", () => {
  it("accepts a complete run", () => {
    expect(validateScn001Run(makeRun())).toEqual([]);
  });

  it("requires every ceremony in the live matrix", () => {
    const failures = validateScn001Run(mutate((draft) => {
      draft["ceremonies"] = (draft["ceremonies"] as unknown[]).slice(0, 10);
    }));
    expect(failures.join("\n")).toMatch(/ceremonies: .*(11|exactly)/i);
  });

  it("rejects a ceremony that observed a reason other than the intended one", () => {
    const failures = validateScn001Run(mutate((draft) => {
      const ceremonies = draft["ceremonies"] as Record<string, unknown>[];
      const lock = ceremonies.find((entry) => entry["id"] === "SCN-001.L4")!;
      // A real invalidation, but the wrong one: the desktop was covered, not locked.
      lock["actualCodes"] = ["guest Secure Desktop active"];
    }));
    expect(failures).toContain(
      'SCN-001.L4 observed "guest Secure Desktop active", which is not the intended reason "guest session locked".',
    );
  });

  it("refuses to let the operator choose the expected reason", () => {
    const failures = validateScn001Run(mutate((draft) => {
      const ceremonies = draft["ceremonies"] as Record<string, unknown>[];
      const lock = ceremonies.find((entry) => entry["id"] === "SCN-001.L4")!;
      lock["expectedCodes"] = ["guest Secure Desktop active"];
      lock["actualCodes"] = ["guest Secure Desktop active"];
    }));
    expect(failures.some((failure) => failure.startsWith("SCN-001.L4 echoes expected reasons"))).toBe(true);
  });

  it("requires both halves of the missing-and-corrupt case", () => {
    const failures = validateScn001Run(mutate((draft) => {
      const ceremonies = draft["ceremonies"] as Record<string, unknown>[];
      const corrupt = ceremonies.find((entry) => entry["id"] === "SCN-001.L10")!;
      corrupt["actualCodes"] = ["no scene value is published"];
      corrupt["expectedCodes"] = ["no scene value is published"];
    }));
    expect(failures.some((failure) => failure.includes("SCN-001.L10 echoes expected reasons"))).toBe(true);
  });

  it("rejects a prefix-matched reason that carries no cause", () => {
    const failures = validateScn001Run(mutate((draft) => {
      const ceremonies = draft["ceremonies"] as Record<string, unknown>[];
      const rejection = ceremonies.find((entry) => entry["id"] === "SCN-001.L9")!;
      rejection["actualCodes"] = ["scene rejected: "];
    }));
    expect(failures.some((failure) => failure.startsWith("SCN-001.L9 observed"))).toBe(true);
  });

  it("rejects a ceremony that left the host in the wrong state", () => {
    const failures = validateScn001Run(mutate((draft) => {
      const ceremonies = draft["ceremonies"] as Record<string, unknown>[];
      const lock = ceremonies.find((entry) => entry["id"] === "SCN-001.L4")!;
      lock["hostState"] = "ready";
    }));
    expect(failures).toContain("SCN-001.L4 must leave the host invalidated, not ready.");
  });

  describe("SCN-001.L5, the case that can pass trivially", () => {
    it("rejects a stale scene that was actually captured after the lock", () => {
      const failures = validateScn001Run(mutate((draft) => {
        const unlock = draft["unlock"] as Record<string, unknown>;
        (unlock["staleScene"] as Record<string, unknown>)["capturedAt"] = timestamp(42);
      }));
      expect(failures).toContain(
        "the scene SCN-001.L5 rejected was captured after the lock, so its rejection proves nothing about staleness.",
      );
    });

    it("rejects a fresh scene that predates the unlock", () => {
      const failures = validateScn001Run(mutate((draft) => {
        const unlock = draft["unlock"] as Record<string, unknown>;
        (unlock["freshScene"] as Record<string, unknown>)["capturedAt"] = timestamp(44);
      }));
      expect(failures).toContain("the scene that restored readiness was not captured after the unlock.");
    });

    it("rejects a stale scene that was never presented after the unlock", () => {
      const failures = validateScn001Run(mutate((draft) => {
        const unlock = draft["unlock"] as Record<string, unknown>;
        (unlock["staleScene"] as Record<string, unknown>)["presentedAt"] = timestamp(44);
      }));
      expect(failures).toContain(
        "the stale scene was presented before the unlock, so it did not test post-unlock readiness.",
      );
    });

    it("will not accept a stale scene that failed some other check", () => {
      const failures = validateScn001Run(mutate((draft) => {
        const unlock = draft["unlock"] as Record<string, unknown>;
        (unlock["staleScene"] as Record<string, unknown>)["signatureValid"] = false;
      }));
      expect(failures.some((failure) => failure.includes("signatureValid"))).toBe(true);
    });
  });

  it("binds the launched, relaunched, and torn-down producer into one identity chain", () => {
    expect(validateScn001Run(mutate((draft) => {
      (draft["producerRelaunch"] as Record<string, unknown>)["killedPid"] = 9_999;
    }))).toContain("SCN-001.L7 killed a process other than the producer SCN-001.L1 launched.");

    expect(validateScn001Run(mutate((draft) => {
      (draft["teardown"] as Record<string, unknown>)["producerPid"] = 9_999;
    }))).toContain("teardown terminated a process other than the producer that was running at the end of the run.");
  });

  it("rejects a relaunch that reuses the killed process ID", () => {
    const failures = validateScn001Run(mutate((draft) => {
      (draft["producerRelaunch"] as Record<string, unknown>)["relaunchedPid"] = 4_100;
    }));
    expect(failures).toContain("the relaunched producer reuses the killed process ID, so no relaunch was observed.");
  });

  it("rejects a producer that outlived the Field reaching Off", () => {
    const failures = validateScn001Run(mutate((draft) => {
      (draft["teardown"] as Record<string, unknown>)["producerExitedAt"] = timestamp(112);
    }));
    expect(failures).toContain("the producer outlived the Field reaching Off.");
  });

  it("rejects a producer launched outside the approved session or image", () => {
    expect(validateScn001Run(mutate((draft) => {
      (draft["producerLaunch"] as Record<string, unknown>)["sessionId"] = "7";
    }))).toContain("the producer launched in a session other than the approved interactive session.");

    expect(validateScn001Run(mutate((draft) => {
      (draft["producerLaunch"] as Record<string, unknown>)["producerExecutableSha256"] = digest("8");
    }))).toContain("the launched producer image does not match the digest the session file pinned.");
  });

  it("requires both an inline and a chunked scene", () => {
    const failures = validateScn001Run(mutate((draft) => {
      const scenes = draft["acceptedScenes"] as Record<string, unknown>[];
      scenes[1]!["transport"] = "kvp_inline";
      scenes[1]!["chunkCount"] = 1;
    }));
    expect(failures).toContain("SCN-001.L3 requires at least one chunked scene.");
  });

  it("rejects a scene bound to a different Field, boot, or session", () => {
    expect(validateScn001Run(mutate((draft) => {
      const scenes = draft["acceptedScenes"] as Record<string, unknown>[];
      (scenes[0]!["field"] as Record<string, unknown>)["fieldGeneration"] = 3;
    })).some((failure) => failure.includes("bound to a different Field generation"))).toBe(true);

    expect(validateScn001Run(mutate((draft) => {
      const scenes = draft["acceptedScenes"] as Record<string, unknown>[];
      scenes[0]!["windowsSessionId"] = "7";
    })).some((failure) => failure.includes("session other than the approved one"))).toBe(true);
  });

  it("rejects scenes whose capture times move backwards", () => {
    const failures = validateScn001Run(mutate((draft) => {
      const scenes = draft["acceptedScenes"] as Record<string, unknown>[];
      scenes[1]!["capturedAt"] = timestamp(9);
    }));
    expect(failures.some((failure) => failure.includes("capture time moves backwards"))).toBe(true);
  });

  it("rejects a scene payload over the structural bound", () => {
    const failures = validateScn001Run(mutate((draft) => {
      const scenes = draft["acceptedScenes"] as Record<string, unknown>[];
      scenes[0]!["payloadBytes"] = 12_289;
    }));
    expect(failures.some((failure) => failure.includes("payloadBytes"))).toBe(true);
  });

  it("rejects a run whose verifier and guest agent come from different commits", () => {
    const failures = validateScn001Run(mutate((draft) => {
      draft["contractEvaluationCommit"] = "d".repeat(40);
    }));
    expect(failures.some((failure) => failure.includes("must come from one commit"))).toBe(true);
  });

  /**
   * The situation this contract was rewritten for. CHN-001 is globally passed, and it proved
   * field 4401b702 generation 3 — a VM that was destroyed at cleanup. A fresh generation inherits
   * the gate but not the verification, and nothing about "CHN-001 == passed" may stand in for it.
   */
  describe("generation-specific channel verification", () => {
    it("rejects a scene session on a generation whose channel was never verified", () => {
      const failures = validateScn001Run(mutate((draft) => {
        (draft["channelVerifiedForGeneration"] as Record<string, unknown>)["channelVerifiedGeneration"] = 3;
      }));
      expect(failures.some((failure) =>
        failure.includes("only generation 3 has a verified channel") &&
        failure.includes("passed CHN-001 gate is not a substitute"))).toBe(true);
    });

    it("rejects a verification belonging to a different Field", () => {
      const failures = validateScn001Run(mutate((draft) => {
        (draft["channelVerifiedForGeneration"] as Record<string, unknown>)["channelVerifiedFieldId"] =
          "99999999-9999-4999-8999-999999999999";
      }));
      expect(failures.some((failure) => failure.includes("the verified channel belongs to"))).toBe(true);
    });

    it("rejects a channel verified only after the scene session began", () => {
      const failures = validateScn001Run(mutate((draft) => {
        (draft["channelVerifiedForGeneration"] as Record<string, unknown>)["verifiedAt"] = timestamp(60);
      }));
      expect(failures).toContain(
        "the channel was verified after the scene session started; it must be verified first.",
      );
    });

    it("rejects scenes produced on the unverified generation, stated per scene", () => {
      const failures = validateScn001Run(mutate((draft) => {
        // The run header and the scenes agree with each other, and both disagree with the
        // verification: the drift a transitive check would have missed.
        (draft["field"] as Record<string, unknown>)["fieldGeneration"] = 5;
        for (const scene of draft["acceptedScenes"] as Record<string, unknown>[]) {
          (scene["field"] as Record<string, unknown>)["fieldGeneration"] = 5;
        }
      }));
      expect(failures.some((failure) =>
        failure.includes("was produced on a generation whose channel was not verified"))).toBe(true);
    });

    it("offers no way to assert a global CHN-001 pass in place of verification", () => {
      const run = makeRun() as unknown as Record<string, unknown>;
      const verification = run["channelVerifiedForGeneration"] as Record<string, unknown>;
      expect(Object.keys(run)).not.toContain("channelProvenGeneration");
      expect(Object.keys(verification)).not.toContain("chn001Passed");
      // The only accepted result is a verification outcome, not a gate status.
      expect(verification["result"]).toBe("verified");
      expect(validateScn001Run({ ...run, channelVerifiedForGeneration: { ...verification, result: "passed" } }))
        .not.toEqual([]);
    });
  });

  it("rejects a stale-generation case that presented the run's own generation", () => {
    const failures = validateScn001Run(mutate((draft) => {
      (draft["staleGeneration"] as Record<string, unknown>)["presentedFieldGeneration"] = 4;
    }));
    expect(failures).toContain(
      "the stale-generation proof presented the run's own generation, so nothing stale was tested.",
    );
  });

  it("rejects a reboot proof with an unchanged boot identity", () => {
    const failures = validateScn001Run(mutate((draft) => {
      (draft["reboot"] as Record<string, unknown>)["newBootId"] = BOOT_ID;
    }));
    expect(failures).toContain("the reboot proof shows an unchanged boot identity.");
  });

  it("rejects a mutated immutable base", () => {
    const failures = validateScn001Run(mutate((draft) => {
      draft["baseDigestAfter"] = digest("9");
    }));
    expect(failures).toContain("SCN-001 immutable base digest changed during the run.");
  });

  it("rejects a ceremony citing one digest as both raw and processed evidence", () => {
    const failures = validateScn001Run(mutate((draft) => {
      const ceremonies = draft["ceremonies"] as Record<string, unknown>[];
      ceremonies[0]!["artifactSha256"] = ceremonies[0]!["rawArtifactSha256"];
    }));
    expect(failures).toContain("SCN-001.L1 cites one digest as both its raw and processed artifact.");
  });

  it("rejects evidence observed outside the run window", () => {
    const failures = validateScn001Run(mutate((draft) => {
      const ceremonies = draft["ceremonies"] as Record<string, unknown>[];
      ceremonies[0]!["observedAt"] = timestamp(500);
    }));
    expect(failures).toContain("SCN-001.L1 falls outside the run window.");
  });

  it("forbids a scene that carries a screenshot or unstructured text", () => {
    const failures = validateScn001Run(mutate((draft) => {
      const scenes = draft["acceptedScenes"] as Record<string, unknown>[];
      scenes[0]!["screenshotIncluded"] = true;
    }));
    expect(failures.some((failure) => failure.includes("screenshotIncluded"))).toBe(true);
  });
});
