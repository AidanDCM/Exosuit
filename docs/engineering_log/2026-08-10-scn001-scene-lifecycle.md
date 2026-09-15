# SCN-001 supervised scene lifecycle

- **Goal:** connect supervisor → launcher → producer → `Exosuit.Field.Scene` KVP → host intake
  → relay into one supervised lifecycle, and decide when a scene may actually be acted on.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion. CHN-001 untouched.
- **Subsystem ownership:** Field owns the lifecycle decision, producer supervision, and
  teardown. The Glove remains the unprivileged producer. Signing authority stays with
  `FieldSceneRelayBoundary`; this layer grants no new authority and signs nothing.
- **Files changed:** `FieldSceneLifecycle` (new) with `FieldSceneReadiness`,
  `FieldSceneLifecycleState`, and `FieldSceneTeardown`; one new test file; this log; a Level 4
  atomic audit.
- **Core rule:** completing an action is not verifying its effect. A running producer proves
  nothing about whether the scene it last published still describes the desktop, so readiness
  is derived from live conditions and revoked on any change rather than latched at startup.
  Invalidation is one-way until a *fresh* scene arrives — a previously verified scene is never
  re-promoted, because whatever invalidated it is exactly why its contents can no longer be
  trusted.
- **Design note:** the lifecycle performs no I/O, launches nothing, and signs nothing. That is
  deliberate: every one of the nine required failure paths is a refusal or an invalidation, and
  all of them must be reachable in a test without a live guest, without SYSTEM, and without a
  real interactive session. The wiring that drives it owns the Windows calls.

## Required failure paths and where each is proven

| Required behaviour | Covered by |
| --- | --- |
| Producer dies unexpectedly → scene state invalid | `ProducerDeathInvalidatesReadiness`, `ACleanProducerExitInvalidatesJustAsFirmlyAsACrash`, `ADeadProducerCannotPublishAFurtherScene` |
| Wrong session/user → no launch | `RejectsAProducerLaunchedIntoTheWrongSession`, `RejectsAProducerLaunchedIntoSessionZero`, `RejectsAProducerRunningAsADifferentUser`, plus the launcher's own refusals |
| Producer binary digest changes → no launch | `FieldSceneProducerLauncherTests.RejectsAReplacedProducerImageAtTheApprovedPath` (launcher layer, not re-checked here) |
| Stale Field generation → scene rejected | `RejectsASceneFromADifferentFieldGeneration`, plus `RejectsASceneFromADifferentBoot` and `RejectsASceneFromADifferentSession` |
| KVP scene value missing/corrupt → no stale reuse | `AnUnreadableSceneValueInvalidatesAndDoesNotReuseTheLastScene`, `AMissingSceneValueDoesNotFallBackToAnOlderScene` |
| Host intake restarts → fresh scene required | `HostIntakeRestartRequiresAFreshSceneRatherThanCachedState` |
| Guest reboot / boot-ID change → previous scene invalidated | `BootIdChangeInvalidatesThePreviousSceneAndTheProducer`, `AnUnchangedBootIdIsNotAnInvalidation` |
| Lock/Secure Desktop → producer may exist, readiness clears | `LockClearsActionableReadinessWhileTheProducerKeepsRunning`, `SecureDesktopClearsActionableReadinessWhileTheProducerKeepsRunning`, `UnlockingAloneDoesNotRestoreReadiness`, `ASceneObservedOnANonActionableDesktopIsNeverRetained` |
| Clean teardown → producer terminated with the exact Field/session lifecycle | `TeardownReportsTheExactProducerAndFieldLifecycleToStop`, `ATornDownLifecycleCannotBeReused`, `TeardownAfterProducerDeathReportsNoOrphanToStop` |

Two behaviours are worth calling out because they are easy to get wrong in the permissive
direction. Unlocking alone does not restore readiness — the desktop may have changed while
nothing was observing it, so only a fresh scene can. And a scene arriving while the desktop is
locked or on the Secure Desktop is not retained at all rather than stored-but-withheld, so
there is nothing for a later state change to promote.

- **Identity/generation/policy impact:** adds no signing authority and no new transport. Scene
  acceptance is bound to the exact Field generation, boot, and interactive session; teardown
  reports the exact producer PID and Field lifecycle so a caller cannot orphan a producer.
- **Parts & Pieces/donors:** reused the existing exact-generation binding, fail-closed refusal,
  and one-way-invalidation patterns already in the Field code. No donor code copied.
- **Questions/assumptions:** assumes the driver reports desktop lock and Secure Desktop
  transitions promptly; a missed transition would leave readiness set for longer than the
  desktop justifies. That detection is the live wiring's responsibility and is not proven here.
- **Tests:** 28 new tests covering startup, all nine required failure paths, construction
  guards, and reuse-after-teardown.
- **Commands actually run:** `npm run validate:repository`, `npm run validate:field-contract`,
  `npm run validate:completion`, and .NET SDK 8.0.423 Release build with `-warnaserror` plus
  focused and full agent test runs.
- **Results/evidence:** .NET build passed with 0 warnings and 0 errors. Focused lifecycle tests
  28/28; full agent suite 158/158, up from 130 before this slice. Repository validation passed,
  88 artifacts. Field-contract validation passed, 88 artifacts / 28 modules.
  `validate:completion` unchanged: CHN-001 `passed`, SCN-001 `source_validated`, next phase M2,
  promotion denied.
- **Unvalidated:** everything live. No real guest scene has crossed this path. The lifecycle is
  not yet driven by a real supervisor loop; nothing detects producer exit, lock, Secure Desktop,
  boot change, or intake restart on a live guest and calls these methods. Live
  `CreateProcessAsUser` across sessions, host-side KVP scene reads, timing and ordering under
  real transitions, and teardown actually terminating a real producer all remain unproven.
- **Security/privacy:** holds a scene digest and process/session identity only. No UI text, no
  payload content, nothing logged.
- **Failure behavior:** every binding mismatch throws before state changes; every environmental
  change invalidates; a torn-down lifecycle refuses all further use.
- **Storage:** none. This layer performs no I/O.
- **Rollback:** remove `FieldSceneLifecycle` and its tests. No runtime path constructs it today.
- **Next slice:** the live supervisor loop that detects these transitions on a real guest and
  drives this lifecycle, then live SCN-001 failure injection. Promotion evidence is not "all
  components exist" — it is a real guest scene crossing the authenticated path, bound to the
  correct Field, session, and boot, and becoming invalid when the desktop state changes.
