# CHN-001 lifecycle append boundary

## Goal, phase, and gate

Make real-time M1 CHN-001 lifecycle attestation compatible with exact-commit evidence
acquisition without hiding, backdating, or retrospectively importing signed state. No
completion gate is promoted by this source slice.

## Ownership and authority impact

Shared completion/Field evidence boundary. Environment and Glove authority are
unchanged. The pilot cannot create a Field, expand policy, sign lifecycle, enable
recording, rotate keys, or promote a gate. Generation invalidation remains terminal at
the signed `destroyed` event.

## Files changed

CHN harness and tests, CHN session runbook, Field threat model and failure-injection
matrix, Level 4 atomic audit, and this engineering log.

## Parts and donor patterns

Reused the existing canonical record format, host-key signature verification,
append-only lifecycle hash chain, exact Field-generation binding, and clean exact-commit
session. No donor implementation or donor tests are used as Exosuit evidence.

## Questions and assumptions

- Lifecycle state is evidence, not executable source, but must remain review-visible.
- Only a valid append for the one active session is necessary during acquisition.
- The completion key registry is unchanged and remains the authority used to verify the
  entire committed and appended chain.
- G2 is non-promotable because its source commit predates this fix; the authoritative
  acquisition must use G3 or later prepared and provisioned from the new commit.

## Tests and commands

- `npx vitest run tests/chn001Harness.test.ts --reporter=verbose` — passed, including
  valid signed append, invalid signature, truncation, prefix mutation, and cross-Field
  rejection cases.
- `npm run typecheck` — passed.
- `npm run test:chn001 -- --reporter=verbose` — passed, 5 files / 32 tests.
- `npm run validate:repository` — passed, 88 required artifacts.
- `npm run validate:plan` — passed, 72,371 characters / 22 phases.
- `npm run validate:mvp-plan` — passed; all target promotions remain denied.
- `npm run validate:field-contract` — passed, 88 artifacts / 28 modules.
- `npm run validate:completion` — passed; CHN remains `source_validated`, M1 is next,
  and promotion remains denied.
- `npm run validate:evidence-artifacts -- --reporter=dot` — passed, 6 / 6.
- `npm run scan:evidence-artifacts` — 12 artifacts, 0 warnings, 0 blockers.
- `npm run test:field -- --reporter=dot` — passed.
- `npm run test:field-pulse -- --reporter=dot` — passed.
- The first fully parallel `npm test` execution passed all 691 assertions but emitted
  three Vitest worker RPC timeout errors under host contention, so it was not counted
  as authoritative evidence.
- `npx vitest run --reporter=dot --exclude tests/security/keyProtection.adversarial.test.ts --maxWorkers=2 --minWorkers=2`
  — clean authoritative rerun, 95 files / 679 tests.
- `npx vitest run tests/security/keyProtection.adversarial.test.ts --reporter=verbose --maxWorkers=1 --minWorkers=1`
  — clean authoritative live-host rerun, 1 file / 12 tests. Combined: 96 files /
  691 tests with no unhandled errors.
- `npm run build` — passed.
- `npm run test:pulse -- --reporter=dot` — passed, 1 / 1.
- `C:\Users\Aidan\.dotnet\dotnet.exe restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj`
  — passed.
- `C:\Users\Aidan\.dotnet\dotnet.exe build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore -warnaserror`
  — passed, 0 warnings / 0 errors.
- `C:\Users\Aidan\.dotnet\dotnet.exe test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build`
  — passed, 83 / 83.

## Evidence and unvalidated areas

Source/unit evidence only at creation. The first G2 authenticated KVP capture proved
transport availability but is deliberately excluded from promotion. A fresh live G3
must prove the real-time signed lifecycle sequence and the complete CHN matrix.

## Field-specific answers

- Phase: M1, CHN-001.
- Authority: evidence acceptance only; no environment or Glove authority change.
- Rebuild/rollback invalidation: exact generation must be stopped and destroyed; a new
  generation and generation-specific key are required.
- Pilot policy: cannot create or expand it.
- Recording: none; no visual or input recording is introduced.
- Cross-boundary data: no new host, Field, or cross-Field transfer path.
- Lock, Secure Desktop, heartbeat loss, replay, overflow, uncertain effect, and stop:
  existing fail-closed CHN behavior remains; this slice only validates ledger diffs.
- Storage: no base, overlay, personal-state, or task-disk mutation.
- Evidence separation: signed lifecycle proves environment timing; authenticated KVP
  proves channel observations; stop artifacts prove emergency stop separately.

## Security, privacy, and rollback

No secrets or raw private UI data are added to tracked files. Roll back by reverting the
slice and abandoning the fresh unpromoted generation. Signed events are never edited.

## Next slice

Complete mandatory validation, commit this change, destroy non-promotable G2, provision
G3 from the new exact commit, and run the signed lifecycle-bound CHN acquisition.
