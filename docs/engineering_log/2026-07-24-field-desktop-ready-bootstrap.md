# Field desktop-ready bootstrap

## Goal

Prevent a normal boot from permanently binding the authenticated Field channel to a bootstrap report captured before the interactive desktop is unlocked.

## Files changed

- `scripts/windows/Start-ExosuitFieldGuest.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-24-field-desktop-ready-bootstrap.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-24_FIELD_DESKTOP_READY_BOOTSTRAP.md`

## Parts & Pieces and donor patterns considered

The existing bootstrap precheck remains the sole source of guest readiness checks. The startup wrapper now reruns that precheck every two seconds until its signed report contains exactly one passing `session_unlocked` check. Waiting is bounded to 900 seconds by default and configurable only within 1–3600 seconds. Hard bootstrap failures still terminate immediately, and the authenticated runtime does not start before the desktop gate passes.

Changing only the scheduled task multiple-instance policy was considered but rejected because it leaves a boot/logon race. The wrapper-level gate is deterministic regardless of trigger ordering.

## Tests added or updated

- Windows script contract asserts the bounded timeout and exact `session_unlocked` gate.
- PowerShell parser validation passed.
- Focused Windows script suite passed 6 tests.
- Typecheck and build passed.
- Full TypeScript suite passed 237 tests.
- Windows-agent suite passed 44 tests.
- Glove and Field system pulses each passed.

## Commands actually run

- PowerShell parser validation for `Start-ExosuitFieldGuest.ps1`
- `npm test -- tests/windowsFieldScripts.test.ts`
- authenticated Hyper-V KVP read through the existing replay ledger
- `verify-field-live-readiness.mjs`

## Results

- Hyper-V Time Synchronization was enabled after evidence showed a stopped VM resumed with stale signed timestamps; expiry checks were never weakened.
- The updated startup wrapper was deployed only to the disposable v6 overlay with SHA-256 `ad58795daa24b330497c8b9c36c0239b73f56a68223c97432492c0b46c107970`.
- Final host readiness: `ready`
- Field: `43a675d0-7a86-4ffd-8f0b-77a72ef3afcd`, generation 1
- Boot ID: `3ad46cd5-f7b5-4055-8fb9-3522710c76c9`
- Replay high-water mark: `1784852364417048`
- Evidence: `artifacts/field-l4-v6-boot/generation-1/`

## Assumptions and unvalidated areas

The bounded wait was live-proven once on the disposable v6 overlay after manual unlock. A new immutable base containing this startup script still requires a fresh boot proof before promotion.

## Security impact

The change tightens readiness: no channel runtime starts from a pre-login bootstrap snapshot. It adds no capability, listener, privilege, or model authority. Timeout remains fail-closed. Emergency stopping remains host-owned and independent.

## Rollback or disable path

Restore the prior startup script or select base v6. Doing so restores the known pre-login bootstrap limitation; host readiness remains fail-closed. The disposable overlay can be destroyed without modifying base v6.

## Next recommended slice

Build immutable base v7 containing this startup script, then prove one fresh v7 boot without offline component replacement.
