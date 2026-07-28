# Field reviewed base v9

## Goal

Build an immutable Field Windows base that contains the reviewed unattended-development initializer and setup-complete cleanup from source commit `fba754f21efc07e09042cd8108399778366154ae`.

## Files changed

- `docs/engineering_log/2026-07-24-field-reviewed-base-v9.md`
- Local ignored catalog: `vm/field-host-config.local.json`
- Local image: `C:\ProgramData\Exosuit\Images\exosuit-field-base-v9.vhdx`
- Local ignored evidence: `artifacts/field-l4-base-build/v9/base-v9-review.json`

## Parts & Pieces and donor patterns considered

The existing reviewed-base builder and immutable v8 base were reused. No new binary donor was introduced.

## Tests added or updated

No source tests were added in this image-only slice. The builder performed a read-only review mount and exact source/target digest checks for all seven embedded components.

## Commands actually run

The elevated reviewed-base builder copied v8 to v9, injected the exact source files from commit `fba754f`, set the target read-only, hashed source and target, mounted v9 read-only, and compared every embedded component digest.

## Results

- Source v8 SHA-256: `c7ea39258343b43316382540cc3d9d680b72c3d0bb8ceb0a6867fbc305f402ad`
- Target v9 SHA-256: `40fdc00f6e15c30ac217c79f6bb049ef3a97e0e0a7bf515d497c6c2237fdd361`
- Target is read-only.
- Read-only review mount passed.
- All seven source digests matched.
- Development initializer SHA-256: `64fd6446090ca60f8bc44cdd77cce2a8c609bb142e81d6821fb2fa141a702721`
- Setup-complete SHA-256: `164742792f59de0f03b40e02a1e0c6debc07681cc129820994602445b5f18e76`

## Assumptions and unvalidated areas

Live Windows OOBE completion and authenticated guest readiness remain unvalidated until a fresh v9 generation boots.

## Security impact

v9 preserves the immutable-base boundary and contains no per-generation credential or channel secret. Those values remain confined to the disposable overlay seed and host-local secret root.

## Rollback or disable path

Remove v9 from the local ignored catalog and delete the unattached v9 image after verifying no generation references it. Continue using immutable v8 if unattended development setup is not required.

## Next recommended slice

Provision and prove one fresh v9 development generation, then destroy the failed v8 development generation.
