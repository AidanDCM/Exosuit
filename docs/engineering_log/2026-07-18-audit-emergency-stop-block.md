# Audit emergency-stop execution blocks

## Goal

Record execution attempts that are denied before fresh provider evaluation because emergency stop is active or the proposal is already terminal.

## Files changed

- `apps/windows-agent/AgentHost.cs`
- `docs/qa/CODEX_WINDOWS_ACCEPTANCE.md`
- `docs/qa/ATOMIC_AUDIT_BASELINE.md`
- `docs/qa/evidence/2026-07-18-phase8-fake-emergency-stop.json`
- this engineering log

## Parts & Pieces and donor patterns considered

The slice applies Exosuit's hash-chain event ledger, fail-closed policy, reconciliation, and evidence-source discipline. No donor code was copied and no action capability changed.

## Tests added or updated

No new schema was introduced. The live fake-provider sequence prepared an allowed action, triggered emergency stop, attempted execution, proposed another mutation, verified the audit chain, and required an `action_blocked_before_execution` event.

## Commands actually run

- `pnpm run typecheck`
- `pnpm test`
- `pnpm run build`
- `pnpm run test:pulse`
- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release`
- authenticated loopback fake-provider observe, propose, emergency-stop, execute, status, audit-tail, and audit-verify requests

## Results

- Emergency stop returned in 8.06 ms in the fake-provider run.
- The prepared proposal was denied and its execution was blocked without verification.
- Later mutation was blocked by `emergency-stop-lock`.
- Audit sequence 4 recorded `action_blocked_before_execution` with emergency stop active and proposal status denied.
- Audit verification passed.
- Typecheck/build, 34 TypeScript tests, system pulse, and 27 .NET tests passed.
- NuGet emitted `NU1900`; no clean vulnerability audit is claimed.

## Assumptions and unvalidated areas

The latency measurement covers only the fake provider. Real pointer/typing interruption, cancellation timeout, and physical stop latency remain unvalidated and require a disposable VM snapshot.

## Security impact

The change adds audit evidence for an already-blocked execution path. It does not change permission decisions, provider behavior, or physical-input availability.

## Rollback or disable path

Remove the `action_blocked_before_execution` append in the terminal execution branch. Emergency-stop behavior remains available independently of this additional audit event.

## Next recommended slice

Run the remaining pure/fake fault-injection checks, then require explicit disposable-VM confirmation before any real motor acceptance.