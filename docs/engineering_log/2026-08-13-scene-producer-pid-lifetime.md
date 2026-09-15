# Scene producer PID lifetime

- Goal: preserve the exact Windows launch identity across one-use scene-intake cycles while the same producer remains supervised.
- Master-plan phase and gate: M2 / SCN-001; no promotion is claimed.
- Subsystem ownership: Field guest scene lifecycle only; Glove authority is unchanged.
- Live evidence: generation 15 with v38 connected successfully and left the session-2 producer alive, proving the pipe ACL correction. A later cycle failed with `Field scene intake has no exact launched producer PID` because the ports cleared the PID before the prior accept completed.
- Change: retain the exact launched PID across cycles. A genuine relaunch replaces it. Every connection still resolves its actual Windows client PID and must match this bound value plus session, SID, executable path/digest, Field generation, and boot.
- Security/privacy impact: no authority or data surface changes. This does not accept a claimed PID or search by executable name; it preserves only the PID returned by `CreateProcessAsUser`.
- Failure behavior: absent launch identity still fails closed. Dead/replaced producers remain governed by the supervisor and relaunch path.
- Rollback: revert this slice and rebuild/increment the immutable Field generation.
- Tests actually run: Release build passed with warnings as errors; focused session-runner, relay, and producer-client suites passed 39/39; repository, master-plan, and Field-contract validators passed; TypeScript typecheck passed.
- Evidence status: focused source validation passed. Fresh-generation repeated-cycle evidence is required; SCN-001 remains unpromoted.
