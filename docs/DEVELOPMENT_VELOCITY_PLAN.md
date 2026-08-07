# Development Velocity Plan

**Written:** 2026-08-06
**Status:** provisional. The forecasting section is a scenario table, not a
forecast, and says so.

---

## 1. The measurement that reframes everything

Taken from the repository on 2026-08-06, not from impression.

| Metric | Value |
| --- | --- |
| Commits since 2026-07-17 | **591** in 20 days (~29.5/day) |
| Proven gates | **3** in 20 days (0.15/day) |
| Remaining gates | **17**, all requiring live evidence |
| Hosted CI success, last 25 runs | 15 success / 9 failure / 1 cancelled (**60%**) |
| Branches | 28 |
| Worktrees registered | 13 metadata entries, 7 listed, several orphaned |
| PR depth to `main` | #28 → `codex/unify-glove-field` → #26 → `build/exosuit-mvp` |
| TypeScript source and test files | 184 |

**Commit throughput is high. Proven-gate throughput is low.** 591 commits
converted into 3 proven gates, and all three are M0 source gates that need no
hardware.

The constraint is therefore **evidence production**, not code production.
Anything that makes writing code faster optimises the part that is not broken.

Two second-order constraints follow from it:

- **Physical and elevated sessions need batching.** Every live gate needs an
  elevated token, and some need firmware changes and restarts. Paid per gate,
  that setup cost dominates. Paid once per session across several gates, it
  nearly disappears.
- **Branch depth and stale worktrees create integration friction.** Work has
  already sat several commits outside the PR that mattered, and orphaned
  worktree metadata raises errors on ordinary git operations.

### The scoreboard changes

Track **gates passed**, not commits produced. 591 commits felt like progress;
3 proven gates is what the ledger says.

---

## 2. What to measure from now on

Recording these is what replaces assumption with cost.

| Signal | Why |
| --- | --- |
| Proven gates per week | The only completion metric |
| Live-gate engineering hours | Harness build, per gate |
| Physical-session hours | Elevated/at-machine time, per session |
| First-pass live success rate | How often a live run yields usable evidence |
| Failed evidence attempts | Evidence is single-use; failures have real cost |
| CI reruns caused by infrastructure | Distinguishes flakiness from regressions |
| Time from implementation complete to gate promotion | Review and custody latency |

---

## 3. Scenario table — not a forecast

Seventeen gates remain. What matters is the **sustained** rate, so the honest
presentation is a table rather than a date.

| Sustained proof rate | Seventeen gates |
| --- | ---: |
| 0.5 gate/week | 34 weeks |
| 1 gate/week | 17 weeks |
| 1.5 gates/week | 11–12 weeks |
| 2 gates/week | 8–9 weeks |

> The forecast will be recalibrated after HYP-001 and CHN-001, when the project
> has measured costs for two genuine live gates.

Extrapolating from three source-only gates and an assumed live-gate multiplier
would be less defensible than saying plainly that the cost is not yet known.

The dominant variable is not in the table: **how many hours per week are
actually available at the machine, elevated.** If that is one evening a week,
engineering improvements move the number far less than session availability
does.

---

## 4. Interventions, in the order they should happen

### Done

1. **PR review boundary corrected.** PR #28 was open and marked ready while
   describing itself as documentation-only; its head carried the TPM
   enforcement work. Returned to draft, retitled, body rewritten to separate
   documentation, sealing, enforcement, recovery, harness, remaining v2.3 work,
   and the Secure Boot requirement.
2. **CI concurrency fixed.** `group` keyed on `github.ref` alone put every event
   for a pull request under `refs/pull/N/merge`, so runs on an exact head were
   cancelled and recorded as failures — leaving no green hosted validation for
   the commit under review. Now keyed on
   `${{ github.workflow }}-${{ github.event.pull_request.head.ref || github.ref_name }}`
   in `ci.yml`, `codeql.yml` (which had no concurrency control at all), and
   `ci-selfhosted.yml`.

   Trigger topology was already correct and was left alone: `push` is restricted
   to `main`, `pull_request` covers feature branches. There was no duplicate
   push/PR run to eliminate — only a group key that cancelled too broadly.

### Next

3. **Batch the v2.3 contract change before HYP-001 promotion.** Not after.
   Add to the record schemas:

   ```
   keyProtectionBackend: tpm | dpapi | plaintext
   keyCustodyEventId
   registryPurpose
   recoveryGrantId?
   ```

   For live records, require: `keyProtectionBackend` equals `tpm`; no recovery
   grant open; the TPM vault produced the signing key; the custody ledger is
   valid.

   The verifier must reject a false TPM claim, missing backend information, a
   record signed during an open recovery grant, a record whose custody event
   does not match its key, and a live signature generated from DPAPI or
   plaintext.

   Batch every other known frozen-contract change into the same v2.3 bump, then
   **re-attest M0 once**. Re-attestation is the cost that makes batching worth
   it.

4. **Enable and verify Secure Boot**, then run elevated preflight. The signed
   preflight artifact — not a human observation — must show it enabled.

5. **Run HYP-001 for real.** Three lifecycle cycles, evidence collected and
   reviewed, promoted only after independent review by a reviewer who is not the
   issuer.

6. **Measure actual gate-hours and failure rate**, and recalibrate §3.

7. **Only then extract a shared harness**, from the proven HYP-001 path.

### Deliberately deferred

**Do not build `liveHarness.ts` yet.** Extracting a shared live harness before
HYP-001 passes risks generalising the wrong abstractions. M0.5 already showed
that real hardware reveals lifecycle problems fixtures miss — the boot-window
gap was found that way, not by design review.

When HYP-001 has passed, extract only what is proven reusable:

- preflight orchestration
- lifecycle event recording
- artifact capture
- evidence signing
- fresh-process evaluation
- negative-injection execution
- cleanup verification
- immutable-base verification

Leave gate-specific policy and environment validation outside the shared spine.
Use CHN-001 as the second consumer: if HYP-001 and CHN-001 both fit cleanly, the
abstraction is real. If CHN-001 has to fight it, it was premature.

---

## 5. Worktree hygiene — conservatively

Orphaned worktree metadata raises `Permission denied` errors on ordinary git
operations in this repository. The goal is less friction, **not** accidental
loss.

```bash
git worktree list --porcelain
git worktree prune --dry-run
git worktree prune
```

Classify each directory before removing anything:

- registered and active
- unregistered but containing uncommitted work
- safe generated scratch directory
- locked or inaccessible, requiring manual inspection

Do not delete a directory merely because it looks orphaned.

---

## 6. Pre-push split — only after CI is reliable

The pre-push hook currently runs the full 12-check parity suite, which is
minutes of dead time on every push. Splitting it is worthwhile, but **only once
the concurrency fix has proven stable** — moving checks to a CI that cannot be
trusted would remove the signal rather than relocate it.

**Pre-push:**

- typecheck
- contract-freeze check
- completion evaluator validation
- tests directly affected by changed files
- secret and private-key scan

**Hosted CI:**

- full TypeScript suite
- full .NET suite
- PowerShell parsing
- SBOM
- dependency audits
- full adversarial matrix

Keep an explicit local command for exact-parity runs before any gate promotion:

```bash
npm run validate:full
```

---

## 7. Standing practice

- **Check whether it already exists.** A `dotnet` SDK probe was reimplemented in
  the HYP-001 preflight when `scripts/ci-parity.mjs` already resolved the same
  PATH-shadowing problem, with a comment recording that it had cost two
  development sessions. The duplicate answered the question differently and
  wrongly, and would have blocked a run on a working toolchain.
- **Batch contract changes.** Each freeze bump costs an M0 re-attestation.
- **Keep the handoff living.** `docs/HANDOFF_M1.md` is why a fresh session
  starts productive instead of rediscovering where the code is.

---

## 8. The highest-value outcome

Not another framework commit:

> **HYP-001 proven, independently reviewed, and promoted with exact live
> evidence.**

That first live gate replaces the largest assumption in this document with a
measured cost.
