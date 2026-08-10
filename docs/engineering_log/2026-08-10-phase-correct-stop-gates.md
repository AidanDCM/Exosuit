# Phase-correct emergency-stop gates

## Goal

Remove an impossible phase dependency without weakening final acceptance: keep M1
channel stop evidence confined to healthy/degraded channel states, and bind execution
and recording stops to the later phases that own those capabilities.

## Master-plan phase and promotion gate

- L2 / M1: CHN-001 v2, healthy and degraded exact-Field host stops.
- M2: ACT-001.23, stop during real bounded execution.
- L5 / M3: TCH-001.12, stop during consented visible recording.
- No gate is promoted by this source change.

## Subsystem ownership

Shared Glove/Field safety contract. Field owns exact VM/generation stop and environment
state. Glove/Teach owns capture-hook and pending-input termination. Owner consent remains
separate from both authorities.

## Files changed

Completion schemas/harness/tests, authoritative roadmap and build plan, test matrices,
Field manuals, threat/traceability documents, decision log, this engineering log, and a
Level 4 atomic audit.

## Identity, generation, and policy impact

No Field identity, generation, policy, key, transport, provider, VM, base image, or
recording runtime changes. A v1-session migration keeps the evidence commit and records
a separate evaluation commit plus the content-addressed changed-file list. Any runtime
or authority change rejects migration.

## Parts & Pieces and donor patterns considered

Reused Exosuit's closed schemas, content addressing, exact commit/Field binding,
deny-by-default evidence import, explicit typed confirmation, and separate owner versus
technical approval roles. No donor code was copied.

## Questions and assumptions

- Assumption: a stopped VM alone cannot prove recording hooks stopped.
- Assumption: pre-capability failure injection belongs to the phase that implements the
  capability, while remaining mandatory for every downstream target.
- The historical CHN-001.12 ID is retired rather than redefined.

## Tests added or updated

- CHN-001 v2 complete/missing/mode/stop/migration tests.
- CHN acquisition tests for eleven injections and two stops.
- TCH-001.12 closed-schema consent, indicator, hook, Field-state, timing, and raw-field
  rejection tests.

## Commands actually run and results

- `npm run typecheck` — passed.
- `npm run test:chn001 -- --reporter=verbose` — passed, 5 files / 29 tests.
- `npm run test:tch001 -- --reporter=verbose` — passed, 3 files / 11 tests.
- `npm run validate:repository` — passed, 88 required artifacts.
- `npm run validate:plan` — passed, 72,371 roadmap characters / 22 phases.
- `npm run validate:field-contract` — passed, 88 artifacts / 28 modules.
- `npm run test:field -- --reporter=verbose` — passed, 50 files / 260 tests.
- `npm run test:field-pulse -- --reporter=verbose` — passed, 1 test.
- `npm test -- --reporter=verbose --maxWorkers=1 --minWorkers=1` — all 96 files
  and 688 assertions passed, but Vitest exited nonzero after two worker
  `onTaskUpdate` RPC timeouts. This is recorded as a runner failure, not a clean suite
  pass and not an assertion failure.
- `npx vitest run --reporter=dot --exclude tests/security/keyProtection.adversarial.test.ts --maxWorkers=2 --minWorkers=2`
  — clean exit, 95 files / 676 tests passed.
- `npx vitest run tests/security/keyProtection.adversarial.test.ts --reporter=verbose --maxWorkers=1 --minWorkers=1`
  — clean exit, 1 live-host file / 12 tests passed. Together the two clean split
  runs cover the same 96 files / 688 assertions as the monolithic invocation.
- `npm run build` — passed.
- `npm run test:pulse -- --reporter=verbose` — passed, 1 test.
- `npm run validate:completion` — passed with zero integrity failure; CHN-001 remains
  `source_validated`, M1 remains the next phase, and promotion remains denied.
- `npm run validate:mvp-plan` — passed; all target profiles remain denied.
- `C:\Users\Aidan\.dotnet\dotnet.exe restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj`
  — passed.
- `C:\Users\Aidan\.dotnet\dotnet.exe build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore -warnaserror`
  — passed with 0 warnings and 0 errors.
- `C:\Users\Aidan\.dotnet\dotnet.exe test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build`
  — passed, 83 / 83 tests.
- `git diff --check` — passed; Git reported only working-tree line-ending notices.

The first .NET attempt used the host `dotnet` selected from `C:\Program Files\dotnet`
and could not find an SDK. The repository was then validated with the installed SDK at
`C:\Users\Aidan\.dotnet\dotnet.exe` (8.0.423). The PATH lookup is a host configuration
trap, not a repository build or test failure.

## Evidence class and unvalidated areas

Source/unit only. Existing live CHN artifacts remain evidence at their original commit;
they are not promoted here. ACT-001.23 and TCH-001.12 remain live-unvalidated.

## Security and privacy impact

No recording or input is enabled. The TCH proof carries metadata and hashes only and
forbids raw demonstration content, screenshots, UI text, and credentials. Consent and
visible indication are literal requirements. Emergency-stop failure remains
release-blocking.

## Rollback or disable path

Revert this slice and discard v2/migrated candidates. Preserve the original v1 session
as incomplete; do not fabricate its retired row. No host or guest rollback is required
because this slice changes no live capability.

## Next recommended slice

Validate and independently review the v2 contract, destroy the already stopped exact
CHN generation through owner authority, finalize the migrated candidate, and obtain
technical promotion review. Build ACT-001.23 only after live execution exists and
TCH-001.12 only after privacy-audited live Teach hooks exist.
