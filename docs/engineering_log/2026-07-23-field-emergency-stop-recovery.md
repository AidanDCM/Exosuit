# Field emergency-stop recovery

## Goal

Prove bounded heartbeat stability, host-owned emergency stop, restart, and authenticated recovery for the v5 Generation 2 guest.

## Files changed

- `scripts/windows/Install-ExosuitFieldGuest.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-23-field-emergency-stop-recovery.md`

## Parts & Pieces and donor patterns considered

Three authenticated samples were collected 30 seconds apart. The original boot-only scheduled task did not run after a Hyper-V hard stop and restart, despite remaining enabled and structurally valid. Recovery diagnostics showed no process, no runtime error, no Task Scheduler event, and an unchanged last-run time.

Installation now registers the same SYSTEM action with both startup and any-user logon triggers. Startup preserves pre-login operation; logon supplies a second local recovery path when Windows does not fire the boot trigger. `IgnoreNew` suppresses duplicate runtime instances, and execution remains local, highest-integrity SYSTEM with no model or network dependency.

## Tests added or updated

The Windows script contract requires startup and logon triggers, SYSTEM service-account identity, highest run level, and `IgnoreNew`. Focused Windows tests passed 6/6 and the installer parsed successfully in Windows PowerShell.

## Commands actually run

- three elevated authenticated `Read-ExosuitFieldGuestKvp.ps1` samples
- elevated `Stop-VM -TurnOff -Force`
- elevated `Start-VM`
- read-only PowerShell Direct task/process/hash diagnostics
- reviewed installer deployment and task registration through PowerShell Direct
- final authenticated KVP capture and readiness evaluation

## Results

- Soak sequences: `334`, `350`, `366`; one stable boot ID; every sample ready and unlocked.
- Emergency stop reached Hyper-V `Off` without the model, MCP transport, or guest action succeeding.
- The raw first stop artifact serialized `before=Off` because the returned Hyper-V CIM object updated in place after shutdown; the script now snapshots the string before mutation. Its enforced precondition required `Running`, and recovery independently proved `Off -> Running`.
- Recovery-start evidence: `artifacts/field-l4-v5-boot/generation-2/recovery-start.json`.
- Original recovery failure diagnostics: `recovery-diagnostics.json`.
- Corrected task contains `MSFT_TaskBootTrigger` and `MSFT_TaskLogonTrigger`, is running, and has exactly one agent process.
- Post-recovery readiness returned `status=ready`, boot ID `32c4ad5d-1260-4670-bb7a-dd61345b28e4`, completed at `2026-07-23T22:35:16.133Z`.

## Assumptions and unvalidated areas

The trigger repair was applied to G2 after restart and has not yet itself been proven by a second hard-stop cycle or baked into a replacement immutable base. Cross-boot durable replay continuity also requires a dedicated review because the guest channel sequence is process-local.

## Security impact

Emergency stop remains host-owned and independent of model, cloud, KVP, and guest runtime health. The additional logon trigger does not add capability; it invokes the same fail-closed wrapper as SYSTEM. Duplicate instances are suppressed. No network, clipboard, input, permission, or policy boundary changed.

## Rollback or disable path

Disable or remove the `ExosuitFieldGuest` scheduled task. Revert the installer change to return to boot-only startup, recognizing the observed recovery failure. Stop and remove disposable G2 through the reviewed generation-removal script after preserving evidence.

## Next recommended slice

Persist or safely scope guest channel sequence continuity across runtime restarts, build base v6 with the dual-trigger installer, and repeat the hard-stop recovery proof without post-boot repair.
