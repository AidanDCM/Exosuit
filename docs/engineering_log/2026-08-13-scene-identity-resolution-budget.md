# Scene identity-resolution budget

- Goal: keep the exact launched producer alive long enough for privileged Windows pipe-client identity verification on a loaded guest.
- Master-plan phase and gate: M2 / SCN-001; no promotion is claimed.
- Subsystem ownership: Field guest scene transport only; Glove authority is unchanged.
- Live evidence: generation 16 with v39 exited cleanly with code 0 after the production 10-second hold, before the relay completed acceptance. Earlier measured manual production took approximately 11.35 seconds.
- Change: raise the production post-send identity-resolution hold from 10 to 30 seconds, the client API's existing hard maximum.
- Authority and privacy impact: none. The producer still sends one bounded structural frame and cannot read from the relay. The relay still requires a live, exact Windows-derived PID/session/SID/path/digest match; no frame is accepted after identity disappears.
- Failure behavior: timeout or early exit still fails closed. Cancellation and service stop interrupt the hold.
- Rollback: revert this slice and rebuild/increment the immutable Field generation.
- Tests actually run: Release build passed with warnings as errors; focused producer-client, session-runner, and process-race suites passed 28/28; repository, master-plan, and Field-contract validators passed; TypeScript typecheck passed.
- Evidence status: focused source validation passed. Fresh-generation live timing evidence is required; SCN-001 remains unpromoted.
