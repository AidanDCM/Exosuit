# Protect KVP observation state

## Goal, phase, gate, and ownership

Add cryptographic integrity and exact identity binding to the compiled host-side
KVP observation ledger. Master-plan Phase L2 owns the channel and replay-state
work. This is Field-owned persistence; Glove execution authority is unchanged.
Promotion remains denied pending live protected-state, rotation, and replacement
evidence.

## Files changed

- `apps/windows-agent/FieldKvpRuntime.cs`
- `apps/windows-agent.Tests/FieldKvpRuntimeTests.cs`
- `docs/MASTER_SYSTEM_ROADMAP.md`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/FIELD_THREAT_MODEL.md`
- `docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-31_FIELD_PROTECTED_KVP_OBSERVATION_STATE.md`
- this log

## Identity, policy, and design decisions

The protected envelope authenticates a domain separator, exact `fieldId`,
`fieldGeneration`, channel `keyId`, algorithm, and serialized ledger payload
with HMAC-SHA256 using the existing host-held channel secret. It uses fixed-time
tag comparison. It does not add a key store or rotation API and does not expose
the secret. The pilot cannot create or expand policy, rotate keys, migrate state,
or treat failed state as empty.

The existing atomic temporary-write and replace path is retained. Authentication
happens before payload deserialization. Failed reads make no state change. A
legacy plaintext state intentionally fails closed; there is no silent migration.
The reader rejects state files above 32 KiB and base64 payloads above 16 KiB
before decoding to keep corruption handling bounded.

## Parts & Pieces, questions, and assumptions

The event-ledger, reconciliation, evidence-source, and fail-closed donor patterns
are retained. HMAC provides integrity and origin binding, not confidentiality;
the payload contains only message IDs, sequence numbers, and envelope digests.
Production channel-secret storage and an owner-authorized rotation ceremony are
separate later work. The destroyed v21 generation requires no migration.

## Tests and commands actually run

- Per-user .NET SDK 8.0.423 was prepended to `PATH` because the system host has
  no SDK.
- Focused `FieldKvpRuntimeTests` with Release and warnings-as-errors: passed 5/5.
- Full worktree validation `20260731T194750Z`: all 15 runner steps passed,
  including repository/plan/Field contracts, typecheck, 143/143 Field tests,
  Field pulse, 315/315 full TypeScript tests, build, Glove pulse, .NET restore,
  zero-warning .NET build, 49/49 .NET tests, and Windows host capability check.
  The report-only production assessment completed and correctly remained denied.
- After adding the pre-decode state-size bounds, focused tests/contracts passed
  again and the complete replacement worktree run `20260731T195430Z` passed the
  same 15/15 steps and test counts. This later run qualifies the final diff;
  `20260731T194750Z` is retained as superseded historical evidence.

Exact-head validation is performed after committing this report and retained in
the ignored local evidence tree so the validated evidence commit remains exact.

## Evidence, security, privacy, and unvalidated areas

Evidence is source/unit only. No live Field, input, recording, scene, artifact,
or Pilot operation occurred. No secret or private UI data is logged or committed.
Live protected-state corruption, key rotation, stale-generation replacement,
lock/Secure Desktop, heartbeat loss, and production authentication remain held.

## Rollback and next slice

Revert this slice to restore the prior plaintext structural ledger. That removes
cryptographic at-rest integrity and must not be used for promotion. The next
slice is a fresh published-agent disposable Field canary for corruption, local
owner-authorized rotation, and stale-generation replacement, followed by exact
destruction and base-immutability verification.
