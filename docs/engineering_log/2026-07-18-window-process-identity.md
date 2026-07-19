# Window process identity recovery

## Goal

Preserve raw-input process scoping when Windows UI Automation reports a top-level window with process ID `0` by recovering the owning process ID from its native window handle.

## Files changed

- `apps/windows-agent/DesktopProviders.cs`
- `apps/windows-agent/Exosuit.Agent.csproj`
- `apps/windows-agent.Tests/CoreTests.cs`
- `docs/qa/ATOMIC_AUDIT_BASELINE.md`

## Parts & Pieces and donor patterns considered

The existing `ToWindow` conversion and process-name allowlist remain the policy boundary. The donor pattern is the documented Win32 `GetWindowThreadProcessId` handle-to-process lookup. No third-party code was copied. Allowlisting the observed fallback name `Idle` was rejected because it would weaken target identity and invalidate the acceptance test.

## Tests added or updated

`WindowProcessIdentityFallsBackToNativeWindowHandle` proves a zero automation process ID uses the native-window lookup and resolves the corresponding process name.

## Commands actually run and results

- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --no-restore`: passed, 28 tests; `NU1900` vulnerability metadata remained unavailable.
- `dotnet build apps/windows-agent/Exosuit.Agent.csproj -c Release --no-restore`: passed.
- `dotnet build apps/windows-agent.AcceptanceFixture/Exosuit.AcceptanceFixture.csproj -c Release --no-restore`: passed.
- `pnpm run typecheck`: passed.
- `pnpm test`: passed, 34 tests. The first sandboxed run could not resolve `vitest.config.ts`; the approved rerun outside the filesystem sandbox passed.
- `pnpm run build`: passed.
- `pnpm run test:pulse`: passed. The approved rerun outside the filesystem sandbox passed.

## Assumptions and unvalidated areas

The Win32 lookup is used only when UI Automation supplies no positive process ID. A failed lookup remains `unknown`/PID `0` and therefore fails process allowlisting. Live Sandbox acceptance is still pending and will be recorded separately. Multi-monitor, DPI, screenshots, consequential controls, and production use remain unvalidated.

## Security impact

This tightens identity recovery without relaxing policy. Raw input still requires full-control startup gates, physical-input enablement, an active freshly resolved window, an exact process allowlist match, and local typed approval. Unknown identity continues to fail closed.

## Rollback or disable path

Revert the `WindowProcessIdentity` helper, `GetWindowThreadProcessId` import, and its call in `ToWindow`. Physical input can also be disabled with `EXOSUIT_ENABLE_PHYSICAL_INPUT=false`; removing the process allowlist or full-control acknowledgement prevents startup.

## Next recommended slice

Repeat the disposable Windows Sandbox motor acceptance and record the recovered fixture identity, local approvals, execution verification, audit-chain validation, and teardown evidence.
