# Level 4 Addendum: Host Scene Intake

**Date:** 2026-08-11

**Verdict:** pass for outcome separation and replay handling; uncalled and unproven against a
real guest

## Safety question

Can a corrupt scene be mistaken for a rejected one, a rejected one for an absent one, or a
replayed scene be accepted twice?

## Implemented controls

- Four distinct outcomes — absent, unreadable, rejected, accepted — with a test asserting they
  are mutually distinct. Transport faults and authentication decisions are never flattened
  together, because a rejection only counts when it rejected for the exact intended reason.
- The boundary is drawn where authentication begins: absent value, missing chunk, digest
  mismatch, and non-envelope bytes are transport faults; everything the receiver decides is a
  rejection.
- The receiver's own message is preserved verbatim. A reworded reason cannot be matched against
  an expected code.
- The receiver is injected rather than constructed per read, because it holds replay state.
  Constructing one per read would silently disable replay rejection, and the failure would be
  invisible since every scene would be accepted. Tested with one receiver reading the same
  snapshot twice.
- No fallback path exists: this module and the reader beneath it are stateless with respect to
  scene content, so a bad value cannot be answered with the last good one.

## Evidence and residual risk

Thirteen tests; typecheck and build pass.

A test defect was found and fixed during the slice: the original tampered-signature case used a
fabricated signature that failed the envelope schema, so it exercised the transport path rather
than the authentication path it claimed to test. A negative test that never reaches the code it
claims to exercise is worse than no test.

Unproven: nothing calls this module. No host loop polls KVP and feeds it, and no real guest
snapshot has been read through it. Agreement between the guest writer and this reader rests on
construction and on matching the existing PowerShell reader, not on an end-to-end run. SCN-001
remains `source_validated`.

## Rollback

Delete the module and its tests. Nothing depends on it.
