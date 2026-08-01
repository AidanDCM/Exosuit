# v22 protected KVP observation-state canary

## Goal, phase, and promotion gate

Publish the exact protected-ledger agent, build a fresh immutable base, exercise
one disposable development generation, inject protected-state faults only into
copies, prove the untouched ledger still advances, and destroy the generation.
Master-plan phases L1-L3 own this work. It does not promote production, Teach,
Shadow execution, Assisted, Pilot, recording, or release capability.

## Ownership and authority

Field-owned base, lifecycle, bootstrap, authenticated guest-to-host observation,
host-side protected ledger, and exact-generation destruction. Glove execution
authority did not change. The pilot cannot create/expand policy, provision or
destroy Fields, grant recording consent, rotate keys, or approve export.

## Files changed

- `docs/MASTER_SYSTEM_ROADMAP.md`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/FIELD_THREAT_MODEL.md`
- `docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md`
- `docs/qa/ATOMIC_AUDIT_2026-08-01_FIELD_V22_PROTECTED_KVP_CANARY.md`
- this engineering log

Ignored local scripts/evidence under `artifacts/local-live/` contain the exact
v22 build, provisioning, readiness, copy-fault, advance, destruction, and base
immutability receipts. The ignored local host config allowlists v22 by exact
path and digest. Secrets remain outside the repository and are not logged.

## Identity, generation, and policy impact

Exact Field `4e0f7c83-3c7f-4be8-90f9-2ee024830980`, generation 1, used immutable
v22 digest `4c8fbe97...b71` and agent digest `520e4861...755`. Policy remained
Shadow-only with `observe_desktop`, no recording consent, host access/write,
privilege escalation, or security-control changes. Exact destruction
invalidated the disposable generation without touching the base or another
Field.

## Parts & Pieces and decisions

The established immutable-parent/disposable-overlay, exact-generation path,
authenticated retained-state, compiled transition authority, atomic ledger,
reconciliation, and evidence-source patterns were retained. Fault injection
used copies so a test harness could not overwrite authoritative evidence. A
successful authenticated read after the negative matrix proved recovery and
strict state advancement separately.

## Questions, assumptions, and observed failures

- A proposed 2048 MiB startup was rejected by the provisioning contract before
  files were created; the required 4096 MiB plan was restored.
- The first readiness observation found the VM running normally but no guest
  handshake yet. It failed closed. A single bounded 15-attempt loop later
  authenticated `ready` without weakening expiry or authentication.
- One destruction UAC launch was canceled by Windows. The generation root still
  existed and no receipt existed, so no deletion was claimed. The same exact
  operation was relaunched only after reconciling state.
- Mutated generation/key metadata are bounded cross-binding tests, not actual
  generation replacement or owner-authorized rotation. Those remain pending.

## Commands actually run and results

- Exact self-contained `dotnet publish`: passed; agent digest `520e4861...755`.
- v22 base build and cleanup: passed; source v10 digest exact, v22 promoted
  read-only at `4c8fbe97...b71`, maintenance VM/staging removed.
- Exact preview/provision: passed with 4430 MiB free before apply.
- Authenticated readiness: initial missing-handshake failure preserved; bounded
  retry passed with bootstrap `ready`.
- Copy-based negative runner: six of six rejected; every input byte-identical;
  authoritative state hash unchanged.
- Protected-state advance: passed under the same key; sequence advanced from
  `1785531727455426` to `1785531727456680` and state digest changed.
- Exact destruction: passed; VM registration and generation root removed.
- Post-destruction base verification: passed; digest exact and read-only.
- Full worktree validation `20260801T053909Z`: passed all 15 runner steps;
  locked install, repository/plan/Field validators, typecheck, 143/143 Field
  tests, Field pulse, 315/315 full TypeScript tests, build, Glove pulse, .NET
  restore, zero-warning .NET build, 49/49 .NET tests, and host capability check.
  The report-only production assessment completed and correctly remained denied.
- Wrapper attempt `20260801T053900Z` stopped before recording a step because the
  SDK-less system `dotnet` host shadowed installed SDK 8.0.423. The passing run
  prepended the existing `C:\Users\Aidan\.dotnet` SDK without changing a gate.
  The failed summary is preserved and is not counted as test evidence.

Exact-head validation is performed after committing this report and retained in
the ignored local validation tree; it is not claimed in this pre-commit text.

## Evidence, privacy, security, and unvalidated areas

Evidence classes are source/static, unit, local Windows/Hyper-V, authenticated
KVP, copy-based failure injection, recovery, and exact destruction. No input or
recording evidence is inferred. No data crossed from another Field or through a
host share. No secret, screenshot, private UI text, or raw demonstration bytes
are committed.

Actual owner-authorized key rotation, actual generation-2 replacement with old
state, lock/Secure Desktop, deliberate heartbeat loss, pause/resume, production
authentication, physical stop, input, recording, artifacts, Pilot, packaging,
and release remain unvalidated.

## Rollback or disable path and next slice

The live generation is already destroyed. Remove the ignored v22 host allowlist
entry to disable future provisioning; v10/v20/v21 remain independent. Revert
this evidence-only commit to remove the documentation without changing runtime
behavior.

Next choose one bounded gate: implement an owner-only key-rotation contract with
old-state rejection, or provision a real successor generation and prove stale
state rejection. Do not advance to input or recording from this canary.
