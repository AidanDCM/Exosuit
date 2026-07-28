# Engineering Log — Clean-Checkout Parity and a Pre-Push Gate

**Date:** 2026-07-28
**Branch:** `build/exosuit-mvp`
**Starting commit:** `35ab90d`
**Evidence class:** local validation only; hosted CI remains billing-blocked

## Goal

Close the two gaps between local parity and hosted CI that can be closed for free.

Asked directly whether the work is really locked behind GitHub, the honest answer is that only the *hosted runner* is. The checks themselves already run locally. What hosted CI additionally provides breaks down as:

| Property | Hosted | Local parity before this slice | Closable locally |
|---|---|---|---|
| Runs automatically | yes | no, invoked by hand | yes |
| Clean checkout | yes | no, used the working tree | yes |
| Independent environment | yes | no | partly |
| Linux and Windows | yes | Windows only | needs WSL or a second machine |
| Third-party attestation | yes | no | no, inherently |

The first two are addressed here. The last is impossible by definition and matters least for a private single-owner repository.

## Clean-checkout mode

`node scripts/ci-parity.mjs --clean`, also `npm run validate:ci-parity:clean`.

It creates a detached `git worktree` at HEAD, runs the full matrix there, and removes it. A worktree contains exactly the committed content: no untracked files, no `node_modules`, no build output.

This matters because a working-tree run can pass on things nobody else has. Two concrete cases, both already observed in this repository:

- a file that was never committed,
- a stale `node_modules` differing from a fresh resolve. Earlier this session a local `npm audit` reported one high and two moderate advisories that a clean resolve did not have, because the installed tree was older than the declared ranges permitted.

The child process runs the *working-tree* copy of the script against the worktree's contents. The subject under test is committed code; the harness is whatever is being edited. Running the worktree's own copy would be marginally purer but makes a change to the harness untestable until committed, which is a poor trade for a tool under active iteration.

### A defect this immediately exposed

The first clean run failed four TypeScript checks with a "not recognized" error for `tsc` and `vitest`. The cause was in the harness, not the repository: a pristine worktree has no `node_modules`, and the runner assumed dependencies were already present, which is only ever true for a working tree. CI installs before running anything.

An install step was added, mirroring CI. In a working tree it is close to a no-op; in a clean worktree it is what makes the run possible at all. The harness only became faithful to CI once it was made to run somewhere CI-like.

## Pre-push hook

`.githooks/pre-push`, activated with `npm run hooks:install`, which sets `core.hooksPath`. Version-controlled rather than hand-installed into `.git/hooks`, so it travels with the repository and can be inspected in review.

It runs the clean matrix and refuses the push on failure. Clean rather than working-tree is deliberate: a push publishes committed content, so committed content is what should be validated.

Bypass is `git push --no-verify`, or `EXOSUIT_SKIP_PREPUSH=1`. Both are documented in the hook itself. Bypassing is a legitimate choice for a work-in-progress branch; the point is that skipping should be a decision rather than a discovery.

Deletions and empty pushes are detected from the refs git supplies on stdin and skipped, so deleting a remote branch does not trigger a two-minute build.

## Timing

| Mode | Duration |
|---|---|
| working tree | ~100 s |
| clean checkout | ~111 s |

Clean costs about eleven seconds more and is strictly stronger, which is why the hook uses it.

Roughly two minutes on every push is real friction. It is the correct default for a repository whose own record shows two defects reaching the canonical branch during the CI outage, but anyone finding it intolerable should use `--no-verify` deliberately rather than uninstall the hook and forget.

## Files changed

- `scripts/ci-parity.mjs` — `--clean` mode, dependency install step, report-path resolution against the original directory
- `.githooks/pre-push` (new)
- `package.json` — `hooks:install`, `hooks:uninstall`, `validate:ci-parity:clean`
- `docs/engineering_log/2026-07-28-clean-checkout-parity-and-pre-push-hook.md`

No source or test file changed.

## Parts & Pieces and donor patterns considered

- Used `git worktree` rather than `git archive` piped to tar, or a full clone. It is git-native, needs no external tar on Windows, and yields exactly the committed tree.
- Used `core.hooksPath` rather than writing into `.git/hooks`, so the hook is version-controlled and reviewable.
- Rejected mirroring to another CI provider. Keeping GitHub for storage while running CI on a GitLab or Codeberg mirror does work, but it means maintaining a mirror sync and a second account to avoid a bill that can be capped, and it lands on another free tier with the same exhaustion mode.
- Rejected making the hook run working-tree parity for speed. Eleven seconds does not justify validating something other than what is being pushed.
- Rejected installing WSL to gain Linux coverage. It is free and would genuinely help, but it is a system-level install with a reboot and belongs to the owner.

## Commands actually run

```text
node scripts/ci-parity.mjs                 # ~100 s, working tree
node scripts/ci-parity.mjs --clean         # ~111 s, clean worktree
npm run hooks:install
git push --dry-run                         # hook fires, correctly skips an empty push
git worktree list                          # confirm temporary worktrees are removed
```

## Results

- Clean-checkout parity: **12 of 12** checks pass against HEAD.
- Temporary worktrees are removed on success and on failure, verified with `git worktree list`.
- The hook fires, and correctly skips a push with no refs to validate.
- A pre-existing unrelated worktree, `AI Exosuit PR11`, was observed and left untouched.

## Assumptions and unvalidated areas

- Parity remains approximate. It runs one OS, one Node version, and one .NET version, against CI's `ubuntu-latest` plus `windows-latest` with `actions/setup-*`. It cannot detect a Linux-only or version-specific failure, and it does not upload artifacts or run CodeQL.
- Clean mode validates HEAD, not the exact merge result a pull request would produce. A conflicting change on the target branch would not be caught.
- The hook only guards `git push`. It cannot constrain a push made from another tool or client that ignores hooks.
- Timings are from one workstation under unknown load.

## Security impact

No runtime capability, permission, provider, action, approval requirement, or audit behaviour changed. No source file changed.

This restores an automatic gate, which is the control that was missing when a build-breaking `as const` and a prompt-injection guard gap both reached the canonical branch during the CI outage. It is weaker than hosted CI in exactly the ways listed above, and the hook says so in its own header so that no one reads a green pre-push as hosted evidence.

The hook executes repository code on every push. That is inherent to any pre-push hook, and the script it runs is version-controlled and reviewable.

## Rollback or disable path

`npm run hooks:uninstall` removes the `core.hooksPath` setting and the hook stops running; `--clean` remains available manually. Reverting the commit removes both. No runtime rollback is required.

## Open decision for the owner

`docs/MASTER_SYSTEM_ROADMAP.md` defines `github_validated` as requiring CI and supported security checks to pass. That wording says *CI*, not *GitHub Actions*, and the roadmap is the owner's document.

Two consistent positions exist. Either amend the definition to name the clean parity matrix explicitly, stating plainly that it is not independently attested, or leave the definition alone and accept that no phase reaches `github_validated` until hosted runners return.

What must not happen is leaving the current wording in place while quietly treating local runs as satisfying it. That is precisely the evidence-class laundering the repository's own discipline exists to prevent. This slice deliberately does not choose; it only makes the local option strong enough to be worth choosing.
