# SCN-001 one-way scene pipe intake

- **Goal:** give the scene relay a fixed, ACL'd, one-way transport with a bounded frame and a
  one-connection budget, and wire the Windows client resolver to the signing boundary.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion. CHN-001 is untouched.
- **Subsystem ownership:** Field/SYSTEM owns the listener, the ACL, and frame bounds. The
  Glove remains the unprivileged producer and gains no read access. Signing authority stays
  with `FieldSceneRelayBoundary`; the transport decides nothing about trust.
- **Files changed:** `FieldSceneRelayPipeServer`, `FieldSceneRelayIntakeService`, their tests,
  this log, and a Level 4 atomic audit.
- **Identity/generation/policy impact:** adds no policy authority and no new signing path. The
  pipe name binds exact Field ID, generation, and boot ID; the intake service refuses to sign
  when its generation or boot differs from the policy's. Session zero and non-`S-1-5-21-`
  producer SIDs remain invalid.
- **Parts & Pieces/donors:** reused Exosuit's existing fixed-boundary, fail-closed,
  exact-generation, and Windows-derived-identity patterns. No donor code copied.
- **Questions/assumptions:** assumes the production producer runs as the one approved
  interactive user in the active session. The session-local launcher, installed agent path
  ACL, and KVP scene writer remain unresolved and are not claimed here.
- **Tests:** 14 focused tests — non-SYSTEM denial, empty boot, four bad producer SIDs, name
  binding, ACL grant/withhold set, real local connection, budget spend on success and on
  rejection, zero-length and oversized declarations, truncation, and a second frame on one
  connection.
- **Commands actually run:** `npm run typecheck`, `npm run build`, `npm run
  validate:repository`, `npm run validate:field-contract`, `npm run validate:plan`, `npm run
  validate:completion`, `npm run test:field`, and .NET SDK 8.0.423 Release build with
  `-warnaserror` plus the full agent test run.
- **Results/evidence:** typecheck and build passed. Repository validation passed, 88 required
  artifacts. Field-contract validation passed, 88 artifacts / 28 modules. Plan validation
  passed, 73,121 characters / 22 phases. Field suite passed 51 files / 263 tests. .NET build
  passed with 0 warnings and 0 errors; agent tests passed 107/107, up from 93 before this
  slice. `validate:completion` is unchanged by this slice: CHN-001 remains `passed`, SCN-001
  remains `source_validated`, next phase remains M2, promotion remains denied.
- **Correction worth recording:** the minimal producer ACL was determined by probing the
  platform, not by reasoning about `FILE_GENERIC_WRITE`. The first hand-derived set was denied
  at `CreateFile`, and a second guess added `CreateNewInstance`, which the probe showed to be
  unnecessary — it would have granted pipe-instance creation, and therefore name squatting
  after close, for nothing. The shipped set is write + `FILE_READ_ATTRIBUTES` + `SYNCHRONIZE`.
  Guessing at a Windows access mask produces ACLs that are wrong in both directions.
- **Unvalidated:** live LocalSystem-to-interactive operation, session-local launcher, PID
  reuse and client-exit races, installed path ACL, KVP scene write/read, backpressure, and
  lock/Secure Desktop transitions. Evidence is source/local only.
- **Security/privacy:** the intake handles opaque payload bytes and process identity metadata.
  It reads no UI text and logs no payload content. The producer is never granted read access.
- **Failure behavior:** every identity, ACL, framing, bound, budget, and generation mismatch
  denies before an envelope exists.
- **Storage:** no base, overlay, personal-state, or task disk mutation.
- **Rollback:** remove the two source files and their tests, or leave them unwired. No runtime
  constructs the intake today.
- **Next slice:** the session-local producer launcher and the KVP scene writer, then live
  SCN-001 failure injection against a real interactive session.
