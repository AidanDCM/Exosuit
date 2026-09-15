# SCN-001 guest runtime wiring

- **Goal:** run the scene path inside the guest runtime — configuration, session runner,
  production ports, and a hook in `RunGuestAsync` — behind an explicit opt-in.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion. CHN-001 untouched.
- **Files changed:** `FieldSceneSession` (configuration, ports interface, production ports,
  session runner), `FieldSceneLifecycle` stale-boot guard, `FieldSceneSupervisor` scene/producer
  notification methods and `IsBootStale`, `FieldKvpRuntime` opt-in hook, two test files, this
  log, a Level 4 atomic audit.

## Opt-in by default, deliberately

Scene production is off unless `C:\Exosuit\Config\scene-session.json` exists and is enabled.
With no file the guest runtime behaves exactly as the one that produced the CHN-001 live
evidence. That default is the point: enabling live scene production must be a deliberate act,
not a side effect of deploying a newer agent onto a Field that is mid-ceremony.

A malformed or invalid file is an error rather than a silent disable. A guest that was meant to
produce scenes and quietly does not is worse than one that refuses to start, because the first
looks healthy.

## A bug the tests caught

The first version of the cycle relaunched the producer after a boot change and re-established
readiness — into a lifecycle still bound to the boot that had just ended. The guest had
rebooted and the supervisor would have reported a fresh, actionable scene as though nothing had
happened. That is precisely the false green this project has hit before.

A boot change is now **terminal** for its lifecycle. `IsBootStale` is set, `OnProducerLaunched`
and `OnScenePublished` refuse outright, and the session runner stops rather than relaunching.
A new boot requires a new lifecycle, which is what the decision layer's own comment always
said and what the code did not previously enforce. Three tests now pin it.

## Cycle ordering and retry discipline

Supervision runs before anything new is accepted, so a change since the last cycle invalidates
before a scene can be published into an already stale lifecycle. A failure in launch, accept, or
publish invalidates rather than retrying in place: re-publishing a scene whose effect is unknown
is the blind retry of a possibly successful consequential effect that the safety rules forbid —
the value may already hold that scene, and a second write would leave no way to tell which
described the desktop. A scene the lifecycle refuses invalidates with the reason recorded
instead of propagating, so one bad scene cannot take down the loop.

The runtime hook cancels the scene session and awaits its teardown before the loop unwinds, so
a producer is never left running past the runtime that supervised it, and the session finishes
borrowing the channel secret before that secret is zeroed rather than racing the wipe.

- **Identity/generation/policy impact:** no new signing authority. Each scene gets a fresh
  one-connection intake bound to the exact Field generation and boot. Session zero and
  non-`S-1-5-21-` SIDs are rejected at configuration load.
- **Tests:** 23 new — configuration absent/disabled/malformed/unknown-property/session-zero/bad
  SID/cadence bounds, and runner cycle behaviour including full cycle, no double launch, relaunch
  after death, launch/accept/publish failure handling, stale generation, locked desktop,
  supervision ordering, stopped supervisor, cancellation teardown, and constructor guards. Plus
  one lifecycle test for the terminal boot guard.
- **Commands actually run:** `npm run typecheck`, `npm run validate:repository`, `npm run
  validate:field-contract`, `npm run validate:completion`, `npm run test:field`, and .NET SDK
  8.0.423 Release build with `-warnaserror` plus focused and full agent test runs.
- **Results/evidence:** .NET build 0 warnings / 0 errors; agent suite 198/198, up from 175.
  Field suite 51 files / 263 tests. Typecheck passed. Repository validation 88 artifacts.
  Field-contract validation 88 artifacts / 28 modules. `validate:completion` unchanged: CHN-001
  `passed`, SCN-001 `source_validated`, next phase M2, promotion denied.
- **Unvalidated — the live path is still entirely unproven.** `RunGuestAsync` has no test
  covering the scene hook; the opt-in default is argued from the code path, not demonstrated by a
  test of the runtime loop. `WindowsFieldSceneSessionPorts` and `WindowsFieldSceneEnvironment`
  have no coverage at all: real `CreateProcessAsUser` across a session boundary, a real producer
  connecting to the intake, real relay signing of a real frame, a real KVP scene write, a
  host-side read of that value, PID reuse, and real lock/Secure Desktop transitions are all
  unexercised. No scene has crossed the authenticated path on a guest. Poll cadence is bounded
  to 250–10,000 ms but no cadence has been shown adequate.
- **Security/privacy:** the session handles opaque scene bytes, process identity, and desktop
  lock state. No UI text is read and no payload content is logged.
- **Failure behavior:** unconfigured means off; invalid configuration refuses to start; every
  cycle failure invalidates; a boot change ends the session; cancellation tears down the producer.
- **Storage:** writes only the guest KVP scene value.
- **Rollback:** delete or disable the scene session file to return to exactly the prior runtime
  behaviour. To remove entirely, drop `FieldSceneSession` and the `RunGuestAsync` hook.
- **Next slice:** live SCN-001 failure injection on a real guest. Promotion evidence remains a
  real guest scene crossing the authenticated path, bound to the correct Field, session, and
  boot, and becoming invalid when the desktop state changes — not the existence of these parts.
