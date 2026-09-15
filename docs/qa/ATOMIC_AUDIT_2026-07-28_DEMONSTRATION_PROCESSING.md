# Level 4 Addendum: Demonstration Processing and Retrieval

**Date:** 2026-07-28

**Verdict:** deterministic source/fake foundation only; live personal-data promotion denied

## Safety question

Can raw consent-bound events become untraceable personal-model claims, leak redacted fields into features, retrieve another operator's behavior, preserve deleted demonstrations, or gain action authority?

## Implemented controls

- Only terminal episodes with outcomes can be processed.
- Events must have contiguous sequences, unique IDs, ordered timestamps, and remain within the episode interval.
- Semantic steps require strict owner-generated `semantic_step` annotations with non-overlapping earlier source ranges.
- Every step retains exact source event IDs, source range, annotation ID, source episode ID, and source episode hash.
- Reasons remain annotation data; the processor does not invent an owner reason.
- Mistake, correction, exploration, and changed-mind labels remain explicit. Default retrieval considers only successful preferred/correction behavior.
- Retrieval binds a hashed operator identity and exact layout fingerprint, applies a minimum similarity score, and returns copies.
- Source-episode deletion removes all indexed steps for that source.
- Held-out partitioning is deterministic and keeps an entire source episode on one side.
- The component imports no provider, semantic execution, mouse, keyboard, process, or network capability.

## Privacy interaction found during testing

The first annotation schema used a field named `contextTokens`. The recorder correctly treated the word `token` as secret-shaped and replaced the whole value with `[REDACTED]`. The processing contract was changed to `features`; secret redaction was not weakened.

## Residual risk and promotion limit

The index is in-memory and its operator hash is not a secret pseudonym. Derived artifacts are not yet encrypted or durably deletion-tracked. Feature quality has not been evaluated on real owner data. Automatic target/intent grounding and ambiguity resolution are absent. This work does not enable recording, Shadow execution, Assisted Mode, Pilot, or any input path.

## Rollback

Remove `demonstrationProcessing.ts` and its validator/test registration. Approved encrypted source episodes remain unchanged and no runtime route depends on the index.
