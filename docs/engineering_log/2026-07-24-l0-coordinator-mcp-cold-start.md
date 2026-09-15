# L0 coordinator MCP cold-start timeout

## Goal

Repair the exact-head L0 failure observed when the coordinator MCP integration test exceeded the global 10-second Vitest timeout after a cold reproducible `npm ci`.

## Files changed

- `tests/coordinatorMcp.test.ts`
- `docs/engineering_log/2026-07-24-l0-coordinator-mcp-cold-start.md`

## Parts & Pieces and donor patterns considered

The existing per-test Vitest timeout facility was used. Runtime workflow deadlines, MCP request behavior, policy, approval, execution, and verification code were not changed.

## Tests added or updated

The existing multi-operation in-memory MCP integration test now has a 30-second test-harness ceiling. Its workflow step retains the existing 5-second runtime timeout.

## Commands actually run

```text
scripts/windows/Invoke-ExosuitFieldValidation.ps1
npx vitest run tests/coordinatorMcp.test.ts --reporter=verbose
```

## Results

The exact-head L0 run `20260724T192447Z` passed reproducible dependency installation, repository, master-plan, Field contract, typecheck, Field tests, and Field pulse, then failed because `coordinatorMcp.test.ts` took 17.2 seconds under full-suite cold-start contention. The isolated test subsequently passed in 7.0 seconds of test time and 26.2 seconds total process time. This confirms a test-harness timing ceiling rather than a changed runtime deadline.

## Assumptions and unvalidated areas

The complete L0 validator must rerun from the beginning on the clean repair commit. No passing L0 claim is made from the failed run or focused rerun.

## Security impact

None. The change does not alter production timeout enforcement, authority, approval, policy, execution, networking, input, or persistence.

## Rollback or disable path

Revert the test timeout override. The prior global 10-second harness limit will again apply.

## Next recommended slice

Run focused validation, commit this repair, then rerun complete L0 from the beginning on the exact clean commit.
