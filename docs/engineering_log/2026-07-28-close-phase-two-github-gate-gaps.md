# Engineering Log — Close the Three Phase 2 GitHub Gate Gaps

**Date:** 2026-07-28
**Branch:** `build/exosuit-mvp`
**Starting commit:** `4e47845` (feat: make the coordinator MCP surface opt-in, core by default)
**Evidence class:** local TypeScript and .NET validation, including mutation verification of one new test; no Windows-provider, ChatGPT, or hosted-CI evidence

## Goal

Audit the Phase 2 promotion gate in `docs/MASTER_SYSTEM_ROADMAP.md` against the tests that exist, then write whatever is missing.

Phase 2 lists thirteen required GitHub tests. Roughly 74 commits of coordinator work landed while hosted CI was blocked by account billing, so nothing had checked which of those thirteen were actually covered. That mattered for more than tidiness: the ordering decision in front of the owner depends on how close Phase 2 really is.

## Audit result: ten of thirteen covered

Covered by existing tests:

- dependency-ordered data transfer A → B → C, and no clipboard required — `workflowRuntime.test.ts`,
- parallel read-only steps and write-lock conflict denial — `coordinator.test.ts`,
- serialized physical actions via per-session focus ownership — `coordinator.test.ts`,
- focus-lease expiry — `coordinator.test.ts`,
- window close/reopen generation change — `coordinator.test.ts` and `workspaceSync.test.ts`,
- unexpected modal dialog — `coordinator.test.ts`,
- checkpoint serialization and hydration — `fileCheckpointStore`, `encryptedCheckpointStore`, `serverStartup`,
- cancellation and emergency-stop propagation — `workflowRuntime.test.ts` and `coordinator.test.ts`.

Three gaps:

1. **Failed verification blocks dependent steps.** `requires passed verification for a succeeded step` builds its workflow with `steps: [base.steps[0]!]`, a single step. It proves a step fails without passed verification; it never exercises a dependent. Roadmap Execution invariant 4 states that failed or partial verification halts dependent work, and nothing asserted it.
2. **Three fake windows observed concurrently.** `workspaceSync.test.ts` used one window (`w1`) and `coordinator.test.ts` used one (`window-a`). The `workflowRuntime` fixture defines three windows but asserts nothing about concurrent multi-window identity.
3. **Crash/restart resume from last verified checkpoint.** Only the uncertain-external-effect path was covered, which ends in `recovery_required` and a refused `resume`. The clean case — restart, hydrate a verified checkpoint, resume, finish — was never exercised.

## Files changed

- `tests/workflowRuntime.test.ts` — gaps 1 and 3.
- `tests/workspaceSync.test.ts` — gap 2.
- `docs/MASTER_SYSTEM_ROADMAP.md` — Phase 2 implementation note updated with gate coverage.
- `docs/engineering_log/2026-07-28-close-phase-two-github-gate-gaps.md`.

No file under `src/` or `apps/` was modified. The implementation was already correct; these tests prove behavior that existed but was unproven.

## Parts & Pieces and donor patterns considered

- Reused the existing `workspace()`, `definition()`, and `FixtureExecutor` fixtures rather than introducing parallel ones, so the new tests exercise the same three-window, three-step shape the suite already models.
- Reused the `InMemoryWorkflowCheckpointStore` handoff pattern from the existing hydration test: build state with one runtime, then hydrate a second runtime sharing only the durable store. That is what makes it a restart rather than a reuse.
- Rejected asserting a step **count** for the concurrent-window test. Counting proves little; the test asserts distinct window IDs, distinct fingerprints, per-window generation, exactly one active window, and absence of every plain title.
- Rejected trusting a passing test. The dependent-blocking test asserts a safety invariant, so it was mutation-verified before being accepted.
- No donor code was copied, ported, or adapted.

## Tests added or updated

Three tests, 142 to 145.

**`blocks dependent steps when an upstream step fails verification`** — runs the full three-step workflow. `read-a` succeeds with passed verification; `calculate-b` returns `succeeded` with `verificationStatus: "partial"`, the shape of a pilot claiming success it cannot prove. Asserts that `calculate-b` is recorded `failed` rather than succeeded, that `write-a` is `blocked` rather than left `pending`, that the executor was never invoked for `write-a`, that only the one verified artifact exists, and that the audit chain still verifies.

**`observes three windows concurrently with distinct identity and no plain titles`** — three windows with three distinct sensitive titles. Asserts three windows tracked, distinct IDs and process names, three distinct fingerprints, generation 1 each, exactly one active, and that none of the three plain titles appears anywhere in the serialized snapshot.

**`resumes from the last verified checkpoint after a restart`** — runs one verified step, pauses, then hydrates a second runtime sharing only the checkpoint store. Asserts the verified step stays `succeeded`, no step is `uncertain`, the artifact survived, and that after `resume` only `calculate-b` and `write-a` execute, the recovered artifact feeds them, and the workflow completes.

### Mutation verification

A passing test is not evidence until it can fail. `#refreshDependencyStates` blocks a dependent when a dependency is in `["failed", "blocked", "cancelled", "uncertain"]`. Removing `"failed"` from that list should break the new test and nothing else.

The first attempt mutated the wrong occurrence: that string appears twice, at lines 535 and 874, and a naive first-match replacement hit line 535 while the dependency logic is at 874. The suite stayed green, which would have been misread as the test not being load-bearing. Targeting the second occurrence produced the expected failure:

```text
× blocks dependent steps when an upstream step fails verification
  → expected 'pending' to be 'blocked'
```

Exactly one test failed, and `src/workflowRuntime.ts` was reverted with `git diff --stat` confirming no residue. The near-miss is recorded because it is the failure mode of mutation testing: a mutation that does not land looks identical to a test that does not matter.

## Commands actually run

```text
npm run typecheck
npx vitest run tests/workflowRuntime.test.ts tests/workspaceSync.test.ts
npx vitest run tests/workflowRuntime.test.ts        # under mutation, then reverted
npm run validate:typescript
"$USERPROFILE/.dotnet/dotnet.exe" test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release
```

## Results

- TypeScript typecheck: passed.
- TypeScript tests: **145 passed, 30 files**, up from 142.
- Build, system pulse, repository validator (34 artifacts): passed.
- .NET tests: passed, 29/29.
- Mutation verification: exactly one test failed under the mutation and the suite returned green after revert.
- All three new tests passed on first run, so no defect was found in the coordinator implementation.

## Assumptions and unvalidated areas

- The three new tests close the **stated** gate items. Coverage of a gate item is not proof the underlying subsystem is correct; each test exercises one scenario, not the space around it.
- Only the dependent-blocking test was mutation-verified. The other two were not, so their strength rests on construction rather than demonstration.
- The gate items judged already covered were matched by reading test names and, where ambiguous, test bodies. The two ambiguous ones — verification failure and checkpoint resume — were read in full and turned out to be the gaps. Items judged covered from names alone were not each opened.
- Phase 2's gate also requires interactive three-window tests on real Windows. This slice touches only the GitHub half. Phase 2 cannot be promoted on these tests alone.
- Everything ran on fake fixtures. No real window, process, focus change, or dialog was involved.

## Security impact

No runtime capability, permission, provider, action, approval requirement, audit behavior, or feature gate changed. No source file changed.

The security-relevant gain is evidential. Execution invariant 4 — failed or partial verification halts dependent work — is a core safety property that was implemented but unproven. It is now proven, and mutation-verified to be genuinely enforced rather than incidentally satisfied. A future refactor that stops blocking dependents after a failed step will fail a test instead of shipping.

The concurrent-window test also asserts that no plain title survives into the workspace model across several windows at once, extending a privacy guarantee that was previously checked for one window only.

## Rollback or disable path

Revert this commit. The three tests disappear and Phase 2 coverage returns to ten of thirteen. No runtime rollback and no restart are required, because no executable component changed.

## Next recommended slice

1. **Owner: billing.** Still blocking. `runner-smoke.yml` re-dispatched 2026-07-28 and returned the same annotation. No phase can reach `github_validated` until hosted CI runs.
2. **Owner: Phase 1 environment.** The disposable VM or dedicated account remains the only dependency for Phase 1.
3. **Owner: ordering.** Phase 2's GitHub half now stands at thirteen of thirteen, which is the input this decision was waiting on. Its interactive three-window half remains untouched and needs the same environment as Phase 1.
4. Available without owner action: Phase 10 has no benchmark numbers at all, and the roadmap requires targets derived from local benchmarks rather than invented. A benchmark harness is the next self-contained piece of work.
