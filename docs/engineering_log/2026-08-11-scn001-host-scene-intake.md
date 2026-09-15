# SCN-001 host scene intake

- **Goal:** one verified path from a raw guest KVP snapshot to an accepted scene snapshot,
  joining reassembly to the authenticated receiver.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion.
- **Files changed:** `src/fieldSceneKvpIntake.ts` (new), its tests, this log, a Level 4 audit.

## Four outcomes, not two

`absent`, `unreadable`, `rejected`, `accepted`.

Transport corruption and authentication failure both mean "do not act on this scene", but they
are different findings, and flattening them would break a rule this project depends on: a
rejection only counts as a successful negative test when it rejected for the *exact* intended
reason. A caller that cannot tell a truncated KVP value from a bad signature cannot honour that.
There is a test asserting all four statuses are mutually distinct.

The split is drawn where authentication begins. Anything before it — absent value, missing
chunk, digest mismatch, bytes that are not an envelope at all — is `unreadable`. Anything the
receiver decides is `rejected`, and the receiver's own message is preserved **verbatim**,
because a reworded reason is a reason that can no longer be matched against an expected code.

## The receiver is injected, not constructed

It carries replay state. The same instance must see every scene in sequence; building a fresh
one per read would silently disable replay rejection — and the failure would be invisible,
because every scene would simply be accepted. A test drives one receiver twice over the same
snapshot and asserts the second read is rejected.

## No fallback exists

This module and the reader beneath it are stateless with respect to scene content, so there is
no last-good scene to return when a value goes bad. A test accepts a scene, breaks the next one,
and asserts the result carries no scene at all.

- **Identity/generation/policy impact:** none. No new authority; all binding and signature
  decisions remain with `FieldSceneChannelReceiver`.
- **Tests:** 13 — accepted end to end, accepted after chunked transport, absent, truncated
  transport, corrupted chunk, non-envelope value, tampered signature, wrong boot, wrong session,
  verbatim reason, replay, no-fallback, and four-way status distinctness.
- **A test defect worth recording:** the first tampered-signature test used a fabricated
  64-character signature, which failed the envelope *schema* and so returned `unreadable`. The
  code was right and the test was wrong. It now flips one character of a real signature, which
  stays schema-valid and therefore actually reaches authentication. A negative test that never
  reaches the code it claims to exercise is worse than no test.
- **Commands actually run:** `npm run typecheck`, `npm run build`, the focused test file,
  `npm run validate:repository`, `npm run validate:field-contract`.
- **Results/evidence:** typecheck and build passed. Focused suite 13/13. Repository validation 88
  artifacts. Field-contract validation 88 artifacts / 28 modules.
- **Unvalidated:** no real guest snapshot has been read through this path. Nothing calls it yet —
  no host loop polls KVP and feeds it. The guest writer and this reader agree by construction and
  by matching the existing PowerShell reader, not by an end-to-end run. SCN-001 remains
  `source_validated`.
- **Security/privacy:** handles structural scene payloads the producer boundary already stripped
  of UI text; logs nothing.
- **Rollback:** delete the module and its tests.
- **Next:** a host polling loop that calls this on an interval and maps the four outcomes onto
  the supervisor's invalidation vocabulary.
