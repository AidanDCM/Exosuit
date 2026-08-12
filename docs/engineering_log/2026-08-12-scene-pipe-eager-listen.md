# Scene pipe eager listen

- Goal: make the scene intake's arm operation create the real ACL'd named-pipe listener before producer process creation.
- Master-plan phase/gate: M2 / SCN-001; no promotion is claimed.
- Ownership: Field guest runtime; Glove authority is unchanged.
- Live finding: G8 proved the service-launched producer ran in interactive session 2 with the exact command and v31 digest, then exited without a scene while the service waited. Source inspection proved the pipe stream was not created until the post-launch accept call.
- Change: `FieldSceneRelayPipeServer` now creates its single named-pipe server during construction. `AcceptSingleFrameAsync` only waits and reads; disposal closes the armed listener.
- Identity/policy: SYSTEM ownership, exact Field/generation/boot pipe name, exact interactive SID ACL, one connection, one bounded frame, and signing checks are unchanged.
- Tests: focused pipe, intake, session runner, and runtime-hook suites passed 34/34.
- Privacy/security: no screenshot, UI text, secret, recording, input, execution, network, or policy expansion.
- Failure behavior: pipe creation now fails before launch; disposal closes the real listener; uncertain frame handling and no-blind-retry remain unchanged.
- Storage/rollback: source-only change; live proof requires a fresh immutable base and generation. Revert this commit to restore lazy pipe creation.
- Next: full validation, new base, fresh generation, automatic structural-scene authentication.
