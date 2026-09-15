# CHN-001 acquisition driver

## Goal and promotion gate

Implement the M1 CHN-001 acquisition contract without granting a test harness Field,
Glove, pilot, model, or MCP authority. The slice prepares reproducible live evidence;
it does not execute the live matrix, record completion evidence, or promote CHN-001.

## Subsystem ownership and files

This is shared completion/Field work. Changed surfaces are the guest KVP runtime and
tests, protected host snapshot reader, `src/completion/chn001Harness.ts`, CHN tests and
package command, runbook, threat model, failure matrix, and this audit record.

## Identity, generation, and policy impact

Every bootstrap payload now carries the runtime-generated boot ID. Compiled verifier
output exposes only non-secret evidence metadata: message ID, nonce, Field/generation,
boot ID, sequence, message type, timestamps, key ID, payload hash validity, verification
time, and transport. The acquisition session binds those values to the exact clean
commit, running VM GUID, production plan, protected runtime configuration, immutable
base, and machine identity.

The pilot cannot create/expand policy, administer a Field, authorize recording,
rotate keys, or approve export. Recording still requires explicit visible consent.
No data path between Fields or from host to guest is added. The base remains immutable;
the driver only reads it in chunks. Finalization requires the exact VM and generation
root to be absent and the base digest unchanged.

## Parts & Pieces and assumptions

Applied content addressing, exact path/generation scope, atomic state publication,
authenticated replay state, and separate authority/evidence roles. The owner ceremony
artifacts are treated as untrusted inputs and must pass closed injection/stop schemas
binding exact commit, machine, Field/generation, VM, mode/scenario, outcome, timing,
and the raw source digest before content hashing, complete-run validation, and
independent review. A typed artifact still does not by itself prove the physical event.

v25 cannot produce a bootstrap message with the new boot binding. A rebuilt immutable
base and its own acceptance evidence are required before live CHN-001 execution.

## Failure behavior

Unknown/mismatched commit, dirty source, VM, GUID, Field, generation, key, plan, base,
runtime, nonce, message ID, sequence, boot ID, artifact, injection, stop, or cleanup
state fails closed. Session lock, Secure Desktop, heartbeat loss, replay, overflow,
uncertain effect, and emergency stop remain live matrix requirements. The harness does
not automate these effects or recover after an emergency-stop failure.

## Tests actually run

- TypeScript typecheck passed.
- Focused CHN contract/harness and Windows script tests passed 26/26.
- .NET Release build passed with zero warnings/errors.
- Focused Field KVP runtime tests passed 7/7.

Complete repository/exact-head validation remains required after commit. No live
Windows/Hyper-V evidence was created by this slice.

## Rollback

Revert this slice and continue denying CHN-001. Do not use a v25 capture to fill the
new boot-bound fields. Acquisition artifacts are non-promotional and may be removed
only from their exact run directory before any evidence record cites them.

## Next recommended slice

Build and accept the next immutable base containing the boot-bound agent, then run the
driver dry plan and production-configured CHN session.
