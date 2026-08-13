# Atomic audit: Persona operational foundations

- **Date:** 2026-08-04
- **Branch:** `codex/unify-glove-field`
- **Implementation head:** `003a277fbfd040fbb05e690624969c504351cc7b`
- **Scope:** encrypted persona/model persistence, governance, derivation, evaluation, personal models, Shadow isolation, Assisted proposals, credential authorization, and npm SBOM generation
- **Verdict:** hosted source, unit, integration, build, Windows/.NET, and supported dependency-audit validation passed; live and production promotion denied

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

Production key acquisition, DPAPI/TPM sealing, rotation, backup, recovery, and secure erasure remain unproven.

## 3. Owner governance

Only an interactive local owner may approve, retire, revoke, roll back, delete, activate, deactivate, grant credential handles, or review Assisted proposals.

The model and Field service cannot satisfy owner presence.

Rollback creates a new latest version rather than rewriting history. Governance decisions form a hash chain and can be persisted encrypted. Deletion decisions create privacy-preserving certificates.

## 4. Derivation and evaluation

Candidate derivation requires multiple successful episodes, one operator identity, exact provenance, and minimum step evidence.

Explicit habit features are required. Unsupported language, typo, and motor-miss domains remain unclaimed until separate consented evidence exists.

Held-out evaluation gates presentation for owner review only and never activates a model.

## 5. Personal model boundaries

- Typing model: metrics/advice only; no text or key events.
- Motor model: metrics/advice only; no coordinates or input events.
- Language model: aggregate metrics only; no retained raw text under contract and no text generation.
- Attention model: advice only; cannot scroll, change focus, or lower verification.
- Model bundle: exact profile/model/evaluation binding; advisory-only activation.

## 6. Shadow and Assisted boundaries

Shadow capability denies network, credentials, authorization, commands, input, and administration. Predictions remain non-executable and produce no-forward/no-input receipts.

Assisted proposals are short-lived and bound to Field, scene, policy, and profile. Consequential proposals are rejected. Owner review still produces a non-executable envelope requiring re-observation and per-step reauthorization.

## 7. Credential boundary

Credential handles are opaque, single-use, exact-scope, and time-limited. Authorization decisions contain no secret material, are not model-visible, and require a separate trusted adapter. Human-verification challenges are blocked.

## 8. Supply-chain inventory

The npm SBOM generator emits deterministic CycloneDX 1.5 data from the committed lockfile and excludes resolved registry URLs. The validated CI run generated **141 components**.

This does not replace .NET inventory, artifact signing, provenance, installer review, or final release SBOM review.

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

Covered negative cases include wrong keys, ciphertext tampering, hash tampering, duplicate evidence, mixed operators, unsupported habits, unstable held-out evidence, protected inputs, impossible motor paths, unrecovered misses, stale scenes, changed policies, replay, cross-Field requests, wrong executable/origin, missing protected-field focus, model activation attempts, and registry URL leakage.

## 10. Hosted validation evidence

### 10.1 Exosuit CI

- Run: `30914537522`
- Result: passed
- Pull-request merge candidate: `ce9e88f97f0be6795db5b3c29261bb08a1b1d407`
- Source implementation head included by that candidate: `003a277fbfd040fbb05e690624969c504351cc7b`
- Workflow token: read-only contents/metadata

Validated results:

- immutable `npm ci --ignore-scripts --fund=false` completed;
- deterministic CycloneDX npm SBOM generated with 141 components;
- repository validator passed 90 required artifacts;
- complete master-plan validator passed all 22 phased sections;
- Field validator passed 103 artifacts and 37 source modules;
- strict TypeScript typecheck passed;
- focused Field/persona/safety/release suite passed 39 files and **194 tests**;
- Field fake-system pulse passed;
- full TypeScript suite passed 72 files and **366 tests**;
- production TypeScript build passed;
- Glove system pulse passed;
- PowerShell parser passed;
- .NET Release build passed with **0 warnings and 0 errors**;
- .NET suite passed **48 tests**, with 0 failures and 0 skips.

Evidence artifacts:

- `typescript-field-validation`: artifact `8907344709`, ZIP SHA-256 `f73c1da9fe58ecbc5864e71ca0ffd699ed37d4bc72cf3131bc67f6b6c89f68b8`;
- `windows-field-validation`: artifact `8894492680`, ZIP SHA-256 `aebd99abff5cd47cd4f8d8816dc976ff0286c126807b7f9002b50aecc8f3b757`.

The SBOM was generated against the pull-request merge candidate checked out by GitHub Actions. It must be regenerated against the final signed release commit during release acceptance.

### 10.2 Security Audit

- Run: `30914537623`
- Result: passed for supported npm and NuGet jobs

Validated results:

- npm installed 145 packages and audited 146 packages during exact locked installation;
- npm audit reported 0 info, low, moderate, high, critical, and total vulnerabilities;
- npm audit artifact: `8894464972`, ZIP SHA-256 `053f1b05fab9d1edee99899cc7d0f4116af886acfc001e85528b20b50278dccb`;
- NuGet restore with auditing enabled passed;
- `Exosuit.Agent.Tests` reported no vulnerable direct or transitive packages from the configured sources;
- NuGet audit artifact: `8894484872`, ZIP SHA-256 `c478a3c52e2b8faf3a6690c313d1cfa838e638f5396b3eecee70a38e731f66ce`.

CodeQL JavaScript/TypeScript and C# jobs were skipped because the current workflow restricts them to public repositories. No CodeQL pass is claimed.

## 11. Confirmed defects repaired during validation

Hosted validation found and repaired two concrete defects:

1. Owner trait overrides were incorrectly interpreted as a complete six-trait record. The contract now uses an explicitly partial trait record.
2. Encrypted model-save methods could throw synchronously despite a Promise-returning API. All model-save methods now fail consistently through their asynchronous Promise path.

The complete pipeline was rerun after both repairs and passed.

## 12. Unproven live areas

- DPAPI/TPM-backed keys and rotation;
- secure erasure across real storage;
- real owner-derived model quality and similarity;
- process-level Shadow sandboxing;
- live credential adapter and secret insertion;
- live Assisted execution;
- physical input and emergency stop;
- production-authenticated Hyper-V lifecycle, channel, and readiness;
- live scene and consented Teach recording;
- synthetic Pilot and normal ChatGPT acceptance;
- packaging, signing, update/rollback/uninstall, .NET SBOM, penetration testing, privacy review, and operations.

## 13. Promotion posture

- repository-side source and hosted test validation: passed for the stated implementation head and PR merge candidate;
- encrypted storage and governance contracts: validated in source/unit/integration scope;
- real owner-derived personal-model use: denied;
- live Shadow/credential/Assisted execution: denied;
- Pilot and ChatGPT acceptance: denied;
- production: denied.
