/**
 * HYP-001 run contract (M1) — the parts that can be judged without a host.
 *
 * Kept separate from `hyp001Harness.ts` because that module executes on
 * import. Everything here is pure, so the rules a run must satisfy are
 * testable without provisioning a VM, and the harness and the tests cannot
 * drift onto different definitions of "three cycles passed".
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/**
 * `dotnet` on PATH here is a hostfxr-only install with no SDK, while a usable
 * SDK sits at `%USERPROFILE%\.dotnet`. `dotnet --version` fails against the
 * shadowing install even though the toolchain works, so HYP-001.4 must probe
 * `--list-sdks` and fall back the way `scripts/ci-parity.mjs` already does.
 * Answering this question twice, differently, is how a preflight blocks a run
 * whose toolchain is fine.
 */
export function resolveDotnetSdk(): { readonly path: string; readonly version: string } | undefined {
  const probe = (exe: string) => {
    const result = spawnSync(exe, ["--list-sdks"], { encoding: "utf8", shell: false });
    return result.status === 0 && (result.stdout ?? "").trim().length > 0
      ? (result.stdout ?? "").trim()
      : undefined;
  };
  const onPath = probe("dotnet");
  if (onPath !== undefined) return { path: "dotnet", version: onPath.split(/\r?\n/)[0]! };

  const home = process.env["USERPROFILE"] ?? process.env["HOME"] ?? "";
  const userLocal = join(home, ".dotnet", process.platform === "win32" ? "dotnet.exe" : "dotnet");
  if (!existsSync(userLocal)) return undefined;
  const local = probe(userLocal);
  return local === undefined ? undefined : { path: userLocal, version: local.split(/\r?\n/)[0]! };
}

/** HYP-001.12 requires three consecutive complete cycles. Not configurable. */
export const REQUIRED_CYCLES = 3;

/**
 * Minimum free physical memory before provisioning.
 *
 * The harness pins a 2 GiB startup allocation because the plan builder's 8 GiB
 * default will not start a Field on this host. Three consecutive cycles at
 * 2 GiB, on a machine measured at 2.93 GB free, is under a gigabyte of
 * headroom — enough to fail partway through a run whose evidence is
 * single-use. Checked immediately before `--apply`, not at plan time, because
 * free memory moves.
 */
export const MINIMUM_FREE_MEMORY_BYTES = 4 * 1024 * 1024 * 1024;

/** VM name prefix the harness provisions under. */
export const FIELD_VM_PREFIX = "Exosuit-Field-";

/**
 * Hyper-V states in which an existing Field VM competes for memory or for the
 * Field's own storage. `Off` is not among them: a stopped VM holds no assigned
 * memory, so it is left alone rather than deleted — removing it would be an
 * unrelated destructive change immediately before evidence collection.
 */
export const BLOCKING_FIELD_VM_STATES: readonly string[] = [
  "Running",
  "Starting",
  "Stopping",
  "Paused",
  "Saved",
];

export interface FieldVmState {
  readonly name: string;
  readonly state: string;
}

/**
 * Free-memory gate. `undefined` means the probe failed or returned something
 * unreadable, which is rejected rather than treated as clear — an unreadable
 * measurement is not evidence of sufficient memory.
 */
export function evaluateFreeMemory(
  freeBytes: number | undefined,
  minimumBytes: number = MINIMUM_FREE_MEMORY_BYTES,
): readonly string[] {
  const gib = (bytes: number) => (bytes / 1024 ** 3).toFixed(2);
  if (freeBytes === undefined || !Number.isFinite(freeBytes) || freeBytes < 0) {
    return ["free physical memory could not be measured; refusing to provision on an unknown value"];
  }
  if (freeBytes < minimumBytes) {
    return [
      `only ${gib(freeBytes)} GiB free physical memory, need ${gib(minimumBytes)} GiB; `
      + "close other applications before provisioning",
    ];
  }
  return [];
}

/**
 * Competing-Field gate. Only VMs under `FIELD_VM_PREFIX` are considered — an
 * unrelated VM running on the host is the operator's business, not this gate's.
 * `undefined` means the VM list could not be read, which is rejected.
 */
export function evaluateCompetingFieldVms(
  vms: readonly FieldVmState[] | undefined,
): readonly string[] {
  if (vms === undefined) {
    return ["existing Field VMs could not be enumerated; refusing to provision on an unknown host state"];
  }
  const active = vms
    .filter((vm) => vm.name.startsWith(FIELD_VM_PREFIX))
    .filter((vm) => BLOCKING_FIELD_VM_STATES.includes(vm.state));
  if (active.length === 0) return [];
  return [
    `competing Field VM(s) not stopped: ${
      active.map((vm) => `${vm.name} [${vm.state}]`).join(", ")
    }; stop them before provisioning`,
  ];
}

export const hyp001CycleSchema = z.object({
  cycle: z.number().int().positive(),
  fieldId: z.string().min(1),
  generation: z.number().int().positive(),
  vmName: z.string().min(1),
  vmGuid: z.string().min(1),
  bootId: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.string().datetime(),
  bootedAt: z.string().datetime(),
  readyAt: z.string().datetime(),
  stoppedAt: z.string().datetime(),
  destroyedAt: z.string().datetime(),
  readinessSeconds: z.number().nonnegative(),
  baseDigestBefore: z.string().regex(/^[0-9a-f]{64}$/),
  baseDigestAfter: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type Hyp001Cycle = z.infer<typeof hyp001CycleSchema>;

export const hyp001RunSchema = z.object({
  contractVersion: z.literal(1),
  testId: z.literal("HYP-001"),
  stage: z.literal("run"),
  machineId: z.string().min(1),
  baseImageId: z.string().min(1),
  baseDigest: z.string().regex(/^[0-9a-f]{64}$/),
  requiredCycles: z.number().int().positive(),
  completedCycles: z.number().int().nonnegative(),
  cycles: z.array(hyp001CycleSchema),
}).strict();
export type Hyp001Run = z.infer<typeof hyp001RunSchema>;

/**
 * The boot id Hyper-V does not give us. There is no guest boot GUID over KVP
 * without guest credentials, so this identifies a power-on *as the host
 * observed it*: `sha256(vmGuid|powerOnTimeUtc)`. Host-observed, not
 * guest-attested — the M0.5 findings say so, and it must not be read as
 * evidence originating inside the guest.
 */
export function deriveBootId(vmGuid: string, powerOnTimeUtc: string): string {
  return createHash("sha256").update(`${vmGuid}|${powerOnTimeUtc}`).digest("hex");
}

/**
 * Every rule a completed HYP-001 run must satisfy before any of it is offered
 * as evidence, returned as reasons rather than a boolean.
 *
 * A rejection is only a pass when the *reason* is right: the M0.5 boot-id probe
 * scored green because it was rejected for artifact reuse while proving nothing
 * about boot ids. Callers assert on these strings.
 */
export function validateHyp001Run(run: Hyp001Run): readonly string[] {
  const failures: string[] = [];

  if (run.completedCycles !== run.cycles.length) {
    failures.push(`completedCycles ${run.completedCycles} does not match ${run.cycles.length} recorded cycles`);
  }
  if (run.cycles.length !== REQUIRED_CYCLES) {
    failures.push(`HYP-001 requires ${REQUIRED_CYCLES} complete cycles; the run has ${run.cycles.length}`);
  }

  const generations = new Set<number>();
  const bootIds = new Set<string>();

  for (const [index, cycle] of run.cycles.entries()) {
    const label = `cycle ${cycle.cycle}`;

    if (cycle.cycle !== index + 1) failures.push(`${label}: cycles are not consecutive at position ${index + 1}`);
    if (cycle.fieldId !== run.cycles[0]!.fieldId) failures.push(`${label}: field id differs from the first cycle`);

    // HYP-001.10 — each cycle takes a fresh incremented generation, so the
    // previous one is invalid by identity rather than by cleanup.
    if (generations.has(cycle.generation)) failures.push(`${label}: generation ${cycle.generation} reused`);
    generations.add(cycle.generation);
    if (index > 0 && cycle.generation <= run.cycles[index - 1]!.generation) {
      failures.push(`${label}: generation does not increase`);
    }

    // A repeated boot id would mean two cycles shared a power-on, which no
    // sequence of create/boot/stop/destroy can produce.
    if (bootIds.has(cycle.bootId)) failures.push(`${label}: boot id reused`);
    bootIds.add(cycle.bootId);

    // HYP-001.13 — the immutable base must be byte-identical across the cycle,
    // and identical to the base the run as a whole claims to have used.
    if (cycle.baseDigestBefore !== cycle.baseDigestAfter) {
      failures.push(`${label}: base image mutated during the cycle`);
    }
    if (cycle.baseDigestBefore !== run.baseDigest) {
      failures.push(`${label}: base image digest differs from the run baseline`);
    }

    // Lifecycle order, and the containment rule the evidence depends on: the
    // observation instant must fall inside the half-open boot window
    // [bootedAt, stoppedAt). Evidence outside it fails closed at evaluation,
    // so catching it here is the difference between a clear harness error and
    // a confusing rejection later.
    const created = Date.parse(cycle.createdAt);
    const booted = Date.parse(cycle.bootedAt);
    const ready = Date.parse(cycle.readyAt);
    const stopped = Date.parse(cycle.stoppedAt);
    const destroyed = Date.parse(cycle.destroyedAt);
    if (!(created <= booted)) failures.push(`${label}: booted precedes created`);
    if (!(booted < stopped)) failures.push(`${label}: stopped does not follow booted`);
    if (!(stopped <= destroyed)) failures.push(`${label}: destroyed precedes stopped`);
    if (!(ready >= booted && ready < stopped)) {
      failures.push(`${label}: readyAt ${cycle.readyAt} is outside the boot window [${cycle.bootedAt}, ${cycle.stoppedAt})`);
    }

    if (index > 0 && Date.parse(cycle.createdAt) < Date.parse(run.cycles[index - 1]!.destroyedAt)) {
      failures.push(`${label}: overlaps the previous cycle, which was not destroyed first`);
    }
  }

  return failures;
}
