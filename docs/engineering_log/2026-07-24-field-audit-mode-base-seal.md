# Field Audit Mode base sealing

## Goal

Create a reviewed, fail-closed way to install and verify the Field guest task in Windows Audit Mode and seal a generalized base before OOBE, so SetupComplete and unattended disposable setup execute on the next fresh generation.

## Files changed

- `scripts/windows/Seal-ExosuitFieldBase.ps1`
- `scripts/windows/Seal-ExosuitFieldBase.cmd`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-24-field-audit-mode-base-seal.md`

## Parts & Pieces and donor patterns considered

The existing reviewed guest installer, startup/logon SYSTEM task contract, fixed-path restrictions, typed confirmation pattern, component digest evidence, and Windows Sysprep Audit Mode workflow were reused. Offline task-registry injection and passwordless guest accounts were rejected because they would weaken reviewability or Windows authentication boundaries.

## Tests added or updated

The Windows script contract test now requires:

- exact typed confirmation and explicit apply;
- built-in Audit Mode administrator enforcement;
- rejection of any per-generation configuration in the base;
- inspection of the SYSTEM principal, highest run level, exact action, startup trigger, and logon trigger;
- metadata-only component digest receipt;
- `sysprep /generalize /oobe /shutdown /quiet`;
- a fixed double-click launcher containing no password, secret, or token.

## Commands actually run

```text
PowerShell parser over scripts/windows/Seal-ExosuitFieldBase.ps1
npm run typecheck
npx vitest run tests/windowsFieldScripts.test.ts --reporter=verbose
```

## Results

Read-only offline inspection of base v9 proved that the reviewed scripts and SetupComplete hook exist, but the `ExosuitFieldGuest` scheduled task and setup-complete log do not. The same task absence was confirmed in v4 through v8. These images were copied after Windows had already entered OOBE, so SetupComplete could not be relied upon to execute on a fresh child boot.

The new script passed Windows PowerShell parsing, TypeScript typecheck passed, and all 6 Windows Field script-contract tests passed.

## Assumptions and unvalidated areas

The complete exact-head L0 validator must still rerun. The new maintenance utility has not yet run inside Windows Audit Mode. Sysprep success, task survival or SetupComplete reinstallation, unattended development initialization, automatic desktop entry, and live guest readiness remain unvalidated.

## Security impact

The utility does not add runtime authority. It requires an elevated built-in Audit Mode administrator, exact typed confirmation, fixed paths, no per-generation configuration in the base, and an exact reviewed SYSTEM task. It records only component digests and task metadata. Production validation continues to reject development unattended access.

## Rollback or disable path

Do not inject or launch the sealing utility; continue treating v9 as an unready reviewed component image. Revert this slice to remove the Audit Mode sealing workflow. Any failed v10 staging VM and staging disk must be stopped, detached, and removed without modifying v9.

## Next recommended slice

Run focused source validation and exact-head L0, create a writable v10 staging copy, enter Windows Audit Mode, run the reviewed launcher, verify shutdown and the seal receipt offline, mark v10 read-only, then boot and prove one fresh disposable generation.
