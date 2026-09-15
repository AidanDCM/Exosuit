# Scene pipe generic-write standard right

- Goal: permit the exact authorized non-owner interactive producer to open the one-way scene pipe using Windows generic-write semantics.
- Master-plan phase and gate: M2 / SCN-001; no promotion is claimed.
- Subsystem ownership: Field guest scene transport only; Glove authority is unchanged.
- Live evidence: generation 14 with v37 retained `UnauthorizedAccessException` at `NamedPipeClientStream.TryConnect` after the mandatory-integrity label was applied. The production pipe is owned by SYSTEM, unlike creator-owned local tests.
- Change: add only `PipeAccessRights.ReadPermissions` (`READ_CONTROL`) to the exact producer SID ACE. Windows includes this standard right when mapping `GENERIC_WRITE` for a non-owner handle.
- Rights intentionally absent: read data, read extended attributes, create new instance, delete, change permissions, take ownership, and access-system-security.
- Identity/generation and policy impact: none. PID, session, SID, executable path/digest, liveness, exact Field generation, boot identity, one-frame bound, and relay validation remain mandatory.
- Security/privacy: no input, screenshots, UI text, recording, credential, policy, consent, administration, or execution authority is added. `READ_CONTROL` permits descriptor inspection, not descriptor mutation.
- Rollback: revert this slice and rebuild/increment the immutable Field generation.
- Tests actually run: repository, master-plan, and Field-contract validators passed; TypeScript typecheck passed; the Release build with warnings as errors passed; the focused relay and producer-client suites passed 26/26. The longer combined full-suite command exceeded the orchestration time limit and is not claimed as a pass here.
- Evidence status: focused source validation passed. Full-suite and fresh-generation live validation are still required; SCN-001 remains unpromoted.
