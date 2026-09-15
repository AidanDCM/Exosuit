# Level 4 atomic audit: scene producer exit/intake race

**Gate:** M2 / SCN-001  
**Decision:** source validated; live promotion denied

Generation 11 proved the relay accepts v34 when the producer is run manually, but the service-launched unprivileged producer exited before connecting and left SYSTEM blocked on the armed one-use intake. Process creation alone is not evidence of a working producer.

The Field runtime now races acceptance against termination of the exact PID returned by `CreateProcessAsUser`. Frame acceptance wins if it completes while the producer is still available for Windows-derived identity resolution. Producer exit first cancels and disposes intake, emits only the numeric exit code through the existing bounded failure record, invalidates readiness, and performs no retry.

This adds no producer authority, input, screenshot, recording, UI-text retention, cross-Field channel, or pilot policy capability. Exact Field/generation/boot/session/SID/path/digest enforcement and the immutable-base requirement are unchanged. Fresh-generation Windows evidence remains mandatory before SCN-001 promotion.

Validation passed: repository, master-plan and Field-contract validators; TypeScript typecheck and build; 51 Field files / 263 tests; Field and system pulses; 112 complete TypeScript files / 875 tests; warning-free Release .NET build; and 288/288 Windows-agent tests.
