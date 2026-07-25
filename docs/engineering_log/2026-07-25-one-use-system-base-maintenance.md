# One-use SYSTEM Field base maintenance

## Goal

Eliminate repeated interactive Audit Mode and terminal steps by allowing an existing Field guest startup task to consume one exact, expiring, staging-only SYSTEM maintenance authorization, remove one explicitly named inherited account, seal the image, and shut down.

## Files changed

- `scripts/windows/Start-ExosuitFieldGuest.ps1`
- `scripts/windows/Invoke-ExosuitFieldBaseMaintenance.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-25-one-use-system-base-maintenance.md`

## Parts & Pieces and donor patterns considered

The existing SYSTEM startup task, fixed `C:\Exosuit` root, component digests, canonical timestamps, local-account/profile cleanup checks, no-personal-state boundary, Sysprep contract, and metadata receipts were reused. Broad PowerShell Direct access, password automation, UAC bypass, persistent maintenance authority, and model-triggered full control were rejected.

## Tests added or updated

The Windows script contract now requires the startup path to detect only the fixed authorization file and dispatch the reviewed maintenance script. The maintenance contract requires local SYSTEM, exact operation/type formats, a four-hour maximum expiry, exact self-digest binding, no active network adapter, no per-generation configuration, one explicitly authorized non-built-in unloaded account, complete cleanup, authorization consumption, a receipt, and generalized OOBE shutdown.

## Commands actually run

```text
PowerShell parser over Start-ExosuitFieldGuest.ps1 and Invoke-ExosuitFieldBaseMaintenance.ps1
npm run typecheck
npx vitest run tests/windowsFieldScripts.test.ts --reporter=verbose
```

## Results

Both PowerShell scripts parsed successfully, typecheck passed, and all 6 Windows Field script-contract tests passed.

## Assumptions and unvalidated areas

The complete exact-head L0 validator must still rerun. The maintenance contract has not run in a staging VM. SYSTEM account/profile deletion, authorization consumption, Sysprep, shutdown, immutable-image promotion, and fresh guest readiness remain unvalidated.

## Security impact

This adds no normal guest authority. The path is reachable only when a host administrator injects the fixed authorization file into a network-detached staging image. Authorization is short-lived, bound to an exact maintenance script digest and source commit, permits one named account only, refuses secrets/personal generation state, and is deleted before Sysprep. Normal Field generations do not contain the authorization and continue through the standard fail-closed launch path.

## Rollback or disable path

Do not inject `C:\Exosuit\Base\maintenance-authorization.json`; the maintenance path remains unreachable. Revert this slice to remove SYSTEM maintenance dispatch. Stop and remove only the disposable staging VM if live validation fails.

## Next recommended slice

Run focused validation and exact-head L0, stop the manual v11 staging VM, build a fresh v12 staging copy with an exact authorization, prove automatic cleanup/seal/shutdown and offline receipt verification, then prove one fresh disposable guest.
