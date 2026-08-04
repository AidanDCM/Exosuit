# Atomic audit: Persona operational foundations

- **Date:** 2026-08-04
- **Branch:** `codex/unify-glove-field`
- **Scope:** encrypted persona/model persistence, governance, derivation, evaluation, personal models, Shadow isolation, Assisted proposals, credential authorization, and npm SBOM generation
- **Verdict:** source and tests added; exact-head hosted validation pending

## 1. Authority invariants

Every new behavioral output preserves one or more explicit no-authority fields:

```text
actionAuthority: none
physicalInputAuthority: none
screenControlAuthority: none
executionAllowed: false
mayAuthorizeActions: false
mayInjectInput: false
```

No new module imports a Glove motor implementation or Field command executor.

## 2. Encrypted persistence

Implemented encrypted stores:

- `EncryptedPersonaProfileStore`
- `EncryptedPersonaGovernanceStore`
- `EncryptedPersonaModelStore`

Common controls:

- AES-256-GCM;
- unique random IV;
- authenticated additional data;
- atomic temporary write and rename;
- hashed filenames;
- strict size limits;
- wrong-key and tamper rejection;
- canonical record-hash verification;
- invalid records excluded from list operations.

Production key management remains unproven.

## 3. Owner governance

Only an interactive local owner may approve, retire, revoke, roll back, delete, activate, deactivate, grant credential handles, or review Assisted proposals.

The model and Field service cannot satisfy owner presence.

Rollback creates a new latest version rather than rewriting history. Governance decisions form a hash chain and can be persisted encrypted. Deletion decisions create privacy-preserving certificates.

## 4. Derivation and evaluation

Candidate derivation requires multiple successful episodes, one operator identity, exact provenance, and minimum step evidence.

Explicit habit features are required. Unsupported language, typo, and motor-miss domains remain unclaimed.

Held-out evaluation gates presentation for owner review only and never activates a model.

## 5. Personal model boundaries

- Typing model: metrics/advice only; no text or key events.
- Motor model: metrics/advice only; no coordinates or input events.
- Language model: aggregate metrics only; no retained raw text under contract and no text generation.
- Attention model: advice only; cannot scroll, change focus, or lower verification.
- Model bundle: exact profile/model/evaluation binding; advisory-only activation.

## 6. Shadow and Assisted boundaries

Shadow capability denies network, credentials, authorization, commands, input, and administration. Predictions remain non-executable and produce no-forward receipts.

Assisted proposals are short-lived and bound to Field, scene, policy, and profile. Consequential proposals are rejected. Owner review still produces a non-executable envelope requiring re-observation and per-step reauthorization.

## 7. Credential boundary

Credential handles are opaque, single-use, exact-scope, and time-limited. Authorization decisions contain no secret material, are not model-visible, and require a separate trusted adapter. Human-verification challenges are blocked.

## 8. Supply-chain inventory

The npm SBOM generator emits deterministic CycloneDX 1.5 data from the committed lockfile and excludes resolved registry URLs. It does not replace .NET inventory, artifact signing, provenance, or installer review.

## 9. Test files added

- `tests/personaProfileVault.test.ts`
- `tests/personaGovernanceStore.test.ts`
- `tests/personaDerivation.test.ts`
- `tests/personalBehaviorModels.test.ts`
- `tests/languageAttentionModels.test.ts`
- `tests/personaModelBundle.test.ts`
- `tests/personaModelStore.test.ts`
- `tests/safeModeBoundaries.test.ts`
- `tests/sbomGenerator.test.ts`

Covered negative cases include wrong keys, ciphertext tampering, hash tampering, duplicate evidence, mixed operators, unsupported habits, unstable held-out evidence, protected inputs, impossible motor paths, unrecovered misses, stale scenes, changed policies, replay, cross-Field requests, wrong executable/origin, missing protected-field focus, human verification, model activation attempts, and registry URL leakage.

## 10. Pending validation

Before promotion of this source slice:

```bash
npm ci --ignore-scripts --fund=false
npm run validate:repository
npm run validate:plan
npm run validate:field-contract
npm run typecheck
npm run test:persona -- --reporter=verbose
npm run test:safety-boundaries -- --reporter=verbose
npm run test:release -- --reporter=verbose
npm run test:field -- --reporter=verbose
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
npm run test:field-pulse -- --reporter=verbose
npm run generate:sbom -- --output artifacts/exosuit-npm-sbom.cdx.json
npm run agent:test
```

## 11. Unproven live areas

- DPAPI/TPM-backed keys and rotation;
- secure erasure across real storage;
- real owner-derived model quality;
- process-level Shadow sandboxing;
- live credential adapter;
- live Assisted execution;
- physical input and emergency stop;
- Pilot and ChatGPT acceptance;
- packaging, signing, update/rollback, .NET SBOM, penetration testing, privacy review, and operations.

## 12. Promotion posture

- source review: open;
- exact-head hosted validation: pending;
- live personal-model use: denied;
- Assisted/Pilot/ChatGPT: denied;
- production: denied.
