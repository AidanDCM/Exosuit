# Field reviewed base v6

## Goal

Create an immutable Windows Field base containing the power-loss-durable v11 guest runtime and the reviewed dual startup/logon installer.

## Files changed

- `docs/engineering_log/2026-07-23-field-reviewed-base-v6.md`
- ignored host-local `vm/field-host-config.local.json`
- local immutable `C:\ProgramData\Exosuit\Images\exosuit-field-base-v6.vhdx`

## Parts & Pieces and donor patterns considered

The reviewed v5 base was copied so its active Generation 2 differencing child remained untouched. The v6 copy received the exact self-contained v11 executable proven across abrupt power loss and the current bootstrap, installer, startup, and SetupComplete scripts. After injection, the image was detached, marked read-only, remounted read-only, and every installed file digest was compared with its source.

## Tests added or updated

No additional source tests were needed for the artifact build. Commit `dcabc5075fd769e4d66f00232d3ecff5e819317d` passed typecheck, build, 237 TypeScript tests, and 44 .NET tests before the image was built.

## Commands actually run

- self-contained single-file `dotnet publish` for `win-x64`
- elevated `Build-ReviewedFieldBaseV6.ps1`
- read-only VHD review and per-file source digest comparison within the builder

## Results

- Source v5 digest: `b122c399a64fe23f22358a5c2a805100854c9895791f7871a17ffff27cde48ef`
- v6 digest: `3ccb719f407b7d0728a1308be278ef127d890c7cbf70dffc06b78e3e3ee1984e`
- Embedded v11 agent digest: `25f15cc59006551d6b05ea4103d74dfced2449ffdc66c918329f418381c5cdcc`
- Source commit: `dcabc5075fd769e4d66f00232d3ecff5e819317d`
- v6 is detached and read-only.
- All six reviewed guest component targets match their source digests.
- Evidence: `artifacts/field-l4-base-build/v6/base-v6-review.json`

## Assumptions and unvalidated areas

v6 has passed offline review but has not yet booted as a fresh disposable generation. The same executable and scripts were live-proven on v5 Generation 2, but fresh v6 setup and guest installation remain a separate gate.

## Security impact

No secret, guest identity, policy, attestation, or channel key is embedded in the base. Networking posture is unchanged. v6 includes fail-closed durable channel sequence persistence and the local SYSTEM startup/logon task registration.

## Rollback or disable path

Remove the ignored v6 catalog entry and stop selecting v6 in provisioning plans. Delete the v6 file only after confirming no differencing child references it. v5 and its existing Generation 2 remain unchanged.

## Next recommended slice

Provision a fresh disposable generation directly from v6 and prove first boot, installation, authenticated channel, heartbeat, identity, display contract, policy, attestation, emergency stop, and cross-reboot replay without replacing guest components.
