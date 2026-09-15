# Classify ambiguous browser actions as uncertain

**Timestamp:** 2026-07-28
**Subsystem ownership:** optional Glove browser companion
**Evidence level:** TypeScript unit/integration, fake system pulses, and .NET regression

## Goal

Prevent blind retries after a browser action times out, loses its result, lacks independent verification, or navigates during execution.

## Files changed

- `src/browserCompanion.ts`
- `src/browserCompanionGuard.ts`
- `tests/browserCompanion.test.ts`
- `tests/browserCompanionGuard.test.ts`
- `docs/SECURITY_MODEL.md`
- `docs/TEST_PLAN.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-28_BROWSER_UNCERTAIN_EFFECTS.md`
- `docs/engineering_log/HANDOFF.md`
- this log

## Parts & Pieces patterns

Reconciliation, expected-result verification, generation identity, bounded timeout, no-blind-retry, and evidence-source guard patterns were applied. Deterministic policy denials remain distinct from post-dispatch uncertainty.

## Tests added or updated

- action timeout returns `uncertain`; observation timeout still rejects;
- higher tab generation returns `uncertain`;
- uncertain navigated snapshots do not become fresh registry state;
- unverified success returns `uncertain` in guard and gateway;
- provider exception after dispatch returns `uncertain`;
- exact matching passed result still succeeds;
- wrong action/tab identity still fails closed.

## Commands and results

```powershell
npm run typecheck
npx vitest run tests/browserCompanion.test.ts tests/browserCompanionGuard.test.ts --reporter=verbose
npm run validate:typescript
& "$env:USERPROFILE\.dotnet\dotnet.exe" restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
& "$env:USERPROFILE\.dotnet\dotnet.exe" build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore -warnaserror
& "$env:USERPROFILE\.dotnet\dotnet.exe" test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

The first typecheck caught a fixture edit placed in `observe` instead of `execute`; no runtime assertion ran. After relocating the fixture:

- focused browser suites: 10/10 passed;
- repository, master-plan, and Field validators: passed;
- TypeScript typecheck/build: passed;
- full TypeScript suite: 56 files, 284/284 tests passed;
- Glove and Field system pulses: passed;
- .NET restore and Release warnings-as-errors build: passed with 0 warnings and 0 errors;
- .NET tests: 44/44 passed.

## Security impact

Strengthens no-blind-retry behavior and prevents navigation or transport ambiguity from being misrepresented as success or ordinary failure. No origin, target, action, or execution permission is added.

## Assumptions and unvalidated areas

The browser companion is not integrated into a production workflow. End-to-end reconciliation and real provider cancellation remain unproven.

## Rollback

Revert this commit or leave the optional companion disabled; core desktop execution is independent.

## Next recommended slice

Refresh the production-readiness manifest and consolidated handoff against the exact evidence commits, while retaining production denial and owner-only gates.
