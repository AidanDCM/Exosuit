# Field base account and SetupComplete repair

## Goal

Remove inherited personal accounts from the reviewed Field base and ensure disposable development access initializes directly during SetupComplete before the guest task starts.

## Files changed

- `scripts/windows/SetupComplete-ExosuitFieldGuest.cmd`
- `scripts/windows/Seal-ExosuitFieldBase.ps1`
- `scripts/windows/Remove-ExosuitFieldBaseAccount.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-25-field-base-account-and-setupcomplete.md`

## Parts & Pieces and donor patterns considered

The existing fixed-path SetupComplete hook, development initializer, exact typed confirmation, Audit Mode identity gate, local-account cmdlets, profile CIM provider, metadata receipts, and fail-closed base sealing contract were reused. Hiding the inherited account or accepting it in an MVP image was rejected because it would violate the no-personal-state base boundary.

## Tests added or updated

The Windows script contract now requires direct no-restart development initialization during SetupComplete, immediate failure propagation, rejection of non-built-in accounts during sealing, and an Audit Mode-only account/profile cleanup utility that refuses built-in, current, loaded, or special accounts.

## Commands actually run

```text
PowerShell parser over Seal-ExosuitFieldBase.ps1 and Remove-ExosuitFieldBaseAccount.ps1
npm run typecheck
npx vitest run tests/windowsFieldScripts.test.ts --reporter=verbose
```

## Results

The v10 base sealed successfully, but a fresh disposable generation stopped at the inherited `Aidan` password screen and never published a handshake. Read-only overlay inspection proved SetupComplete and the SYSTEM task existed, while the development marker and `ExosuitDev` profile were absent and the per-generation development configuration/password seed remained unconsumed. This confirms that task registration alone was insufficient to guarantee development initialization during Windows setup.

Both PowerShell scripts parsed successfully, typecheck passed, and all 6 Windows Field script-contract tests passed.

## Assumptions and unvalidated areas

The complete exact-head L0 validator must still rerun. The repair has not yet run in a v11 Audit Mode base or fresh disposable guest. Account removal, SetupComplete initialization, auto-logon, authenticated KVP readiness, and cleanup remain unvalidated.

## Security impact

The setup hook invokes only the reviewed fixed-path initializer and propagates failure. Base sealing now fails closed if any non-built-in account remains. Account cleanup is confined to an explicitly named local account inside an Audit Mode staging image, requires exact typed confirmation, refuses protected/current/loaded profiles, and records metadata-only evidence. Production validation continues to reject development access.

## Rollback or disable path

Revert this slice and keep v10 unpromoted for guest use. Destroy only the failed disposable v10 generation with the reviewed removal script. Do not reuse a base containing the inherited personal account.

## Next recommended slice

Run focused validation and exact-head L0, build v11 from a writable staging copy, enter Audit Mode, remove the inherited account with the reviewed utility, seal and verify v11, then prove one fresh disposable generation end to end.
