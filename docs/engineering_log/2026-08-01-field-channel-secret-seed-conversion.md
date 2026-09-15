# Field channel-secret seed conversion transaction

## Goal, phase, and promotion gate

Add the next Phase 2 dependency after protected Windows channel-secret storage:
an explicit, idempotent, Field-bound transaction for consuming one plaintext
guest seed. This is source/fake-provider evidence only and does not pass the live
authenticated-channel, rotation, or production promotion gate.

## Ownership and authority impact

- Subsystem: Field guest environment.
- Environment authority: unchanged; exact LocalSystem is required.
- Glove authority: unchanged.
- Pilot/model/MCP authority: none; no surface is added.
- Field generation: exact binding is required on conversion and every restart
  verification. Rebuild/rollback generation mismatch denies.
- Policy and recording: unchanged. The pilot cannot create or expand policy,
  and no recording or data transfer is introduced.

## Files changed

- `apps/windows-agent/ProtectedFieldChannelSecretStore.cs`
- `apps/windows-agent/FieldChannelSecretSeedConverter.cs`
- `apps/windows-agent.Tests/FieldChannelSecretSeedConverterTests.cs`
- `docs/MASTER_SYSTEM_ROADMAP.md`
- `docs/FIELD_ARCHITECTURE.md`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`
- `docs/FIELD_DEVELOPER_MANUAL.md`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/FIELD_THREAT_MODEL.md`
- `docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md`
- `docs/qa/ATOMIC_AUDIT_2026-08-01_FIELD_CHANNEL_SECRET_SEED_CONVERSION.md`
- this engineering log

## Parts and donor patterns considered

The exact `FieldReference`, existing LocalSystem guest-service identity check,
fixed Config root, fake-provider law, bounded atomic persistence, protected
channel-secret store, and fail-closed protected-envelope distinction were reused.
No donor test is claimed as Exosuit evidence.

## Questions and assumptions

- The current seed producer is expected to emit printable secret material and
  may leave one trailing line ending. Other legacy formats deny rather than
  silently broaden parsing.
- LocalSystem and administrators remain trusted. Reparse inspection is an
  independently injectable filesystem provider for deterministic unit faults.
- Same-path atomic replacement avoids a multi-file runtime-configuration
  transaction. The existing `.txt` name is retained until a separately reviewed
  contract version changes it.
- Namespace replacement is not secure erasure. Disposable-overlay destruction,
  host seed retirement, and snapshot/backup policy remain required.

## Tests and commands actually run

Using the installed per-user .NET SDK 8.0.423:

- focused Release `FieldChannelSecretSeedConverterTests` with warnings as
  errors — PASS, 7/7 after adding generation/key and injected reparse faults;
- full .NET Release build/test — PASS, zero warnings and 64/64 tests;
- repository, master-plan, Field-contract, and TypeScript typecheck validators —
  PASS;
- the first Field suite attempt passed 157/158 and reproduced the existing
  Windows PowerShell child-process startup timeout at 10.5 seconds against a
  10-second test limit. This was the second observed timeout for that exact
  assertion under host load. Its test-specific timeout was raised to 30 seconds;
  exit-code and exact output assertions are unchanged;
- rerun Field suite — PASS, 158/158; Field pulse — PASS, 1/1; full
  TypeScript suite — PASS, 330/330; TypeScript build — PASS; Glove pulse —
  PASS, 1/1.

Exact-head results are recorded after execution; no live behavior is claimed by
these pre-commit runs.

## Field-specific failure answers

- Session lock, Secure Desktop, heartbeat loss, replay, overflow, uncertain
  effect, and emergency stop are unchanged because the component is disconnected.
- A pre-publication failure preserves the seed. A post-publication uncertainty
  stops and is reconciled by the next protected-envelope verification; plaintext
  is never restored.
- No host/other-Field data crosses the boundary. The input path is one exact
  guest Config child and is bound to one Field generation.
- Source changes touch no immutable base, disposable overlay, personal-state
  disk, or task disk. Future live execution would mutate only the current
  disposable overlay.
- Evidence classes remain separate: these are source/unit transaction tests,
  not isolation, recording, prediction, execution, or live guest proof.

## Security and privacy impact

The result and errors contain no secret. Working byte arrays are zeroed. The
converter denies malformed protected-looking input rather than treating
untrusted JSON as a seed. No screenshot, private UI text, token, recording, or
provider handle is logged.

## Rollback or disable path

Remove the converter, tests, interface, and documentation references. It has no
runtime caller, so rollback requires no deployed-state migration.

## Next recommended slice

Add a fixed `Program` command that derives exact Field/key/path only from a
validated runtime configuration, rechecks LocalSystem, invokes this transaction,
and emits a metadata-only receipt. Keep ordinary KVP startup unable to convert
plaintext, and do not switch runtime reads until the command is independently
validated under guest LocalSystem.
