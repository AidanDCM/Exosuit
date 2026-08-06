import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  deriveBootId,
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
