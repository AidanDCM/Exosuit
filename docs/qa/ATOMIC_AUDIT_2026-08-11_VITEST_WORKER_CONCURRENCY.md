# Level 4 Addendum: Vitest Worker Concurrency Cap

**Date:** 2026-08-11

**Verdict:** pass; a long-standing runner failure is fixed at its cause, with no reduction in what
runs

## Safety question

Does capping test concurrency make the suite pass by running less of it, or by silencing a real
failure?

## Evidence that it does neither

- **Counts are identical before and after: 105 files, 779 tests.** Verified with reporter output
  visible rather than silenced. Nothing is skipped, excluded, or marked to-do.
- Every assertion already passed before the change. The failure was only ever the process exit
  code, produced after the suite completed — the fix changes when the runner can keep up, not
  whether anything is checked.
- The mechanism was identified by measurement: the failure tracks worker count monotonically on a
  12-core machine (11 and 8 fail; 6, 5, 4, 2 clean). Pressure is on the main process servicing
  `onTaskUpdate`, not on the workers.
- Two plausible alternative causes were tested and rejected rather than assumed: the new
  `powershell.exe`-spawning test (excluding it still fails), and blocking sync child processes in
  workers generally (reducing worker count would not help if that were the mechanism, and it
  does).

## Why concurrency and not a timeout

Vitest does not expose the birpc timeout as a public option, so raising it is not available.
Concurrency is the lever that exists.

The cap is relative — `min(4, cores - 1)` — so a small CI runner keeps its current behaviour
entirely. This is consistent with the failure only ever appearing on high-core-count developer
machines and never being reported by hosted CI.

## Verification

- `npm test`, no CLI flags: exit 0 on three consecutive runs.
- `node scripts/ci-parity.mjs`: **12/12**, including the job that previously blocked the push.

## Residual risk

A future machine with far more cores stays capped at four, so the cap does not decay. A future
suite that grows enough to saturate the main process at four workers would reproduce this, and
the same measurement approach would apply. The underlying Vitest behaviour is unchanged and
remains a property of the tool.

## Rollback

Remove `maxWorkers` from `vitest.config.ts`. The suite returns to passing all assertions and
exiting nonzero on high-core machines.
