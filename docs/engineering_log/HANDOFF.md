# Exosuit Engineering Handoff

**Written:** 2026-07-28
**Branch:** `build/exosuit-mvp`
**Head at writing:** `00308bb`
**Covers:** the sessions of 2026-07-27 and 2026-07-28

> **Note on this file's location.** The previous handoff was reported as living at
> `docs/engineering_log/HANDOFF.md` and did not exist. The real content was split between
> `docs/CODEX_HANDOFF.md` and a dated engineering log, which cost the next session time to
> discover. This file now occupies that path. Keep it here, and keep it current.

---

## 1. What Exosuit is

A private, model-independent "computer body" that lets an authorized AI pilot (ChatGPT,
Claude, any MCP host) perceive and operate Windows applications, while the human keeps
final authority through local policy, explicit approval, verification, audit, deadlines,
and immediate interruption.

Two processes:

- **TypeScript MCP gateway** — the tool surface a pilot talks to. Schemas, prompt-injection
  and loop guards, application-map memory, gateway audit chain, bounded requests.
- **.NET Windows agent** — the local execution authority. Loopback-only HTTP, deterministic
  policy, proposal and approval state, immutable approval fingerprints, fresh
  re-observation before every action, verification, local audit chain, emergency stop.

The architecture rule that matters most: **the brain proposes, the local host owns
permission and execution.** A model can never approve its own action or enable full
control.

**Governing documents, in precedence order:**

| Document | Role |
|---|---|
| `docs/MASTER_SYSTEM_ROADMAP.md` | The planning authority. When documents conflict, this wins. |
| `AGENTS.md` | Architecture laws and the required change-report format. |
| `DEVELOPER_OPERATING_SYSTEM.md` | Evidence discipline and the question-everything checklist. |
| `docs/SECURITY_MODEL.md` | Security boundaries and hard rules. |
| `docs/CODEX_HANDOFF.md` | The Phase 1 local Windows acceptance procedure. |

**The single most important convention in this repository is evidence discipline.** Every
claim names an evidence class — static review, unit tests, GitHub CI, local Windows
session, ChatGPT — and one class must never be described using a higher one. Most of the
work below is downstream of taking that rule seriously.

---

## 2. Where the project actually stands

**Implementation is far ahead of evidence.** That is the central fact.

| Phase | Implemented | Evidenced | Status |
|---|--:|--:|---|
| 0 · Governance | 100% | 100% | `github_validated` |
| 1 · Windows + ChatGPT acceptance | 100% | ~40% | Sandbox evidence exists; tunnel and ChatGPT missing |
| 2 · Multi-window coordinator | ~95% | ~50% | GitHub gate **13/13**; interactive gate **0/6** |
| 3 · Virtual desktop | ~60% | ~15% | Switch-intent only |
| 4 · Multi-agent supervisor | ~65% | ~15% | Registry and auth solid; no real transport |
| 5 · Browser companion | ~40% | ~10% | Contracts and mock; **no extension exists** |
| 6 · Visual sensor | ~15% | 0% | Disabled foundation; privacy audit not started |
| 7 · Skills | ~50% | ~15% | Signed registry; execution not enabled |
| 9 · Reliability | ~70% | ~30% | Checkpoints good; no crash-matrix runs |
| 10 · Performance | ~60% | ~35% | Harness, baseline, and a quota now exist |
| 11–14 · Packaging → Release | ~0% | 0% | Not started |

Roughly **60% implemented, 25% evidenced**. Nothing can reach `github_validated` while
hosted CI is unavailable, because the roadmap defines that state as requiring CI to pass.

---

## 3. How the sessions went, and why

### 3.1 The starting problem: a handoff that pointed at nothing

The session opened with a request to read `docs/engineering_log/HANDOFF.md`. It did not
exist. The actual state was in `docs/CODEX_HANDOFF.md` plus an uncommitted engineering log
closing Phase 0.

Worse, the local checkout was **74 commits behind origin**. Those commits — the coordinator,
supervisor, virtual-desktop, browser, skill, performance, and support-bundle work — had
landed between 2026-07-19 and 2026-07-21 and grew `src/` from 11 files to 30. The first
several hours of analysis were performed against a tree that had been superseded for days,
and had to be redone.

**Lesson for the next person: run `git fetch` before believing anything about state.**

### 3.2 The defect that explained a lot: hosted CI was never failing for a code reason

Every GitHub Actions job, in every workflow, had been failing since at least 2026-07-21
with:

> The job was not started because recent account payments have failed or your spending
> limit needs to be increased.

Four earlier commits had tried to fix this by editing workflow YAML — removing a detection
gate, decoupling jobs, changing npm cache settings. **None of them could have worked.** The
decisive evidence was already in the repository: `runner-smoke.yml`, whose only step is an
`echo`, failed identically on both Linux and Windows. A workflow that only requests a runner
cannot fail for a configuration reason.

The repository had recorded the *symptom* honestly ("failing before checkout with no steps
allocated") but never named the *cause*, so the wrong diagnosis kept being re-derived.

**Fixed in `6c1f7ef`:** the cause is now named in `README.md`, the 07-21 expansion audit,
`DECISION_LOG.md`, and in `runner-smoke.yml` itself, with the standing rule: *dispatch the
smoke test before editing any workflow file; if it fails, the problem is account-level.*

### 3.3 The cost of running without a gate

Two defects had reached the canonical branch during the CI outage, both fixed in `c756802`:

1. **The branch did not compile.** `src/fileCheckpointStore.ts` applied `as const` to a
   reference, which TypeScript rejects. Since `npm run start:mcp` runs `dist/`, a failed
   build meant the tunnel entry point could only run stale output.
2. **A prompt-injection guard missed its most common phrasing.** The pattern required a
   qualifier — `/ignore (all|any|the|your) previous instructions/` — so `ignore all previous
   instructions` matched but the bare `ignore previous instructions` did not, and reached
   `BrowserSemanticGateway.execute` as ordinary page text. The call path was correct; only
   the regex was too narrow.

The second is the more instructive one. The test asserting the correct behaviour already
existed and was failing. **It was not a broken test; it was a broken implementation with a
correct test.** The fix widened the pattern rather than relaxing the assertion.

### 3.4 A false blocker that cost two sessions

Two sessions recorded *".NET tests: not run because no .NET SDK is installed."* That was
wrong.

The machine has two .NET installations. `C:\Program Files\dotnet` is first on `PATH` and is
hostfxr-only with no SDK, so `dotnet --list-sdks` returns empty. The real SDK — **8.0.423** —
sits at `%USERPROFILE%\.dotnet`. Invoking that binary by full path runs the entire gate.

The .NET suite had never been run across two sessions of work, including commits that
changed TypeScript source, because everyone believed a shadowed `PATH` entry. It now passes
**29/29** with a clean `-warnaserror` Release build. Documented in `README.md` so it cannot
cost a third session.

### 3.5 Documentation that would have failed Phase 1 on a false positive

`src/server.ts` registered **27** MCP tools. `README.md`, `docs/ARCHITECTURE.md`, the tunnel
runbook, and the GitHub-phase audit all published a **12**-tool list, and three of them
asserted "one authoritative execution tool."

This mattered concretely. `CODEX_HANDOFF.md` Phase 9 requires the discovered tool list to
match the reviewed surface, Phase 10 requires that only reviewed tools are discovered, and
an unexpected discovered tool is a documented **stop condition**. A validator following those
documents would have halted Phase 1 on a documentation error rather than a safety problem.

Fixed across `70cfbf3` and `4e47845`, and a regression test now discovers the tools over a
real MCP client and asserts each document matches.

### 3.6 The coordinator was exposed to every pilot by default

`composeServer` called `registerCoordinatorMcpTools` **unconditionally**. Every connected
pilot discovered all 27 tools, including 14 coordinator tools that are `in_progress` with no
CI and no interactive evidence.

**Fixed in `4e47845`** with `EXOSUIT_MCP_SURFACE`:

| Value | Surface |
|---|---|
| unset or `core` (**default**) | 13 desktop-core tools |
| `full` | 27 tools, adds the coordinator |
| anything else | throws at startup |

The default is `core` because the safe state must be the one reached by *forgetting*.
Defaulting to `full` would have preserved exactly the exposure the flag exists to remove.

### 3.7 Phase 2's gate was 10/13 and nobody knew

An audit of Phase 2's thirteen required GitHub tests found ten covered and three not:

- **failed verification blocks dependent steps** — the existing test ran a *single* step
  (`steps: [base.steps[0]!]`), so it proved a step fails without verification but never that
  dependents halt. This is Execution invariant 4, a core safety property, unproven.
- **three windows observed concurrently** — every test used one window.
- **crash/restart resume from a verified checkpoint** — only the *uncertain external effect*
  path was covered, never the clean restart-hydrate-resume path.

All three written in `faf9dc0`; all three passed first run, so no defect was found — they
prove behaviour that existed but was unproven. The gate is now **13/13**.

### 3.8 Performance: measured, partially fixed, honestly reported

A benchmark harness (`npm run benchmark`) established the Phase 10 baseline the roadmap
requires. Latencies are sub-millisecond at p50 — except the scheduler.

**The workflow scheduler is superlinear in step count.** With a no-op executor: 9.7 ms at 10
steps, 172.3 ms at 50, **1023.6 ms at 100**. Ten times the steps cost roughly a hundred times
the time.

CPU profiling attributed **64.6%** of self-time to `structuredClone`. `runUntilBlocked` deep-
copied the entire workflow every iteration via `get()`, cloned every ready step via
`readySteps()`, and discarded another full clone returned by `runNext()`. None of this was a
bug — the clones are deliberate defensive copying so callers cannot mutate internal state.
The defect was applying that guarantee to *internal* callers who do not need it.

`bfc2be5` moved internal scheduling onto the live record while keeping every public accessor
cloning. Result: 100 steps went 1023.6 ms → **847.7 ms**, and `structuredClone` fell to 50.8%.

**This is a constant-factor win, not a complexity fix, and the commit says so.** The scheduler
is still O(n²). The remaining dominant cost is `#saveCheckpoint`, which clones the workflow
and hands it to a store that re-parses and serialises it, once per step — O(n) per step by
construction.

`69f562d` then bounded the exposure: `maximumWorkflowSteps`, default **100**, derived from
that curve rather than chosen for roundness, enforced at creation.

### 3.9 Security review of the 74 ungated commits

Requested explicitly. **One high finding and one medium, both fixed. No critical.**

**High — a global stop did not durably stop an unreachable agent (`8a1e1c7`).**
`AgentRegistry.stopAll()` skipped agents marked `offline`. But `offline` means *contact was
lost*, not *the agent halted* — it equally describes a partition, a suspended VM, or a hung
host, any of which may still be driving a real desktop with physical input armed. Because the
skipped agent stayed `offline` rather than `stopped`, and `heartbeat()` only refuses agents
already `stopped`, a reconnecting agent walked back to `online` and became selectable for
work. Demonstrated end to end.

Two `stopAll` implementations existed with different semantics; the durable path exposed the
weaker one **and persisted it across a supervisor restart**.

**Medium — support bundles could carry arbitrary private content (`ff1a438`).**
`recentErrorCodes` was typed as free text up to 200 characters, screened only by a denylist
for credential shapes. A denylist cannot express "no prose": it catches `Bearer …` but not a
file path with a username, a window title with a patient name, or a URL with an email. All
three were accepted **and passed `verifySupportBundle`**. Fixed with an allowlist —
`/^[A-Za-z0-9_.-]{1,64}$/` — because rejecting spaces is what does the work.

**Residual closed afterwards (`cad2c75`):** heartbeats were unauthenticated while
registration was signed, and heartbeats restate capabilities, which `select()` routes work
by. Heartbeats are now signed on the same verification path, with **domain separation** —
a concern the review itself had not named.

**Found sound, no findings:** `encryptedCheckpointStore` (AES-256-GCM, per-save IV, AAD
identity binding, `0o600`, `wx`, `sha256` paths), `agentChannelAuth` (HMAC-SHA256,
`timingSafeEqual` with length guard, replay nonce recorded only after signature verifies),
`skills` (Ed25519 via `sign(null, …)`, which structurally rules out algorithm confusion),
`visualPrivacy` (off by default, then approval + indicator + lease + bounds + frame budget).

### 3.10 Mutation testing caught two of my own worthless tests

Twice, a test that looked correct and passed was proven to verify nothing:

1. The **dependent-blocking** test needed a mutation to confirm it was load-bearing. The first
   mutation attempt patched the *wrong* occurrence of a duplicated string, the suite stayed
   green, and that nearly read as "the test does not matter." Verifying a mutation landed
   requires grepping the specific line, not reading `git diff --stat`.
2. The **domain-separation** tests passed with the domain separator entirely removed, because
   the registration and heartbeat schemas differ structurally and never canonicalize alike —
   *exactly the accident my own comment said the guarantee must not rest on.* Replaced with a
   test that pins the wire format directly against an independent reimplementation of the
   canonicalizer.

**Take this seriously: a passing test is not evidence until you have seen it fail.**

---

## 4. The current problem, precisely

### Hosted CI is blocked by GitHub account billing

Every job fails before checkout with the payment/spending-limit annotation. Confirmed across
nine dispatches over two days, including the minimal smoke test.

**This is not a repository problem and no code change can fix it.** It requires the account
owner in GitHub Billing & plans: clear any failed payment, and raise the Actions spending
limit above $0 — those are *two separate settings*, and a valid card with a $0 limit still
blocks everything on a private repository.

Cost context, since it drove the decision: published rates are $0.008/min Linux and
$0.016/min Windows, with Windows counting **double** against the free allowance. Estimated
~$0.20 per full run — likely a few dollars a month.

**A contributing cause was found and fixed (`35ab90d`).** Both workflows triggered on `push`
to `build/**` *and* on `pull_request`. Since PR #1 originates from that branch, every push
fired **four** runs for one commit — identical work, billed twice. Verified empirically:
`cad2c75` produced 4 runs, `35ab90d` produced 2. Future consumption is halved.

### The owner has declined to fix billing for now

That is a legitimate choice, and the work has continued without it. What follows is what was
built to make that choice survivable.

---

## 5. What was built to work around it

### `npm run validate:ci-parity` — local CI parity

Runs all five hosted jobs locally. **12/12 passing.** `npm run validate` already covered part
of this; the three real gaps were the npm audit, the NuGet audit, and the Release
`-warnaserror` build — precisely the checks nobody could run locally.

The npm audit resolves into a **temporary directory** because CI runs `npm install` on a clean
checkout and this repository commits no lockfile. That distinction is not academic: a stale
local `node_modules` reported one high and two moderate advisories that a fresh resolve does
not have.

### `--clean` mode and the pre-push hook

`--clean` creates a detached `git worktree` at HEAD, runs the matrix there, and removes it. A
worktree holds exactly the committed content — no untracked files, no `node_modules`.

`.githooks/pre-push` (install with `npm run hooks:install`) runs the clean matrix and refuses
the push on failure. **Both paths were verified**: stubbed to fail, the push was rejected;
with the real hook, 12/12 then push succeeded. Bypass is `git push --no-verify` or
`EXOSUIT_SKIP_PREPUSH=1`, both documented in the hook.

Timing: ~100 s working tree, ~111 s clean. Clean is used because a push publishes committed
content, so that is what should be validated.

### `.github/workflows/ci-selfhosted.yml` and a staged runner

`ci.yml` targets `ubuntu-latest` and `windows-latest`; a self-hosted runner matches **neither**
label, so registering one alone would achieve nothing. That workflow mirrors all five jobs
against `[self-hosted, exosuit-local]`, `workflow_dispatch` only.

The runner package is downloaded to `C:\Users\Aidan\actions-runner`, **SHA256-verified against
GitHub's published hash**, and extracted — deliberately outside OneDrive so sync cannot
corrupt `_work`. It is **not registered**: executing `config.cmd` was blocked by the assistant
permission layer, not by billing.

### What local parity does and does not give you

| Property | Hosted | Local now |
|---|---|---|
| Runs automatically | yes | **yes**, pre-push hook |
| Clean checkout | yes | **yes**, `--clean` |
| Independent environment | yes | partly |
| Linux **and** Windows | yes | Windows only |
| Third-party attestation | yes | no, inherently |

---

## 6. Open decisions for whoever takes this on

### 6.1 The `github_validated` definition — decide this first, it is free

The roadmap defines `github_validated` as requiring "CI and supported security checks to
pass." That wording says **CI**, not **GitHub Actions**, and the roadmap is the owner's
document.

Two consistent positions: amend the definition to name the clean parity matrix and state
plainly that it is not independently attested; or leave it and accept that nothing promotes
until runners return.

**What must not happen** is keeping the current wording while quietly treating local runs as
satisfying it. That is the evidence-class laundering this repository's discipline exists to
prevent.

### 6.2 The disposable environment — this is the real blocker

Phase 1 acceptance and Phase 2's six interactive tests both need a disposable Windows
environment. Nothing local substitutes for it, and it is why evidence sits at ~25%.

**Important finding:** `docs/qa/CODEX_WINDOWS_ACCEPTANCE.md` records a *Windows Sandbox Phase 7
motor acceptance* on 2026-07-18 — four approved physical-input actions and a real
emergency-stop interruption. **The disposable environment already worked ten days ago.**

But as of 2026-07-28 this machine reports `VirtualizationFirmwareEnabled: False`, meaning
hardware virtualization appears disabled in BIOS/UEFI, and Hyper-V, Windows Sandbox, and
`VirtualMachinePlatform` all read `NotPresent` (though that query needs elevation to be
reliable). Either virtualization was disabled since, or that evidence came from other
hardware.

**Check this first.** Phase 1 may be one firmware toggle away rather than an evening of VM
setup. Windows Sandbox — not Hyper-V — is the right tool: it ships with Win11 Pro, is
purpose-built as a disposable VM, and wipes itself on close.

### 6.3 Persistence contract — needed to make the scheduler linear

Two options, both changing persistence behaviour and therefore both subject to the roadmap's
change-control rule (decision-log entry, threat-model update, test-plan update, rollback plan,
owner review):

1. incremental or delta checkpointing instead of writing the full record every step,
2. dropping the defensive clone in `#saveCheckpoint` and requiring `WorkflowCheckpointStore`
   implementations not to retain the passed record.

Option 2 appears safe against all three built-in stores, which zod-parse and serialise
immediately, but `WorkflowCheckpointStore` is an exported interface.

**Explicitly rejected:** reducing checkpoint frequency. Checkpoint-per-step is what makes
"resume from last verified checkpoint" meaningful, and Phase 9 requires crash-before, during,
and after coverage. That would trade a durability guarantee for a benchmark number.

### 6.4 Remaining security residuals

- **Browser-companion timeouts surface as `failed`, not `uncertain`.** `withTimeout` races a
  promise but cannot cancel the underlying operation, so a timed-out browser action may still
  have executed. The recovery rule says never assume a timed-out external action did not
  occur, and `workflowRuntime` already models `uncertain`. Fix when browser actions enter
  workflows.
- **GCM 96-bit IV bound** (~2³² messages per key) belongs in the Phase 12 threat model.
- **Skew check runs before signature verification** in `agentChannelAuth` — a minor oracle.

---

## 7. Environment gotchas that will waste your time

1. **`dotnet` on `PATH` is a decoy.** Use `%USERPROFILE%\.dotnet\dotnet.exe`. Cost: two
   sessions.
2. **`git fetch` before trusting local state.** The local branch was 74 commits behind at
   session start. Cost: hours of redone analysis.
3. **OneDrive intermittently locks `.git`.** `git worktree prune` can fail with *Permission
   denied*. The parity runner now prunes at the start and treats end-of-run cleanup as
   best-effort (`00308bb`).
4. **Node on Windows will not spawn `.cmd` shims without a shell.** Every npm step in the
   parity runner failed silently with empty output until `shell: true` was set for `.cmd`.
5. **Markdown backticks inside a shell heredoc get evaluated as command substitution.** This
   corrupted a document mid-session and created two empty files, `offline` and `online`,
   which were committed by `git add -A` and removed in `598a563`. Use file-based commit
   messages and the editor for documents.
6. **No lockfile is committed, deliberately.** CI resolves fresh. `npm install` will *not*
   upgrade already-installed packages that still satisfy their range, so a local tree can lag
   what CI resolves — which is exactly what produced the phantom advisories.

---

## 8. Verification commands

```bash
npm run validate:ci-parity          # all five hosted jobs locally, ~100 s
npm run validate:ci-parity:clean    # same, against a clean checkout of HEAD, ~111 s
npm run benchmark                   # Phase 10 baseline
npm run hooks:install               # activate the pre-push gate
```

```powershell
& "$env:USERPROFILE\.dotnet\dotnet.exe" test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release
```

**Current state:** 165 TypeScript tests, 29 .NET tests, CI parity 12/12, clean tree, `00308bb`
pushed.

---

## 9. If you do only three things

1. **Check BIOS virtualization**, then enable Windows Sandbox. It already worked on
   2026-07-18; this may be one toggle from unblocking Phase 1 and Phase 2's interactive gate,
   which is where ~35 percentage points of missing evidence live.
2. **Settle the `github_validated` wording.** Five minutes, free, and it converts work already
   done into evidence that can honestly be cited.
3. **Either fix billing or register the staged runner.** Both restore an automatic
   independent gate. Its absence is what let a broken build and a prompt-injection hole reach
   the canonical branch.

Everything else in this document is either already done or genuinely lower value than those
three.
