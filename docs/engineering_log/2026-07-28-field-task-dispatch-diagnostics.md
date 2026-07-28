# Field task dispatch diagnostics

## Goal

Distinguish a stale bootstrap report caused by absent task dispatch from one caused by a pre-report launcher failure, without reading guest log contents or unrelated Windows events.

## Files changed

- `scripts/windows/Inspect-ExosuitFieldGuestOffline.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-28_FIELD_TASK_DISPATCH_DIAGNOSTICS.md`
- this log

## Parts & Pieces and donor patterns considered

This extends the canonical off-VM, read-only inspector. It uses the existing Task Scheduler operational log, task XML, and system-generated SetupComplete log as donor evidence, but projects only fixed metadata categories. Event messages, property payloads, matched excerpts, and raw setup text were rejected because they can contain paths, arguments, identities, or environment context.

## Tests added or updated

Static contract checks require exact-task filtering, task-state projection, and fixed SetupComplete classification while forbidding message, property, and raw setup-text projection. Existing checks continue to require an off VM, read-only mount, bounded Hyper-V calls, no VM mutation, and guaranteed dismount.

## Commands actually run

- PowerShell AST parse of `scripts/windows/Inspect-ExosuitFieldGuestOffline.ps1`
- `npm test -- --run tests/windowsFieldScripts.test.ts`
- `npm run typecheck`
- `npm test -- --reporter=verbose`
- `npm run build`
- `%USERPROFILE%\.dotnet\dotnet.exe test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --no-restore`
- `npm run test:pulse -- --reporter=verbose`
- `npm run test:field-pulse -- --reporter=verbose`

## Results

- PowerShell parse: passed;
- focused static tests: 8/8 passed;
- TypeScript typecheck and build: passed;
- full TypeScript suite: 314/314 passed;
- .NET suite: 45/45 passed;
- core and Field system pulses: 1/1 passed each.

## Assumptions and unvalidated areas

The Task Scheduler operational log may be disabled or may omit older events. An empty filtered result is therefore evidence of no retained matching event, not proof that dispatch never occurred. Unknown setup errors intentionally collapse to `unclassified_nonempty` and require a separately reviewed classifier update rather than exporting text.

## Security impact

The inspector exposes only task settings, exact-task event IDs/timestamps, and a fixed SetupComplete category. It adds no write, execution, guest credential, input, network, or permission capability.

## Rollback or disable path

Revert this slice or ignore the optional `taskEvents` object. Runtime behavior is unchanged.

## Next recommended slice

Validate and commit, rerun the canonical inspector against the off v13 overlay, and use the task metadata to choose a bounded repair.
