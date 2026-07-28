# Require a focused physical-text target

## Goal

Restore the intended deny-by-default boundary for physical text input by requiring the freshly resolved target element to have keyboard focus before local confirmation can be requested.

## Files changed

- `apps/windows-agent/SafetyPolicy.cs`
- `docs/engineering_log/2026-07-17-require-focused-physical-text-target.md`

## Parts & Pieces and donor patterns considered

The existing Exosuit policy gateway, fresh-state recheck, and fail-closed patterns were retained. No donor code was needed for this one-condition policy correction.

## Tests

The existing regression test `PhysicalTextInputRequiresFreshFocusedField` covers the failing boundary. No test expectation was weakened or rewritten.

Required verification commands:

```text
npm run typecheck
npm test
npm run build
npm run test:pulse
dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release -warnaserror
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

## Results

- `npm run typecheck`: passed.
- `npm test -- --reporter=verbose`: passed, 34 tests across 6 files.
- `npm run build`: passed.
- `npm run test:pulse -- --reporter=verbose`: passed, 1 system-pulse test.
- .NET 8.0.423 restore: passed.
- .NET Release build with warnings as errors: passed with 0 warnings and 0 errors.
- .NET Release tests: passed, 26 of 26 tests including `PhysicalTextInputRequiresFreshFocusedField`.
- GitHub-hosted Windows CI remains required as independent hosted-run evidence.

## Assumptions and unvalidated areas

- `UiElement.Focused` reflects the fresh provider observation supplied to the policy evaluation.
- This change does not prove live UI Automation focus behavior or physical keyboard behavior; those remain part of isolated Windows acceptance.

## Security impact

Security is tightened: an enabled and visible but unfocused field is now blocked before approval. The model and MCP surface cannot bypass this check.

## Rollback or disable path

Revert this slice to restore the previous policy. Physical input also remains independently disableable through the restart-only local configuration and emergency stop.

## Next recommended slice

After hosted CI is green, complete the isolated Windows acceptance matrix for focused and unfocused physical text targets before promoting live capability.
