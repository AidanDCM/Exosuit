# SCN-001 relay signing boundary and session-identity correction

- **Goal:** ensure only SYSTEM can sign a scene while proving the scene client is a separate exact interactive-session Glove process.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion.
- **Subsystem ownership:** Glove produces structural UIA state; Field/SYSTEM owns channel signing and environment/session facts. Neither gains the other's authority.
- **Files changed:** `.NET FieldSceneRelayBoundary.cs` and tests; scene TTL selection; master roadmap, subsystem boundary, decision log, architecture/status/test/threat/failure/traceability docs and Level 4 audit.
- **Identity/generation/policy impact:** explicitly prevents historic v1 session-0 bootstrap identity from serving as interactive scene identity. Relay policy separately binds Field, boot, agent, display, active session, user SID, PID, fixed path, digest, and channel configuration.
- **Parts & Pieces/donors:** reused Field channel authentication/canonical JSON, producer normalization, fixed agent path, and constant-time digest comparison patterns. No donor evidence claimed.
- **Questions/assumptions:** future Windows adapter must derive facts from the connected pipe/process without TOCTOU; current tests inject facts. Interactive user SID needs an owner-approved per-generation source distinct from the v1 manifest field.
- **Tests:** exact signed scene/ten-second TTL; wrong signer/session/user/path/digest/boot; duplicate/unknown/noncanonical/private/oversized payload denial.
- **Commands actually run:** repository, plan, Field-contract, and completion validators; TypeScript typecheck and build; full Field suite; full repository suite; Field and system pulses; .NET SDK 8.0.423 Release warnings-as-errors build and full test suite; `git diff --check`.
- **Results/evidence:** all validators passed; TypeScript typecheck/build passed; Field suite passed 263/263; Field and system pulses passed 1/1 each; .NET build passed with zero warnings/errors and 90/90 tests passed. The full repository run completed 694/694 passing assertions but exited nonzero after two Vitest worker `onTaskUpdate` RPC timeouts, so it is recorded as assertion-clean but not a clean runner-process pass. Evidence class remains source/unit only.
- **Unvalidated:** IPC ACL, OS resolver, process race, launcher, KVP scene write/read, live UIA/lock/Secure Desktop/backpressure.
- **Security/privacy:** interactive client receives no channel secret; SYSTEM independently revalidates the complete structural representation before signing.
- **Failure behavior:** every mismatch stops before signature or publication; input and recording remain absent.
- **Storage:** no base, overlay, personal-state, or task disk mutation.
- **Rollback:** leave boundary unwired or remove it; existing M1 channel behavior remains.
- **Next slice:** implement secured one-way IPC and OS-derived client facts, followed by the fixed session-local launcher.
