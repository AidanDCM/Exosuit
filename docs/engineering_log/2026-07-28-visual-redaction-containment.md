# Reject visual redactions outside the captured frame

**Timestamp:** 2026-07-28
**Subsystem ownership:** Glove visual privacy foundation
**Evidence level:** TypeScript unit/integration, fake system pulses, and .NET regression

## Goal

Prevent privacy evidence from counting a clamped partial or no-op redaction as successful treatment.

## Files changed

- `src/visualPrivacy.ts`
- `tests/visualPrivacy.test.ts`
- `docs/SECURITY_MODEL.md`
- `docs/TEST_PLAN.md`
- `docs/qa/2026-07-28-SECURITY-REVIEW-UNGATED-COMMITS.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-28_VISUAL_REDACTION_CONTAINMENT.md`
- this log

## Parts & Pieces patterns

Privacy guard, fail-closed validation, evidence-source guard, bounded region scope, and independent rollback were applied. The guard validates before copying sensitive frame bytes.

## Tests added

- partially out-of-frame redaction rejection;
- wholly out-of-frame redaction rejection;
- contained frame-local redaction under a nonzero desktop-origin consent;
- exact pixel and metadata-count verification.

## Commands and results

```powershell
npx vitest run tests/visualPrivacy.test.ts --reporter=verbose
npm run validate:typescript
& "$env:USERPROFILE\.dotnet\dotnet.exe" restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
& "$env:USERPROFILE\.dotnet\dotnet.exe" build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore -warnaserror
& "$env:USERPROFILE\.dotnet\dotnet.exe" test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

- focused visual privacy suite: 5/5 passed;
- repository, master-plan, and Field validators: passed;
- TypeScript typecheck/build: passed;
- full TypeScript suite: 56 files, 283/283 tests passed;
- Glove and Field system pulses: passed;
- .NET restore and Release warnings-as-errors build: passed with 0 warnings and 0 errors;
- .NET tests: 44/44 passed.

## Security and privacy impact

Strengthens redaction truthfulness and avoids an unnecessary source-byte copy on invalid input. It does not enable capture, persistence, model access, or execution.

## Assumptions and unvalidated areas

Redactions are frame-local while consent/capture regions are desktop-local. Live capture and protected-surface handling remain unimplemented and unapproved.

## Rollback

Revert this commit; visual capture remains disabled by default regardless.

## Next recommended slice

Represent browser action timeouts and mid-action navigation as uncertain external effects so workflows reconcile rather than retry blindly.
