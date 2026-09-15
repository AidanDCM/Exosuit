# Level 4 Addendum: Field Scene Guest Runtime Wiring

**Date:** 2026-08-10

**Verdict:** source/unit pass for configuration and cycle logic; the runtime hook and every
production adapter remain untested, and the live path is wholly unproven

## Safety question

Can deploying this agent change the behaviour of a Field that is mid-ceremony, and can the scene
cycle produce a readiness claim that outlives the conditions that justified it?

## Implemented controls

- Scene production is off unless an explicit session file exists and is enabled. With no file
  the runtime behaves as the one that produced the CHN-001 live evidence, so deployment alone
  cannot start scene production on a Field mid-ceremony.
- A malformed or invalid session file refuses to start rather than silently disabling. A guest
  that was meant to produce scenes and quietly does not looks healthy while being wrong.
- Configuration rejects session zero, non-`S-1-5-21-` SIDs, malformed digests, unknown
  properties, and poll cadences outside 250–10,000 ms.
- A boot change is terminal for its lifecycle. `IsBootStale` is set, launch and scene acceptance
  refuse outright, and the session stops. This closes a real defect found during this slice:
  the first version relaunched after a reboot and re-established readiness against a boot that
  had ended, which would have reported a fresh actionable scene after a guest reboot.
- Supervision runs before any new scene is accepted, so a change since the last cycle invalidates
  before a scene can enter an already stale lifecycle.
- Launch, accept, and publish failures invalidate rather than retrying in place. Re-publishing a
  scene whose effect is unknown is the forbidden blind retry of a possibly successful
  consequential effect.
- A scene the lifecycle refuses invalidates with the reason recorded rather than propagating, so
  one bad scene cannot take down the supervision loop.
- The runtime hook cancels the session and awaits teardown before unwinding, so a producer is
  never left running past the runtime that supervised it, and the session stops borrowing the
  channel secret before that secret is zeroed.

## Evidence and residual risk

Twenty-three new tests cover configuration loading and every cycle path; one further test pins
the terminal boot guard. Agent suite 198/198, Field suite 263/263, typecheck and both validators
pass.

The residual risk is the entire live path and it has not narrowed. `RunGuestAsync` has **no test
covering the scene hook** — the opt-in default is argued from reading the code path, not
demonstrated by a test of the runtime loop, and that is the single claim in this slice most
worth distrusting. `WindowsFieldSceneSessionPorts` and `WindowsFieldSceneEnvironment` have **no
coverage at all**: real `CreateProcessAsUser` across a session boundary, a real producer
connecting to the intake, real relay signing of a real frame, a real KVP scene write, a
host-side read of that value, PID reuse, and real lock and Secure Desktop transitions are all
unexercised.

No scene has crossed the authenticated path on a guest. Poll cadence is bounded but no cadence
has been shown adequate; a slow cadence widens the window in which readiness outlives the
desktop state that justified it. Evidence is source/unit only. This is not a live SCN-001 pass
and promotes nothing.

## Rollback

Delete or disable `C:\Exosuit\Config\scene-session.json` to return to exactly the prior runtime
behaviour. To remove entirely, drop `FieldSceneSession` and the `RunGuestAsync` hook.
