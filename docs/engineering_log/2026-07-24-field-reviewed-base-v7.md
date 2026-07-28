# Field reviewed base v7

## Goal

Create an immutable Field base containing the power-loss-durable v11 agent and the bounded desktop-ready startup wrapper.

## Files changed

- `docs/engineering_log/2026-07-24-field-reviewed-base-v7.md`
- ignored host-local `vm/field-host-config.local.json`
- local immutable `C:\ProgramData\Exosuit\Images\exosuit-field-base-v7.vhdx`

## Parts & Pieces and donor patterns considered

The immutable v6 base was copied rather than mutated. The v7 copy received the exact current agent, bootstrap, installer, startup, and SetupComplete files. It was detached, marked read-only, remounted read-only, and each installed target was compared with its source digest.

## Tests added or updated

The source commit passed typecheck, build, 237 TypeScript tests, 44 .NET tests, and both full-chain system pulses before the artifact build.

## Commands actually run

- parameterized elevated reviewed-base builder
- read-only VHD mount review
- SHA-256 comparison for every installed guest component

## Results

- Source v6 digest: `3ccb719f407b7d0728a1308be278ef127d890c7cbf70dffc06b78e3e3ee1984e`
- v7 digest: `e51c50070d34904d0d4fe07fc8943b333730b2f1d5abcf428121cd5535ed2cbe`
- Embedded v11 agent digest: `25f15cc59006551d6b05ea4103d74dfced2449ffdc66c918329f418381c5cdcc`
- Embedded startup digest: `ad58795daa24b330497c8b9c36c0239b73f56a68223c97432492c0b46c107970`
- Source commit: `308212729cf26c64e138c420cd9795c0244f8b0c`
- v7 is detached and read-only.
- Evidence: `artifacts/field-l4-base-build/v7/base-v7-review.json`

## Assumptions and unvalidated areas

v7 is an offline-reviewed candidate. It has not yet completed a fresh disposable boot without overlay component replacement.

## Security impact

No secrets, identity, policy, attestation, or channel keys are embedded. The startup wrapper now withholds the authenticated runtime until the interactive desktop precheck passes or the bounded wait fails closed.

## Rollback or disable path

Remove the ignored v7 catalog entry and stop selecting v7. Delete the v7 image only after proving no differencing child references it. v6 remains unchanged.

## Next recommended slice

Provision and validate a fresh v7 disposable generation with Hyper-V Time Synchronization enabled from creation.
