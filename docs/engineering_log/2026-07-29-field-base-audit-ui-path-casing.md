# Field base Audit UI path casing

## Goal

Allow the reviewed field-base sealing script to recognize the canonical Windows Sysprep executable when WMI reports different letter casing for the same normalized path.

## Files changed

- `scripts/windows/Invoke-ExosuitFieldBaseAuditSeal.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/qa/ATOMIC_AUDIT_2026-07-29_FIELD_BASE_AUDIT_UI_PATH_CASING.md`
- this engineering log

## Parts & Pieces and donor patterns considered

The existing fail-closed process-count, executable-path normalization, exact Audit UI command-line contract, receipt validation, and one-use Sysprep flow remain the donor pattern. Only Windows path equality changes to explicit ordinal case-insensitive comparison, matching Windows filesystem path semantics without weakening the command-line check.

## Tests added or updated

The Windows Field script contract test now requires the explicit `OrdinalIgnoreCase` path comparison.

## Commands actually run and results

- `git diff --check` — passed.
- `npm test -- --run tests/windowsFieldScripts.test.ts` — passed, 8/8 tests.
- `$env:PATH="$env:USERPROFILE\.dotnet;$env:PATH"; npm run validate` — passed: repository safety 71 artifacts, master plan, Field contract 84 artifacts/26 modules, typecheck, 314/314 TypeScript tests, build, system pulse, Field pulse, and 48/48 .NET tests.

## Assumptions and unvalidated areas

The source-level fix is based on preserved attempt-4 evidence showing one canonical `Sysprep.exe /reboot` process whose normalized executable path differed only by casing. A new live image build is still required before claiming that sealing or promotion passes.

## Security impact

No permission boundary changes. The script still requires the built-in Audit Mode administrator, exactly one Sysprep process, a canonical normalized executable path, an exact `/reboot` command line, valid maintenance receipts, and detached networking.

## Rollback or disable path

Revert this slice. No base image is promoted by the source change alone, and the current v19 staging image remains non-canonical and untrusted.

## Next recommended slice

Run the full validator, publish an exact-head agent, then perform one recovery-scoped v19 build attempt and preserve its evidence.
