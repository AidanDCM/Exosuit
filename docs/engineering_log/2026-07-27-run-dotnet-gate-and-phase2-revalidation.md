# Engineering Log — Run the .NET Gate, Re-validate the Fake-Provider Chain, Reconcile Roadmap Status

**Date:** 2026-07-27
**Branch:** `build/exosuit-mvp`
**Starting commit:** `6c1f7ef` (docs: identify hosted CI blockage as account billing)
**Evidence class:** local TypeScript and .NET validation, plus a fake-provider runtime run; no Windows-provider, physical-input, ChatGPT, or hosted-CI evidence

## Goal

Close every gap reachable without owner action or a disposable environment:

1. run the .NET gate that `AGENTS.md` requires and that two prior sessions recorded as impossible,
2. re-validate the fake-provider chain on the current head after the coordinator expansion,
3. correct the false evidence records those prior sessions left,
4. reconcile roadmap phase statuses with what the branch actually implements.

## Finding 1 — the .NET SDK was installed the whole time

Two sessions recorded ".NET tests: not run because no .NET SDK is installed." That conclusion was wrong.

The machine carries two .NET installations:

- `C:\Program Files\dotnet\dotnet.exe` — first on `PATH`, hostfxr only, **no SDK**,
- `%USERPROFILE%\.dotnet\dotnet.exe` — **SDK 8.0.423** plus ASP.NET Core, .NET, and Windows Desktop runtimes at 8.0.29.

`dotnet --list-sdks` resolved to the Program Files install and returned empty, so the SDK appeared absent while being installed and usable. Invoking the user-local binary by full path ran the entire gate with no installation and no configuration change.

This is why `AGENTS.md`'s required `dotnet test` had never run across two sessions of work, including two commits that changed TypeScript source. The gate has now been run and passes.

## Finding 2 — the fake-provider chain still behaves correctly

Full results are in `docs/qa/evidence/2026-07-27-fake-provider-revalidation.md`. All fourteen checks passed: loopback-only binding, 401 on missing and wrong tokens, correct sandbox status, observation, proposal, execution with passed verification, physical-input denial in sandbox, audit chain validity before and after stop, emergency stop, post-stop mutation denial, and absence of the agent token from the audit API, the process log, and the persisted ledger.

This is a regression check, not new Phase 1 coverage, and the evidence document says so explicitly.

## Finding 3 — roadmap statuses contradicted the branch

The roadmap described the coordinator, virtual-desktop, and multi-agent phases as `planned` and **not implemented** while the branch contained working implementations of those phases plus browser, skills, reliability, and performance foundations.

Phases 1, 2, 3, 4, 5, 7, 9, and 10 are now `in_progress`, which the roadmap's own vocabulary defines as implementation existing on a branch with incomplete evidence. Each carries an implementation note naming the modules and stating explicitly that its promotion gate is **not** met.

Nothing was promoted to `github_validated`. Nothing can be while hosted CI is blocked, because that state requires CI and supported security checks.

Phase 6 was deliberately left at `proposed` even though `src/visualPrivacy.ts` exists, with a note that the module is a disabled synthetic-only foundation, that no capture is implemented, and that the critical privacy audit remains a hard precondition. Promoting it would risk reading as progress toward enabling screenshots.

## Files changed

- `docs/MASTER_SYSTEM_ROADMAP.md` — promotion-status block, reconciliation note, and per-phase statuses for 1, 2, 3, 4, 5, 6, 7, 9, 10.
- `README.md` — a section on the shadowed `dotnet` install.
- `docs/engineering_log/2026-07-22-close-phase-zero-governance.md` — correction note.
- `docs/engineering_log/2026-07-27-reconcile-mcp-tool-surface.md` — correction note.
- `docs/engineering_log/2026-07-27-fix-build-and-injection-guard.md` — correction note and .NET results.
- `docs/qa/evidence/2026-07-27-fake-provider-revalidation.md` (new).
- `docs/engineering_log/2026-07-27-run-dotnet-gate-and-phase2-revalidation.md`.

No file under `src/` or `apps/` was modified.

## Parts & Pieces and donor patterns considered

- Applied the evidence-discipline rule that one class must never be upgraded into another. The fake-provider run is labeled a regression check; it does not advance Phase 1, and the evidence document lists what it does not prove.
- Applied the correction pattern already used in this branch: prior engineering logs received dated correction notes rather than rewrites, so the original wrong conclusion stays visible alongside the correction.
- Applied safety asymmetry to Phase 6 by declining to raise its status, because the accurate lower label is also the safer one.
- Rejected quoting the 153 ms emergency-stop round trip as latency. It is an external `curl` measurement and would misrepresent the 8.06 ms internal figure already recorded.
- Rejected changing `PATH` or installing anything. The SDK was already present; the correct fix was documentation so the next session does not lose the same time.
- No donor code was copied, ported, or adapted.

## Tests added or updated

None. This slice changes documentation only. The .NET and TypeScript suites were run unchanged.

## Commands actually run

```text
"$USERPROFILE/.dotnet/dotnet.exe" --list-sdks
"$USERPROFILE/.dotnet/dotnet.exe" restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
"$USERPROFILE/.dotnet/dotnet.exe" build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore -warnaserror
"$USERPROFILE/.dotnet/dotnet.exe" test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
"$USERPROFILE/.dotnet/dotnet.exe" run --project apps/windows-agent/Exosuit.Agent.csproj --configuration Release   # fake provider
npm run validate:typescript
```

Plus the fourteen `curl` checks recorded in the evidence document.

## Results

- .NET restore: passed.
- .NET build, Release, `-warnaserror`: passed, **0 warnings, 0 errors**.
- .NET tests: **29 passed, 0 failed**.
- TypeScript typecheck, build, tests (135 passed, 30 files), pulse, and repository validator (34 artifacts): all passed.
- Fake-provider runtime: 14 of 14 checks passed.
- Agent process terminated and port 43117 confirmed released.
- Hosted CI: still blocked by account billing. No hosted evidence was produced or claimed.

## Assumptions and unvalidated areas

- The .NET result reflects this workstation only. CI parity was approximated with the same `-warnaserror` Release flags the workflow uses, but `--collect:"XPlat Code Coverage"` was not run and no TRX artifact was captured.
- The fake-provider run used the default composition. It did not exercise the coordinator, supervisor, virtual-desktop, browser, skill, or performance surfaces, which hold unit coverage only.
- The run happened on a developer workstation, not a disposable VM, and therefore carries no weight toward the Phase 1 environment requirement. It was safe because the fake provider touches no real desktop state.
- Phase status assignments were derived from module presence plus passing local tests. Each phase's deliverable list was **not** audited item by item, so `in_progress` means implementation exists, not that every listed deliverable is complete.
- Audit tamper detection was not re-tested in this run. It is covered by the existing .NET suite.

## Security impact

No runtime capability, permission, network binding, provider, action, approval requirement, audit behavior, or feature gate changed. No source file changed.

The fake-provider run positively confirmed several safety behaviors on the current head rather than assuming them: loopback-only binding, token enforcement, physical-input denial outside full control, emergency-stop lockout, audit chain integrity, and absence of the token from all three output surfaces.

The roadmap correction reduces a governance risk. A plan that described implemented, unvalidated subsystems as "not implemented" understated how much unvalidated capability sits on the branch. The corrected statuses make the gap between implementation and evidence explicit at every phase.

The token used for the run was generated locally, never printed, never written inside the repository, and its absence from the audit ledger and process log was verified rather than assumed.

## Rollback or disable path

Revert this commit. Documentation returns to the prior statuses and correction notes disappear. No runtime rollback and no restart are required, because no executable component changed.

## Next recommended slice

Remaining work is gated on owner action, in this order:

1. **Billing.** Resolve the GitHub billing state, dispatch `runner-smoke.yml`, then re-run Exosuit CI and Security Audit. Until then no phase can reach `github_validated`, regardless of how much local evidence accumulates.
2. **Phase 1 environment.** Provision the disposable Windows VM or dedicated account. The .NET blocker is gone; the environment requirement is the only remaining one.
3. **Scoping decision.** Decide whether Phase 1 acceptance should present the desktop core alone. `src/server.ts` registers the coordinator surface unconditionally, so a tunnel session currently exposes all twenty-seven tools. If the answer is yes, that needs a composition flag in `src/server.ts`, not a documentation change.
4. **Ordering decision.** Phases 2 through 10 were built ahead of Phase 1 acceptance. The roadmap now records that as fact. Whether to continue in that order, or to stop and complete Phase 1 first, is an owner call with real consequences for how much unvalidated capability accumulates.
