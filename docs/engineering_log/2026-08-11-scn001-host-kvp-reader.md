# SCN-001 host-side KVP value reassembly

- **Goal:** give the host a reader for the chunked guest KVP scene value that distinguishes
  absent from corrupt, and never answers either with a previously good value.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion.
- **Files changed:** `src/fieldSceneKvpReader.ts` (new), its tests, this log, a Level 4 audit.

## Why this is its own module

Reassembly has three outcomes, and collapsing them loses the distinction that matters. A value
that is **absent** is not the same as a value that is **corrupt**, and neither may be answered
with the last good scene. A reader that returns "no scene" for both an empty slot and a failed
digest invites the caller to treat corruption as mere quiet — which is the shape of a false
green this project has hit before.

The reader is stateless by construction, so there is no last-good value available to fall back
to even by accident. A test asserts exactly that.

## Decisions worth recording

- **The manifest is identified by exact shape, not by "looks like JSON".** Scene payloads are
  JSON objects too. A manifest that fails the schema — wrong contract version, chunk count out
  of bounds — is treated as a plain value rather than sending the host walking an unbounded key
  set.
- **A chunk beyond the declared count is a hard failure.** It means the snapshot holds fragments
  of two different writes. Joining only the declared prefix would produce a value that was never
  published as such, which is worse than refusing.
- **Failures return a specific reason instead of throwing.** Every failure has the same correct
  caller response — invalidate, do not reuse — and a thrown error tends to be caught somewhere
  that turns it back into silence.
- Digest verification is over the joined text, matching what the guest writes and what
  `Read-ExosuitFieldGuestKvp.ps1` already does, so host and guest agree on the format.

- **Identity/generation/policy impact:** none. Pure function over a snapshot; no I/O, no
  authority, no transport.
- **Tests:** 15 — absent, plain value, JSON-payload-not-manifest, chunked round trip,
  single-chunk, missing chunk named, digest mismatch, stray trailing chunk, out-of-range chunk
  count, wrong contract version, no fallback to a previous value, absent-versus-unreadable
  distinctness, and three JSON-reading cases.
- **Commands actually run:** `npm run typecheck`, `npm run build`, the focused test file,
  `npm run validate:repository`, `npm run validate:field-contract`.
- **Results/evidence:** typecheck and build passed. Focused suite 15/15. Repository validation 88
  artifacts. Field-contract validation 88 artifacts / 28 modules.
- **Unvalidated:** nothing has read a real guest KVP snapshot through this. It is not yet wired
  into any host path, and the scene envelope verification that would follow reassembly
  (`FieldSceneChannelReceiver`) is not connected to it. SCN-001 remains `source_validated`.
- **Security/privacy:** handles opaque strings; logs nothing.
- **Rollback:** delete the module and its tests. Nothing depends on it yet.
- **Next:** wire reassembly to `FieldSceneChannelReceiver` so a host-side scene read is one
  verified path from KVP snapshot to accepted scene snapshot.
