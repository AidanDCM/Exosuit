# Multi-window coordinator foundation

## Goal

Introduce the first reviewable Phase 2 foundation: versioned workspace/window/workflow contracts, fail-closed identity continuity, dependency-graph validation, and deterministic resource leases without executing desktop actions.

## Files changed

- `src/coordinator.ts`
- `tests/coordinator.test.ts`
- `docs/qa/evidence/2026-07-19-phase2-coordinator-foundation.json`
- `docs/qa/ATOMIC_AUDIT_2026-07-19_COORDINATOR_FOUNDATION.md`
- `docs/engineering_log/2026-07-19-coordinator-foundation.md`

## Parts & Pieces and donor patterns considered

The slice follows the repository's Dev Orchestrator pattern of explicit task graphs and bounded state transitions, plus the master-roadmap resource model of window generations, read/write locks, and one focus lease per Windows session. No donor code was copied. Generic database read/write lock semantics were narrowed to deterministic in-memory coordinator leases with bounded TTLs.

## Tests added or updated

Nine coordinator tests cover monotonic registry versions, fingerprint/generation continuity, stale generations, unexpected dialogs, valid DAGs, missing/duplicate/cyclic steps, parallel readers, conflicting writers, focus serialization, expiry, and emergency-stop invalidation.

## Commands actually run and results

- `pnpm run typecheck`: passed.
- `pnpm test -- tests/coordinator.test.ts`: the configured suite ran; 43 tests passed across seven files, including nine coordinator tests.
- `pnpm run build`: passed.
- `pnpm run test:pulse`: passed.
- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --no-restore`: 29 passed; `NU1900` remained.

## Assumptions and unvalidated areas

The lease manager is process-local and in-memory. This slice assumes a single coordinator process and a trustworthy monotonic caller-provided clock for deterministic tests. It does not yet implement persistence, distributed locking, workflow execution, artifact movement, checkpoints, recovery, MCP exposure, or interactive Windows behavior.

## Security impact

The new module has no desktop execution or approval authority. Unknown/stale window generations, identity changes without generation advancement, unexpected dialogs, conflicting mutations, and concurrent focus ownership fail closed. Emergency stop removes coordinator authority represented by session leases.

## Rollback or disable path

Remove `src/coordinator.ts` and its tests; no current MCP tool or execution path imports the module, so the existing single-action core remains unchanged.

## Next recommended slice

Add the workflow runtime and step lifecycle: dependency gating, verification-required completion, dependent-step blocking, checkpoints, and recovery states. Keep desktop execution behind the existing proposal gateway.
