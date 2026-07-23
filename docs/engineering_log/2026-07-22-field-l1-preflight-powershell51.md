# Engineering Log - Field L1 Preflight PowerShell 5.1 Compatibility

**Date:** 2026-07-22
**Master-plan phase:** L1 preflight
**Subsystem ownership:** Field validation and Windows scripts
**Starting commit:** `14d0d520d90ff642bf72d43bb25c2024979351ca`

## Goal

Begin L1 proof with non-mutating Field provisioning preflight on the local Windows host and fix the script compatibility issue that prevented the plan resolver and dry-run apply from executing in Windows PowerShell 5.1.

## Files changed

- `scripts/windows/Show-ExosuitFieldProvisioningPlan.ps1`
- `scripts/windows/Invoke-ExosuitFieldProvisioning.ps1`
- `scripts/windows/Remove-ExosuitFieldGeneration.ps1`
- `scripts/windows/Initialize-ExosuitFieldGuest.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-22-field-l1-preflight-powershell51.md`

## Parts & Pieces and donor patterns considered

Reused the existing PowerShell script structure, strict mode, read-only validation order, and .NET `UTF8Encoding(false)` approach already present in the L0 validator. No donor code was copied.

## Tests added or updated

Updated the Windows script contract test to reject direct `ConvertFrom-Json -Depth` usage in scripts that must run on PowerShell 5.1 and to require no-BOM evidence writes through `[IO.File]::WriteAllText`.

## Commands actually run

- `scripts/windows/Test-ExosuitFieldHost.ps1`
- generated a TypeScript-contract Field plan under `artifacts/field-l1-preflight/20260723T011715Z/field-plan.json`
- `scripts/windows/Show-ExosuitFieldProvisioningPlan.ps1`
- `scripts/windows/Invoke-ExosuitFieldProvisioning.ps1`
- `npm test -- --run tests/windowsFieldScripts.test.ts`

## Results

The host capability check passed. The first L1 preflight attempt exposed that `ConvertFrom-Json -Depth` is unsupported in Windows PowerShell 5.1, causing the plan resolver and dry-run apply to fail before reaching the expected base-image registry checks. This slice adds compatibility helpers while preserving the same schema inputs and fail-closed behavior.

After the compatibility fix, the focused Windows script contract test passed. The non-mutating plan resolver and dry-run apply both reached the expected L1 blocker: `C:\ProgramData\Exosuit\Images\exosuit-field-base-v1.vhdx` is missing from the approved local host registry path. No Hyper-V VM was created.

## Assumptions and unvalidated areas

This does not create a VM or prove guest readiness. Live provisioning remains blocked until an approved immutable base VHDX, optional encrypted personal-state VHDX, matching local host registry, and a Hyper-V Private switch are present.

## Security impact

No new execution authority, network access, model control, recording, or host integration is introduced. The change only makes existing validation paths executable on the local PowerShell version. Unknown or missing Field assets still fail closed.

## Rollback or disable path

Revert this slice to restore the previous scripts. If compatibility behavior is suspect, keep live provisioning disabled and continue with plan-only review.

## Next recommended slice

Rerun L0 after this script compatibility change, then rerun L1 preflight. If it reaches the expected missing-base-image/private-switch blocker, create or register the approved Field base image and isolated switch before any `-Apply`.
