# Level 4 Addendum: Field Scene Runtime Hook Coverage

**Date:** 2026-08-11

**Verdict:** the opt-in default is now demonstrated rather than argued; the two Windows adapters
and the whole live path remain untested

## Safety question

Can deploying this agent onto a Field that is mid-ceremony start scene production as a side
effect — and can that be shown, rather than reasoned about?

## Implemented controls

- `StartSceneSessionIfEnabled` returns the already-completed task by reference when no session is
  configured, and the ports factory is never invoked. The runtime constructs nothing rather than
  starting a loop that happens to do nothing. Asserted directly.
- Absent, disabled, and enabled configurations all resolve through the same function the runtime
  calls, not a parallel test-only path.
- The fixed production path is pinned by assertion, so a silent relocation of the configuration
  file would fail the suite.
- A configured guest is shown to run real cycles and to terminate the producer it started when
  cancelled — the orphan property established at runtime level, not only at supervisor level.
- The injected ports and environment both default to the production implementations, so the
  production call site is byte-for-byte the previous behaviour. The seam adds no runtime path.

## Evidence and residual risk

Seven focused tests; full agent suite 205/205.

One full-suite run during this slice reported 204/205. The failing test was never identified and
has not recurred across seventeen subsequent full runs. Two new tests that had asserted work
after a `Task.Delay` were rewritten to wait on a completion signal from an actual publish, which
is a plausible but unproven cause. This is recorded as an unexplained intermittent failure, not
as a resolved defect. The timing-sensitive `LocalWindows` pipe tests are the next candidate if
it returns.

**Update 2026-08-11:** a probable cause was found while adding the scene producer client — see
`ATOMIC_AUDIT_2026-08-11_FIELD_SCENE_PRODUCER_CLIENT.md`. The pipe name derives from Field
generation and boot ID, and `FieldSceneRelayPipeServerTests` shared one `BootId` constant across
the class, so every `LocalWindows` test there created a server on the same name;
`UnauthorizedAccessException` at pipe creation is what name contention looks like. It reproduced
deterministically in the new client tests. Both classes now use per-test boot identities. This
remains probable rather than proven, because the original failing test was never identified.

Unchanged and still the dominant risk: `WindowsFieldSceneSessionPorts` and
`WindowsFieldSceneEnvironment` have no coverage whatsoever. Real `CreateProcessAsUser` across a
session boundary, a real producer connecting to the intake, real relay signing of a real frame, a
real KVP scene write, a host-side read of that value, PID reuse, and real lock and Secure Desktop
transitions are all unexercised, and cannot be exercised except against a live guest. No scene
has crossed the authenticated path. Evidence is source/unit only. This is not a live SCN-001 pass
and promotes nothing.

## Rollback

Revert `StartSceneSessionIfEnabled` to private without parameters and drop the test file.
Production behaviour is identical either way.
