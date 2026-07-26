# Field base Audit Mode maintenance bootstrap

## Goal

Replace the unproven assumption that a pre-Sysprep scheduled-task registration will execute on first boot with a one-use, digest-bound Windows Audit Mode bootstrap that invokes the reviewed SYSTEM maintenance entrypoint without owner interaction or a password.

## Files changed

- `scripts/windows/Invoke-ExosuitFieldBaseMaintenance.ps1`
- `scripts/windows/Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-25-field-base-auditsystem-bootstrap.md`

The exact v12 builder and diagnostic collectors remain local evidence artifacts under `artifacts/field-l4-base-build/v12/`.

## Parts & Pieces and donor patterns considered

The existing expiring authorization, script digest binding, fixed `C:\Exosuit` entrypoint, SYSTEM identity check, zero-network requirement, account/profile removal, consumed authorization, receipt, and Sysprep contract were retained. Windows unattended `auditUser` runs a fixed installer under the automatically enabled built-in Audit Administrator; the installer immediately starts the existing task under SYSTEM. Password automation, PowerShell Direct, UAC bypass, persistent maintenance services, broad shell access, and VMConnect input were rejected.

## Tests added or updated

The Windows script contract requires a SHA-256-bound maintenance answer file, exact Exosuit maintenance marker and fixed bootstrap script, deletion before final Sysprep, absence verification, and receipt evidence that the bootstrap was consumed. The Audit Administrator bootstrap installs and starts the SYSTEM task, waits for a receipt, and reports a terminal task result or bounded timeout instead of returning before the outcome is known.

## Commands actually run

```text
PowerShell parser over Invoke-ExosuitFieldBaseMaintenance.ps1 and Build-AutomatedV12.ps1
npx vitest run tests/windowsFieldScripts.test.ts --reporter=verbose
npm run typecheck
```

## Results

Both PowerShell files parsed, all 6 focused Windows Field script-contract tests passed, and TypeScript typecheck passed.

Live v12 attempt evidence: `artifacts/field-l4-base-build/v12/base-v12-build-result.json` records a bounded shutdown timeout. `artifacts/field-l4-base-build/v12/timed-out-v12-inspection.json` proves zero network adapters, authorization still present, receipt absent, startup task file present, and no immutable v12 promotion. This proves the prior startup dispatch did not consume its authorization; it does not prove why Windows omitted the trigger.

## Assumptions and unvalidated areas

Exact-head L0 passed at `artifacts/field-validation/20260726T010651Z`. The first live answer file proved `oobeSystem` reseal and entry into Audit Mode, but Panther evidence showed `RunSynchronous` in `auditSystem` completed without executing because that setting is valid only in `auditUser` or `specialize`. The corrected `auditUser` installer then executed live, but returned before the SYSTEM task outcome and the receipt remained absent. A reviewed wrapper now waits for a receipt or terminal task result and writes a bounded local log. The wrapper has not yet executed live. SYSTEM maintenance success, account removal, answer-file consumption, final Sysprep shutdown, offline receipt verification, immutable v12 promotion, and a fresh v12 disposable guest remain unvalidated.

## Security impact

The new authority exists only when a host administrator injects a short-lived authorization and matching one-use answer file into a network-detached staging image. The maintenance script checks both SHA-256 digests, its SYSTEM identity, exact marker/entrypoint, account scope, and absence of generation secrets. It deletes the answer file and authorization before final Sysprep. Normal Field generations contain neither file.

## Rollback or disable path

Do not inject the maintenance authorization or answer file. Stop and remove only the v12 maintenance VM and staging disk if live validation fails. Revert this slice to remove answer-file verification/consumption; immutable v10 remains the reviewed recovery base.

## Next recommended slice

Commit and run exact-head L0. Rebuild v12 from immutable v10, prove `auditUser` installer-to-SYSTEM-task dispatch and offline receipt, promote only a matching read-only image, then provision and validate one fresh disposable generation.
