# L0 MCP protocol cold-start timeout

## Goal

Repair the second exact-head L0 failure, where the MCP protocol integration test exceeded the global 10-second Vitest timeout under cold full-suite contention.

## Files changed

- `tests/mcpProtocol.test.ts`
- `docs/engineering_log/2026-07-24-l0-mcp-protocol-cold-start.md`

## Parts & Pieces and donor patterns considered

The existing coordinator MCP integration-test pattern and Vitest's per-test timeout facility were used. Runtime request deadlines, MCP behavior, policy, approval, execution, verification, and emergency-stop behavior were not changed.

## Tests added or updated

The existing multi-operation in-memory MCP protocol integration test now has a 30-second test-harness ceiling.

## Commands actually run

```text
scripts/windows/Invoke-ExosuitFieldValidation.ps1
npm run typecheck
npx vitest run tests/mcpProtocol.test.ts --reporter=verbose
```

## Results

The exact-head L0 run `20260724T194717Z` passed reproducible dependency installation, repository, master-plan, Field contract, typecheck, Field tests, and Field pulse. The full TypeScript suite then failed because `mcpProtocol.test.ts` took 20.375 seconds under cold full-suite contention and exceeded the global 10-second test-harness ceiling. The coordinator MCP test passed in the same run with its narrow 30-second harness ceiling.

Focused typecheck passed. The MCP protocol test passed in 4.844 seconds of test time and 21.35 seconds total process time, including cold transform and collection.

## Assumptions and unvalidated areas

The complete L0 validator must still run from the beginning on the clean repair commit. No passing L0 claim is made from the failed run or focused rerun.

## Security impact

None. The change does not alter production timeout enforcement, authority, approval, policy, execution, networking, input, persistence, verification, or emergency stopping.

## Rollback or disable path

Revert the test timeout override. The prior global 10-second harness limit will again apply.

## Next recommended slice

Run focused validation, commit this repair, then rerun the complete L0 validator from the beginning on the exact clean commit.
