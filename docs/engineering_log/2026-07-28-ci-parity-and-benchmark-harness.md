# Engineering Log — CI Parity Runner and Phase 10 Benchmark Harness

**Date:** 2026-07-28
**Branch:** `build/exosuit-mvp`
**Starting commit:** `faf9dc0` (test: close the three Phase 2 GitHub gate gaps)
**Evidence class:** local TypeScript and .NET validation, plus local benchmark measurements; no hosted-CI, Windows-provider, or ChatGPT evidence

## Goal

Two requested items, both reachable without owner action:

1. work around the hosted-CI outage so the branch still has a gate,
2. build the Phase 10 benchmark harness.

## Part 1 — CI parity runner

Hosted CI has been blocked by account billing since at least 2026-07-21. Without it there is no gate, and the cost of that is already recorded: a build-breaking `as const` and a prompt-injection guard gap both reached the canonical branch during the outage.

`scripts/ci-parity.mjs` runs every job in `.github/workflows` locally, added as `npm run validate:ci-parity`.

`npm run validate` already covered part of this. The three gaps it did **not** cover were the npm audit, the NuGet audit, and the Release `-warnaserror` build, which are exactly the checks nobody could run locally.

The npm audit needed care. CI runs `npm install` on a clean checkout, so it resolves fresh, and this repository intentionally commits no lockfile. A developer's stale `node_modules` can therefore differ from CI. The harness resolves into a temporary directory to match CI rather than auditing whatever happens to be installed. That distinction is not academic: it is why an earlier local audit reported one high and two moderate advisories that CI would never have seen.

### Honesty constraint

The script prints "local evidence only" and its report carries a blockquote stating that `github_validated` requires CI and supported security checks it cannot supply, and that it must not be used to promote a phase. Substituting local runs for hosted CI is the exact failure the evidence-discipline rule exists to prevent.

### Verification

Two defects were found and fixed in the harness itself before it was trusted:

- every `npm`-invoked step failed with empty output while the `dotnet` steps passed. Node on Windows refuses to spawn `.cmd` shims without a shell. Fixed with a targeted `shell: true` for `.cmd` commands only.
- the harness was then verified to actually fail: injecting a failing test produced `FAIL typescript: unit and integration tests`, `10/11`, and exit code 1, with exit code 0 when all pass. A green harness that cannot go red is worthless.

## Part 2 — Phase 10 benchmark harness

`scripts/benchmark.mjs`, run with `npm run benchmark`, added because the roadmap requires Phase 10 targets to be "established from local benchmarks rather than invented in advance."

It reports p50/p95/p99 for observation, proposal, execute-and-verify, emergency-stop, and audit-append latency, plus scheduler scaling, memory per tracked window, and audit growth.

It deliberately does **not** propose targets. It also refuses to approximate four target classes — focus-switch latency, motor start latency, CPU while idle and observing, and maximum agents — reporting them as not covered. A fake-provider figure for motor start latency would be a fabricated number wearing the costume of evidence.

### Finding — the workflow scheduler is superlinear in step count

The headline result, with a no-op executor so this is scheduler overhead alone:

| Steps | Total | Per step |
|--:|--:|--:|
| 1 | 0.2 ms | 0.24 ms |
| 5 | 3.0 ms | 0.60 ms |
| 10 | 9.7 ms | 0.97 ms |
| 25 | 45.9 ms | 1.84 ms |
| 50 | 172.3 ms | 3.45 ms |
| 100 | 1023.6 ms | 10.24 ms |

Ten times the steps costs roughly a hundred times the time. Per-step cost degrades 43x between 1 and 100 steps. That is the signature of per-step work that is itself linear in the number of steps.

This was nearly missed. The harness originally averaged a single 10-step workflow into one number, which looked unremarkable next to the sub-millisecond latencies. Only measuring across sizes exposed the curve, so scaling is now its own reported table.

**No fix is claimed and no cause is asserted.** The responsible code has not been profiled. Reporting a measurement as a diagnosis would be the same error as reporting local runs as hosted CI.

## Incidental finding — a flaky integration test

During a full suite run immediately after the parity harness, `tests/mcpProtocol.test.ts` failed with `Test timed out in 10000ms`. It normally completes in well under a second.

Investigated rather than re-run: 5 of 5 passes in isolation and 3 of 3 full-suite passes at 145/145. The failure was load, not breakage, and not suite-ordering pollution.

It is still a genuine flake risk. That test is an integration test doing a real client/server handshake plus roughly ten tool invocations, measured against a 10s global timeout intended for unit tests. On a loaded CI runner it could flake, and a flaky gate is worse than a slow one because it teaches people to re-run instead of read.

Given a dedicated 30s timeout with a comment explaining the reasoning. No assertion was weakened and the global 10s still applies to every other test.

## Files changed

- `scripts/ci-parity.mjs` (new)
- `scripts/benchmark.mjs` (new)
- `package.json` — `validate:ci-parity` and `benchmark` scripts
- `tests/mcpProtocol.test.ts` — per-test timeout only
- `docs/MASTER_SYSTEM_ROADMAP.md` — Phase 10 note, baseline, and the scheduler finding
- `docs/qa/evidence/2026-07-28-ci-parity.md` (new)
- `docs/qa/evidence/2026-07-28-phase10-benchmark-baseline.md` (new)
- `docs/engineering_log/2026-07-28-ci-parity-and-benchmark-harness.md`

No file under `src/` or `apps/` was modified.

## Parts & Pieces and donor patterns considered

- Reused `scripts/validate-repository.mjs` for the repository-contract job instead of reimplementing its required-file and secret-shape checks.
- Reused the user-local `dotnet` resolution learned on 2026-07-27, so the harness works on a machine where `dotnet` on `PATH` is a hostfxr-only install.
- Rejected `act` or a container runner. Neither is installed, and both would add a dependency to work around an account billing problem.
- Rejected registering a self-hosted GitHub runner. It would make the real PR checks pass, but it changes repository settings and executes workflow code on the owner's desktop. That is an owner decision, not a workaround to apply unilaterally.
- Rejected inventing Phase 10 targets from these numbers. The roadmap explicitly forbids it and real-desktop figures are still missing.
- No donor code was copied, ported, or adapted.

## Tests added or updated

No new tests. `tests/mcpProtocol.test.ts` received a per-test timeout and no assertion change.

Both new scripts are tools rather than library code. The parity harness was validated by fault injection, described above.

## Commands actually run

```text
node scripts/ci-parity.mjs
node scripts/ci-parity.mjs --report docs/qa/evidence/2026-07-28-ci-parity.md
npm run build
node --expose-gc scripts/benchmark.mjs --iterations 200 --report docs/qa/evidence/2026-07-28-phase10-benchmark-baseline.md
npm test                       # x3 for flake characterization
npx vitest run tests/mcpProtocol.test.ts   # x5 in isolation
```

## Results

- CI parity: **11 of 11 checks pass**, covering all five hosted jobs.
- Fault injection: harness correctly reported 10/11 and exit code 1.
- Benchmark baseline recorded; latencies are sub-millisecond at p50 except the scheduler.
- Scheduler scaling: superlinear, documented above.
- Full suite: 145 passed, 30 files. .NET: 29/29.
- Hosted CI: still blocked. `runner-smoke.yml` re-dispatched 2026-07-28, same billing annotation.

## Assumptions and unvalidated areas

- Parity is approximate. The harness runs on Windows with one Node and one .NET version, while CI uses `ubuntu-latest` and `windows-latest` with `actions/setup-*`. It cannot detect a Linux-only or version-specific failure, and it does not upload artifacts or run CodeQL.
- All benchmark figures come from one developer workstation under unknown background load, with no machine profile pinned. The roadmap asks for repeatable test machines and profiles; that deliverable is not met.
- The superlinear result is reproducible in shape across runs, but absolute values moved noticeably between runs, so the curve is trustworthy and the exact numbers are not.
- Memory per tracked window was measured with forced GC via `--expose-gc`, which `npm run benchmark` sets. Running the script directly without that flag produces looser figures, and the report records which applied.
- The `mcpProtocol` timeout was observed once. The 30s budget is a judgment about headroom, not a measured requirement.

## Security impact

No runtime capability, permission, provider, action, approval requirement, audit behavior, or feature gate changed. No source file changed.

The parity harness restores a gate that has been absent since the billing outage. That is a real reduction in the risk that produced the two defects fixed in `c756802`. It does not restore the hosted dependency audits as *hosted* evidence, and the tooling says so in three places rather than letting a future reader assume otherwise.

The benchmark harness reads only in-process fake state. It starts no agent, opens no port, touches no real desktop, and writes only the report path it is given.

The scheduler finding has a security dimension worth naming: unbounded superlinear cost is a denial-of-service shape. A pilot that submits a long workflow can consume disproportionate scheduler time. Phase 10 already lists resource quotas and backpressure as deliverables; this measurement is an argument for a maximum workflow length being among them.

## Rollback or disable path

Revert this commit. Both scripts and their npm entries disappear, the two evidence reports are removed, and the `mcpProtocol` timeout returns to the global 10s. No runtime rollback and no restart are required, because no executable component changed.

## Next recommended slice

1. **Profile the workflow scheduler.** This is now the strongest self-contained engineering task available. The measurement exists; the cause does not. Likely candidates are per-step work that walks all steps, but that is a hypothesis to test rather than a conclusion.
2. **Owner: billing.** Still blocking, still the only route to `github_validated`.
3. **Owner: Phase 1 environment.** The disposable VM remains Phase 1's only dependency, and Phase 2's interactive three-window tests need the same environment.
4. **Owner: self-hosted runner, optional.** It would make the real PR checks execute during the outage, at the cost of running workflow code on the owner's machine and changing repository settings. Recorded as an option, not a recommendation.
