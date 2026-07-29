# Field Audit administrator Sysprep ownership

## Goal

Stop invoking Sysprep from the one-use LocalSystem maintenance service and return final image sealing to the built-in Windows Audit Mode administrator, while retaining SYSTEM-only cleanup and installation work.

## Files changed

- `scripts/windows/Invoke-ExosuitFieldBaseMaintenance.ps1`
- `scripts/windows/Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-29-field-audit-administrator-sysprep.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-29_FIELD_AUDIT_ADMINISTRATOR_SYSPREP.md`

## Parts & Pieces and donor patterns considered

The existing auditUser built-in Administrator entrypoint, one-use LocalSystem service, expiring digest-bound authorization, network-detached requirement, exact account cleanup, component verification, runtime service installation, authorization consumption, maintenance receipt, and immutable host promotion checks remain. Windows' supported Audit Mode administrator Sysprep flow is the platform donor pattern.

## Evidence and cause

Fresh v16 and v17 disposable generations both reached specialize, created the standard development user, configured secure auto-logon, and installed the canonical runtime service, then failed in OOBE before SetupComplete or authenticated KVP. Bounded read-only inspection of v17 recorded `0x8007001f` followed by `0x80004005`, setup phase 4, child `setup.exe` status 1, and offline `IMAGE_STATE_UNDEPLOYABLE`.

The base maintenance receipt proved the previous builder launched final Sysprep from a LocalSystem maintenance service. Microsoft documents that running Sysprep under SYSTEM is unsupported on Windows 11 24H2 and 25H2 because it can skip registration of XAML packages required by the shell. This matches the observed successful maintenance followed by OOBE-shell failure.

## Implementation

The SYSTEM script now completes cleanup/install, consumes its one-use authority, writes a receipt with `sysprep: pending_audit_administrator`, records a terminal SYSTEM stage, and exits. The original auditUser bootstrap waits up to 15 minutes for that receipt, validates every security-critical completion flag, verifies authorization consumption and service exit, re-verifies the current `-500` built-in Administrator identity, writes a separate receipt bound to the SYSTEM receipt hash, and invokes the fixed Sysprep command.

## Tests added or updated

Script-contract tests require the terminal SYSTEM stage, forbid Sysprep launch from the SYSTEM script, and require built-in Administrator identity enforcement, digest binding, fixed arguments, and Sysprep launch from the auditUser bootstrap.

## Commands actually run and results

- PowerShell parser over both changed scripts — passed.
- `npm test -- tests/windowsFieldScripts.test.ts` — passed, 8/8.
- `npm run validate` with `C:\Users\Aidan\.dotnet` first on PATH — repository, plan, and Field validators passed; typecheck passed; 314/314 TypeScript tests passed; production build passed; system pulse and Field pulse passed; 48/48 .NET tests passed.
- `C:\Users\Aidan\.dotnet\dotnet.exe test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --warnaserror` — passed, 48/48 with zero warnings-as-errors.

Exact-commit elevated L0 and live Windows acceptance remain pending until after commit.

## Assumptions and unvalidated areas

The Microsoft guidance directly establishes that SYSTEM Sysprep is unsupported, and live evidence matches its failure class. Static tests cannot prove the new principal completes Sysprep or that fresh OOBE succeeds. A new immutable v18 and fresh disposable Field are required; v16 and v17 remain negative evidence only.

## Security impact

No model, network, persistent service, guest account, or full-control authority is added. SYSTEM authority is reduced: it no longer launches Sysprep. The built-in Audit administrator already owns the reviewed auditUser entrypoint and now performs only the fixed final Sysprep command after validating a digest-bound SYSTEM receipt. Unknown, missing, duplicated, stale, or incomplete state fails closed.

## Rollback or disable path

Do not build a new base and continue using no approved development Field. Reverting restores SYSTEM Sysprep and its live-proven OOBE corruption risk, so reverted images must not be promoted.

## Next recommended slice

Run focused and complete gates, commit and push, execute exact-head L0, build immutable v18 from v10, then prove a fresh disposable Field reaches authenticated readiness before motor acceptance.
