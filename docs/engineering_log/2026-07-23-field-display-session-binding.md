# Field display and session binding

## Goal

Make two readiness inputs executable: enforce the signed display dimensions in Hyper-V and bind guest bootstrap identity to the actual Windows session running the guest bootstrap process.

## Files changed

- `scripts/windows/Invoke-ExosuitFieldProvisioning.ps1`
- `scripts/windows/Initialize-ExosuitFieldGuest.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-23-field-display-session-binding.md`

## Parts & Pieces and donor patterns considered

- Existing signed display contract in the provisioning plan.
- Hyper-V `Set-VMVideo` for Generation-2 single-resolution configuration.
- Existing Field identity `windowsSessionId`.

## Tests added or updated

The Windows script contract suite now requires `Set-VMVideo` and evidence of the actual Windows session ID.

## Commands actually run

- Parsed both changed PowerShell files with the PowerShell language parser.
- Ran `npm test -- --run tests/windowsFieldScripts.test.ts`.

## Results

- PowerShell parsing passed.
- Focused Windows administration tests passed 6/6.
- Provisioning now applies the plan’s exact width and height with `ResolutionType Single`.
- Bootstrap fails if its current process session ID differs from the manifest identity.

## Assumptions and unvalidated areas

- Live Hyper-V video enforcement and guest display observation remain to be proven.
- The SYSTEM startup task is expected to run in Windows session `0`; the generated manifest must bind that exact value.

## Security impact

Display drift and session substitution now fail closed before readiness. No input, capture, networking, or privilege boundary expanded.

## Rollback or disable path

Revert this commit and keep guest readiness denied. Do not reuse a base generation containing the earlier bootstrap script for readiness evidence.

## Next recommended slice

Run L0, seal a new base generation containing the updated bootstrap script, then execute the live seeded guest-readiness proof.
