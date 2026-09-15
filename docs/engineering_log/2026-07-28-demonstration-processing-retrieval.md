# Deterministic Demonstration Processing and Retrieval

## Goal

Create the first safe bridge from approved terminal demonstrations to source-traceable retrieval without granting Shadow or any model execution authority.

## Files changed

- `src/demonstrationProcessing.ts`
- `tests/demonstrationProcessing.test.ts`
- `scripts/validate-field.mjs`
- `package.json`
- Field status, test plan, handoff, and Level 4 audit documents

## Parts & Pieces and donor patterns considered

The implementation follows the roadmap's immutable-source/derived-artifact split, evidence-source guard, explicit deletion propagation, bounded registries, deterministic comparison, and held-out evaluation patterns. No donor runtime code or arbitrary model inference is used.

## Tests added or updated

- semantic segmentation and exact source lineage;
- terminal, overlap, future-reference, and redacted-semantic denial;
- same-operator/same-layout relevance retrieval;
- failed/mistake exclusion;
- source deletion and immutable returned copies;
- deterministic episode-isolated held-out split.

## Commands actually run and results

- Initial focused run exposed four failures caused by the recorder redacting `contextTokens`; the contract was corrected without weakening redaction.
- `npm exec vitest run tests/demonstration.test.ts tests/demonstrationProcessing.test.ts tests/shadowLearning.test.ts -- --reporter=verbose` — passed 12/12 before held-out coverage was added.
- `npm run typecheck` — passed.
- Final focused processing suite — 5/5 passed.
- `npm run validate:typescript` — passed: 58 files, 293/293 tests, build, Glove pulse, and Field pulse.
- `$env:PATH = \"$env:USERPROFILE\\.dotnet;$env:PATH\"; dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release` — passed: 44/44.

## Assumptions and unvalidated areas

Semantic annotations are supplied by a trusted local recording/annotation surface. Automatic segmentation, learned grounding, encrypted derived persistence, deletion across durable indexes, real owner-data relevance, and data-quality reporting remain unvalidated.

## Security impact

Positive: derived behavior remains traceable, deletable, bounded, owner/layout scoped, and structurally separate from execution. No runtime capability or default was enabled.

## Rollback or disable path

Do not construct a `DemonstrationRetrievalIndex`, or revert this slice. Encrypted source demonstrations are unaffected.

## Next recommended slice

Add a retrieval-backed Shadow baseline with explicit abstention and `executionAllowed: false`, then separately add encrypted derived-index persistence.
