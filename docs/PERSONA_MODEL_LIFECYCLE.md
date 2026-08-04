# Persona Model Lifecycle

**Status:** repository implementation foundation  
**Production status:** denied  
**Permanent invariant:** personality may shape safe behavior; personality may never create authority.

## 1. Purpose

This document defines how Exosuit turns consented demonstrations into owner-governed personal behavior models without giving those models permission to execute actions, create consent, lower policy requirements, access secrets, or represent AI activity as proof that a person acted.

The lifecycle is:

```text
Consented Teach evidence
  -> deterministic processing
  -> provenance-bound candidate
  -> held-out evaluation
  -> interactive owner review
  -> evaluating persona profile
  -> owner governance approval
  -> encrypted profile and governance persistence
  -> observed typing/motor/language/attention models
  -> integrity-bound model bundle
  -> interactive owner activation
  -> advisory behavior plans
  -> downstream Glove re-observation, authorization, execution, verification, recovery, audit, and stop
```

No stage before downstream Glove authorization can click, type, move a pointer, submit a form, administer a Field, or release credential material.

## 2. Implemented modules

| Module | Responsibility | Direct action authority |
|---|---|---:|
| `src/personaBehavior.ts` | profile contracts, contextual state, timing, verification intensity, bounded low-risk imperfection eligibility, drift | none |
| `src/personaProfileVault.ts` | encrypted profile persistence and owner governance transitions | none |
| `src/personaGovernanceStore.ts` | encrypted append-only governance records and deletion certificates | none |
| `src/personaDerivation.ts` | evidence-backed candidate derivation, owner-reviewed promotion, held-out stability evaluation | none |
| `src/personalBehaviorModels.ts` | observed typing-process and motor-preference models | none |
| `src/languageAttentionModels.ts` | consented language metrics and attention/verification models | none |
| `src/personaModelBundle.ts` | exact-profile model bundles, owner activation, deactivation, rollback | none |
| `src/personaModelStore.ts` | encrypted persistence for models, bundles, and activations | none |
| `src/shadowIsolation.ts` | prediction-only Shadow capability and receipts | none |
| `src/assistedMode.ts` | expiring scene/policy-bound proposals and owner review envelopes | none |
| `src/credentialBroker.ts` | opaque, exact-scope, single-use credential authorization decisions | none |
| `scripts/generate-sbom.mjs` | deterministic CycloneDX npm inventory | none |

## 3. Evidence intake

Only consented, appropriately scoped evidence may enter personal modeling.

### 3.1 Processed demonstrations

Persona derivation requires:

- at least two successful episodes;
- at least five processed semantic steps;
- one verified operator identity;
- no duplicate source episodes;
- exact source episode IDs and hashes;
- explicit semantic labels;
- explicit `habit:<id>` features for habit candidates.

The derivation module does not invent high-confidence habits. A habit is proposed only when an explicit habit feature appears repeatedly across at least two episodes and meets the configured evidence threshold.

### 3.2 Unsupported domains

Action demonstrations alone do not establish:

- expressive language style;
- typo rates;
- motor miss rates.

Those domains remain unsupported in the first candidate and default to zero imperfection eligibility until separate consented evidence is supplied.

### 3.3 Language evidence

Raw language samples are converted into derived metrics and are not retained by the language observation contract. The intake rejects:

- absent consent;
- identity-sensitive samples;
- protected content;
- externally published content in the current foundation;
- obvious credential or private-key material;
- samples shorter than twenty words.

The resulting model stores aggregate style metrics and cannot generate text.

### 3.4 Typing and motor evidence

Typing and motor models accept only low-risk drafting observations.

They reject:

- protected fields or targets;
- external submission;
- destructive or external effects;
- unrecovered motor misses;
- impossible trajectories;
- insufficient observations;
- single-episode corpora;
- duplicate observation IDs.

## 4. Candidate derivation and evaluation

`derivePersonaCandidate` produces integrity-bound estimates for:

- cautiousness;
- patience;
- exploration;
- directness;
- thoroughness;
- contextual timing;
- explicit evidence-backed habits.

Expressiveness remains unsupported unless the owner supplies a reviewed value or a separate consented language model.

Every trait estimate carries:

- value;
- confidence;
- evidence count;
- source episode IDs;
- rationale.

Held-out evaluation compares:

- maximum and mean trait drift;
- habit precision and recall;
- median timing ratio.

Passing evaluation means only **stable enough to show the owner**. It never approves or activates a model.

## 5. Owner governance

Only `owner_local` over local transport with interactive owner presence may:

- approve a profile;
- retire a profile;
- revoke a profile;
- roll back to earlier reviewed content;
- delete a profile;
- activate a model bundle;
- deactivate a model bundle;
- roll back to a prior registered model bundle;
- grant a credential handle;
- review an Assisted proposal.

The Field service and Pilot model cannot satisfy owner presence.

### 5.1 Version semantics

Approval, retirement, revocation, and rollback create a new profile version. Existing profile content is never silently mutated.

Rollback copies reviewed content into a new latest version. It does not move the version counter backward or erase history.

### 5.2 Governance chain

Each governance decision contains:

- exact request ID;
- exact owner/profile/version binding;
- previous governance record hash;
- current profile hash;
- next profile hash or deletion-certificate hash;
- allow/block decision and rule;
- decision timestamp;
- canonical record hash.

The encrypted governance store verifies both individual integrity and chain continuity.

### 5.3 Deletion certificate

A deletion certificate contains hashes of owner and profile identity rather than plaintext identifiers, the highest deleted version, owner-only authority, timestamp, reason, and certificate hash.

The certificate proves the deletion decision. Live secure erasure of every storage layer still requires platform-specific acceptance evidence.

## 6. Encryption and storage

Profiles, governance records, deletion certificates, personal models, model bundles, and activation records use:

- AES-256-GCM;
- a unique 96-bit random IV per record;
- authenticated additional data binding record type and identity;
- atomic temporary-file write and rename;
- restrictive requested file/directory modes where supported;
- hashed filenames;
- strict record size limits;
- schema and canonical-hash verification after decryption.

Wrong-key, tampered, oversized, or identity-inconsistent records are rejected and are not advertised by list operations.

The current source accepts a raw 32-byte key. Production key acquisition, DPAPI/TPM sealing, key rotation, backup, and recovery remain separate live gates.

## 7. Personal model separation

### 7.1 Typing process

The typing model contains aggregate observations such as:

- characters per second;
- pause distribution;
- observed typo and correction rates;
- backspace rate;
- immediate-correction rate.

It produces advice only. It does not produce text or key events.

### 7.2 Motor preference

The motor model contains aggregate observations such as:

- median path speed;
- path efficiency;
- correction rate;
- bounded observed low-risk miss probability;
- target-difficulty speed relationship.

It produces no coordinates or input events and has no physical-input authority.

### 7.3 Language style

The language model contains derived aggregate metrics such as:

- sentence and paragraph length;
- contraction preference;
- question and expressive-punctuation rates;
- first-person rate;
- vocabulary diversity.

It produces style advice only, retains no source text under the contract, generates no message, and never represents human authorship.

### 7.4 Attention and verification

The attention model contains:

- reading dwell per content size;
- reread rate;
- scroll-reversal and focus-switch rates;
- verification-event rate;
- final-verification rate.

It may increase suggested verification under risk. It cannot reduce deterministic policy verification, scroll, or change focus.

## 8. Model bundles

A model bundle binds:

- exact owner;
- exact profile ID, version, and hash;
- held-out evaluation hash and result;
- included model hashes;
- supported behavioral dimensions;
- advisory-only and no-authority invariants.

Activation requires:

- registered integrity-valid bundle;
- exact approved persona profile;
- stable-enough evaluation;
- interactive local owner request.

Activation never grants input or action authority. It merely selects which advisory model bundle downstream planners may consult.

## 9. Shadow isolation

The Shadow capability explicitly permits observation, retrieval, and prediction while denying:

- network use;
- credential access;
- authorization;
- command invocation;
- input injection;
- Field administration.

Predictions must retain `executionAllowed: false`. The gateway issues integrity-bound receipts showing that execution was not forwarded and input was not injected.

This is a source/capability boundary. Process sandboxing and operating-system proof remain live acceptance work.

## 10. Assisted Mode

Assisted Mode produces abstract proposals bound to:

- exact Field generation;
- exact scene version and hash;
- exact policy hash;
- exact persona profile hash;
- short expiration;
- ordered steps and expected results.

Consequential actions cannot enter the proposal contract.

An owner review may approve steps only for downstream review. The resulting envelope still states:

```text
executionAllowed: false
downstreamMustReobserve: true
downstreamMustReauthorizeEachStep: true
actionAuthority: none
```

Stale scene, changed policy, expiry, cross-Field use, or replay fails closed. Final submission and external commitment require interactive owner presence at execution time.

## 11. Credential authorization

The credential broker implemented here is an authorization broker, not a secret store.

It issues one-use opaque handles scoped to:

- exact owner grant;
- exact Field generation;
- reviewed executable name and SHA-256;
- canonical origin;
- purpose;
- expiration.

Redemption requires a currently focused protected field and rejects human-verification challenges. The decision contains no secret material and requires a separate trusted local adapter and external vault.

## 12. Software inventory

`scripts/generate-sbom.mjs` generates a deterministic CycloneDX 1.5 inventory from the committed npm lockfile.

It records:

- application name/version;
- optional exact Git commit;
- lockfile version;
- component count;
- dependency-set SHA-256;
- package names, versions, purls, integrity hashes, and development/optional flags.

It intentionally excludes registry-resolved URLs so query tokens or private registry details cannot leak into the inventory.

This is npm inventory only. Production release work still needs .NET inventory, signed artifacts, provenance, installer/update manifests, and final SBOM review.

## 13. Current evidence boundary

The repository implementation can prove only source, unit, integration, build, and hosted-runner behavior for these contracts.

It does not yet prove:

- real owner similarity;
- correct behavior from real demonstrations;
- Windows process isolation for Shadow;
- live secure storage key handling;
- live credential insertion;
- physical-input suppression or interruption;
- actual Assisted execution;
- Pilot reliability;
- ChatGPT acceptance;
- production packaging or operations.

## 14. Required live sequence

1. Run exact-head hosted CI and security audit.
2. Run Windows L0 on the same exact source candidate.
3. Prove production-authenticated Field lifecycle, channel, and readiness.
4. Prove live scene production and consented Teach recording.
5. Collect owner demonstrations under the documented privacy controls.
6. Derive candidates and perform held-out evaluation.
7. Review, approve, encrypt, bundle, and activate models through owner controls.
8. Prove process-level Shadow no-input isolation.
9. Prove low-risk Assisted proposals with exact downstream reauthorization.
10. Prove synthetic Pilot and normal ChatGPT MCP acceptance.
11. Complete packaging, signing, update/rollback, SBOM, privacy, penetration, incident-response, and support acceptance.

Until then, the personal-model, Assisted, Pilot, ChatGPT, owner-acceptance, and production gates remain denied.
