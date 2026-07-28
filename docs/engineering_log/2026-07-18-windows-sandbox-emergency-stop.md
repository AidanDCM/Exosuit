# Windows Sandbox real emergency-stop interruption

## Goal

Prove the local emergency stop interrupts an in-flight real Windows input action, permanently stops the session, blocks later mutation, and preserves a valid audit chain. Prove the provider-cancellation-timeout branch separately with a hanging fake provider.

## Files changed

- `.sandbox-launch/bootstrap.ps1`
- `.sandbox-launch/emergency-runner.ps1`
- `.sandbox-launch/acceptance-runner.ps1`
- `apps/windows-agent/AgentHost.cs`
- `apps/windows-agent.Tests/CoreTests.cs`
- `docs/qa/evidence/2026-07-18-phase8-windows-sandbox-emergency-stop.json`
- `docs/qa/CODEX_WINDOWS_ACCEPTANCE.md`
- `docs/qa/ATOMIC_AUDIT_BASELINE.md`

## Parts & Pieces and donor patterns considered

The runner reused the existing local control-panel stop, provider cancellation token, emergency-stop lock, loopback status/audit endpoints, and disposable fixture. The real provider was not modified or faulted to simulate a timeout. The timeout branch uses a test-only hanging provider, consistent with the rule that tests use fake providers unless explicitly local/manual.

## Tests added or updated

`EmergencyStopRemainsActiveWhenProviderCancellationTimesOut` proves a cancellation deadline overrun leaves the state stopped, denies pending proposals, records `emergency_stop_provider_timeout`, records the terminal stop event with `providerCancellationTimedOut=true`, and preserves a valid audit chain.

## Commands actually run and results

- Real Windows Sandbox bounded typing action: cancelled by local control-panel emergency stop.
- Post-stop proposal: blocked by `emergency-stop-lock`.
- Guest audit verification: valid, 11 events checked.
- Audit delta from `emergency_stop` to `action_cancelled`: 2.40 ms.
- Human reaction plus host-evidence polling: 9982.46 ms; not presented as internal stop latency.
- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --no-restore`: 29 passed; `NU1900` remained.

## Assumptions and unvalidated areas

The live run interrupted typing in the disposable fixture only. It did not induce a real Windows provider cancellation timeout, because doing so would require an acceptance-only fault hook in production code; that branch is covered by the hanging fake-provider test. Pointer interruption, multi-monitor/DPI, screenshots, consequential controls, and production accounts remain unvalidated.

## Security impact

Emergency stop remained model-independent and locally invoked. The stopped state persisted after provider cancellation, pending work was denied, later mutation failed through `emergency-stop-lock`, and restart remained required. Audit data containing action payload text was kept in the host temporary evidence directory and was not committed.

## Rollback or disable path

Delete the temporary `.sandbox-launch/` harness. Physical input remains disabled unless every existing startup gate and allowlist requirement is satisfied. Closing Windows Sandbox erases the guest.

## Next recommended slice

Complete the final full test matrix, review the combined diff, and publish only as a draft PR with the remaining limitations explicit.
