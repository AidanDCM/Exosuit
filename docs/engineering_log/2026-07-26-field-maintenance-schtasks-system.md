# Field maintenance SYSTEM task creation

## Goal

Replace the raw Task Scheduler XML rejected by the live Windows Audit Mode image with the supported `schtasks /RU SYSTEM` path while preserving the exact one-use action, independent SYSTEM check, bounded diagnostics, and fail-closed promotion contract.

## Files changed

- `scripts/windows/Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/qa/ATOMIC_AUDIT_2026-07-26_FIELD_MAINTENANCE_PRINCIPAL.md`
- `docs/engineering_log/2026-07-26-field-maintenance-schtasks-system.md`

## Parts & Pieces and donor patterns considered

Microsoft's documented `schtasks /Create /RU SYSTEM` mechanism was selected after live evidence rejected raw `LogonType:ServiceAccount` XML. The existing fixed action, on-demand start, exact registered SID/action validation, maintenance-side `S-1-5-18` check, expiring authorization, digest binding, detached network, one-use cleanup, receipt, and host verification remain unchanged. A boot trigger is used only to satisfy task creation syntax; the task is created after the current boot, started explicitly, and must remove itself before image promotion.

## Tests added or updated

The script contract now requires `/RU SYSTEM`, highest run level, a fixed action, explicit on-demand start, registered SYSTEM SID validation, and preserved diagnostics.

## Commands actually run

```text
PowerShell parser over Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1
npx vitest run tests/windowsFieldScripts.test.ts --reporter=verbose
npm run typecheck
npm test
npm run build
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
npm run test:pulse -- --reporter=verbose
npm run test:field-pulse -- --reporter=verbose
```

## Results

The rejected live attempt recorded `HRESULT 0x80041318` at `LogonType:ServiceAccount`, no scheduled task, no maintenance stage, no receipt, retained authorization, host timeout, and no immutable v12 target. The replacement script parses, all 6 focused Field script tests pass, all 240 TypeScript tests pass, typecheck and build pass, all 44 .NET tests pass, and both system pulses pass.

## Assumptions and unvalidated areas

The Windows image accepts its native `/RU SYSTEM` task creation path and permits on-demand execution during Audit Mode. Live SYSTEM execution, maintenance completion, Sysprep shutdown, receipt verification, and v12 promotion remain unvalidated.

## Security impact

Authority is not broadened. The task remains local to a network-detached staging VM, fixed to the reviewed script, bound to expiring host authorization and digests, and independently rejected unless the script runs as `S-1-5-18`. No password, remote listener, or model-controlled command is introduced.

## Rollback or disable path

Do not inject the maintenance authorization or answer file. Stop and remove only the exact v12 maintenance VM and staging disk after verifying its binding. Revert this slice to restore the rejected XML path; immutable v10 remains untouched.

## Next recommended slice

Run focused and mandatory validators, commit one reviewable slice, execute exact-head L0, then make one isolated live v12 attempt under the recovery mutex.
