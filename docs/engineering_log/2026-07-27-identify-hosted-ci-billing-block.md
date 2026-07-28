# Engineering Log — Identify the Hosted-CI Billing Block

**Date:** 2026-07-27
**Branch:** `build/exosuit-mvp`
**Starting commit:** `c756802` (fix: restore the build and close a prompt-injection guard gap)
**Evidence class:** GitHub Actions run inspection through the authenticated `gh` CLI; documentation correction only

## Goal

Identify why GitHub-hosted workflow jobs fail before checkout, record the cause accurately, and stop the repeated wrong-diagnosis cycle.

The repository already recorded the symptom honestly in `README.md` and `docs/qa/ATOMIC_AUDIT_2026-07-21_GITHUB_EXPANSION.md`, describing jobs that fail "before checkout with no steps allocated" and calling it a "runner/account failure." Neither document named a cause. As a result the blockage was repeatedly re-diagnosed as workflow configuration.

## Finding

The cause is **GitHub account billing**, not workflow configuration.

Every job in every workflow carries the same GitHub annotation:

> The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings

Observed on:

| Run | Workflow | Date | Jobs affected |
|---|---|---|---|
| `29848199984` | Runner Smoke Test | 2026-07-21 | `Allocate ubuntu-latest`, `Allocate windows-latest` |
| `30303482508` | Exosuit CI | 2026-07-27 | all three jobs |
| `30303482527` | Security Audit | 2026-07-27 | npm dependency vulnerability audit |

`.github/workflows/runner-smoke.yml` is the decisive control. Its jobs contain a single `echo`/`Write-Output` step with no checkout, dependencies, cache, or job dependencies. Both its Linux and Windows jobs fail identically with the billing annotation. A workflow that only requests a runner cannot fail for a configuration reason, which excludes YAML validity, `runs-on` labels, the project-surface detection gate, npm cache settings, and the missing lockfile.

The repository is private, so Actions draws on a monthly free-minutes allowance, and `windows-latest` bills at roughly twice the Linux rate. The `windows-agent` job is the most expensive in the matrix.

### Why previous attempts could not have worked

Four upstream commits changed workflow configuration while chasing this blockage:

- `7078eda` remove brittle project-surface detection gate,
- `c759fd0` run supported security audits without detect gate,
- `38ee6d5` avoid npm cache requirement without lockfile,
- `2df8715` avoid npm cache requirement in security audit.

None addressed the cause. They may be independently reasonable, but none could have restored hosted runs and none should be cited as CI repair evidence. `5302cf0`, which added the smoke test, was the correct diagnostic instinct; its result was simply not read as conclusive.

## Files changed

- `README.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-21_GITHUB_EXPANSION.md`
- `.github/workflows/runner-smoke.yml` (comment only; no workflow behavior changed)
- `docs/logs/DECISION_LOG.md`
- `docs/engineering_log/2026-07-27-identify-hosted-ci-billing-block.md`

## Parts & Pieces and donor patterns considered

- Applied the evidence-discipline rule that separates confirmed observation from inference. The annotation is quoted verbatim from GitHub with run IDs rather than paraphrased as a "runner failure."
- Retained `runner-smoke.yml` rather than deleting it as a failed repair attempt. It is a correctly designed isolating control, and it produced the finding.
- Rejected any further workflow edits. Changing YAML in response to an account-level block would add churn and imply a fix that does not exist.
- Rejected weakening the local validation chain to compensate. The substitute gate should be at least as strict as the hosted one, not less.
- No donor code was copied, ported, or adapted.

## Tests added or updated

None. This slice changes documentation and one YAML comment. No executable behavior changed, so no test could meaningfully assert the outcome.

## Commands actually run

```text
gh run list --limit 15
gh run view 30303482508
gh run view 30303482527
gh run view 29848199984
gh run list --workflow=runner-smoke.yml --limit 3
gh repo view --json isPrivate,name,owner
npm run validate:typescript
```

`gh api users/AidanDCM/settings/billing/actions` returned HTTP 404 and reported that the operation needs the `user` scope, which the current token lacks. Exact remaining-minutes and spending-limit values were therefore not read. This does not affect the finding, which rests on the annotation itself.

## Results

- Billing annotation confirmed on three runs across three different workflows, including a workflow with no steps beyond `echo`.
- Both `ubuntu-latest` and `windows-latest` affected, so the block is not runner-OS specific.
- Repository confirmed private via `gh repo view`.
- Local validation chain re-run after the documentation edits; recorded below.
- No hosted evidence was produced or claimed. Hosted CI remains unavailable.

## Assumptions and unvalidated areas

- The precise billing state — failed payment versus exhausted allowance with a zero spending limit — was not determined, because the annotation covers both and the billing API was not readable with the current token scope. The required owner action is the same in either case.
- Whether the block began exactly at the 2026-07-21 smoke run was not established. That is the earliest run inspected here, not a proven start date.
- The four cited CI commits were assessed only for whether they could have fixed this blockage. They were not otherwise reviewed for correctness, and this slice does not revert them.
- Restoration cannot be verified from here. It requires an owner billing change followed by a fresh `runner-smoke.yml` dispatch.

## Security impact

No runtime capability, permission, provider, action, approval requirement, audit behavior, or feature gate changed. No file under `src/` or `apps/` was modified, and no workflow step was altered.

The security-relevant point is the exposure this documents rather than one it introduces. With hosted CI unavailable, nothing gated commits to the canonical branch, and two defects reached it during the outage: a build-breaking invalid `as const` in `src/fileCheckpointStore.ts`, and a prompt-injection guard that missed its most common phrasing. Both were fixed in `c756802`. Naming the cause makes the unguarded window explicit rather than leaving it as an unexplained CI oddity.

No credential, token, or account secret was read or recorded. Billing details were not accessed, and no payment action was taken or attempted.

## Rollback or disable path

Revert this commit. The documents return to describing the symptom without the cause and the smoke test loses its explanatory comment. No runtime rollback and no restart are required.

## Next recommended slice

1. **Owner action, not reachable from this repository:** resolve the billing state in GitHub Settings → Billing & plans, then dispatch `runner-smoke.yml` from the Actions tab. If both jobs pass, re-run Exosuit CI and Security Audit on the current head and attach the run IDs as the first genuine hosted evidence since the outage.
2. Once hosted CI is confirmed working, consider whether the `windows-agent` job needs `--collect:"XPlat Code Coverage"` on every push, since Windows minutes bill at roughly twice the Linux rate and that job is the largest consumer.
3. Reconcile the roadmap phase statuses with what the branch implements.
4. Owner decision on whether Phase 1 acceptance should present the desktop core alone; if so, the coordinator registration in `src/server.ts` needs an explicit composition flag.
5. Then Phase 1 environment work: install the .NET 8 SDK and provision the disposable VM or dedicated account required by `docs/CODEX_HANDOFF.md`.
