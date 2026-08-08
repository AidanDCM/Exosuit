# v21 compiled KVP canary and PowerShell adapter repair

## Goal, phase, and gate

Publish the exact compiled observation-ledger agent, build a fresh immutable
base, exercise one disposable development generation, repair only observed
integration failures, run restart/replay negative evidence, and destroy the
generation. Master-plan phases L1-L3 own this work. This does not promote any
production, Teach, Shadow execution, Assisted, or Pilot capability.

## Ownership and authority

Field-owned base, lifecycle, bootstrap, authenticated guest-to-host observation,
and exact-generation destruction. Glove execution authority did not change.
The pilot cannot create or expand policy, provision/destroy Fields, grant
recording consent, rotate keys, or approve export.

## Files changed

- `scripts/windows/Read-ExosuitFieldGuestKvp.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/MASTER_SYSTEM_ROADMAP.md`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/FIELD_THREAT_MODEL.md`
- `docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-31_FIELD_V21_COMPILED_KVP_CANARY.md`
- this log

Ignored local scripts and evidence under `artifacts/local-live/` contain exact
v21 build, provisioning, restart, repeated-poll, fault-injection, destruction,
and immutability receipts. Local host configuration allowlists v20 and v21 by
exact path and digest. No secret value is recorded here.

## Identity, generation, and policy impact

Exact Field `6834d5ff-3b29-4dcb-b405-73f5227ea63f`, generation 1, used immutable
v21 base digest `e74c7fe...7265` and agent digest `c9cf91e...ba40`. Policy was
Shadow-only with observation capability, no recording consent, no host desktop
access, no host drive write, no privilege escalation, and no security-control
changes. Destruction invalidated the exact disposable generation; it did not
touch the base or another Field.

## Parts & Pieces and design decisions

The existing event-ledger, reconciliation, fail-closed channel, exact path
scope, and evidence-source doctrines were retained. KVP is treated as retained
observation state, not a command queue. The compiled agent remains the sole
transition authority; PowerShell only collects records and normalizes the
compiled verifier's output.

Windows PowerShell 5.1 returns a JSON array as one `System.Object[]` item inside
`@(...)`. Explicit `[object[]]` normalization is required before positional
mapping, followed by an exact count of three. This does not alter authentication
or ledger acceptance.

## Questions, failures, and reconciliation

- A first base-build attempt failed before boot due to 1536 MiB allocation; the
  exact maintenance VM/staging disk were removed with a receipt before retry.
- A read-only preview initially failed because v21 was not allowlisted, then
  because free disk was below the 80 GiB gate. The exact v21 staging duplicate
  and unreferenced immutable v19 base were removed after digest/reference checks.
- The first live compiled read authenticated and committed all three records,
  then the adapter indexed a nested PowerShell array and failed. This produced
  the source repair in this slice.
- `Stop-VM -Shutdown` is unsupported on this host. The preserved failure made no
  state change; the supported default graceful stop was used without force.
- One start reported RAM allocation failure, but later state was Running. The
  possible effect was reconciled before retry; a resume attempt refused the
  already Running VM.
- A cold verifier start exceeded the heartbeat's ten-second envelope. It failed
  closed with unchanged ledger; bounded warm retries passed without TTL change.

## Commands and results

- Self-contained `dotnet publish` for exact `454fc85`: passed; agent digest
  `c9cf91e...ba40`.
- v21 base build: passed after one preserved pre-boot RAM failure; promoted
  digest `e74c7fe...7265`, read-only.
- Exact preview/provision: passed; 4646 MiB free before apply.
- Focused Windows script tests after adapter repair: passed, 9/9.
- Focused `FieldKvpRuntimeTests`: passed, 5/5.
- Restart/readiness matrix: passed after five bounded observations; new boot ID,
  ledger sequence advanced, durable enrollment accepted after manifest expiry.
- Repeated observation: passed; retained handshake/bootstrap exact, heartbeat
  and ledger advanced.
- Live-captured negatives: three of three rejected; ledger byte-identical.
- Exact destruction: passed; VM and generation root removed.
- Post-destruction base verification: passed; digest exact and read-only.
- Full worktree validation `20260731T192632Z`: passed all 15 runner steps;
  repository/plan/Field contracts, typecheck, 143/143 Field tests, Field pulse,
  315/315 full TypeScript tests, build, Glove pulse, .NET restore, zero-warning
  .NET build, 49/49 .NET tests, and Windows host capability check all passed.
  The report-only production assessment completed and correctly remained denied.
- An earlier wrapper attempt `20260731T192457Z` stopped before recording a step
  because the SDK-less system `dotnet` host shadowed the installed per-user SDK.
  The successful run prepended the existing `C:\Users\Aidan\.dotnet` SDK 8.0.423
  without changing a validation gate. The failed summary remains preserved and
  is not counted as test evidence.

Exact-head validation is performed after committing this report and retained in
the ignored local validation evidence tree so the evidence commit remains exact.

## Evidence, security, privacy, and unvalidated areas

Evidence classes are source/static, unit, local Windows/Hyper-V, authenticated
KVP, failure injection, and exact destruction. No input or recording evidence is
inferred. No data crossed from another Field or the host through a guest share.

Session lock, Secure Desktop, deliberate heartbeat loss, VM pause/resume,
protected ledger corruption, key rotation, stale-generation replacement,
production authentication, scene production, Teach, artifacts, and Pilot remain
unvalidated.

## Rollback and next slice

Revert the two adapter/test changes to restore the prior behavior; that rollback
reintroduces the Windows PowerShell 5.1 indexing failure and is not recommended.
The live generation is already destroyed. v21 can be disabled by removing its
local host allowlist entry; the immutable v10/v20 bases remain separate.

Next complete full exact-head validation, then choose the next L2/L3 matrix item:
protected-state corruption/key rotation or stale-generation replacement. Do not
advance to recording or execution from this canary.
