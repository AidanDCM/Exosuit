# CHN-001 lifecycle-gated recording

## Goal and gate

Prevent a valid CHN candidate from consuming single-use evidence or being presented for
promotion without the M1 host-signed Field lifecycle required by the completion gate.
No gate is promoted by this change.

## Ownership and identity impact

Shared completion/Field evidence boundary. Field and Glove runtime authority are
unchanged. Recording binds the exact Field ID, generation, VM GUID, immutable-base hash,
guest boot ID, and heartbeat verification time already present in the candidate and
lifecycle ledger. Candidate, current host, and lifecycle events must name the same
machine. Generation invalidation remains terminal at `destroyed`.

## Files changed

CHN harness/tests, M1 handoff, CHN runbook, completion matrix, Field
threat model, Level 4 audit, and this engineering log.

## Parts and patterns considered

Reused the existing signed completion lifecycle, evidence recorder, baseline ancestry,
content addressing, TPM-backed live evidence, and independent transition review. A
retrospective import was rejected because the preserved owner receipts are not a complete
host-signed lifecycle chain.

## Questions and assumptions

- A host may attest a newly observed guest boot only at the current ledger time.
- A heartbeat used as evidence must be verified after that signed boot opens.
- Every actual reboot/stop must be reflected; omission is not an optimization.
- G1 cannot be repaired and remains candidate-only.

## Tests and commands

- `npm run typecheck` — passed.
- `npm run test:chn001 -- --reporter=verbose` — passed, 5 files / 31 tests.
- Direct G1 record refusal probe — exited 1 for zero signed created events, zero signed
  destroyed events, and no heartbeat in a signed boot window. The completion evidence
  store SHA-256 stayed exactly
  `23085a437acb3969471f7507ce68bc2891351f69a43dfbbff431d0f7e87c00de`
  before and after.
- `npx vitest run --reporter=dot --exclude tests/security/keyProtection.adversarial.test.ts --maxWorkers=2 --minWorkers=2`
  — passed, 95 files / 678 tests.
- `npx vitest run tests/security/keyProtection.adversarial.test.ts --reporter=verbose --maxWorkers=1 --minWorkers=1`
  — passed, 1 live-host file / 12 tests. The split covers 96 files / 690 tests.
- `npm run validate:repository` — passed, 88 required artifacts.
- `npm run validate:plan` — passed, 72,371 characters / 22 phases.
- `npm run validate:mvp-plan` — passed; all profiles remain denied.
- `npm run validate:field-contract` — passed, 88 artifacts / 28 modules.
- `npm run validate:completion` — passed; CHN remains `source_validated`, M1 remains
  next, and promotion remains denied.
- `npm run test:field -- --reporter=verbose` — passed, 50 files / 260 tests.
- `npm run test:field-pulse -- --reporter=verbose` — passed, 1 test.
- `npm run test:pulse -- --reporter=verbose` — passed, 1 test.
- `npm run build` — passed.
- `npm run validate:evidence-artifacts -- --reporter=verbose` — passed, 6 tests.
- `npm run scan:evidence-artifacts` — scanned 12 artifacts, 0 warnings, 0 blockers.
- `C:\Users\Aidan\.dotnet\dotnet.exe restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj`
  — passed.
- `C:\Users\Aidan\.dotnet\dotnet.exe build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore -warnaserror`
  — passed, 0 warnings / 0 errors.
- `C:\Users\Aidan\.dotnet\dotnet.exe test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build`
  — passed, 83 / 83 tests.

## Evidence and unvalidated areas

Source/unit only. G1 remains an independently approved candidate with no completion
credit. The recording success path requires a new live G2-or-later generation.

## Security and privacy

No new live execution or recording capability. The guard only narrows evidence
eligibility and writes nothing on precondition failure. No secret or raw user content is
added to logs, artifacts, fixtures, or commits.

## Rollback and next slice

Revert this slice before any G2 recording attempt. Do not alter G1 evidence. After this
slice passes review, prepare G2, sign lifecycle transitions in real time, reacquire CHN,
independently review the candidate, record one evidence artifact, and only then consider
the separately signed technical promotion.
