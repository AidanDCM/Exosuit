# SCN-001 live scene supervisor loop

- **Goal:** detect producer exit, lock, Secure Desktop, boot change, and host intake restart on
  a real guest, and drive `FieldSceneLifecycle` from those observations.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion. CHN-001 untouched.
- **Subsystem ownership:** Field owns observation, tick ordering, and producer termination. The
  lifecycle still owns every readiness decision; the supervisor decides only *when to ask*.
- **Files changed:** `FieldSceneSupervisor` with `IFieldSceneEnvironment`, `FieldDesktopState`,
  and `WindowsFieldSceneEnvironment`; `FieldKvpRuntime.IsSessionLocked` widened from private to
  internal for reuse; one new test file; this log; a Level 4 atomic audit.

## Two things the decision layer could not express

**Tick ordering.** A tick evaluates boot, then producer liveness, then desktop state, and stops
at the first invalidation. Without that ordering a reboot could be recorded as a mere lock, or
a dead producer masked by a desktop that happens to look fine — both would leave a materially
wrong reason on the record, and the reason is what a later reviewer reads. Two tests assert the
precedence directly by making several failures visible in the same tick.

**Orphan safety.** The supervisor tracks the last producer PID it saw *independently of the
lifecycle*. When a boot change makes the lifecycle drop its producer reference the process may
still be running, and a supervisor that could only terminate what the lifecycle still admits to
knowing about would leave exactly the orphan it exists to prevent. The PID is recorded before
the lifecycle validates the launch, so even a launch that is refused for landing in the wrong
session leaves a process this supervisor knows it must clean up. Three tests cover this:
teardown after a boot change, teardown after a rejected launch, and teardown with no producer.

A probe that throws is treated as a failure to observe, never as evidence of health — the
lifecycle is invalidated and the reason recorded. Tested for all three probes.

- **Identity/generation/policy impact:** adds no signing authority, no transport, and no new
  privilege. Termination targets one exact PID.
- **Parts & Pieces/donors:** reused the existing lock and Secure Desktop probes already used by
  the guest heartbeat, and the established fail-closed patterns. No donor code copied.
- **Questions/assumptions:** the boot identity is supplied at construction rather than read from
  the running guest, so a real supervisor must be constructed per boot. Poll cadence is the
  caller's choice and is not specified here; a slow cadence widens the window in which readiness
  outlives the desktop state that justified it. Neither is proven.
- **Tests:** 17 new tests — quiet tick, producer death, lock, Secure Desktop, boot change, two
  precedence-ordering cases, three probe-failure cases, host intake restart, four teardown and
  orphan cases, reuse-after-stop, and constructor guards.
- **Commands actually run:** `npm run validate:repository`, `npm run validate:field-contract`,
  `npm run validate:completion`, `npm run test:field`, and .NET SDK 8.0.423 Release build with
  `-warnaserror` plus focused and full agent test runs.
- **Results/evidence:** .NET build passed with 0 warnings and 0 errors. Focused supervisor tests
  17/17; full agent suite 175/175, up from 158. Field suite 51 files / 263 tests. Repository
  validation passed, 88 artifacts. Field-contract validation passed, 88 artifacts / 28 modules.
  `validate:completion` unchanged: CHN-001 `passed`, SCN-001 `source_validated`, next phase M2,
  promotion denied.
- **Unvalidated — and this is still the whole live path.** Every test here drives a fake
  environment. `WindowsFieldSceneEnvironment` itself has no test coverage: real
  `Process.GetProcessById` behaviour under PID reuse, `IsSessionLocked` under an actual lock and
  Secure Desktop transition, `consent` process detection on the guest, and
  `Kill(entireProcessTree: true)` against a real producer are all unexercised. Nothing has yet
  run this loop on a guest, no scene has crossed the authenticated path, and no timing or
  ordering claim under real transitions is supported. What is proven is that given correct
  observations the supervisor asks the right questions in the right order and cleans up after
  itself.
- **Security/privacy:** observes process liveness and desktop lock state only. No UI text, no
  payload content, nothing logged.
- **Failure behavior:** unobservable state invalidates; the most fundamental invalidation wins;
  a stopped supervisor refuses all further use; termination failure surfaces rather than being
  swallowed.
- **Storage:** none.
- **Rollback:** remove `FieldSceneSupervisor` and its tests, and revert `IsSessionLocked` to
  private. No runtime path constructs the supervisor today.
- **Next slice:** wire the supervisor into the guest runtime with a real per-boot identity and a
  chosen poll cadence, then run live SCN-001 failure injection. Promotion evidence remains a
  real guest scene crossing the authenticated path, bound to the correct Field, session, and
  boot, and becoming invalid when the desktop state changes — not the existence of these parts.
