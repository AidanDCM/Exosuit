# Level 4 Addendum: Windows Scene Environment Coverage

**Date:** 2026-08-11

**Verdict:** pass for process supervision and fail-closed session probing; lock, Secure Desktop,
and PID reuse remain live-only

## Safety question

Can the supervisor's view of the real world be wrong in the permissive direction — a dead
producer reading as alive, an unknown session reading as unlocked, or a teardown failing to kill
a real process?

## Implemented controls verified against real Windows

- A killed process reads as not alive; a never-existing PID reads as not alive rather than
  throwing. Absence is absence, not an error that could be swallowed as health.
- Termination kills a real spawned process, confirmed by waiting for exit.
- Terminating an absent or already-exited PID is a non-error, so teardown on a forgotten PID
  cannot fail.
- An unresolvable session reads as **locked**. Unknown is not unlocked. This fail-closed
  property was previously asserted only by reading `IsSessionLocked`.

## Evidence and residual risk

Ten focused tests; full agent suite 215/215. No source changed.

Still uncovered and live-only: real lock and Secure Desktop transitions, which a test cannot
induce on the developer's own desktop; `consent` detection, which needs a genuine UAC prompt on
the target session; and PID reuse — these tests show a killed PID reads as dead, not that a
recycled PID cannot be mistaken for the original producer. `WindowsFieldSceneSessionPorts`
remains at zero coverage. No scene has crossed the authenticated path. SCN-001 remains
`source_validated`.

## Rollback

Delete the test file. No source depends on it.
