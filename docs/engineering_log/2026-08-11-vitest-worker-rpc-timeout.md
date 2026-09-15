# Vitest worker RPC timeout — root cause and fix

- **Goal:** make `npm test` exit clean, so the pre-push CI-parity gate stops failing on a suite
  where every assertion already passes.
- **Files changed:** `vitest.config.ts`, this log, a Level 4 audit.

## The failure

```
FAIL  typescript: unit and integration tests
      Error: [vitest-worker]: Timeout calling "onTaskUpdate"

Test Files  105 passed (105)
     Tests  779 passed (779)
EXIT=1
```

Recorded in five engineering logs going back to 2026-08-08, each time as "a runner failure, not a
clean suite pass and not an assertion failure", and each time worked around by splitting the run
by hand.

## Root cause

Every worker reports progress to the main process over birpc. Past roughly four concurrent
workers on this suite, the main process cannot service `onTaskUpdate` inside its RPC timeout and
the worker gives up. The assertions have all passed by then; only the exit code is affected.

This was established by measurement, not inference. On a 12-core machine:

| Workers | Exit | `onTaskUpdate` timeouts | Wall |
|---|---|---|---|
| default (11) | 1 | 2 | 90s |
| 8 | 1 | 2 | — |
| 6 | 0 | 0 | 114s |
| 5 | 0 | 0 | 95s |
| 4 | 0 | 0 | 103s |
| 2 | 0 | 0 | — |

The failure tracks worker count, cleanly and repeatably.

## Two hypotheses that were checked and rejected

**The new PowerShell contract test.** It calls `spawnSync` repeatedly, which blocks a worker's
event loop, and `tests/windowsFieldScripts.test.ts` already warns that a saturated worker can
fail to allocate `powershell.exe`. It was the obvious suspect. Excluding it still reproduced the
failure — 104 files, 772 tests, exit 1, same two timeouts. Not the cause.

**Sync child processes generally.** Four test files use `spawnSync`/`execSync`. If blocked
workers were the mechanism, reducing worker count would not help, because the same files still
block. It does help, and monotonically. The pressure is on the *main* process, not the workers.

## The fix

`maxWorkers` is capped in `vitest.config.ts`, relative rather than fixed:

```ts
const maxWorkers = Math.max(1, Math.min(4, cpus().length - 1));
```

Never more than four, never more than `cores - 1`. A two-core CI runner keeps its existing
behaviour and is unaffected — consistent with this only ever having been observed on
high-core-count developer machines, which is likely why hosted CI never reported it.

## Why this is a fix and not a mask

Nothing is skipped, excluded, or silenced. All 105 files and all 779 tests still run, and the
counts are unchanged before and after. What changes is how much RPC pressure the main process is
asked to absorb, which is the actual mechanism.

The alternative — raising the RPC timeout — is not available: Vitest does not expose the birpc
timeout as a public option. Concurrency is the lever that exists.

The cost is about thirteen seconds on a 90-second suite, and it buys a deterministic exit code.
Wall time here is dominated by the slowest individual files rather than by parallelism beyond
roughly four workers, which is why the cap is nearly free.

## Verification

- `npm test` with no CLI flags: exit 0 on three consecutive runs (96s, 98s, 99s).
- Counts unchanged: **105 files / 779 tests passed**, confirmed with output visible rather than
  silenced.
- `node scripts/ci-parity.mjs`: **12/12 checks passed**, including the
  `typescript: unit and integration tests` job that previously blocked the push.

## Consequence

The `--no-verify` bypass recorded in `2026-08-11-pre-push-bypass.md` is no longer needed for
future pushes on this branch. That log stays as the record of what was done and why at the time;
it is not retroactively correct to describe the gate as having passed then.
