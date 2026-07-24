# Field reviewed base v8

## Goal

Create an immutable Field base containing the reviewed development auto-login initializer.

## Files changed

- `docs/engineering_log/2026-07-24-field-reviewed-base-v8.md`
- ignored local Field catalog
- immutable `C:\ProgramData\Exosuit\Images\exosuit-field-base-v8.vhdx`

## Parts & Pieces and donor patterns considered

Immutable v7 was copied, never modified. The v8 copy received all current guest components, including the development initializer, then was detached, marked read-only, remounted read-only, and compared against source digests.

## Tests added or updated

Source commit `2a9bd4b6cbb7df1af05350ddc9ea9a2e76a9d793` passed 239 TypeScript tests, 44 .NET tests, typecheck, build, PowerShell parsing, and both system pulses.

## Commands actually run

- parameterized reviewed-base builder
- elevated VHD copy/mount/injection
- full-image SHA-256
- read-only per-file digest comparison

## Results

- v7 source digest: `e51c50070d34904d0d4fe07fc8943b333730b2f1d5abcf428121cd5535ed2cbe`
- v8 digest: `c7ea39258343b43316382540cc3d9d680b72c3d0bb8ceb0a6867fbc305f402ad`
- development initializer digest: `19288ce9e37b7be41f0807681867d2d82e5b29c21ffdd5e7937e473499a5bbd7`
- startup digest: `3abd0ed15da23c1f0a67b39a834fc8f72c3d42e13f16455427e4cd890df2b225`
- all source digests matched;
- v8 is detached and read-only.

## Assumptions and unvalidated areas

Development auto-login still requires live proof on a fresh v8 generation.

## Security impact

The base contains code for a production-forbidden development mode, but no credential, account, or auto-login setting. The mode activates only through a signed plan plus explicit host switch.

## Rollback or disable path

Omit development access, stop selecting v8, or destroy its disposable child. v7 remains unchanged.

## Next recommended slice

Provision a fresh isolated v8 development generation and prove unattended login, PowerShell Direct, authenticated readiness, and exact destruction.
