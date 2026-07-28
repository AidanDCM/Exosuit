# Authenticate agent messages before semantic diagnostics

**Timestamp:** 2026-07-28
**Subsystem ownership:** shared Glove supervisor authentication
**Evidence level:** TypeScript unit/integration, fake system pulses, and .NET regression

## Goal

Close the security-review residual where unauthenticated schema-valid packets could distinguish clock-skew or registration-range diagnostics, while guaranteeing rejected authenticated messages do not consume replay state.

## Files changed

- `src/agentChannelAuth.ts`
- `tests/agentChannelAuth.test.ts`
- `docs/TEST_PLAN.md`
- `docs/qa/2026-07-28-SECURITY-REVIEW-UNGATED-COMMITS.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-28_AGENT_AUTH_ORDERING.md`
- this log

## Parts & Pieces patterns

Authentication gateway, replay guard, evidence-source guard, and negative mutation tests were applied. The message schema remains bounded before canonicalization; local authority and MCP surfaces are unchanged.

## Tests added

- tampered stale packet returns signature-invalid rather than clock-skew diagnostics;
- tampered invalid-range packet returns signature-invalid rather than semantic diagnostics;
- a correctly signed invalid range does not consume the nonce needed by a repaired registration.

## Commands and results

```powershell
npx vitest run tests/agentChannelAuth.test.ts --reporter=verbose
npm run validate:typescript
& "$env:USERPROFILE\.dotnet\dotnet.exe" restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
& "$env:USERPROFILE\.dotnet\dotnet.exe" build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore -warnaserror
& "$env:USERPROFILE\.dotnet\dotnet.exe" test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

- focused authentication suite: 11/11 passed;
- repository, master-plan, and Field validators: passed;
- TypeScript typecheck/build: passed;
- full TypeScript suite: 56 files, 282/282 tests passed;
- Glove and Field system pulses: passed;
- .NET restore and Release warnings-as-errors build: passed with 0 warnings and 0 errors;
- .NET tests: 44/44 passed.

## Security impact

Reduces an unauthenticated diagnostic oracle and makes replay-state mutation strictly post-authentication and post-semantics. No permission, execution, recording, networking, or Field administration capability is added.

## Assumptions and unvalidated areas

Strict schema failures remain observable. Live transport and key rotation remain outside this slice.

## Rollback

Revert this commit; no persisted format or external contract changes.

## Next recommended slice

Reject redaction regions that are not wholly contained by their approved visual frame so privacy evidence cannot count a no-op clamp as successful redaction.
