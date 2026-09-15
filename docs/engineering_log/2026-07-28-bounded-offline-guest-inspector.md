# Bounded Offline Guest Inspector

## Goal

Replace ad-hoc elevated VHD diagnosis with a canonical, bounded, privacy-preserving inspector for an off disposable Field generation.

## Files changed

- `scripts/windows/Inspect-ExosuitFieldGuestOffline.ps1`
- `tests/windowsFieldScripts.test.ts`
- `scripts/validate-field.mjs`
- Field status, test plan, and Level 4 addendum

## Parts & Pieces and donor patterns considered

The tool adapts the earlier v14 direct-inspection pattern while removing its forced VM shutdown and raw log-tail collection. It reuses the repository's bounded-job, exact-generation-root, read-only mount, hash-only evidence, atomic-write, and fail-closed patterns.

## Tests added or updated

- parser validation;
- refusal to stop/start/remove a VM;
- read-only Storage-provider mount and bounded dismount;
- exact task path and file hashing;
- absence of raw log-content reads and dynamic evaluation.

## Commands actually run and results

- PowerShell parser check — passed.
- `npm run typecheck` — passed.
- focused Windows script suite — 7/7 passed.
- `npm run validate:field-contract` — passed: 84 artifacts and 26 source modules.
- Live v14 offline inspection — passed and dismounted cleanly. It found the complete injected agent set, generation configuration, and the `ExosuitFieldGuest` LocalSystem boot/logon task; no private file contents were captured.
- `npm run validate:typescript` — passed: repository and plan validators, Field validation (84 artifacts / 26 source modules), typecheck, 62 test files with 312/312 tests, build, Glove pulse, and Field pulse.
- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release` — passed: 44/44 tests.

## Assumptions and unvalidated areas

The caller is an elevated local administrator and supplies an exact disposable Field identity. Windows Storage and Hyper-V providers remain host dependencies. File hashes prove observed bytes, not correctness. The inspector does not read task history or private log contents.

## Security impact

Positive: a running VM is denied, the overlay is mounted read-only, operations are bounded, configuration/log content is excluded, and the result contains only metadata and hashes. No guest credential, channel secret, input, network, or execution authority is added.

## Rollback or disable path

Do not invoke the script, or revert this slice. Existing provisioning and guest runtime behavior are unchanged.

## Next recommended slice

Make guest startup failures produce a privacy-safe bounded status artifact before KVP begins, then rebuild the base image and repeat authenticated readiness.
