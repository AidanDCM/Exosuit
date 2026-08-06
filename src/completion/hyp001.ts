/**
 * HYP-001 run contract (M1) — the parts that can be judged without a host.
 *
 * Kept separate from `hyp001Harness.ts` because that module executes on
 * import. Everything here is pure, so the rules a run must satisfy are
 * testable without provisioning a VM, and the harness and the tests cannot
 * drift onto different definitions of "three cycles passed".
 */

import { createHash } from "node:crypto";
import { z } from "zod";

/** HYP-001.12 requires three consecutive complete cycles. Not configurable. */
export const REQUIRED_CYCLES = 3;

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
