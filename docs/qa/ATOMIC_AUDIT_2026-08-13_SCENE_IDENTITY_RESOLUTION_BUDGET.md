# Level 4 atomic audit: scene identity-resolution budget

**Gate:** M2 / SCN-001  
**Decision:** focused source validation passed; live promotion denied

Generation 16 proved the producer crossed the pipe boundary, delivered, and exited normally after its fixed ten-second hold, while the privileged relay had not completed Windows client identity resolution. Prior manual timing was approximately 11.35 seconds, so the production budget was below observed execution time.

The hold is raised to the already-enforced 30-second API maximum. This changes process lifetime only: one bounded structural frame, one-way transport, exact PID/session/SID/image verification, generation and boot binding, cancellation, and fail-closed early-exit behavior remain unchanged. Fresh immutable-generation evidence is required.

The Release build passed with warnings treated as errors. Focused producer-client, session-runner, and process-race tests passed 28/28. Repository, master-plan, and Field-contract validators and TypeScript typecheck passed.
