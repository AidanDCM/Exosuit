# Retrieval-backed Shadow Baseline

## Goal

Turn safe demonstration retrieval into a useful predict-or-abstain Shadow baseline without adding any execution authority.

## Files changed

- `src/retrievalShadowPredictor.ts`
- `tests/retrievalShadowPredictor.test.ts`
- `scripts/validate-field.mjs`
- `package.json`
- Field status, test plan, handoff, and Level 4 audit documents

## Parts & Pieces and donor patterns considered

The slice uses the evidence-source guard, deterministic reconciliation, bounded registry, explicit abstention, provenance, and no-capability-by-construction patterns. It is a retrieval baseline, not a trained model.

## Tests added or updated

- consensus prediction, weighted timing, model/version provenance, and nested no-execution contracts;
- desktop-not-ready, unexpected modal, unknown task, wrong owner, and changed-layout abstention;
- weak conflicting-example low-confidence abstention;
- configuration and observation bounds.

## Commands actually run and results

- `npm exec vitest run tests/demonstrationProcessing.test.ts tests/retrievalShadowPredictor.test.ts tests/shadowLearning.test.ts -- --reporter=verbose` — 13/13 passed.
- `npm run typecheck` — passed.
- `npm run validate:field-contract` — passed: 77 artifacts and 23 source modules.
- `npm run validate:typescript` — passed: 59 files, 297/297 tests, build, Glove pulse, and Field pulse.
- `$env:PATH = \"$env:USERPROFILE\\.dotnet;$env:PATH\"; dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release` — passed: 44/44.

## Assumptions and unvalidated areas

Features and layout fingerprints come from a trusted observation adapter that does not yet exist. Confidence is heuristic, not calibrated. Live process isolation, latency, owner relevance, changed-layout recovery, and encrypted derived storage remain unvalidated.

## Security impact

Positive: the first actual Shadow prediction path is structurally non-executing, provenance-bearing, bounded, and abstention-first. No live runtime route or default was enabled.

## Rollback or disable path

Do not construct `RetrievalShadowPredictor`, or revert this slice. Demonstration processing and encrypted source storage remain usable independently.

## Next recommended slice

Add encrypted derived-index persistence with deletion propagation, then a read-only live observation adapter and process-isolation acceptance.
