# Level 4 audit — Field desktop-ready bootstrap

**Date:** 2026-07-24  
**Depth:** Level 4 — execution-sensitive guest readiness

## Boundary reviewed

The Windows guest startup wrapper runs as local SYSTEM and controls when the authenticated Hyper-V KVP runtime starts. The host remains the promotion authority and joins bootstrap checks, heartbeat, policy, and attestation.

## Failure observed

A boot-triggered task produced a valid signed bootstrap report before login. Its long-running runtime caused the logon trigger to be ignored, leaving `session_unlocked` failed even after heartbeats correctly reported an unlocked desktop. Separately, disabled/ineffective Hyper-V time synchronization caused otherwise valid envelopes to fail expiry validation after a long powered-off interval.

Both failures were fail-closed. Replay state, signature verification, expiry validation, policy validation, and attestation validation were not reset or weakened.

## Control change

The startup wrapper repeatedly executes the existing bootstrap precheck until the exact `session_unlocked` check passes. The wait is bounded, hard bootstrap failures terminate immediately, report paths remain confined to `C:\Exosuit`, and the channel runtime starts only after the desktop-ready precondition.

## Live evidence

- Time Synchronization enabled: `artifacts/field-l4-v6-boot/generation-1/time-sync-repair.json`
- Offline script digest proof: `artifacts/field-l4-v6-boot/generation-1/desktop-ready-startup-offline-deploy.json`
- Authenticated envelopes: `artifacts/field-l4-v6-boot/generation-1/authenticated-channel/`
- Host readiness: `artifacts/field-l4-v6-boot/generation-1/final-readiness.json`
- Result: `ready`
- Boot ID: `3ad46cd5-f7b5-4055-8fb9-3522710c76c9`
- Replay high-water mark: `1784852364417048`

## Security verdict

The slice improves fail-closed startup ordering and does not broaden authority. The live proof used an offline replacement on a disposable overlay because guest password authentication was unavailable; therefore base v6 itself is not promoted as containing this fix. A new reviewed base and fresh boot remain mandatory.

Repository validation passed: typecheck, build, 237 TypeScript tests, 44 .NET tests, the Glove system pulse, and the Field full-chain system pulse.

## Rollback

Stop selecting a base containing the new wrapper or restore the prior script in a disposable overlay. Host emergency stop and readiness denial remain available independently.
