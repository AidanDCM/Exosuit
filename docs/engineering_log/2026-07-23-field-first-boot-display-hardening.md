# Field first-boot and display hardening

## Goal

Make the reviewed guest base safe to install at first boot and make its fixed display-contract check meaningful when the authenticated guest runtime executes as SYSTEM in session 0.

## Files changed

- `scripts/windows/SetupComplete-ExosuitFieldGuest.cmd`
- `scripts/windows/Initialize-ExosuitFieldGuest.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-23-field-first-boot-display-hardening.md`

## Parts & Pieces and donor patterns considered

The existing SetupComplete hook, fixed-display manifest contract, and SYSTEM startup-task design remain the donors. The display fallback uses the built-in `Win32_VideoController` inventory only after the session-local Windows Forms result does not exactly match the approved contract.

## Tests added or updated

The Windows script contract test now requires first-boot log-directory creation and the bounded display-controller fallback.

## Commands actually run

- `npm test -- --run tests/windowsFieldScripts.test.ts`

## Results

The focused Windows script suite passed: 6 tests.

## Assumptions and unvalidated areas

The live guest still has to prove that Hyper-V reports the configured resolution through either the active console surface or `Win32_VideoController`. A source-level check is not evidence of live Windows display behavior.

## Security impact

No permission boundary is widened. The fallback only reads local display-adapter state and still fails closed unless the exact manifest width and height are observed. SetupComplete creates only the fixed `C:\Exosuit\Logs` directory before launching the reviewed installer.

## Rollback or disable path

Revert this slice and continue using the prior read-only base generation. Do not promote or launch a base generation built from the reverted hook.

## Next recommended slice

Run the full L0 validator on a clean commit, build a new immutable base generation, then create and prove one disposable guest generation.
