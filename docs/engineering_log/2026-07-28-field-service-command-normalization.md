# Field service command normalization

## Goal

Repair the fail-closed runtime-service verifier after live Windows evidence proved that SCM removes redundant quotes from the exact no-space Exosuit executable path.

## Files changed

- `scripts/windows/Install-ExosuitFieldGuest.ps1`
- `scripts/windows/Seal-ExosuitFieldBase.ps1`
- `scripts/windows/Invoke-ExosuitFieldBaseMaintenance.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-28_FIELD_SERVICE_COMMAND_NORMALIZATION.md`
- this log

## Parts & Pieces and donor patterns considered

The existing fixed service command, LocalSystem identity, automatic start, own-process type, recovery policy, legacy-task removal, one-use maintenance authorization, and read-only offline inspection contracts remain the donors. Loosening the check to a substring, prefix, wildcard, executable-only comparison, or arbitrary argument parsing was rejected. The repair uses an explicit two-member allowlist: the exact quoted command requested from SCM and the exact unquoted serialization Windows persisted for the same no-space executable and fixed argument.

## Tests added or updated

The Windows script contract test now requires all three verifiers to use their exact command allowlists and requires the canonical unquoted serialization to be present. Existing tests continue to require LocalSystem, automatic start, the fixed `--field-guest-service` mode, recovery delays, legacy-task removal, and maintenance/base-seal verification.

## Commands actually run

- PowerShell AST parse of the installer, base-seal, and base-maintenance scripts
- `npm test -- --run tests/windowsFieldScripts.test.ts`
- `npm run validate` with `%USERPROFILE%\.dotnet` prepended to `PATH`
- `%USERPROFILE%\.dotnet\dotnet.exe build apps/windows-agent/Exosuit.Agent.csproj -c Release --no-restore -warnaserror`
- `%USERPROFILE%\.dotnet\dotnet.exe list apps/windows-agent/Exosuit.Agent.csproj package --vulnerable --include-transitive`
- `npm run validate:ci-parity:clean` after commit

## Results

The v15 build timed out without promoting an image. Exact host validation and a bounded hard stop preserved the staging disk. Read-only offline inspection reported `components_verified`, no receipt, retained authorization, and a private maintenance-log classification of `runtime_service_contract_mismatch`. A second read-only classification of the offline SYSTEM service registry proved:

- image path: exact canonical command without redundant quotes;
- object name: LocalSystem;
- start value: `2` (automatic);
- type value: `16` (own process);
- failure actions: present;
- non-crash failure actions: enabled.

The focused script suite passes 8/8 and all three edited PowerShell scripts parse. Complete validation passes: repository safety (71 artifacts), master plan, Field contract (84 artifacts and 26 modules), typecheck, 314/314 TypeScript tests, build, both system pulses, and 48/48 .NET tests. The Release warning-as-error build completed with zero warnings and zero errors, and the NuGet scan found no vulnerable direct or transitive packages. Clean-commit parity is run after commit because that validator requires a clean checkout.

## Assumptions and unvalidated areas

The two exact strings are execution-equivalent because the executable path contains no spaces and both contain the same single fixed argument. A fresh reviewed base must still complete receipt creation, authorization consumption, Sysprep shutdown, read-only promotion, and disposable-generation readiness.

## Security impact

Authority is unchanged. The service remains LocalSystem and accepts no model input, network input, arbitrary path, arbitrary argument, shell command, or alternate executable. Verification remains fail closed against every serialization outside the explicit two-value allowlist.

## Rollback or disable path

Revert this slice and discard the unpromoted v15 staging VM/disk. Do not promote or mutate v15 into an immutable base.

## Next recommended slice

Run complete validation on a clean commit, publish the exact self-contained agent, build a fresh base version from immutable v10, require a matching offline receipt before promotion, then provision one fresh disposable generation and execute the complete readiness/reboot/stop matrix.
