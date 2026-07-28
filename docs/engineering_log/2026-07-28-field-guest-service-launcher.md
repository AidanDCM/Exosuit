# Field guest service launcher

## Goal

Replace the unreliable scheduled-task runtime dispatch with an SCM-managed LocalSystem service while preserving the exact fail-closed PowerShell bootstrap and authenticated KVP runtime.

## Files changed

- `apps/windows-agent/Exosuit.Agent.csproj`
- `apps/windows-agent/Program.cs`
- `apps/windows-agent/FieldGuestServiceHost.cs`
- `apps/windows-agent.Tests/FieldGuestServiceHostTests.cs`
- `scripts/windows/Install-ExosuitFieldGuest.ps1`
- `scripts/windows/SetupComplete-ExosuitFieldGuest.cmd`
- `scripts/windows/Seal-ExosuitFieldBase.ps1`
- `scripts/windows/Invoke-ExosuitFieldBaseMaintenance.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-28_FIELD_GUEST_SERVICE_LAUNCHER.md`
- this log

## Parts & Pieces and donor patterns considered

The service follows the repository's proven LocalSystem SCM dispatch pattern from one-use base maintenance, but remains a distinct fixed runtime service. It reuses the existing startup wrapper, manifest/bootstrap evaluator, authenticated KVP runtime, desktop-ready wait, and service recovery delays. Keeping the dual-trigger task, adding more triggers, using Run/RunOnce, broad PowerShell Direct, widening the standard account, or editing TaskCache internals were rejected.

## Tests added or updated

.NET tests assert the fixed executable, fixed arguments, no shell, hidden process, canonical service name, and LocalSystem-only identity. PowerShell contract tests require automatic LocalSystem registration, bounded recovery, legacy task removal, explicit start during SetupComplete, base-seal verification, and maintenance-image migration.

## Commands actually run

- PowerShell AST parse of installer, base-seal, and base-maintenance scripts
- `%USERPROFILE%\.dotnet\dotnet.exe restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj`
- `%USERPROFILE%\.dotnet\dotnet.exe test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --no-restore`
- `npm test -- --run tests/windowsFieldScripts.test.ts`
- `npm run validate` with `%USERPROFILE%\.dotnet` prepended to `PATH`
- `%USERPROFILE%\.dotnet\dotnet.exe build apps/windows-agent/Exosuit.Agent.csproj -c Release --no-restore -warnaserror`
- `%USERPROFILE%\.dotnet\dotnet.exe list apps/windows-agent/Exosuit.Agent.csproj package --vulnerable --include-transitive`

## Results

- PowerShell parse: passed;
- focused Windows script tests: 8/8 passed;
- TypeScript suite: 314/314 passed;
- .NET suite: 48/48 passed;
- repository, roadmap, and Field contract validators: passed;
- TypeScript typecheck/build and both system pulses: passed;
- .NET Release warning-as-error build: zero warnings and zero errors;
- NuGet vulnerability scan: no vulnerable direct or transitive packages.

The first bare `npm run validate` invocation reached the known host `PATH` defect at its final .NET wrapper step because `dotnet` resolved to a hostfxr-only installation. Repeating the same canonical command with the installed SDK directory prepended passed completely; direct .NET test and Release build commands had already passed through that SDK.

## Assumptions and unvalidated areas

SCM start/recovery behavior, process-tree stopping, Sysprep persistence, first enrollment, KVP readiness, and reboot repeatability require a fresh reviewed base and disposable generation. Existing v13/v14 disks do not contain this service and remain negative evidence only.

## Security impact

This replaces one persistent LocalSystem launcher with another. The service accepts no model command, network input, arbitrary executable, script, configuration path, or user identity. It invokes only the fixed bootstrap wrapper, which still enforces manifest identity, policy, binary digest, display, session, channel, and durable-enrollment checks before starting KVP. SCM recovery cannot bypass those checks. Stop kills the entire child process tree.

## Rollback or disable path

Stop and disable the `ExosuitFieldGuest` service or revert this slice and build a new base with the legacy task. Destroy the disposable generation if live acceptance fails. Do not modify an immutable reviewed base in place.

## Next recommended slice

Run focused and full validation, publish a self-contained Windows agent, build a reviewed replacement base, provision one fresh isolated development generation, and execute the complete bootstrap/readiness/reboot recovery matrix.
