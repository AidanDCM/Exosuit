# Level 4 atomic audit: phase-correct stop gates

## Decision

Approved for source validation, subject to the recorded test matrix. CHN-001 v2
requires only healthy- and degraded-channel exact-Field host stops. Active execution
stop is ACT-001.23 and active recording stop is TCH-001.12. Both remain mandatory
before personal MVP, daily-driver, or production promotion.

This audit supersedes the CHN-001 v1 acceptance-contract row count for new evaluation;
the earlier audit remains immutable historical evidence of the contract the live
session originally attempted.

## Boundary correction

CHN-001 v1 required a stop during execution and a stop during recording even though
its M1/L2 dependencies provide neither authority. The live run exposed the contradiction:
eleven channel/readiness rows and two host stops were executable, while the repository
explicitly reported no live Teach hooks. A synthetic recorder, owner assertion, or VM-Off
state would not prove capture hooks stopped.

## Migration controls

- The original evidence commit remains immutable and named in the candidate.
- The evaluation commit is separate and must descend from the evidence commit.
- The changed-file list is sorted, content-addressed, and restricted to the reviewed
  completion contract, tests, roadmap, threat model, manuals, audit, and change log.
- Any runtime, provider, Field script, policy, key, transport, or provisioning change
  rejects migration and requires a new live acquisition.
- Migration cannot manufacture CHN-001.12, ACT-001.23, TCH-001.12, recording, execution,
  cleanup, reviewer approval, or promotion evidence.

## Recording-stop proof boundary

The strict TCH-001.12 schema binds exact commit, machine, Field/generation, VM, active
owner consent, visible indication, trigger and stop times, stopped capture hooks,
invalidated pending input, independent model/channel paths, Field Off, and content
addresses. It rejects raw event/UI fields through a closed schema. It is a proof
contract only; no capture or recording capability is enabled by this change.

## Abuse review

The change grants no model, MCP, pilot, guest, recorder, or harness authority. It does
not weaken consent, indicator, privacy, deletion, credential exclusion, input denial,
five-second stop timing, exact-generation identity, or independent review. Retiring the
misplaced CHN identifier cannot be used to waive the moved ACT/TCH requirements.

## Rollback

Revert this slice, discard any v2 migrated candidate, and retain the v1 session as
incomplete. Never convert a migrated v2 candidate back into a v1 pass or synthesize the
retired row.
