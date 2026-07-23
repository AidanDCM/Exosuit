# Field v5 fresh-boot proof

## Goal

Prove that reviewed base v5 can create a new disposable Field generation whose baked guest components install and reach authenticated readiness without PowerShell Direct component replacement.

## Files changed

- `docs/engineering_log/2026-07-23-field-v5-fresh-boot-proof.md`
- ignored evidence under `artifacts/field-l4-v5-boot/generation-2/`
- restricted generation secrets under `C:\Users\Aidan\.codex\secrets\exosuit\993a45ef-3412-46ce-9862-5efe5a9dbfb1-g2`

## Parts & Pieces and donor patterns considered

Generation 2 retained the stable Field ID and incremented the generation. It used a disposable differencing overlay and task disk, isolated networking, no personal-state disk, no clipboard, no broad drive mapping, and no host input injection. Its manifest bound directly to base v5 and the reviewed single-file agent digest. Channel and attestation secrets were regenerated and ACL-restricted for G2.

## Tests added or updated

No source test changed. This was a live local acceptance proof against the already validated source and reviewed base.

## Commands actually run

- generated and resolved the G2 provisioning plan against the host-local v5 registry
- restricted the G2 secret root with `icacls`
- elevated `Invoke-ExosuitFieldProvisioning.ps1` with exact typed confirmation and the approved four-file seed
- completed Windows first boot and sign-in through VMConnect
- elevated `Read-ExosuitFieldGuestKvp.ps1`
- `node scripts/verify-field-live-readiness.mjs ...`

## Results

- VM: `Exosuit-Field-993a45ef-3412-46ce-9862-5efe5a9dbfb1-G2`
- Base v5 digest: `b122c399a64fe23f22358a5c2a805100854c9895791f7871a17ffff27cde48ef`
- Manifest digest: `d7763f793390c5d9ac746aaa81b050d58d6551e3a070c4a2e166d6e4e538d44c`
- All 10 guest bootstrap checks passed.
- Authenticated sequences accepted: handshake `242`, bootstrap `243`, heartbeat channel `282`.
- Heartbeat reported `lifecycle=ready`, `desktopReady=true`, and `sessionLocked=false`.
- Final result: `status=ready`, generation `2`, boot ID `82150bb2-0b13-400b-9ba9-dbae5ad54f7a`, completed at `2026-07-23T22:20:57.765Z`.
- Evidence: `artifacts/field-l4-v5-boot/generation-2/final-readiness.json` and `kvp-proof/verified-guest-kvp.json`.
- No PowerShell Direct deployment or guest component replacement was performed on G2.

## Assumptions and unvalidated areas

This proves one clean first boot on this host. It is not a soak test and does not validate real input, network access, Teach capture, application-specific workflows, or Pilot execution.

## Security impact

The proof preserved deny-by-default host integrations and isolated networking. Authentication, expiry, chunk digest, identity binding, and durable replay verification remained mandatory. No secrets were committed or placed in evidence.

## Rollback or disable path

Stop and remove only Generation 2 with `Remove-ExosuitFieldGeneration.ps1` after preserving evidence, then remove its restricted secret root. Base v5 remains immutable and detached from the disposable generation through its differencing child relationship.

## Next recommended slice

Run a bounded guest soak/restart test, prove stop/recovery behavior, then begin the consented Teach-mode acceptance matrix.
