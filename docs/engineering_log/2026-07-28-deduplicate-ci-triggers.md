# Engineering Log — Remove Duplicate CI Triggers

**Date:** 2026-07-28
**Branch:** `build/exosuit-mvp`
**Starting commit:** `cad2c75`
**Evidence class:** static workflow change plus an observed run-count check; hosted CI remains billing-blocked

## Goal

Stop paying twice for every commit.

`ci.yml` and `codeql.yml` both triggered on `push` to `[main, "build/**"]` **and** on `pull_request`. Because PR #1 originates from `build/exosuit-mvp`, every push to the canonical branch fired four runs for one commit:

```text
Exosuit CI      push          bfc2be5
Exosuit CI      pull_request  bfc2be5
Security Audit  push          bfc2be5
Security Audit  pull_request  bfc2be5
```

Identical commit, identical work, billed twice. On a private repository where Windows minutes count double against the allowance, this is a plausible contributor to the exhausted quota behind the current billing block.

## Change

`push` now covers `main` only. `pull_request` covers pre-merge validation. A commit is therefore validated exactly once: through the PR before merge, and on `main` after.

`runner-smoke.yml` was left alone. It triggers on `push` to `build/**` but has no `pull_request` trigger and is path-filtered to its own file, so it cannot double-fire.

`ci-selfhosted.yml` is `workflow_dispatch` only and is unaffected.

## Trade-off

A `build/**` branch with **no open PR** now receives no automatic run. That is acceptable here because all work flows through PR #1 by documented convention, and `workflow_dispatch` remains available. It is a real gap if that convention changes, so it is recorded rather than buried: a branch pushed without a PR is unvalidated until one is opened.

## Files changed

- `.github/workflows/ci.yml` — trigger scope and an explanatory comment
- `.github/workflows/codeql.yml` — trigger scope and a pointer to the same note
- `docs/engineering_log/2026-07-28-deduplicate-ci-triggers.md`

No source, test, or documentation-of-record file changed.

## Parts & Pieces and donor patterns considered

- Adopted the conventional split used by most projects: `push` on the default branch for post-merge, `pull_request` for pre-merge.
- Rejected relying on `concurrency` to deduplicate. The existing group key is `github.ref`, which differs between a branch push and a PR merge ref, so the two runs never collide and `cancel-in-progress` cannot help.
- Rejected a job-level `if:` condition to suppress the push run when a PR is open. It would still allocate a runner to evaluate the condition, and it is harder to read than a narrower trigger.
- Rejected removing `--collect:"XPlat Code Coverage"` from the Windows job in the same slice. It would cut the expensive half further, but coverage is cited as evidence in `docs/qa/GITHUB_PHASE_FINAL_AUDIT.md`, so dropping it trades evidence for cost and is a separate decision.

## Tests added or updated

None. This changes workflow triggers, which no test in this repository can exercise: the trigger matrix is evaluated by GitHub, not by the code under test.

Verified instead by parsing all four workflow files and confirming that no workflow now has both a `push` trigger covering `build/**` and a `pull_request` trigger, and by counting the runs produced by the commit that carries this change.

## Commands actually run

```text
python -c "import yaml ..."      # parse all four workflow files
gh run list                      # count runs produced by this commit
npm run validate:ci-parity
```

## Results

- All four workflow files parse.
- Trigger overlap eliminated; no workflow pushes on `build/**` while also handling pull requests.
- Expected effect: four runs per push to the canonical branch drop to two, a 50% reduction in consumption per commit.
- CI parity: 11 of 11.

## Assumptions and unvalidated areas

- The 50% figure counts runs, not minutes. The two eliminated runs are the `push`-event duplicates of the same jobs, so minutes should track closely, but no billable-minute data was available to confirm: `gh api .../timing` returned zeros for the last known-good run, and no run has executed since the billing block.
- Whether duplicate triggers materially caused the quota exhaustion is inference, not measurement. The billing block predates any usage data this session could read.
- Savings apply only once hosted runners are restored. While the block persists, both the old and new configurations consume nothing.

## Security impact

No runtime capability, permission, provider, action, approval requirement, or audit behavior changed. No source file changed.

One security-relevant consequence: a `build/**` branch with no open PR is no longer automatically validated. Given that hosted CI is entirely unavailable today, this does not reduce present coverage, but it should be revisited when runners return.

## Rollback or disable path

Revert this commit to restore `branches: [main, "build/**"]` in both workflows. No runtime rollback is required.

## Next recommended slice

Unchanged and owner-gated: billing, the disposable VM for Phase 1 and Phase 2 interactive tests, the persistence contract for the scheduler, a maximum workflow-length quota, and self-hosted runner registration.
