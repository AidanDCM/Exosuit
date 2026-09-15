# Field channel-key rotation foundation

## Goal, phase, and promotion gate

Implement one reviewable L2/L3 source slice for owner-authorized channel-key
rotation: exact authorization binding, prepare/commit, reconciliation, rollback,
old-key rejection, secret redaction, and fail-closed uncertain state. This is a
fake-provider foundation only and does not satisfy the live rotation or
production promotion gate.

## Ownership and authority

This is Field-owned channel administration. It does not alter Glove action
authority or Field policy. `pilot_model` and `field_service` cannot rotate keys;
only a fresh interactive `owner_local` request on local transport is accepted.
No MCP surface is added.

## Files changed

- `src/fieldChannelKeyRotation.ts`
- `tests/fieldChannelKeyRotation.test.ts`
- `package.json`
- `scripts/validate-field.mjs`
- `docs/MASTER_SYSTEM_ROADMAP.md`
- `docs/FIELD_ARCHITECTURE.md`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/FIELD_THREAT_MODEL.md`
- `docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md`
- `docs/qa/ATOMIC_AUDIT_2026-08-01_FIELD_CHANNEL_KEY_ROTATION_FOUNDATION.md`
- this log

## Identity, generation, and policy impact

Every request and provider receipt binds an exact Field ID/generation. Rotation
does not increment generation or change policy. The caller's current key ID must
equal local authority and the next key ID must differ. Unknown reconciliation
trusts neither key and blocks continuation. The pilot cannot create a key,
secret handle, provider receipt, owner confirmation, or recovery decision.

## Parts & Pieces and decisions

The slice reuses local-admin separation, exact identity/generation binding,
bounded replay IDs, provider parity, reconciliation-before-retry, atomic local
authority update, fail-closed hydration, and evidence-source separation. The
coordinator holds no secret bytes. The provider owns an opaque handle; that
handle and arbitrary provider errors are excluded from exported results/state.

## Questions and assumptions

- The live provider and protected store do not exist; a fake provider proves
  contract behavior only.
- A guest acknowledgment in the fake receipt models, but does not prove, an
  authenticated host/guest prepare exchange.
- Exported state is schema-validated but not yet durably stored or protected;
  live persistence must be atomic and authenticated before wiring.
- No overlap window is implemented. Exactly one key is accepted after a proven
  commit; unknown state accepts neither.
- Owner presence remains a contract boolean until a reviewed local UI/transport
  supplies it. Model text cannot satisfy review.

## Tests and commands actually run

- `npm run typecheck`: passed after correcting the integration test to the
  existing `createFieldChannelEnvelope` API and literal message type.
- Focused rotation tests: nine tests pass after hardening. An intermediate run
  exposed only the test API-name mismatch; no runtime behavior was changed or
  claimed from that failed run.
- Full worktree validation `20260801T060324Z`: passed all 15 runner steps;
  locked install, repository/plan/Field validators, typecheck, 152/152 Field
  tests, Field pulse, 324/324 full TypeScript tests, build, Glove pulse, .NET
  restore, zero-warning .NET build, 49/49 .NET tests, and host capability check.
  The report-only production assessment completed and correctly remained denied.

Exact-head validation is performed after committing this report and retained in
the ignored local validation tree; it is not claimed in this pre-commit text.

## Security and privacy impact

The new surface reduces authority ambiguity and explicitly blocks model/service
rotation. Secret material is outside schemas and durable results. Provider error
redaction prevents accidental secret reflection. Unknown effects deny every key
instead of continuing under a guessed state. No input, recording, private UI
text, screenshots, or demonstration data are touched.

## Rollback and next slice

Revert this commit to remove the unused coordinator, tests, validator rule, and
documentation. No live key or Field requires migration because no real provider
is wired.

Next implement a protected Windows provider and authenticated guest transaction
behind this interface, including atomic persistence, ACL/key-vault review,
restart/crash injection, exact rollback, old-key live traffic, and owner-visible
confirmation. Do not expose rotation to MCP or the pilot.
