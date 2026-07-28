# Read-only Field Scene Observation Adapter

## Goal

Safely convert the existing Windows observation contract plus authenticated Field liveness into monotonic Field scenes without enabling capture or execution.

## Files changed

- `src/fieldSceneObservation.ts`
- `src/fieldScene.ts`
- `tests/fieldSceneObservation.test.ts`
- `scripts/validate-field.mjs`
- `package.json`
- Field status, test plan, handoff, traceability, and Level 4 audit documents

## Parts & Pieces and donor patterns considered

The adapter reuses the existing Windows UI Automation observation provider and Field heartbeat/scene contracts. It applies evidence-source guarding, fail-closed freshness, exact generation identity, structural privacy defaults, independent sensitive-element enforcement, and monotonic versioning.

## Tests added or updated

- default structural-only redaction;
- explicit consented UI text while preserving sensitive-field denial;
- screenshot, stale heartbeat, and cross-generation denial;
- queue derivation and no scene-version consumption after denial;
- independent Field scene sensitive-element invariant.

## Commands actually run and results

- Focused adapter and scene suite — 7/7 passed.
- `npm run typecheck` — passed after narrowing the test display fixture through the canonical schema.
- `npm run validate:field-contract` — passed: 81 artifacts and 25 source modules.
- `npm run validate:typescript` — passed: repository and plan validators, Field contract validation (81 artifacts / 25 source modules), typecheck, 61 test files with 305/305 tests, build, Glove system pulse, and Field system pulse.
- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release` — passed: 44/44 tests.

## Assumptions and unvalidated areas

Heartbeat input has already passed channel authentication. Cursor/modal facts come from a future trusted guest collector. Live UIA transport, text-consent UI, process isolation, large trees, failures, display changes, and privacy inspection remain unvalidated.

## Security impact

Positive: Field scenes now have a deny-by-default text policy, fresh liveness binding, screenshot exclusion, sensitive-control stripping, and monotonic acceptance. No capture or input capability was enabled.

## Rollback or disable path

Do not construct the adapter, or revert this slice. The fake scene graph and existing Glove observer remain independent.

## Next recommended slice

Implement a bounded authenticated guest-to-host observation transport and run structural-only live scene acceptance before any consented Teach source.
