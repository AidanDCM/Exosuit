# SCN-001 Windows connected-client resolver

- **Goal:** derive scene relay client identity from Windows and the connected pipe rather than trusting client-supplied facts.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion.
- **Subsystem ownership:** Field/SYSTEM derives transport and process facts; Glove remains the unprivileged structural producer.
- **Files changed:** Windows resolver and tests; architecture/status/test/developer/threat/failure/traceability/decision docs and Level 4 addendum.
- **Identity/generation/policy impact:** adds no policy authority; supplies PID/session/SID/path/digest facts to the already exact-generation relay policy. Session zero remains invalid.
- **Parts & Pieces/donors:** reused the fixed-boundary, fail-closed, SHA-256, and Windows identity patterns already present in Exosuit. No donor evidence claimed.
- **Questions/assumptions:** production pipe ACL and the owner-approved per-generation interactive SID source remain unresolved; installed agent path ACL is assumed but not treated as evidence.
- **Tests:** non-SYSTEM denial, disconnected denial, and real local Windows pipe client fact derivation.
- **Commands actually run:** repository, plan, Field-contract, and completion validators; TypeScript typecheck/build; full Field suite; full repository suite; Field and system pulses; focused and full .NET SDK 8.0.423 Release warnings-as-errors build/tests; `git diff --check`.
- **Results/evidence:** all validators passed; TypeScript typecheck/build passed; Field suite passed 263/263; Field and system pulses passed 1/1 each; .NET build passed with zero warnings/errors and 93/93 tests passed, including focused resolver 3/3. The full repository run completed 694/694 passing assertions but exited nonzero after two Vitest worker `onTaskUpdate` RPC timeouts, so it is assertion-clean but not a clean runner-process pass. Evidence remains source/local only.
- **Unvalidated:** production pipe ACL/name/framing, LocalSystem-to-interactive connection, PID/process-exit race, launcher, KVP scene write/read, lock/Secure Desktop/backpressure.
- **Security/privacy:** derives only process identity metadata and executable digest; reads no UI text or scene bytes and logs none.
- **Failure behavior:** every lookup/access/process-stability failure denies before facts are returned or any signature exists.
- **Storage:** reads the connected process image only; no base, overlay, personal-state, or task disk mutation.
- **Rollback:** leave resolver unwired or remove its source/tests; current runtime remains unchanged.
- **Next slice:** implement a fixed one-way named-pipe server with explicit ACL, bounded frame, one connection budget, and resolver-to-relay integration.
