# Exact validation stability

## Goal and gate

Make the exact-head validation runner deterministic after Field runtime
reconciliation exposed a scheduler-dependent harness assertion and Vitest worker RPC
timeouts. This is shared test-infrastructure work supporting M1/CHN-001; it does not
change a gate status or create live evidence.

## Ownership and impact

The Windows Field startup product behavior is unchanged. The test now asserts the
security invariant—locked startup begins only after bootstrap and secret protection,
never enters the normal wait path, and always stops the guest—without requiring an
exact number of bootstrap polls before the deadline. Under host saturation, secret
protection can consume the one-second harness deadline before a second poll occurs.

The exact Windows validation runner now invokes its local Vitest command directly
with one worker. On this host, the npm PowerShell shim did not forward the appended
Vitest worker arguments, so a nominally serialized rerun remained concurrent. The
fast development runner is unchanged and remains available for parallel feedback.

There is no Field identity, generation, policy, recording, data-transfer, immutable
base, overlay, personal-state, task-disk, Glove authority, pilot authority, or MCP
impact. No model can create policy or authorize the validation runner.

## Tests and evidence

The first exact-head run on merge `030c68b` passed repository, plan, completion-plan,
Field-contract, typecheck, Field tests (259/259), and Field pulse (1/1), then failed
the full suite with 672/673 tests plus two worker RPC timeouts. The sole assertion
failure was the scheduler-dependent locked-startup poll count. This failed run is not
a passing claim.

Required follow-up is a focused repeated startup-harness run and a complete clean
exact-head rerun. Live Windows/Hyper-V behavior remains unvalidated by this slice.

## Security and privacy

The revised assertion remains fail-closed: success requires a nonzero launcher exit,
the exact initial bootstrap/protect/guest order, a terminal stop, no normal wait, and
only bootstrap observations between guest start and stop. It does not permit a missed
stop or a continued guest. No private UI, secret, screenshot, or raw demonstration
data is logged.

## Rollback

Revert this commit to restore the exact call-count assertion and default Vitest worker
pool. That rollback restores the observed nondeterminism and is not recommended.

## Next slice

Complete exact-head validation, then implement the CHN-001 live acquisition runner.
