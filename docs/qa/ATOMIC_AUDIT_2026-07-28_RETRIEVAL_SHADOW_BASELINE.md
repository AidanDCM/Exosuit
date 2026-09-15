# Level 4 Addendum: Retrieval Shadow Baseline

**Date:** 2026-07-28

**Verdict:** source/fake prediction gate pass; live Shadow promotion denied

## Safety question

Can retrieval-backed behavior silently become action authority, cross owners or layouts, guess through unsafe desktop state, hide uncertainty, or lose demonstration provenance?

## Implemented controls

- The predictor receives only the bounded in-memory retrieval index and contract types. It has no provider, process, network, semantic-action, mouse, or keyboard interface.
- Prediction and abstention results both hard-code `executionAllowed: false`; nested `ShadowPrediction` does the same.
- Queries require an exact Field reference, observation ID, operator identity, layout fingerprint, and bounded features.
- Desktop-not-ready and unexpected-modal states abstain before retrieval.
- No relevant demonstration and low confidence produce explicit abstentions, never guessed actions.
- Consensus is deterministic. Intent, target, method, and expected result define an action group; timing is similarity-weighted only within the selected group.
- Predictions carry unique source episode IDs and a fixed retrieval-baseline version.
- Changed layout, another operator, failed demonstrations, and mistake/exploration labels cannot supply candidates.

## Confidence boundary

The confidence value is a transparent heuristic combining retrieval similarity and candidate consensus. It is not statistically calibrated and must not be represented as an owner-data performance estimate. Promotion thresholds remain owner-reviewed and data-derived later.

## Residual risk and promotion limit

There is no live observation adapter, encrypted durable derived index, real-data relevance report, timeout/process isolation evidence, or owner evaluation. Exact target grounding still depends on trusted semantic annotations and layout fingerprinting. This slice does not enable Teach capture, semantic mutation, physical input, Assisted Mode, or Pilot.

## Rollback

Remove the predictor and its tests/validator registration. Retain approved encrypted source episodes, deterministic derived records, and comparison evidence.
