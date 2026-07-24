# Field development auto-login

## Goal

Remove repeated owner credential prompts from isolated disposable development Fields without weakening production release requirements.

## Files changed

- `src/fieldProvisioningPlan.ts`
- `scripts/windows/Invoke-ExosuitFieldProvisioning.ps1`
- `scripts/windows/Initialize-ExosuitDevelopmentAccess.ps1`
- `scripts/windows/Start-ExosuitFieldGuest.ps1`
- `scripts/validate-production-readiness.mjs`
- related tests, production manifest, runbook, Level 4 audit, and this log

## Parts & Pieces and donor patterns considered

A blank password was rejected because Windows restricts blank-password remote/PowerShell Direct use and it would not provide reliable automation. The selected development-only design creates a standard local account from an explicit signed plan field, stores a generated password in Windows LSA private data for automatic login, removes the guest seed copy after configuration, and reboots once. The host retains its generated credential only under the local secret root.

Development access requires isolated networking, forbids personal-state attachment, requires an explicit provisioning switch, refuses to modify an existing account, and is visibly marked non-production. Hyper-V Time Synchronization is now enabled during normal provisioning.

## Tests added or updated

- Plan schema accepts the exact isolated development mode.
- Plan schema rejects development access with filtered NAT or personal state.
- Production validation rejects an otherwise complete candidate when development access is enabled.
- Windows script tests assert the explicit switch, LSA secret storage, standard-user posture, and time synchronization.
- PowerShell parser validation passed.

## Commands actually run

- focused Vitest plan, production-validator, and Windows-script suites
- TypeScript typecheck
- PowerShell parser validation
- complete validation matrix recorded before commit

## Results

The focused suite passed 16 tests, all changed PowerShell scripts parsed successfully, and the complete matrix passed: typecheck, build, 239 TypeScript tests, 44 .NET tests, and both system pulses.

## Assumptions and unvalidated areas

The LSA-backed auto-login path still requires a live disposable guest proof. Deleting the temporary guest password file does not prove forensic erasure from a differencing VHD, so development overlays must remain disposable and must never contain personal state.

## Security impact

This intentionally weakens interactive login for explicitly labeled development guests only. It does not create an administrator, does not enable networking, and cannot pass the production validator. No generated password is logged or committed.

## Rollback or disable path

Omit `developmentAccess` from the plan and omit the `-DevelopmentAccess` host switch. Destroy the disposable development generation. Production validation requires `developmentAccessEnabled` to be exactly `false`.

## Next recommended slice

Build a reviewed base containing the initializer and live-prove unattended boot, PowerShell Direct authentication, readiness, and disposable destruction.
