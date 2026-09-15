# Scene pipe mandatory-integrity label

- Goal: allow the exact authorized medium-integrity interactive producer to connect to the one-way scene intake created by LocalSystem.
- Master-plan phase and gate: M2 / SCN-001; no promotion is claimed.
- Subsystem ownership: Field guest scene transport only; Glove authority is unchanged.
- Live evidence: generation 13 proved the v36 configuration ACL exactly names SYSTEM, Administrators, and the approved SID with read/execute. The producer then failed in `NamedPipeClientStream.TryConnect` with `UnauthorizedAccessException`, before relay identity resolution.
- Files changed: scene pipe security, its local-Windows security test, Field failure matrix, Level 4 audit, and this log.
- Identity/generation and policy impact: the DACL remains exact-SID only. The pipe receives a medium mandatory label with no-write-up so the approved medium producer can write while low-integrity processes remain denied. PID, session, token SID, executable path/digest, Field generation, boot, and frame validation remain unchanged and mandatory.
- Parts & Pieces and donor patterns: uses the Windows mandatory-integrity SDDL contract directly; no donor runtime or broad ACL pattern is introduced.
- Questions and assumptions: generation 13 evidence establishes the DACL and denial location but not the producer token integrity level directly. Fresh-generation live evidence must prove the diagnosis and confirm low-integrity denial separately before promotion.
- Tests and commands actually run: `npm run validate:repository`, `npm run validate:plan`, `npm run validate:field-contract`, `npm run typecheck`, `npm run test:field -- --reporter=verbose` (51 files, 263 tests), `npm run test:field-pulse -- --reporter=verbose` (1 test), `npm test -- --reporter=verbose` (112 files, 875 tests), `npm run build`, and `npm run test:pulse -- --reporter=verbose` (1 test) all passed. Using the explicitly installed .NET 8 SDK, restore and the required Release build with warnings as errors passed, followed by 289/289 agent tests. The pipe security test pins the medium/no-write-up mandatory-label ACL bytes; the relay and producer-client focused suites passed 14/14 and 12/12 respectively.
- Security/privacy: no screenshot, UI text, secret, input, recording, policy, consent, or administration authority is added. The pipe remains one-way, single-instance, single-frame, bounded, exact-generation, and exact-boot.
- Failure behavior: inability to apply the descriptor fails pipe creation before producer launch. A connected client is still untrusted until Windows-derived identity and image verification pass.
- Storage/rollback: immutable guest-base source only; rebuild and increment Field generation. Revert this slice to restore the prior integrity denial.
- Results and evidence class: source, static contract, unit, integration, build, and system-pulse evidence passed. No fresh-generation live result is claimed.
- Assumptions and unvalidated areas: the current diagnosis is based on generation 13's exact ACL and Windows exception evidence. A fresh generation must still prove automatic structural scene publication and low-integrity refusal.
- Next recommended slice: deploy a fresh immutable base/generation and prove automatic structural scene publication plus low-integrity refusal.
