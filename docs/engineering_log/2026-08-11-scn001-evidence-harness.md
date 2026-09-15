# The SCN-001 evidence harness, and a rule CHN-001 held only by review

## What was missing

Every other live gate that has run has a contract module and an acquisition driver: `chn001.ts` +
`chn001Harness.ts`, `hyp001.ts` + `hyp001Harness.ts`. SCN-001 had neither. The L1–L11 matrix
existed only as a table in the runbook, which meant the session could have been run and its
evidence would have had nowhere to go that could check it.

Added: `src/completion/scn001.ts` (contract), `src/completion/scn001Harness.ts` (driver),
`tests/scn001.test.ts`, `tests/scn001Harness.test.ts`, `tests/scn001ReasonCoupling.test.ts`, and
the `test:scn001` / `scn001:harness` scripts.

## The thing worth keeping

The project's stated rule is that a negative test passes only when it failed for the intended
reason. `readSceneFromKvp` says so in a comment, and the SCN-001 runbook makes it a stop
condition: *a right answer for the wrong reason is a failure, not a pass.*

CHN-001's contract does not enforce it. `chn001.ts` carries `expectedCode` and `actualCode` on
every failure injection and never compares them — `tests/chn001.test.ts` builds a run with
`expectedCode: "expected-0"` against `actualCode: "actual-0"` and the contract accepts it. The
harness copies both fields verbatim from the operator's artifact. So for CHN-001 the rule held
because a human read the evidence and checked, which is a real check, but not the one the
documents describe.

That is not a claim CHN-001 was wrong. Its recorded `actualCode`s are the right ones. It is a
claim that the mechanism was weaker than the written rule, and that SCN-001 should not inherit it.

## How SCN-001 enforces it instead

The expected reason for each ceremony is pinned in `scn001Expectations`, in the contract, not in
the artifact. The operator supplies only what was observed. There is deliberately nowhere in
`scn001CeremonyArtifactSchema` to state an expectation, so an operator cannot supply both sides of
the comparison and satisfy it trivially. The harness checks at import time rather than at
finalize, because a wrong-reason pass discovered at finalize costs the whole session.

The pinned strings for the negative cases are the runtime's own messages, lifted from
`FieldSceneHostMonitor` and `readSceneFromKvp`. `scn001ReasonCoupling.test.ts` drives the real
monitor into each state and asserts the pinned string is what actually comes out. Rewording an
invalidation reason therefore fails the suite. That cost is the point: a contract that pins a
reason the runtime no longer emits would keep passing while asserting nothing.

`SCN-001.L10` pins two reasons in order — absent, then corrupt — because one code would let a run
prove the easier half and claim the other.

## L5

The runbook singles out L5: if it passes trivially, confirm the scene under test was genuinely
captured before the lock. That warning is now a check rather than advice. The unlock proof carries
`lockedAt`, `unlockedAt`, and both scenes' capture and presentation times, and the contract
rejects the run if the "stale" scene was captured after the lock, if the scene that restored
readiness was not captured after the unlock, or if the stale scene was presented before the
unlock. The stale scene must also record `signatureValid`, `bootMatched`, `sessionMatched`, and
`sequenceAccepted` as true: a scene rejected for a bad signature would be the wrong evidence, and
the case only means something if the scene was valid by every check except freshness.

## Producer identity

L1, L7, and L11 are bound into one process-identity chain: the PID killed in L7 must be the PID
launched in L1, the relaunched PID must differ from the killed one, and the PID torn down in L11
must be the relaunched one. "The exact producer is terminated" is otherwise unfalsifiable from
evidence — three unrelated PIDs would read the same.

## What this does not do

It records nothing and promotes nothing. `finalize` writes a validated candidate and says so. No
ceremony has been run against a guest; every component here is source with unit coverage, which
is exactly the status the runbook warns not to mistake for promotion evidence. The completion
validator is unchanged at 32.39% proven, SCN-001 still `source_validated`.

## Open

The CHN-001 expected/actual gap is left as it is. Changing `chn001.ts` now would alter a contract
that already promoted a gate, and the fix belongs with a decision about whether CHN-001's evidence
is re-verified under it rather than as a side effect of SCN work.
