# Level 4 Addendum: Field Scene Producer Client

**Date:** 2026-08-11

**Verdict:** source/local pass for the framing protocol; live producer identity and relay
signing of a real frame remain unproven

## Safety question

Can the producer half send something the intake will accept but the relay should not, or can a
producer bug deny the scene channel?

## Implemented controls

- The producer holds no authority: it cannot sign, cannot read from the privileged side, and
  cannot hold the connection open. Everything it sends is re-derived and re-validated by the
  relay against facts Windows reports about the connecting process.
- Serialization emits exactly the canonical channel representation the relay re-derives and
  compares, asserted byte-for-byte against `FieldSceneProducerBoundary.ToChannelPayload`.
- The frame bound is enforced before connecting, so an oversized scene fails in the producer's
  own process instead of spending the server's one-connection budget on a frame already known
  to be invalid. A producer bug therefore cannot become a denial of the scene channel.
- An empty boot identity and an invalid Field generation are refused before any connection.
- A producer for another generation cannot reach this intake: the name simply is not there.
- A misbehaving producer that bypasses the client's own bound is still refused by the intake.

## Evidence and residual risk

Eleven focused tests, driving the client and intake against each other rather than against
hand-written bytes — a round trip is the only thing that catches a framing disagreement between
the two halves. Full agent suite 226/226 across ten consecutive runs.

This slice also identified the probable cause of the intermittent failure recorded in the
runtime-hook audit: pipe-name contention from a shared `BootId` constant across a test class,
surfacing as `UnauthorizedAccessException` at pipe creation. It reproduced deterministically in
the new tests. Both classes now use per-test boot identities and a leaked pending accept is
cancelled. This remains **probable rather than proven** for the original failure, whose failing
test was never identified.

Unproven: the client has never run in the guest, under the real producer identity, or against a
real relay signature. `WindowsFieldSceneSessionPorts` still has no coverage. No scene has
crossed the authenticated path. SCN-001 remains `source_validated`.

## Rollback

Delete `FieldSceneProducerClient` and its tests. Retain the per-test boot identities regardless:
they fix a real test defect independent of this slice.
