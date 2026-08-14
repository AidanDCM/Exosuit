# Level 4 atomic audit: scene clean-exit acceptance grace

**Gate:** M2 / SCN-001  
**Decision:** focused source validation passed; live promotion denied

The scene producer is intentionally one-shot and generation 17 proves it exits normally with code 0. The privileged relay can still be hashing the large self-contained executable after that exit. Treating all exits as immediate cancellation discards a frame that may already be completely written.

Only a clean exit receives a fixed 60-second grace for the existing accept task. No new connection or retry is started. The executable handle is pinned against write and delete before hashing, after Windows-derived PID/session/token/path resolution. Nonzero exit, timeout, cancellation, unstable identity, digest mismatch, and invalid frame remain fail-closed. Fresh immutable-generation evidence is required.

The Release build passed with warnings treated as errors. Focused process-race, Windows client-resolver, and scene-session tests passed 20/20. Repository, master-plan, and Field-contract validators and TypeScript typecheck passed.
