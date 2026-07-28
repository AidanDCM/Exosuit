# Preserve native SYSTEM task principal

## Goal

Preserve the valid native `/RU SYSTEM` registration after live evidence proved `Set-ScheduledTask` rewrites its effective logon type to `InteractiveToken` on the Audit Mode image.

## Files changed

- `scripts/windows/Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/qa/ATOMIC_AUDIT_2026-07-26_FIELD_MAINTENANCE_PRINCIPAL.md`
- `docs/engineering_log/2026-07-26-preserve-schtasks-system-principal.md`

## Parts & Pieces and donor patterns considered

The native `schtasks /RU SYSTEM` creation and on-demand run, exact registered SID/action validation, immediate return from `auditUser`, independent maintenance-side SYSTEM check, expiring authorization, digest binding, network detachment, receipt, and host verification remain. Re-registering task settings through the ScheduledTasks CIM cmdlets was removed because it changed the live principal. No service, password, remote channel, or broader action was introduced.

## Tests added or updated

The script contract now explicitly forbids `Set-ScheduledTask` in this bootstrap while retaining native SYSTEM creation, dispatch, registered SID/action checks, and bounded status.

## Commands actually run

```text
PowerShell parser over Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1
npx vitest run tests/windowsFieldScripts.test.ts --reporter=verbose
npm run typecheck
```

## Results

The preceding live attempt proved `auditUser` returned in 18 seconds, the immediate status reported `SYSTEM`/`ServiceAccount` and `Queued`, but the offline exported task showed `InteractiveToken` after `Set-ScheduledTask`; no maintenance stage, receipt, or target existed. The replacement script parses, all 6 focused Field script tests pass, and typecheck passes. Complete exact-head L0 remains pending until after commit.

## Assumptions and unvalidated areas

An untouched native `/RU SYSTEM` registration remains a service-account task after the bootstrap returns and its accepted on-demand request executes. Live execution, maintenance stages, Sysprep shutdown, receipt validation, and promotion remain unvalidated.

## Security impact

Authority is unchanged. Removing the re-registration preserves the intended least-scoped built-in SYSTEM identity; the task action remains fixed, one-use, time/digest-bound, and isolated. Host promotion still fails closed without the matching offline receipt.

## Rollback or disable path

Do not inject authorization or the answer file. Stop and remove only the exact v12 maintenance VM and staging disk after verifying binding. Revert this slice to restore the principal-mutating settings rewrite. Immutable v10 remains untouched.

## Next recommended slice

Run focused validation, commit, execute complete exact-head L0, and make one isolated live v12 attempt under the recovery mutex.
