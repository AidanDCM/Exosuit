# SCN-001 host scene monitor

- **Goal:** fold each host-side scene read into a readiness decision, using the same vocabulary
  and the same ordering as the guest-side lifecycle.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion.
- **Files changed:** `src/fieldSceneHostMonitor.ts` (new), its tests, this log, a Level 4 audit.

## Why it mirrors the guest deliberately

Two sides of the channel reaching different conclusions about readiness would be worse than
either being wrong alone: the guest would stop publishing while the host still believed it held
an actionable scene, and nothing in the system would report a disagreement. So the monitor uses
the same states, the same one-way invalidation, and the same tick ordering — boot, then desktop
state, then the value — with the most fundamental cause recorded. A reboot is never reported as
a mere lock, and there is a test for exactly that.

## A real divergence the tests caught

The first version let a scene restore readiness after a lock cleared, as long as the scene
authenticated and was in sequence. The guest-side lifecycle explicitly does **not** do that —
"unlocking alone does not restore readiness, because the desktop may have changed while nothing
was observing it" — so the two halves disagreed on the exact case they both exist to handle.

The test was right and the code was wrong. The monitor now raises an **observability barrier**
at the moment the desktop was last seen locked or on the Secure Desktop, and refuses any scene
captured at or before it, however well that scene authenticates. Only a scene captured after the
desktop became observable again can return the monitor to `ready`. Ties fail closed: a scene
captured at the same instant the desktop stopped being observable cannot be shown to predate the
change.

This matters because the scene would otherwise be perfectly valid — correct signature, correct
boot, correct session, in-sequence. Staleness of this kind is invisible to every other check in
the path.

- **Identity/generation/policy impact:** none. All signature and binding decisions remain with
  `FieldSceneChannelReceiver`; the monitor only decides what to do with the outcome.
- **Tests:** 13 — initial state, ready on a verified scene, value disappearing, corrupt
  transport, rejected scene, lock, Secure Desktop, no-restore-on-unlock, restore on a
  post-unlock scene, fresh-scene recovery, terminal boot change, reboot-beats-lock precedence,
  and never exposing a scene while invalidated.
- **Commands actually run:** `npm run typecheck`, `npm run build`, the focused test file, and the
  full TypeScript suite.
- **Results/evidence:** typecheck and build passed. Focused suite 13/13. Full TypeScript suite
  **728 tests across 100 files, all passing**.
- **Unvalidated:** no real guest snapshot has driven this. Nothing polls it on an interval, the
  snapshot source is not connected to a real Hyper-V KVP read, and no cadence has been shown
  adequate — a slow poll widens the window in which host readiness outlives the guest desktop.
  SCN-001 remains `source_validated`.
- **Security/privacy:** holds one accepted scene snapshot and a timestamp; logs nothing.
- **Failure behavior:** every outcome other than a fresh accepted scene invalidates with a
  specific reason; a boot change is terminal.
- **Rollback:** delete the module and its tests.
- **Next:** connect a real Hyper-V KVP snapshot source and an interval, which is the last piece
  before the path can be exercised live.
