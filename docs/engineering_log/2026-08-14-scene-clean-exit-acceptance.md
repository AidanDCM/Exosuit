# Scene clean-exit acceptance grace

- Goal: let an already-received one-shot scene finish exact executable verification when its producer exits normally.
- Master-plan phase and gate: M2 / SCN-001; no promotion is claimed.
- Subsystem ownership: Field guest scene transport only; Glove authority is unchanged.
- Live evidence: generation 17 with v40 again reported producer exit code 0 after the 30-second hold. The relay resolves and hashes the approximately 151 MB self-contained executable before acceptance completes.
- Change: exit code 0 permits only the already-started accept task to finish within a fixed 60-second grace. Nonzero exit still cancels immediately. The executable is opened without write/delete sharing while the live process token/path are resolved, pinning the exact bytes during hashing even if the one-shot process then exits.
- Identity/generation and policy impact: none. Kernel-derived client PID, session, token SID, path, digest, exact launch PID, Field generation, boot, and frame validation remain mandatory.
- Security/privacy: no retry, second frame, UI text, screenshot, input, recording, credential, consent, or authority surface is added.
- Failure behavior: grace expiry, cancellation, hash failure, identity mismatch, or nonzero exit fails closed.
- Rollback: revert this slice and rebuild/increment the immutable Field generation.
- Tests actually run: Release build passed with warnings as errors; focused process-race, Windows client-resolver, and scene-session suites passed 20/20; repository, master-plan, and Field-contract validators passed; TypeScript typecheck passed.
- Evidence status: focused source validation passed. Fresh-generation live validation is required; SCN-001 remains unpromoted.
