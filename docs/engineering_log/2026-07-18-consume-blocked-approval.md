# Consume approval on fresh execution block

## Goal

Ensure a proposal whose fresh execution-time policy evaluation blocks becomes terminally denied when its local approval is consumed.

## Files changed

- `apps/windows-agent/AgentHost.cs`
- `apps/windows-agent/SafetyPolicy.cs`
- `apps/windows-agent.Tests/CoreTests.cs`
- `docs/qa/ATOMIC_AUDIT_BASELINE.md`
- `docs/qa/CODEX_WINDOWS_ACCEPTANCE.md`
- `docs/qa/evidence/2026-07-18-phase5-scoped-semantic.json`
- this engineering log

## Parts & Pieces and donor patterns considered

The change follows Exosuit's existing approval registry, deterministic policy, fail-closed state transition, hash-chain audit, and reconciliation patterns. No donor code was copied and no provider capability was expanded.

## Tests added or updated

Added `MarkProposalDeniedConsumesApprovedState` to prove an approved proposal transitions to `denied`. Repeated the live missing-target denial with a locally approved disposable fixture proposal.

## Commands actually run

- `pnpm run typecheck`
- `pnpm test`
- `pnpm run build`
- `pnpm run test:pulse`
- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release`
- authenticated loopback status, observe, propose, execute, audit-tail, and audit-verify requests against the interactive Windows agent

## Results

- TypeScript typecheck and build passed.
- All 34 TypeScript tests passed.
- System pulse passed.
- All 27 .NET tests passed.
- First patched missing-target execution was blocked by `target-resolution-required`.
- Retry was blocked as terminal local policy, with zero `approval_fingerprint_mismatch` events.
- Audit sequences 30-32 recorded proposal, local approval, and execution block; the hash chain verified.
- NuGet emitted `NU1900` because vulnerability metadata was unreachable; no clean audit is claimed.

## Assumptions and unvalidated areas

The interactive proof covers only the disposable fixture and scoped semantic value setting. It does not validate Notepad, other applications, physical input, screenshots, multi-monitor/DPI behavior, Secure MCP Tunnel, or production workflows.

## Security impact

The fix strengthens deny-by-default behavior. A fresh policy block now consumes approval and records a terminal denied state, preventing misleading fingerprint-mismatch classification on retry. It adds no permissions or execution routes.

## Rollback or disable path

Revert `AgentRuntimeState.MarkProposalDenied`, its call in the fresh block branch, and the regression test. Runtime disable paths remain emergency stop, agent termination, Windows-provider disablement, and token rotation.

## Next recommended slice

Complete the remaining Phase 1 startup-denial and emergency-stop checks before any physical-input acceptance.