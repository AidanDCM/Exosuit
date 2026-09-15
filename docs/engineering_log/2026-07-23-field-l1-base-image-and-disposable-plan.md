# Field L1 base image and disposable-plan preflight

## Goal

Build and register an owner-approved immutable Windows evaluation base image, generate a disposable Field plan with no personal-state disk, and complete the non-mutating L1 resolver and dry-run gates.

## Files changed

- `.gitignore`
- `scripts/windows/Show-ExosuitFieldProvisioningPlan.ps1`
- `scripts/windows/Invoke-ExosuitFieldProvisioning.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-23-field-l1-base-image-and-disposable-plan.md`

Machine-local files and evidence were created outside version control:

- `vm/field-host-config.local.json`
- `C:\ProgramData\Exosuit\Images\exosuit-field-base-v1.vhdx`
- ignored evidence beneath `artifacts/field-l1-base-build/`, `artifacts/field-l1-source-media/`, and `artifacts/field-l1-live/`

## Parts & Pieces and donor patterns considered

- `docs/FIELD_WINDOWS_RUNBOOK.md` for L1 hard holds and operation order.
- `vm/field-host-config.example.json` for the local registry contract.
- `src/fieldProvisioningPlan.ts` and its tests for the supported no-personal-state plan shape.
- Existing PowerShell strict-mode and optional-property guards.
- Microsoft Evaluation Center media, UEFI/GPT Windows deployment conventions, Hyper-V differencing disks, and the repository's immutable-parent architecture.

## Tests added or updated

`tests/windowsFieldScripts.test.ts` now requires both provisioning scripts to guard the optional `personalState` property through `PSObject.Properties` and forbids the strict-mode-unsafe direct conditional.

## Commands actually run

- Downloaded the current Microsoft-hosted Windows 11 IoT Enterprise LTSC 2024 Evaluation x64 ISO.
- Computed its SHA-256 digest and stopped when Microsoft’s linked PDF contained a stale, different digest.
- After explicit owner approval of the exact Microsoft URL and observed digest, renamed the quarantined ISO to the approved local source name.
- Mounted the ISO read-only and used elevated DISM inspection to confirm exactly one image at index 1: `Windows 11 IoT Enterprise LTSC Evaluation`.
- Re-verified source SHA-256, created a 64-GB dynamic VHDX, initialized GPT, created EFI/MSR/Windows partitions, applied image index 1 with DISM, generated UEFI boot files with BCDBoot, detached the image, marked it read-only, and computed its sealed SHA-256.
- Created the ignored host registry and generated a no-personal-state isolated provisioning plan through the compiled TypeScript contract.
- Ran the elevated plan resolver and dry-run provisioning script.
- Ran `npm test -- --run tests/windowsFieldScripts.test.ts`.

## Results

- Owner-approved source digest: `2cee70bd183df42b92a2e0da08cc2bb7a2a9ce3a3841955a012c0f77aeb3cb29`.
- Sealed base VHDX digest: `b93a20f121105e5edcfabdb589dfd23e14ceacdf4fb4f84738738a78b07e9d7d`.
- Base VHDX is detached and read-only.
- The local registry is now protected by `.gitignore`.
- The first disposable-plan preflight found a strict-mode access bug for omitted personal state. The patched focused suite passed 5 tests.
- The patched resolver and dry-run completed successfully for Field `18756ac2-1b9f-4503-baab-2183cf8e0fb3`, generation 1.
- No VM has yet been created by this slice.

## Assumptions and unvalidated areas

- The owner explicitly accepted the exact Microsoft-hosted evaluation ISO despite Microsoft’s linked verification PDF containing a stale digest. Evidence preserves both values.
- The evaluation license is suitable only for bounded development and acceptance, not production deployment.
- The offline image is bootable by construction, but boot, OOBE completion, guest integration, Exosuit guest bootstrap, heartbeat, identity, display, and attestation remain unvalidated.
- The base currently contains stock Windows evaluation media. Exosuit guest components must be installed and sealed in a later reviewed base generation before production consideration.

## Security impact

The local registry contains no personal-state disk. The plan uses only the Private isolated switch, denies host LAN and inbound connections, and disables clipboard, broad drive mapping, and host input injection. The change preserves strict-mode failure for malformed personal-state entries while allowing the schema-approved absence of personal state. No credentials or unattended account secrets were embedded in the base image.

## Rollback or disable path

Do not delete the immutable base while any differencing child exists. If no child exists, an administrator may remove only `C:\ProgramData\Exosuit\Images\exosuit-field-base-v1.vhdx`, remove the ignored local registry, and remove the approved cached evaluation ISO. Revert this commit to restore the prior optional-property behavior, though doing so disables supported disposable plans without personal state.

## Next recommended slice

Commit this slice and run the complete L0 validator on that exact clean commit. If every blocking L0 gate passes, execute the exact typed-confirmation live apply, capture VM start evidence, then destroy the disposable generation with the reviewed destroy script and capture cleanup evidence.
