# Level 4 Addendum: Host Scene Monitor

**Date:** 2026-08-11

**Verdict:** pass for readiness folding and staleness barrier; undriven and unproven against a
real guest

## Safety question

Can the host believe a scene is actionable after the guest desktop stopped justifying it — in
particular, can a perfectly valid scene captured before a lock be promoted once the lock clears?

## Implemented controls

- The same states, one-way invalidation, and tick ordering as the guest lifecycle. Two sides
  disagreeing about readiness would be worse than either being wrong alone, because nothing in
  the system reports a disagreement.
- Ordering is boot, then desktop state, then value, and the most fundamental cause is recorded.
  A reboot is never reported as a mere lock; tested directly.
- **Observability barrier.** When the guest is seen locked or on the Secure Desktop, the monitor
  records that instant and afterwards refuses any scene captured at or before it, however well
  that scene authenticates. Only a scene captured after the desktop became observable again
  restores readiness. Ties fail closed.
- Absence invalidates rather than being treated as quiet: if the value is gone, the guest stopped
  publishing and the last scene describes a desktop nothing is observing.
- Transport faults and rejections invalidate with distinct, specific reasons.
- A boot change is terminal; further reads are not folded in, because the receiver's replay state
  belongs to the previous boot.
- No scene is exposed while invalidated.

## Evidence and residual risk

Thirteen tests; full TypeScript suite 728 tests across 100 files, all passing.

The barrier exists because of a divergence the tests caught: the first version let a scene
restore readiness after a lock cleared, as long as it authenticated and was in sequence, while
the guest-side lifecycle refuses exactly that. The two halves disagreed on the case they both
exist to handle. Such a scene is valid by every other check in the path — correct signature,
boot, session, sequence — so this class of staleness is invisible without the barrier.

Unproven: nothing drives this monitor. No interval polls it, the snapshot source is not connected
to a real Hyper-V KVP read, and no cadence has been shown adequate — a slow poll widens the
window in which host readiness outlives the guest desktop, and no test here can detect that. No
real guest snapshot has been read. SCN-001 remains `source_validated`.

## Rollback

Delete the module and its tests. Nothing depends on it.
