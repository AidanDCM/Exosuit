# Protected Windows Field channel secret primitive

## Goal, phase, and gate

Add the next bounded dependency for master-plan Phase 2 authenticated Field
transport: protected guest-local channel-secret persistence. This is source and
local-provider evidence only. It does not satisfy the Phase 2 live key-rotation
or production promotion gate.

## Subsystem ownership and authority impact

- Owner: Field guest environment.
- Glove authority: unchanged.
- Field authority: unchanged; the primitive performs no administration by
  itself and is not reachable from MCP, the model, or the current runtime.
- Identity: encryption scope and envelope bind exact Field ID, generation, key
  ID, and algorithm. Rebuild or rollback changes generation and invalidates
  decryption through the scope/binding checks.
- Policy: the pilot cannot create, expand, or invoke policy through this slice.

## Files changed

- `apps/windows-agent/ProtectedFieldChannelSecretStore.cs`
- `apps/windows-agent.Tests/ProtectedFieldChannelSecretStoreTests.cs`
- `docs/MASTER_SYSTEM_ROADMAP.md`
- `docs/FIELD_ARCHITECTURE.md`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`
- `docs/FIELD_DEVELOPER_MANUAL.md`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/FIELD_THREAT_MODEL.md`
- `docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md`
- `docs/qa/ATOMIC_AUDIT_2026-08-01_FIELD_PROTECTED_CHANNEL_SECRET.md`
- this engineering log

## Parts and donor patterns considered

The existing fake-provider rule, exact `FieldReference`, atomic replay/KVP state
files, protected rotation-metadata envelope, provisioning Config-directory ACL,
and LocalSystem guest-service identity were reused as boundary patterns. No
donor repository test or behavior is claimed as Exosuit evidence.

## Questions and assumptions

- DPAPI LocalMachine must execute inside the guest whose machine scope will own
  the ciphertext; an offline host cannot correctly pre-encrypt the seed.
- Local administrators and SYSTEM remain trusted. DPAPI LocalMachine is not a
  defense against either authority, so the file DACL and guest isolation remain
  necessary.
- The combined pre-seal/rename path is intended for guest LocalSystem. A normal
  interactive process correctly lost rename authority after applying the exact
  DACL, so combined execution is held for a later guest acceptance.
- Existing plaintext `channel-secret.txt` provisioning is unchanged and remains
  an explicit unvalidated area.

## Tests and commands actually run

The per-user SDK `C:\Users\Aidan\.dotnet` was prepended to `PATH`; the system
`dotnet` host contains no SDK.

1. Focused Release test with the initial combined DPAPI/ACL check: five tests
   passed and one failed with `UnauthorizedAccessException` at atomic rename
   after the non-elevated caller sealed the temp file. This was preserved as
   boundary evidence and the test design was corrected, not the DACL weakened.
2. `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
   --configuration Release --warnaserror
   --filter FullyQualifiedName~ProtectedFieldChannelSecretStoreTests` — PASS,
   7/7 before the strict-envelope case was added; the final focused/full counts
   are captured by the subsequent validation run.
3. Final focused protected-store suite — PASS, 8/8. .NET restore, Release build
   with `-warnaserror`, and full test suite — PASS, zero warnings and 57/57
   tests.
4. `npm run validate:repository`, `npm run validate:plan`,
   `npm run validate:field-contract`, and `npm run typecheck` — PASS.
5. The first parallel `npm run test:field -- --reporter=verbose` run passed
   157/158 and hit the existing 10-second timeout in the Windows PowerShell JSON
   normalization process-start test. The isolated retry passed in 2.9 seconds.
   No product assertion failed and no timeout was weakened.
6. The serialized rerun `npm run test:field -- --reporter=verbose
   --maxWorkers=1` — PASS, 158/158. `test:field-pulse` — PASS, 1/1;
   full `npm test` — PASS, 330/330; TypeScript build — PASS; and
   `test:pulse` — PASS, 1/1.

No exact-head or live Field result is claimed by these pre-commit runs. The
evidence-preserving runner remains required on the committed slice.

## Security, privacy, and failure behavior

No plaintext, screenshot, private UI text, provider handle, or token is written
to logs or the envelope. Plaintext working bytes are zeroed. Malformed,
cross-generation, wrong-key, unexpected-algorithm, corrupt-ciphertext,
unprotected-file, and pre-publication failures stop. No recording occurs, no
data crosses from the host or another Field, and session lock, Secure Desktop,
heartbeat loss, uncertain external effect, and emergency stop behavior are
unchanged because the primitive is disconnected.

The slice touches no immutable base, disposable overlay, personal-state disk,
or task disk. It changes source and documentation only.

## Rollback or disable path

Remove the new source/test files and revert the documentation entries. No live
feature flag or deployed system depends on them.

## Next recommended slice

Add a narrowly authenticated guest LocalSystem conversion command that consumes
a one-use seed, writes this protected format inside the guest, proves the exact
directory/file ACL and restart read, deletes the plaintext seed, and fails closed
under interruption. Do not connect it to rotation or MCP until that evidence
passes.
