# Level 4 Addendum: Field Scene Supervisor Loop

**Date:** 2026-08-10

**Verdict:** source/unit pass for observation ordering and teardown; the Windows environment
adapter and the entire live path remain untested

## Safety question

Can a scene stay actionable because a change went unobserved, be invalidated for the wrong
reason, or can a producer survive teardown as an orphan?

## Implemented controls

- A tick evaluates boot, then producer liveness, then desktop state, and stops at the first
  invalidation. The most fundamental cause is the one recorded, so a reboot is never reported as
  a lock and a dead producer is never masked by a healthy-looking desktop.
- A probe that throws is treated as a failure to observe, not as evidence of health. All three
  probes invalidate on failure with the reason recorded.
- The supervisor tracks the last producer PID independently of the lifecycle. A boot change
  makes the lifecycle drop its producer reference while the process may still be running;
  teardown still terminates it. The PID is recorded before the lifecycle validates the launch,
  so a launch refused for landing in the wrong session still leaves a process the supervisor
  will clean up.
- Termination failure is surfaced rather than swallowed. An orphaned producer holding a desktop
  observation channel for a destroyed generation is precisely what must not pass silently.
- A stopped supervisor refuses all further use.
- The supervisor grants no authority: it signs nothing, launches nothing, and every readiness
  decision remains with the lifecycle.

## Evidence and residual risk

Seventeen focused tests cover the quiet tick, each detected transition, two precedence-ordering
cases where several failures are visible in the same tick, all three probe failures, host intake
restart, four teardown and orphan cases, reuse-after-stop, and constructor guards. Full agent
suite 175/175.

The residual risk is unchanged in kind and still large. Every test drives a fake environment.
`WindowsFieldSceneEnvironment` has **no test coverage at all**: `Process.GetProcessById` under
PID reuse, `IsSessionLocked` across a real lock, `consent` detection during a real Secure
Desktop transition, and `Kill(entireProcessTree: true)` against a real producer are all
unexercised. The boot identity is supplied at construction rather than read from the running
guest. Poll cadence is unspecified, and a slow cadence widens the window in which readiness
outlives the desktop state that justified it — no test here can detect that.

What is proven is that given correct observations, the supervisor asks the right questions in
the right order and cleans up after itself. Nothing has run on a guest. Evidence is source/unit
only. This is not a live SCN-001 pass and promotes nothing; the existence of intake, launcher,
writer, lifecycle, and supervisor is not promotion evidence.

## Rollback

Remove `FieldSceneSupervisor` and its tests, and revert `FieldKvpRuntime.IsSessionLocked` to
private. No runtime path constructs the supervisor today.
