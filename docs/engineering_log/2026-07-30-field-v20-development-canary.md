# Field v20 development canary

## Goal and phase

Build a corrected immutable Field base and prove one fresh development-access
generation reaches authenticated readiness. Master-plan phase L3 owns this
work. No promotion gate is opened beyond the bounded canary.

## Ownership and authority

Field-owned base lifecycle, provisioning, guest bootstrap, and host readiness
observation. Glove action/policy authority is unchanged. The pilot cannot create
or expand Field policy, administer the environment, grant recording consent, or
cross host/Field boundaries.

## Files changed

- `scripts/windows/Read-ExosuitFieldGuestKvp.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/FIELD_THREAT_MODEL.md`
- `docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-30_FIELD_V20_DEVELOPMENT_CANARY.md`
- this log

Local ignored builders, launchers, plans, secrets, and evidence under
`artifacts/local-live`, `vm/field-host-config.local.json`, and
`C:\Users\Aidan\.codex\secrets\exosuit` were used but are not commit surfaces.

## Identity and storage impact

Base v20 digest is
`452790e549cc31f3d4bb2613113f5a386716447d9b4795ded2a9193ad415547d`.
The canary is Field `7fad0376-68aa-4300-899d-a2ded6e1fb15`, generation 1.
Rebuild/rollback invalidates this exact generation and requires fresh secrets.
The immutable v10 donor and v20 target were preserved. Successful duplicate
staging disks and their powered-off maintenance VM registrations were removed
only after digest/receipt verification. No personal-state disk was attached.

## Parts & Pieces and assumptions

The existing immutable-parent/disposable-overlay, separate task disk,
SetupComplete activation, signed KVP, and atomic replay-state patterns were
retained. Hyper-V KVP retains the latest record, so repeat observation must be
idempotent without treating the retained record as a newly executed message.

## Commands and results

- Exact-head evidence runner `20260730T200229Z`: passed all 15 steps before this
  live slice (314 TypeScript tests, 48 .NET tests, builds, pulses, and host gate).
- v20 builder: passed; SYSTEM receipt bound service
  `ManualUntilSetupComplete`; Audit receipt bound canonical Sysprep; promoted
  read-only digest matched staging.
- v20 preview: passed.
- First two apply attempts: failed closed before state creation at 3492 MiB and
  3819 MiB free versus the 4096 MiB gate.
- Third apply: passed with 4750 MiB free after bounded app cleanup.
- First live readiness: authenticated `ready` with zero failed bootstrap checks.
- Original delayed reread: failed closed on retained handshake replay, exposing
  the observation defect.
- PowerShell parser for the corrected reader: passed.
- `npm test -- --run tests/windowsFieldScripts.test.ts --reporter=verbose`:
  passed, 8/8.
- Corrected live observation 1: passed; ledger last sequence
  `1785449589383193`.
- Corrected live observation 2: passed; retained handshake/bootstrap accepted
  exactly and heartbeat advanced to `1785449589383218` / guest sequence 213.
- Exact canary destruction: passed; VM registration and disposable generation
  root removed.
- Post-destruction base check: passed; v20 remained read-only and SHA-256 stayed
  `452790e549cc31f3d4bb2613113f5a386716447d9b4795ded2a9193ad415547d`.
- `git diff --check`: passed.
- `npm run validate:repository`: passed, 71 required artifacts.
- `npm run validate:plan`: passed, 22 phased sections.
- `npm run validate:field-contract`: passed, 84 artifacts and 26 modules.
- `npm run typecheck`: passed.
- `npm run test:field -- --reporter=verbose`: passed, 142/142.
- `npm run test:field-pulse -- --reporter=verbose`: passed, 1/1.
- `npm test -- --reporter=verbose`: passed, 314/314.
- `npm run build`: passed.
- `npm run test:pulse -- --reporter=verbose`: passed, 1/1.
- `.NET restore`: passed.
- `.NET Release build --no-restore -warnaserror`: passed with zero warnings.
- `.NET Release tests --no-build`: passed, 48/48.

## Evidence class and unvalidated areas

Evidence classes: static inspection, TypeScript unit, Hyper-V host/guest,
authenticated channel, and live development canary. This does not prove
production authentication, command execution, recording, prediction, repeated
or faulted base-immutability/destruction, replay mutation/regression, restart, key
rotation, session lock, Secure Desktop, heartbeat loss, suspend/resume,
emergency stop, or repeated lifecycle reliability.

## Security, privacy, failure behavior

Unknown identity/generation/message state remains fail closed. Exact retained
KVP rereads are allowed only after current signature/expiry verification and
exact digest/message/sequence equality; changed records must advance strictly.
No input or recording occurred. Host/LAN access remained disabled. On lock,
Secure Desktop, heartbeat loss, replay/regression, uncertain effect, overflow,
or emergency stop, existing deny/stop behavior remains unchanged.

## Rollback and next slice

Revert the reader/contract documentation to disable repeat observation. The
canary generation has already been destroyed through exact typed confirmation;
the v20 base remains immutable.
Next, add negative live KVP mutation/regression fixtures, restart persistence,
key rotation, heartbeat-loss, lock/Secure Desktop, and exact destruction/base
immutability evidence before any production-authenticated or action slice.
