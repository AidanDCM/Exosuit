import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  BLOCKING_FIELD_VM_STATES,
  deriveBootId,
  evaluateCompetingFieldVms,
  evaluateFreeMemory,
  FIELD_VM_PREFIX,
  hyp001RunSchema,
  resolveDotnetSdk,
  validateHyp001Run,
  REQUIRED_CYCLES,
} from "../src/completion/hyp001.js";

const BASE = "a".repeat(64);

function cycle(index: number, overrides: Record<string, unknown> = {}) {
  const start = Date.parse("2026-08-06T12:00:00.000Z") + index * 3_600_000;
  const at = (offsetMs: number) => new Date(start + offsetMs).toISOString();
  return {
    cycle: index + 1,
    fieldId: "11111111-1111-4111-8111-111111111111",
    generation: index + 1,
    vmName: `Exosuit-Field-11111111-1111-4111-8111-111111111111-G${index + 1}`,
    vmGuid: `guid-${index}`,
    bootId: createHash("sha256").update(`boot-${index}`).digest("hex"),
    createdAt: at(0),
    bootedAt: at(10_000),
    readyAt: at(120_000),
    stoppedAt: at(300_000),
    destroyedAt: at(310_000),
    readinessSeconds: 110,
    baseDigestBefore: BASE,
    baseDigestAfter: BASE,
    ...overrides,
  };
}

function run(cycles: readonly unknown[]) {
  return hyp001RunSchema.parse({
    contractVersion: 1,
    testId: "HYP-001",
    stage: "run",
    machineId: "machine-9c62d678dd970f15",
    baseImageId: "exosuit-field-base-v25",
    baseDigest: BASE,
    requiredCycles: REQUIRED_CYCLES,
    completedCycles: cycles.length,
    cycles,
  });
}

const threeGoodCycles = [cycle(0), cycle(1), cycle(2)];

describe("deriveBootId", () => {
  it("binds the vm guid and the observed power-on instant", () => {
    const id = deriveBootId("abc", "2026-08-06T12:00:00.000Z");
    expect(id).toBe(
      createHash("sha256").update("abc|2026-08-06T12:00:00.000Z").digest("hex"),
    );
  });

  it("distinguishes two power-ons of the same VM", () => {
    expect(deriveBootId("abc", "2026-08-06T12:00:00.000Z"))
      .not.toBe(deriveBootId("abc", "2026-08-06T12:00:01.000Z"));
  });
});

describe("resolveDotnetSdk", () => {
  // `dotnet --version` fails on this host because the PATH install is
  // hostfxr-only, while a real SDK sits in %USERPROFILE%\.dotnet. The whole
  // point of this helper is that HYP-001.4 must not fail on that distinction.
  it("finds an SDK when one is installed anywhere the repo already looks", () => {
    const sdk = resolveDotnetSdk();
    if (sdk === undefined) return; // CI images without any SDK are a valid state.
    expect(sdk.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(sdk.path.length).toBeGreaterThan(0);
  });
});

describe("validateHyp001Run", () => {
  it("accepts three complete cycles", () => {
    expect(validateHyp001Run(run(threeGoodCycles))).toEqual([]);
  });

  it("rejects fewer than three cycles", () => {
    const failures = validateHyp001Run(run([cycle(0), cycle(1)]));
    expect(failures).toContain("HYP-001 requires 3 complete cycles; the run has 2");
  });

  // The M0.5 lesson: a rejection only counts when the reason is the one under
  // test. Each case below asserts its own reason, not merely that it failed.
  it("rejects a reused generation for the right reason", () => {
    const failures = validateHyp001Run(run([cycle(0), cycle(1, { generation: 1 }), cycle(2)]));
    expect(failures).toContain("cycle 2: generation 1 reused");
  });

  it("rejects a reused boot id for the right reason", () => {
    const reused = createHash("sha256").update("boot-0").digest("hex");
    const failures = validateHyp001Run(run([cycle(0), cycle(1, { bootId: reused }), cycle(2)]));
    expect(failures).toContain("cycle 2: boot id reused");
  });

  it("rejects a mutated base image", () => {
    const failures = validateHyp001Run(run([cycle(0), cycle(1, { baseDigestAfter: "b".repeat(64) }), cycle(2)]));
    expect(failures).toContain("cycle 2: base image mutated during the cycle");
  });

  it("rejects a base image that is not the run baseline", () => {
    const other = "c".repeat(64);
    const failures = validateHyp001Run(
      run([cycle(0), cycle(1, { baseDigestBefore: other, baseDigestAfter: other }), cycle(2)]),
    );
    expect(failures).toContain("cycle 2: base image digest differs from the run baseline");
  });

  it("rejects an observation after the boot window closes", () => {
    const bad = cycle(1, { readyAt: new Date(Date.parse(cycle(1).stoppedAt) + 1_000).toISOString() });
    const failures = validateHyp001Run(run([cycle(0), bad, cycle(2)]));
    expect(failures.some((f) => f.startsWith("cycle 2: readyAt") && f.includes("outside the boot window"))).toBe(true);
  });

  it("rejects an observation before the boot window opens", () => {
    const bad = cycle(1, { readyAt: cycle(1).createdAt });
    const failures = validateHyp001Run(run([cycle(0), bad, cycle(2)]));
    expect(failures.some((f) => f.includes("outside the boot window"))).toBe(true);
  });

  it("treats the boot window as half-open at the stop instant", () => {
    const boundary = cycle(1, { readyAt: cycle(1).stoppedAt });
    expect(validateHyp001Run(run([cycle(0), boundary, cycle(2)])).some((f) => f.includes("outside the boot window")))
      .toBe(true);
  });

  it("accepts an observation exactly at the boot instant", () => {
    const boundary = cycle(1, { readyAt: cycle(1).bootedAt });
    expect(validateHyp001Run(run([cycle(0), boundary, cycle(2)]))).toEqual([]);
  });

  it("rejects cycles that overlap instead of running consecutively", () => {
    const overlapping = cycle(1, { createdAt: cycle(0).bootedAt });
    const failures = validateHyp001Run(run([cycle(0), overlapping, cycle(2)]));
    expect(failures).toContain("cycle 2: overlaps the previous cycle, which was not destroyed first");
  });

  it("rejects a generation that does not increase", () => {
    const failures = validateHyp001Run(run([cycle(0), cycle(1), cycle(2, { generation: 2 })]));
    expect(failures).toContain("cycle 3: generation 2 reused");
    expect(failures).toContain("cycle 3: generation does not increase");
  });

  it("rejects a cycle belonging to a different Field", () => {
    const failures = validateHyp001Run(
      run([cycle(0), cycle(1, { fieldId: "22222222-2222-4222-8222-222222222222" }), cycle(2)]),
    );
    expect(failures).toContain("cycle 2: field id differs from the first cycle");
  });

  it("rejects a completedCycles count that disagrees with the cycles present", () => {
    const value = hyp001RunSchema.parse({
      contractVersion: 1,
      testId: "HYP-001",
      stage: "run",
      machineId: "machine-9c62d678dd970f15",
      baseImageId: "exosuit-field-base-v25",
      baseDigest: BASE,
      requiredCycles: REQUIRED_CYCLES,
      completedCycles: 3,
      cycles: [cycle(0), cycle(1)],
    });
    expect(validateHyp001Run(value)).toContain("completedCycles 3 does not match 2 recorded cycles");
  });

  it("rejects a stop that does not follow the boot", () => {
    const bad = cycle(1, { stoppedAt: cycle(1).bootedAt, readyAt: cycle(1).bootedAt });
    const failures = validateHyp001Run(run([cycle(0), bad, cycle(2)]));
    expect(failures).toContain("cycle 2: stopped does not follow booted");
  });

  it("rejects a run whose schema is not a HYP-001 run", () => {
    expect(() => hyp001RunSchema.parse({ contractVersion: 1, testId: "CHN-001" })).toThrow();
  });
});

describe("pre-apply resource gates", () => {
  const GIB = 1024 ** 3;

  describe("free memory", () => {
    it("rejects 3.9 GiB free, naming the measured and required values", () => {
      const reasons = evaluateFreeMemory(3.9 * GIB);
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toContain("3.90 GiB free");
      expect(reasons[0]).toContain("need 4.00 GiB");
    });

    it("allows exactly 4.0 GiB free", () => {
      // The threshold is inclusive; 4.00 GiB is the documented minimum, not the
      // first rejected value.
      expect(evaluateFreeMemory(4 * GIB)).toEqual([]);
    });

    it("allows more than the threshold", () => {
      expect(evaluateFreeMemory(8 * GIB)).toEqual([]);
    });

    it("rejects an unreadable measurement rather than treating it as clear", () => {
      // A probe that failed is not evidence of sufficient memory.
      for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
        const reasons = evaluateFreeMemory(value as number | undefined);
        expect(reasons).toHaveLength(1);
        expect(reasons[0]).toContain("could not be measured");
      }
    });
  });

  describe("competing Field VMs", () => {
    const legacy = `${FIELD_VM_PREFIX}c7dead44-f5e4-48c8-aa2d-a12a8902ea75-G4`;

    it("allows a legacy Field VM that is Off", () => {
      // Off holds no assigned memory, so it is left alone rather than deleted —
      // removing it would be an unrelated destructive change before evidence
      // collection.
      expect(evaluateCompetingFieldVms([{ name: legacy, state: "Off" }])).toEqual([]);
    });

    it("allows an empty host", () => {
      expect(evaluateCompetingFieldVms([])).toEqual([]);
    });

    it("rejects a Running Field VM", () => {
      const reasons = evaluateCompetingFieldVms([{ name: legacy, state: "Running" }]);
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toContain(legacy);
      expect(reasons[0]).toContain("[Running]");
    });

    it.each(BLOCKING_FIELD_VM_STATES)("rejects a Field VM in state %s", (state) => {
      expect(evaluateCompetingFieldVms([{ name: legacy, state }])).toHaveLength(1);
    });

    it("does not reject an unrelated non-Exosuit VM that is running", () => {
      // Another VM on the host is the operator's business, not this gate's.
      expect(evaluateCompetingFieldVms([{ name: "Ubuntu-Dev", state: "Running" }])).toEqual([]);
    });

    it("rejects when several Field VMs exist and only one is active", () => {
      const reasons = evaluateCompetingFieldVms([
        { name: `${FIELD_VM_PREFIX}a-G1`, state: "Off" },
        { name: `${FIELD_VM_PREFIX}b-G2`, state: "Paused" },
        { name: `${FIELD_VM_PREFIX}c-G3`, state: "Off" },
      ]);
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toContain("b-G2 [Paused]");
      expect(reasons[0]).not.toContain("a-G1");
    });

    it("rejects an unreadable VM list rather than treating it as clear", () => {
      const reasons = evaluateCompetingFieldVms(undefined);
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toContain("could not be enumerated");
    });
  });
});
