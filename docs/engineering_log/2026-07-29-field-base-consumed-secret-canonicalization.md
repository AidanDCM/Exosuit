# Field base consumed-secret canonicalization

## Goal

Keep the v19 one-use Audit credential out of durable evidence while allowing SYSTEM maintenance to verify the Windows-processed answer file against the host authorization.

## Files changed

- `scripts/windows/Invoke-ExosuitFieldBaseMaintenance.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/qa/ATOMIC_AUDIT_2026-07-29_FIELD_BASE_CONSUMED_SECRET_CANONICALIZATION.md`

## Parts & Pieces and donor patterns considered

The existing canonical XML comparison remains the donor pattern. Live attempt-2 evidence showed that Windows Setup removed comments, added `wasPassProcessed`, and removed the complete `Password` and `AdministratorPassword` elements after applying `auditSystem`. The existing digest excluded the first two transformations but not the consumed secret elements.

The change excludes exactly those two Setup-consumed secret element names before canonical hashing. It does not ignore passes, components, account names, autologon enablement, logon count, reseal mode, or any other setting. The local v19 builder moves its PowerShell Direct marker into `RegisteredOrganization`, because comments do not survive Setup processing.

## Tests added or updated

The Windows Field script contract test now requires explicit removal of only `Password` and `AdministratorPassword` nodes from canonical comparison.

## Commands actually run and results

- `npm test -- --run tests/windowsFieldScripts.test.ts` — passed, 8/8.
- `npm run validate` — repository, plan, Field contract, typecheck, 314/314 TypeScript tests, build, system pulse, and Field pulse passed; the final npm-dispatched .NET step resolved the hostfxr-only system installation and reported no SDK.
- `& "$env:USERPROFILE\.dotnet\dotnet.exe" test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj` — passed, 48/48 using the installed SDK 8 toolchain.

The aggregate command's final exit code reflects the already-documented PATH shadowing issue, not a source or test failure. Every required constituent gate was run with the installed SDK and passed.

## Assumptions and unvalidated areas

Source tests prove the fail-closed canonicalization shape, not a successful live v19 seal. A fresh v19 rebuild must still prove the SYSTEM receipt, built-in Audit Administrator receipt, canonical Sysprep shutdown, immutable digest promotion, and a clean disposable generation.

## Security impact

The change reduces secret retention and does not widen execution authority. Only Windows-consumed credential elements are removed from the digest input; the remaining non-secret answer-file contract stays bound to the authorization. `RunSynchronous` remains explicitly forbidden.

## Rollback or disable path

Revert this slice and leave v19 unpromoted. The immutable v10 donor and attempt-2 evidence remain unchanged.

## Next recommended slice

Validate, commit, and build v19 from the immutable v10 donor; then independently rehash and boot one fresh isolated generation.
