# SCN-001 scene producer client

- **Goal:** add the producer half of the one-way intake — the unprivileged side that connects,
  writes one bounded frame, and disconnects — and prove the two halves agree on the protocol.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion.
- **Files changed:** `FieldSceneProducerClient` (new), its tests, per-test boot identities in
  `FieldSceneRelayPipeServerTests`, this log, a Level 4 atomic audit.

## The client

Deliberately tiny, because the producer holds no authority. It cannot sign, cannot read from
the privileged side, and cannot keep the connection open. Everything it sends is re-derived and
re-validated by the relay boundary against facts Windows reports about the connecting process,
so nothing is trusted on the strength of having been sent.

The frame bound is enforced **before** connecting. A producer that has built an oversized scene
should fail in its own process rather than opening a connection it cannot legally complete: the
intake would reject it anyway, and spending the server's one-connection budget on a frame
already known to be invalid would turn a producer bug into a denial of the scene channel.

Tests drive the client and the intake against each other rather than against hand-written
bytes. A round trip is the only thing that catches a framing disagreement between the two
halves, and the round-trip assertion is byte-for-byte.

## Probable root cause of the earlier intermittent failure

The previous slice recorded an unexplained 204/205 run that never recurred. While writing this
slice the same failure reproduced deterministically: `UnauthorizedAccessException` from
`NamedPipeServerStreamAcl.Create`.

The cause is pipe-name contention. The pipe name is derived from Field generation and boot ID,
and `FieldSceneRelayPipeServerTests` shared one `BootId` constant across the whole class, so
every `LocalWindows` test there created a server on the **same** name. When one server has not
finished releasing the name as the next test creates its own, creation fails with access denied
rather than with anything that names a collision. My new client tests had the same defect and
hit it immediately, which is how it was found.

Both classes now use a per-test boot identity, and one test that left an accept pending forever
— holding the name past the end of the test — now cancels it.

This is a **probable**, not proven, explanation for the original failure: that run's failing
test was never identified, so it cannot be matched to this cause with certainty. The mechanism
and the failure signature match exactly, and eleven full runs since the fix are clean.

- **Identity/generation/policy impact:** none. The client adds no authority and no new
  transport.
- **Tests:** 11 new client tests plus the collision fix in the existing suite.
- **Commands actually run:** .NET SDK 8.0.423 Release build with `-warnaserror`, focused and
  repeated full agent test runs, `npm run validate:field-contract`, `npm run
  validate:repository`.
- **Results/evidence:** build 0 warnings / 0 errors. Focused client tests 11/11, repeated three
  times. Full agent suite 226/226, repeated ten times clean. Field-contract validation 88
  artifacts / 28 modules. Repository validation 88 artifacts.
- **Unvalidated:** the client has never run in the guest or under the real producer identity.
  Relay signing of a real frame, `WindowsFieldSceneSessionPorts`, and the whole live path remain
  unproven. SCN-001 remains `source_validated`.
- **Security/privacy:** sends only the canonical structural payload the producer boundary
  already sanitized. Reads nothing back.
- **Rollback:** delete `FieldSceneProducerClient` and its tests. Keep the per-test boot
  identities regardless — they fix a real test defect independent of this slice.
