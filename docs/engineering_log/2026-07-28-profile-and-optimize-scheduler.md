# Engineering Log — Profile and Partially Optimize the Workflow Scheduler

**Date:** 2026-07-28
**Branch:** `build/exosuit-mvp`
**Starting commit:** `397dff7` (build: add self-hosted CI fallback workflow)
**Evidence class:** local TypeScript and .NET validation, CPU profiling, benchmark measurement, and mutation-verified regression test; no hosted-CI, Windows-provider, or ChatGPT evidence

## Goal

Find and address the cause of the superlinear workflow scheduler recorded in `docs/qa/evidence/2026-07-28-phase10-benchmark-baseline.md`.

## Profiling

A 150-step workflow with a no-op executor was profiled with `node --cpu-prof`, and self-time aggregated per function.

| Function | Self time | Share |
|---|--:|--:|
| `structuredClone` | 1439.7 ms | 64.6% |
| `save` (checkpoint store) | 106.0 ms | 4.8% |
| zod `parse` / `runChecks` / `run` | ~169 ms | ~7.6% |

Deep cloning dominated. Three sites ran per scheduling step, each O(n) in step count, giving O(n^2) overall:

1. `runUntilBlocked` called `this.get(workflowId)` every iteration, which deep-clones the entire workflow record only to read `status` and count terminal steps.
2. The same loop called `readySteps(workflowId)`, which clones every ready step.
3. `runNext` returned `structuredClone(workflow)` on every step, and `runUntilBlocked` discarded it.

None of this was a bug. The clones are deliberate defensive copying so callers cannot mutate internal workflow state. The defect was applying that guarantee to internal callers that do not need it.

## Change

Internal only. No public signature or behavior changed.

- Added `#live(workflowId)`, returning the live record for internal callers, documented as never returnable from a public method.
- Added `#readyCount(workflow)`, counting ready steps without cloning them.
- Split `runNext` into a public wrapper that clones once and a private `#runNextInternal` that returns the live record.
- `runUntilBlocked` now reads through `#live` and `#readyCount` and calls `#runNextInternal`, cloning only at its return points.

`get`, `list`, `listArtifacts`, `readySteps`, and `runNext` all still return copies.

## Result: a constant-factor win, not a complexity fix

| Steps | Before | After |
|--:|--:|--:|
| 1 | 0.2 ms | 0.4 ms |
| 10 | 9.7 ms | 9.6 ms |
| 25 | 45.9 ms | 53.3 ms |
| 50 | 172.3 ms | 189.1 ms |
| 100 | 1023.6 ms | 847.7 ms |

Re-profiling showed `structuredClone` falling from 64.6% to 50.8% of self-time, 1439.7 ms to 946.8 ms.

**The scheduler is still O(n^2).** Ten times the steps still costs roughly eighty-six times the time. Run-to-run variance on this workstation is wide enough that individual rows above move by tens of percent between runs; the shape of the curve is the reliable signal, not any single number. An intermediate run measured 756.1 ms at 100 steps against the 847.7 ms recorded here.

The remaining dominant cost is `#saveCheckpoint`, which clones the whole workflow and hands it to a store that re-parses it with zod and serializes it, once per step. That is O(n) per step by construction.

## Why the remaining cost was not removed

Two options would make it linear, and both change persistence behavior:

1. incremental or delta checkpointing rather than writing the full record every step,
2. dropping the defensive clone in `#saveCheckpoint` and requiring `WorkflowCheckpointStore` implementations not to retain the passed record.

Option 2 looks safe against the three built-in stores, which all zod-parse and serialize immediately and never retain the reference. But `WorkflowCheckpointStore` is an exported interface, so this would change an implicit contract for any third-party store.

The roadmap change-control rule requires that any change affecting **persistence** carry a decision-log entry, threat-model update, test-plan update, rollback plan, and **owner review before implementation is enabled**. Both options qualify. Neither was implemented.

## Files changed

- `src/workflowRuntime.ts`
- `tests/workflowRuntime.test.ts`
- `docs/MASTER_SYSTEM_ROADMAP.md`
- `docs/qa/evidence/2026-07-28-phase10-benchmark-baseline.md` (regenerated)
- `docs/engineering_log/2026-07-28-profile-and-optimize-scheduler.md`

## Parts & Pieces and donor patterns considered

- Kept the defensive-copy guarantee at the public boundary and removed it only where the caller is inside the class. The safety property was preserved rather than traded for speed.
- Rejected removing the `#saveCheckpoint` clone, and rejected reducing checkpoint frequency. The second is worse than it looks: checkpoint-per-step is what makes "resume from last verified checkpoint" meaningful, and Phase 9 explicitly requires crash-before, crash-during, and crash-after coverage. Making checkpoints sparser to win a benchmark would trade a durability guarantee for a number.
- Rejected a timing-based regression test. A "100 steps in under X ms" assertion would be flaky on shared runners and would encode this workstation's speed as a contract.
- No donor code was copied, ported, or adapted.

## Tests added or updated

One test, 145 to 146: `returns copies callers cannot use to mutate internal state`.

It mutates what `runUntilBlocked`, `get`, `list`, and `listArtifacts` return, at top level, inside the step map, and inside the nested definition, then asserts a fresh read is unaffected. This guards the exact property the optimization put at risk.

### Mutation verification, and a defect found in the test itself

The first version of this test passed under a mutation that made `get` return the live record. It mutated the object returned by `runUntilBlocked` and then *read* through `get`, so a leaking `get` was invisible: nothing ever mutated a `get` result.

The test was strengthened to mutate what `get` returned and read again. It then failed correctly under the same mutation with `expected 'cancelled' to be 'completed'`, one test failing, and passed after revert.

A second process error is worth recording. `git diff --stat` was used to confirm the mutation had landed, but the working tree already contained the uncommitted optimization, so the stat reflected both and proved nothing about the mutation. Verification switched to grepping for the mutated line directly. Confirming a mutation landed requires checking the specific line, not the diff size.

## Commands actually run

```text
node --cpu-prof --cpu-prof-dir=./.prof <scratch profile script>   # before and after
npm run typecheck
npm test
npm run build
node --expose-gc scripts/benchmark.mjs --iterations 100 --report docs/qa/evidence/2026-07-28-phase10-benchmark-baseline.md
npx vitest run tests/workflowRuntime.test.ts     # under mutation, then reverted
npm run validate:ci-parity
```

## Results

- TypeScript typecheck: passed.
- TypeScript tests: **146 passed, 30 files**, up from 145.
- CI parity: **11 of 11**.
- .NET: 29/29 via the parity runner.
- Profile after change: `structuredClone` 50.8% of self-time, down from 64.6%.
- Scheduler at 100 steps: 847.7 ms, down from 1023.6 ms, complexity unchanged.
- Mutation verification: exactly one test failed under the leak mutation; suite green after revert; `get` confirmed restored by direct inspection.

## Assumptions and unvalidated areas

- Benchmarks come from one workstation under unknown background load, and run-to-run variance is wide. Treat the curve as evidence and individual figures as approximate.
- Profiling used the default in-memory checkpoint store. A file or encrypted store adds I/O and would shift the balance further toward checkpointing.
- The isolation test covers `runUntilBlocked`, `get`, `list`, and `listArtifacts`. `runNext`, `pause`, `resume`, `cancel`, and `hydrate` also return records; those paths were left unchanged by this slice but are not covered by the new test.
- No concurrency testing was done. The runtime is single-threaded per process here, and internal live-record access assumes no interleaved mutation during an `await`. That assumption held before this change too, since the same code mutated the live record; the change widens the window in which an internal reference is held.

## Security impact

No runtime capability, permission, provider, action, approval requirement, audit behavior, deadline, or feature gate changed. The MCP surface is untouched.

The change moves internal callers off defensive copies, which is a real risk to the integrity of runtime workflow state. That risk is mitigated by keeping every public accessor cloning and by a mutation-verified test that proves a caller cannot corrupt internal state.

The performance finding retains a security dimension: unbounded superlinear scheduling cost is a denial-of-service shape. A pilot submitting a long workflow consumes disproportionate scheduler time. Reducing the constant does not remove that; a maximum workflow length quota would.

## Rollback or disable path

Revert this commit. `runUntilBlocked` and `runNext` return to cloning per step, the isolation test is removed, and performance returns to the earlier baseline. No persisted state, contract, on-disk format, or public signature changed, so rollback is safe in both directions and needs no migration.

## Next recommended slice

1. **Owner decision on persistence.** Incremental checkpointing, or a documented no-retain contract for `WorkflowCheckpointStore`. Either makes the scheduler linear; both require the change-control process.
2. **Phase 10 quota.** Set a maximum workflow length regardless of the above. It bounds the DoS shape and is already a listed Phase 10 deliverable.
3. **Owner: billing**, still the only route to `github_validated`.
4. **Owner: Phase 1 environment**, still the only dependency for Phase 1 and for Phase 2's interactive tests.
