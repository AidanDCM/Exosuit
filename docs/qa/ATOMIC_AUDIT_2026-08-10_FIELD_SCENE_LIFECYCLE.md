# Level 4 Addendum: Field Scene Lifecycle Supervision

**Date:** 2026-08-10

**Verdict:** source/unit pass for the decision layer; the entire live path remains unproven

## Safety question

Can a scene be acted on after the conditions that made it meaningful have stopped holding —
the producer died, the desktop locked, the guest rebooted, the host intake restarted, the KVP
value went missing, or the Field generation moved on?

## Implemented controls

- Readiness is derived, never latched. A launch alone is never readiness; a verified scene on
  an actionable desktop is required, and readiness is revoked the moment any condition changes.
- Invalidation is one-way until a fresh scene arrives. A previously verified scene is never
  re-promoted, because whatever invalidated it is precisely why its contents can no longer be
  trusted. Unlocking a desktop does not restore readiness on its own.
- A scene observed while the desktop is locked or on the Secure Desktop is not retained at all,
  rather than stored and withheld. There is nothing left for a later state change to promote.
- Scene acceptance is bound to the exact Field generation, boot ID, and interactive session,
  and to a scene-observation message type. Each mismatch throws before any state changes.
- Producer exit invalidates regardless of exit code; a clean exit is treated exactly as firmly
  as a crash, because both leave the desktop unobserved.
- A boot-ID change invalidates the scene and marks the producer gone. The lifecycle does not
  follow the new boot; a new lifecycle must be constructed for it.
- Host intake restart invalidates: cached state on the guest side is not evidence that the
  current desktop still matches.
- An absent or corrupt KVP scene value invalidates rather than falling back to the last good
  scene. A missing value is not a reason to trust an older one.
- Teardown returns the exact producer PID, Field, boot, and session that must be stopped, so a
  caller cannot silently orphan a producer holding a desktop observation channel for a
  generation that no longer exists. A torn-down lifecycle refuses all further use.
- The layer performs no I/O, launches nothing, and signs nothing, so it cannot become a second
  path to authority.

## Evidence and residual risk

Twenty-eight focused tests cover startup, all nine required failure paths, construction guards,
and reuse-after-teardown; the full agent suite is 158/158. The decision layer was deliberately
kept free of I/O so that every refusal and invalidation is reachable without a live guest,
without SYSTEM, and without a real interactive session.

The residual risk is the whole live path, and it is large. Nothing yet detects producer exit,
lock, Secure Desktop, boot change, or host intake restart on a real guest and calls these
methods; the supervisor loop does not exist. The correctness proven here is that *given* a
correct observation, the decision is right — not that the observation will arrive, arrive
promptly, or arrive in order. A missed or delayed lock transition would leave readiness set
longer than the desktop justifies, and no test here can catch that.

Also unproven: live `CreateProcessAsUser` across a session boundary, host-side reads of the
scene value, teardown actually terminating a real producer, and behaviour under concurrent
transitions. Evidence is source/unit only. This is not a live SCN-001 pass and promotes
nothing. Component existence is not promotion evidence; a real guest scene must cross the
authenticated path, bind to the correct Field, session, and boot, and become invalid when the
desktop state changes.

## Rollback

Remove `FieldSceneLifecycle` and its tests. No runtime path constructs it today.
