# SCN-001 session-local producer launcher and KVP scene writer

- **Goal:** close the gap between the pipe intake and a live Field scene — start the producer
  inside the active interactive session, and publish the signed scene envelope on the guest
  KVP transport.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion. CHN-001 untouched.
- **Subsystem ownership:** Field/SYSTEM owns session resolution, token handling, the launch
  decision, and the KVP write. The Glove remains the unprivileged producer and runs under the
  interactive user's own token, not SYSTEM's.
- **Files changed:** `FieldSceneProducerLauncher` (new), `FieldKvpRuntime.PublishScene` and the
  `SceneValueName` constant, `GetActiveInteractiveSessionId` widened from private to internal
  for reuse, two new test files, this log, and a Level 4 atomic audit.
- **Identity/generation/policy impact:** adds no new signing authority. The launcher pins one
  session, one interactive user SID, one image path, and one image digest. The KVP writer
  refuses any envelope that is not a scene observation or is bound to a different Field
  generation. Session zero remains invalid on both paths.
- **Parts & Pieces/donors:** reused the existing chunked KVP `WriteEnvelope` path, the
  established SYSTEM identity assertion, and the exact-generation and digest-pinning patterns
  already in the Field code. No donor code copied.
- **Questions/assumptions:** assumes the approved producer image is installed at the fixed path
  with an ACL that prevents unprivileged replacement; the installed-path ACL is assumed, not
  proven, and is not treated as evidence. Assumes the active console session is the correct
  target when several interactive sessions exist.
- **Tests:** 23 new tests. Launcher — exact-match acceptance, non-SYSTEM caller, session zero
  as expected and as observed, session mismatch, four bad approved-SID shapes, missing image,
  replaced image at the approved path, two malformed digests, and identity refusal before any
  token query. KVP writer — non-SYSTEM caller, three non-scene message types refused, wrong
  generation, wrong Field, and scene value-name distinctness.
- **Commands actually run:** `npm run typecheck`, `npm run build`, `npm run
  validate:repository`, `npm run validate:field-contract`, `npm run validate:completion`,
  `npm run test:field`, and .NET SDK 8.0.423 Release build with `-warnaserror` plus the full
  agent test run.
- **Results/evidence:** typecheck and build passed. Repository validation passed, 88 artifacts.
  Field-contract validation passed, 88 artifacts / 28 modules. Field suite passed 51 files /
  263 tests. .NET build passed with 0 warnings and 0 errors; agent tests passed 130/130, up
  from 107 before this slice. `validate:completion` unchanged: CHN-001 `passed`, SCN-001
  `source_validated`, next phase M2, promotion denied.
- **Design note:** the launch decision is separated from the launch itself
  (`ValidateLaunchPolicy` versus `Launch`) because every interesting behaviour here is a
  refusal, and refusals must be reachable in tests without a real interactive session and
  without SYSTEM. All validation runs before a process exists, so there is no partially
  launched state to unwind. The image digest is recomputed from the file that is about to run,
  opened without delete sharing — a path check alone would let a replaced binary inherit the
  producer's standing.
- **Unvalidated:** real LocalSystem-to-interactive `CreateProcessAsUser` across a session
  boundary, `WTSQueryUserToken` behaviour under lock and Secure Desktop, multi-session hosts,
  PID reuse and producer-exit races, installed path ACL, an actual host-side read of the scene
  value, backpressure, and scene cadence under sustained production. Evidence is source/local
  only; the launch and publish paths have no live execution behind them.
- **Security/privacy:** the launcher starts one fixed image and never a caller-supplied command
  line. The producer runs unprivileged under the user's own token. The KVP writer publishes
  only an already-signed scene envelope and logs no payload content.
- **Failure behavior:** every identity, session, user, image, digest, message-type, and
  generation mismatch denies before a process is created or a value is written.
- **Storage:** writes only the guest KVP scene value. No base, overlay, personal-state, or task
  disk mutation.
- **Rollback:** remove `FieldSceneProducerLauncher` and `PublishScene` with their tests, and
  revert `GetActiveInteractiveSessionId` to private. Nothing in the runtime calls either path
  today.
- **Next slice:** wire intake, launcher, and writer into one supervised producer lifecycle, then
  run live SCN-001 failure injection against a real interactive session.
