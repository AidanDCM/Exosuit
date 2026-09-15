# SCN-001 guest runtime scene-hook coverage

- **Goal:** prove the opt-in default rather than argue it. The previous slice left
  `RunGuestAsync`'s scene decision untested, so "an unconfigured guest starts nothing" rested on
  reading the code path.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion. CHN-001 untouched.
- **Files changed:** `FieldKvpRuntime` — `StartSceneSessionIfEnabled` widened to internal with
  optional ports/environment injection, and `ReadSceneSessionConfiguration` extracted; one new
  test file; this log; a Level 4 atomic audit.

## The seam, and why it is not a test-only backdoor

Both new parameters default to the real implementations, so the production call site is
unchanged: with no arguments the runtime builds `WindowsFieldSceneSessionPorts` and
`WindowsFieldSceneEnvironment` exactly as before. The seam exists because the property that
matters most in this area — that deploying the agent onto a Field mid-ceremony cannot start
scene production — was otherwise unobservable without launching a real producer and writing to
the real registry. A safety claim that can only be checked by reading source is the kind of
claim this project has repeatedly been burned by.

## What is now proven rather than asserted

- With no session, the hook returns the already-completed task **by reference**, the ports
  factory is never invoked, and launch, accept, and publish counts are all zero. The runtime
  constructs nothing at all rather than starting a loop that happens to do nothing.
- Absent file, explicitly disabled file, and enabled file each resolve correctly through the
  same function `RunGuestAsync` calls, not through a parallel test-only path.
- The fixed production path is pinned by assertion.
- A configured guest runs real cycles and, on cancellation, terminates the producer it started —
  the orphan property at runtime level rather than at supervisor level.
- The session is built from the exact configuration object the runtime read.

## An intermittent failure I could not identify

During this slice one full-suite run reported 204/205. The failing test name scrolled past the
captured output and the failure has not recurred in seventeen subsequent full runs.

It is recorded here rather than dismissed. Two of the new tests originally waited on
`Task.Delay` and then asserted that work had happened, which is precisely the shape that fails
intermittently under load. Both now wait on a `TaskCompletionSource` signalled by an actual
publish, so they block on real progress instead of a wall-clock guess. Eight further full runs
after that change were clean.

That is a plausible cause, not a demonstrated one — the failing test was never identified, so
this must not be read as "fixed". If it resurfaces, the timing-sensitive
`[Trait("Category", "LocalWindows")]` pipe tests, which use real named pipes with five-second
connect timeouts, are the next place to look.

- **Identity/generation/policy impact:** none. No behaviour change on the production path; the
  defaults preserve the previous construction exactly.
- **Tests:** 7 new — unconfigured/disabled/enabled reads, production path pinning, the
  starts-nothing property, configured-cycle-plus-teardown, and configuration identity.
- **Commands actually run:** `npm run validate:repository`, `npm run validate:field-contract`,
  `npm run validate:completion`, and .NET SDK 8.0.423 Release build with `-warnaserror` plus
  focused and repeated full agent test runs.
- **Results/evidence:** .NET build 0 warnings / 0 errors. Focused hook tests 7/7. Full agent
  suite 205/205, repeated seventeen times clean after the one unexplained failure described
  above. Repository validation 88 artifacts. Field-contract validation 88 artifacts / 28
  modules. `validate:completion` unchanged: CHN-001 `passed`, SCN-001 `source_validated`, next
  phase M2, promotion denied.
- **Unvalidated:** the live path, unchanged from the previous slice.
  `WindowsFieldSceneSessionPorts` and `WindowsFieldSceneEnvironment` still have no coverage —
  real `CreateProcessAsUser` across a session boundary, a real producer connecting to the
  intake, real relay signing of a real frame, a real KVP scene write, a host-side read of that
  value, PID reuse, and real lock and Secure Desktop transitions. Those two adapters can only be
  exercised against a live guest. No scene has crossed the authenticated path.
- **Security/privacy:** no new surface. The seam changes no production behaviour.
- **Failure behavior:** unchanged.
- **Storage:** none.
- **Rollback:** revert `StartSceneSessionIfEnabled` to private without parameters and drop the
  test file. The production behaviour is identical either way.
- **Next slice:** live SCN-001 failure injection on a real guest, which is the only thing that
  can cover the two Windows adapters and the only thing that moves the gate. Promotion evidence
  remains a real guest scene crossing the authenticated path, bound to the correct Field,
  session, and boot, and becoming invalid when the desktop state changes.
