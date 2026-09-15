# Scene acceptance stage telemetry

- Goal: localize a live scene-acceptance stall without exposing scene content or widening runtime authority.
- Master-plan phase and gate: M2 / SCN-001; no promotion is claimed.
- Subsystem ownership: Field guest diagnostics only; Glove authority is unchanged.
- Live evidence: generation 18 with v41 exhausted the clean-exit acceptance grace, proving the privileged accept task remained incomplete but not identifying its internal stage.
- Change: record only the latest fixed stage literal across pipe connection, Windows PID/process/image/token/SID resolution, pinned image hashing, frame completion, boundary verification, signing, and publication.
- Data boundary: the stage file contains a timestamp and one source-defined label only. It excludes payload bytes, UI text, screenshots, paths, SIDs, PIDs, hashes, secrets, exception text, and user data.
- Failure behavior: stage telemetry is non-authoritative and cannot make an accept succeed. All existing timeouts, identity checks, frame bounds, signing rules, and cancellation remain unchanged.
- Rollback: revert this slice and rebuild/increment the immutable Field generation.
- Tests actually run: Release build passed with warnings as errors; focused pipe-server, Windows client-resolver, intake-service, and process-race suites passed 21/21; repository, master-plan, and Field-contract validators passed; TypeScript typecheck passed.
- Evidence status: focused source validation passed. Fresh-generation stage evidence is required; SCN-001 remains unpromoted.
