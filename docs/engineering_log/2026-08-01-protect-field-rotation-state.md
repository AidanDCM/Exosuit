# Protect Field channel-key rotation state

## Goal, phase, and gate

Add bounded authenticated atomic persistence for the L2/L3 channel-key rotation
coordinator without claiming a protected key store or live rotation. This is one
source/pure-file slice and does not promote production or any operating mode.

## Ownership and authority

Field-owned local administration metadata only. Glove execution, Field policy,
recording consent, VM lifecycle, and pilot authority do not change. No MCP or
model-facing method is added.

## Files changed

- `src/fieldChannelKeyRotationStore.ts`
- `tests/fieldChannelKeyRotationStore.test.ts`
- `package.json`
- `scripts/validate-field.mjs`
- `docs/MASTER_SYSTEM_ROADMAP.md`
- `docs/FIELD_ARCHITECTURE.md`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/FIELD_THREAT_MODEL.md`
- `docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md`
- `docs/qa/ATOMIC_AUDIT_2026-08-01_FIELD_PROTECTED_ROTATION_STATE.md`
- this log

## Identity, policy, and Parts & Pieces

The store and HMAC domain bind exact Field ID/generation. No policy is created
or changed. Existing authenticated-envelope, exact-generation, bounded-state,
atomic replacement, fixed-time verification, legacy-denial, and evidence-source
patterns were reused. The integrity secret remains caller-owned and separate.

## Questions and assumptions

- HMAC authenticates metadata only if the caller protects the integrity secret.
- Mode 0600 is requested but is not proof of Windows ACL enforcement.
- Rename behavior is tested in ordinary local execution, not crash/power loss.
- No concurrent-writer or directory-reparse acceptance is claimed.
- This store does not contain or protect channel key bytes or provider handles.

## Tests and commands actually run

- `npm run typecheck`: passed.
- Focused store tests: 6/6 passed after changing the tag mutation to remain
  lowercase hex so the test reached HMAC verification. The earlier assertion
  stopped at schema validation and is not counted as corruption-auth evidence.
- `npm run validate:field-contract`: passed with 88 required artifacts and 28
  source modules.
- Full worktree validation `20260801T061705Z`: passed all 15 runner steps;
  locked install, repository/plan/Field validators, typecheck, 158/158 Field
  tests, Field pulse, 330/330 full TypeScript tests, build, Glove pulse, .NET
  restore, zero-warning .NET build, 49/49 .NET tests, and host capability check.
  The report-only production assessment completed and correctly remained denied.

Exact-head validation is performed after committing this report and retained in
the ignored local validation tree; it is not claimed in this pre-commit text.

## Security, privacy, rollback, and next slice

The store prevents unauthenticated metadata from restoring rotation authority
and never serializes the integrity secret. It touches no private UI, screenshot,
recording, demonstration, or guest data.

Revert this slice to remove the unused store; no live state requires migration.
Next implement protected integrity-secret ownership plus Windows ACL/reparse and
crash/concurrency evidence before connecting a real rotation provider.
