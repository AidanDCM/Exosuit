# SCN-001 Windows scene environment coverage

- **Goal:** cover the parts of `WindowsFieldSceneEnvironment` that can be exercised without a
  guest. This adapter previously had **no** test coverage at all, which the last three audits
  named as a dominant risk.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion.
- **Files changed:** one new test file, this log, a Level 4 atomic audit. No source change.

## What is now covered against real Windows

- The current process reads as alive.
- A freshly spawned real process reads as alive.
- A killed process reads as **not** alive — a dead producer never reads as healthy.
- A PID that never existed reads as not alive rather than throwing, so absence is absence and
  not an error the supervisor might swallow as health.
- Termination actually kills a real spawned process, verified by waiting for exit.
- Terminating an absent PID and terminating an already-exited PID are both non-errors. Teardown
  runs on a PID the lifecycle may already have forgotten; a process that is already gone cannot
  be orphaned and must not fail the teardown.
- Desktop observation on the real current session completes and returns well-formed state.
- **An unresolvable session reads as locked.** This is the fail-closed property that matters
  most in this adapter: unknown is not unlocked. It was previously an unverified claim about
  `IsSessionLocked`, and it now holds against real Windows.

## What still cannot be covered here

Real lock and Secure Desktop transitions. A test cannot lock the developer's own desktop, and
`consent` process detection needs a genuine UAC prompt on the target session. Those remain
live-only, as does everything in `WindowsFieldSceneSessionPorts` — `CreateProcessAsUser` across
a session boundary, a real producer connecting to the intake, real relay signing of a real
frame, a real KVP write, and a host-side read.

PID reuse is also still unproven. These tests show that a killed PID reads as dead, not that a
recycled PID cannot be mistaken for the original producer.

- **Identity/generation/policy impact:** none. Tests only.
- **Tests:** 10 new.
- **Commands actually run:** .NET SDK 8.0.423 Release build with `-warnaserror`, focused and full
  agent test runs, `npm run validate:field-contract`, `npm run validate:repository`.
- **Results/evidence:** build 0 warnings / 0 errors. Focused environment tests 10/10. Full agent
  suite 215/215, up from 205. Field-contract validation 88 artifacts / 28 modules. Repository
  validation 88 artifacts.
- **Security/privacy:** spawns and kills only its own short-lived `cmd.exe timeout` processes,
  each cleaned up in `Dispose` even on failure.
- **Rollback:** delete the test file.
- **Next:** `WindowsFieldSceneSessionPorts` remains at zero coverage and is live-only.
