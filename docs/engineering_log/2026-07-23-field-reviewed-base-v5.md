# Field reviewed base v5

## Goal

Create an immutable Windows Field base containing the exact guest components proven by the authenticated Generation 1 readiness join.

## Files changed

- `docs/engineering_log/2026-07-23-field-reviewed-base-v5.md`
- ignored host-local `vm/field-host-config.local.json`
- local immutable `C:\ProgramData\Exosuit\Images\exosuit-field-base-v5.vhdx`

## Parts & Pieces and donor patterns considered

The reviewed v4 base was copied rather than modified because the running disposable generation still depends on v4. The v5 copy received the single-file Windows agent and fixed guest bootstrap, installer, startup, and SetupComplete scripts. The image was detached, marked read-only, remounted read-only, and every installed component was hashed from that review mount.

The first build attempt preserved v4's read-only file attribute. Inspection proved the resulting v5 was detached and byte-identical to v4. The recovery wrapper required the exact known v4 digest before removing only that incomplete v5 copy and rebuilding.

## Tests added or updated

No new source tests were required for this local artifact build. The source content came from clean commit `837e861a87d404c86b8f47f21d0c0e08c5b60110`, whose complete Level 0 validator passed.

## Commands actually run

- forced single-file `dotnet publish` for `win-x64`
- elevated `Build-ReviewedFieldBaseV5.ps1`
- elevated read-only `Inspect-FieldBaseV5.ps1`
- elevated `Rebuild-VerifiedIncompleteFieldBaseV5.ps1`
- `Invoke-ExosuitFieldValidation.ps1 -RepositoryRoot ...`

## Results

- Clean Level 0 evidence: `artifacts/field-validation/20260723T212848Z`
- Base review evidence: `artifacts/field-l4-base-build/v5/base-v5-review.json`
- v5 digest: `b122c399a64fe23f22358a5c2a805100854c9895791f7871a17ffff27cde48ef`
- Embedded agent digest: `9689b01948cf1cb7844c92e0e87f39be959b83a6055bfa9734336c69a5dc8a45`
- v5 was detached and read-only after review.
- All reviewed guest component hashes matched their injected source files.

## Assumptions and unvalidated areas

The v5 image has been reviewed offline but has not yet booted as a fresh disposable generation. The live readiness proof used generation 1 on v4 with the same v9 agent and scripts deployed through PowerShell Direct. A fresh v5 boot remains necessary before v5 is promoted beyond reviewed-candidate status.

## Security impact

The image keeps the existing isolated networking posture. No secrets, manifests, channel keys, or guest-specific identity were baked into v5. The executable digest covers the embedded managed code rather than only a .NET app-host launcher.

## Rollback or disable path

Do not select v5 in a provisioning plan. The local catalog can remove only the v5 entry, and the detached v5 file can be removed after verifying no differencing child references it. v4 remains unchanged.

## Next recommended slice

Create a new disposable generation from v5, complete first boot, and repeat the authenticated readiness join without PowerShell Direct component replacement.
