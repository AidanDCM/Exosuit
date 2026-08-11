import { cpus } from "node:os";
import { defineConfig } from "vitest/config";

/**
 * Worker concurrency is capped rather than left to Vitest's default of one worker per core.
 *
 * Every worker reports progress to the main process over birpc. Past roughly four concurrent
 * workers on this suite, the main process cannot service `onTaskUpdate` within its RPC timeout,
 * and Vitest exits nonzero with `[vitest-worker]: Timeout calling "onTaskUpdate"` **after every
 * assertion has already passed**. That failure was reproducible and load-dependent: on a 12-core
 * machine the uncapped default (11 workers) and an explicit 8 both failed with two timeouts,
 * while 6, 5, 4, and 2 were clean.
 *
 * It costs almost nothing. Wall time is dominated by the slowest individual files rather than by
 * parallelism beyond about four workers: uncapped 90s (failing), five workers 95s, four workers
 * 103s. Roughly thirteen seconds buys a deterministic exit code.
 *
 * Nothing is skipped or silenced — all files and all tests still run. This bounds how much RPC
 * pressure the main process is asked to absorb, which is the actual cause.
 *
 * The cap is relative, not a fixed number: a small CI runner keeps `cores - 1` and is unaffected,
 * which is consistent with this only ever having been observed on high-core-count machines.
 */
const maxWorkers = Math.max(1, Math.min(4, cpus().length - 1));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    reporters: ["default"],
    maxWorkers,
  },
});
