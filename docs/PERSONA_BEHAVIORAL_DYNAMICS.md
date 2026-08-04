# Exosuit Persona and Behavioral Dynamics

**Subsystem status:** hosted source and unit validation passed; live integration unpromoted  
**Planning authority:** `docs/MASTER_SYSTEM_ROADMAP.md`  
**Primary implementation:** `src/personaBehavior.ts`  
**Focused tests:** `tests/personaBehavior.test.ts`

## 1. Purpose

The Persona and Behavioral Dynamics subsystem converts an owner-approved persona profile and current task context into a bounded behavioral plan.

It exists to make Exosuit consistent and personally recognizable across tasks without giving the persona layer authority to execute actions or weaken deterministic safety policy.

The subsystem may influence:

- contextual thinking and reading time;
- behavioral state;
- motor-speed preference;
- verification intensity;
- whether an approved low-risk draft may preserve an observed typo or correction process;
- whether an approved low-risk target may preserve an observed harmless motor-correction process;
- owner-review and disclosure requirements;
- abstention when the environment or task is unsuitable.

It does not directly:

- click, type, or move the pointer;
- approve an action or create consent;
- change Field policy or lower risk;
- bypass human-verification requirements;
- claim that an AI action proves a person performed it.

Every produced plan contains:

```text
actionAuthority: none
```

The downstream Glove remains responsible for current observation, deterministic authorization, action execution, verification, recovery, audit, and emergency stop.

## 2. Design rule

> Personality may shape safe behavior. Personality may never create authority.

The subsystem is deliberately separate from Field administration, guest-command authorization, credentials, application/origin authorization, approval fingerprints, physical-input enablement, consequential-action policy, and emergency stop.

A persona profile is advisory input to an already-authorized workflow. It cannot make a denied workflow permissible.

## 3. Persona profile

A profile contains:

```text
contractVersion
profileId
ownerId
version
supersedesVersion?
createdAt
status
ownerApproved
traits
timing
imperfection
habits
profileHash
```

Profiles are integrity-bound with canonical SHA-256. Modified content fails integrity verification until it is recreated as a new reviewed version. Versions advance one step at a time, and approved status requires explicit owner approval.

### 3.1 Stable traits

The first contract represents:

- cautiousness;
- patience;
- exploration;
- directness;
- expressiveness;
- thoroughness.

Values range from `-1` through `1`. They are behavioral controls, not clinical or psychological diagnoses. Candidate values should ultimately come from consented demonstrations and remain owner-correctable.

### 3.2 Habits

A habit records a stable ID, description, confidence, evidence count, and last observation time. Examples include reading before clicking, cursor-rest behavior, preferred selection method, file-verification habits, and form-completion order.

Habits must remain evidence-backed. A model may not silently invent a high-confidence owner habit.

### 3.3 Timing profile

Timing includes minimum/maximum thinking delay, base reaction time, reading time, uncertainty and risk multipliers, familiarity and urgency adjustments, and bounded deterministic variation.

Timing is contextual. The system does not use one universal human delay or arbitrary sleeps merely to look human.

## 4. Behavioral context

A behavior plan receives:

```text
contextId
mode
taskStage
declaredRisk
complexity
familiarity
uncertainty
urgency
targetDifficulty
contentCharacters
systemReady
recoveringFromError
identitySensitiveCommunication
externalCommitment
financialOrLegalEffect
destructiveEffect
humanVerificationRequired
deterministicSeed
```

### 4.1 Modes

The contract recognizes Teach, Shadow, Correction, Assisted, and Pilot. An unapproved profile may be evaluated only in a non-executing mode such as Shadow. Assisted and Pilot behavior planning require an owner-approved profile.

This requirement does not authorize Assisted or Pilot operation; every normal Glove and Field gate still applies.

### 4.2 Task stages

The stages are `drafting`, `reviewing`, and `committing`. Bounded imperfection modeling is eligible only during an approved low-risk draft. Review and commit stages suppress it.

### 4.3 Risk escalation

The persona layer may preserve or raise risk, never lower it. Identity-sensitive communication raises review requirements. External commitments, financial/legal effects, destructive effects, and human-verification requirements become consequential.

## 5. Behavioral state

The implementation selects one deterministic state:

```text
focused
casual
rushed
uncertain
exploring
reading
waiting_for_system
recovering_from_error
careful
```

Examples:

- unavailable desktop → `waiting_for_system`;
- active recovery → `recovering_from_error`;
- high/consequential risk → `careful`;
- high uncertainty → `uncertain`;
- substantial text → `reading`;
- low familiarity → `exploring`;
- high urgency → `rushed` only after higher-priority safety states.

## 6. Thinking-time model

The current foundation combines base reaction time, estimated reading duration, complexity, uncertainty, risk, familiarity, urgency, behavioral state, and profile-bound deterministic variation. Output is clamped to the approved minimum and maximum.

Variation is derived from:

```text
profileHash + deterministicSeed + contextId
```

The same valid inputs produce the same plan for testing and audit. This is not a cryptographic-security mechanism.

## 7. Verification intensity

Verification intensity increases with cautiousness, thoroughness, uncertainty, and effective risk. Learned style cannot reduce deterministic verification required by product policy.

## 8. Imperfection policy

The profile contract fixes:

```text
strategy: observed_distribution_only
purpose: personalization_not_evasion
immediateCorrectionRequired: true
```

The module exposes only eligibility and probability ceilings. It does not generate a typo, select a wrong target, or inject a misclick.

A future downstream model may preserve an observed low-risk editing or motor-correction process only when:

- the task is still drafting;
- risk is below the configured suppression threshold;
- the context is not identity-sensitive or externally committing;
- there is no financial, legal, destructive, or human-verification effect;
- the system is ready and the plan is not abstaining;
- the profile is integrity-valid and owner-approved where required;
- the behavior derives from observed data;
- correction remains immediate;
- no more than one imperfection is eligible per action chunk.

Source ceilings are intentionally strict:

- draft typo probability: at most 15%;
- draft misclick probability: at most 5%;
- action-chunk imperfection count: at most one.

A trained profile should normally use substantially lower observed rates.

### 8.1 Mandatory suppression

Imperfections are suppressed during review/commit, configured medium-or-greater risk, identity-sensitive communication, external commitments, financial/legal/destructive effects, human verification, unavailable desktop state, abstention, Teach capture, and Correction capture.

This subsystem must not be used to defeat bot, fraud, identity, employment, examination, or platform-integrity controls.

## 9. Abstention and owner review

The plan abstains when the system is not ready, human verification is required, or uncertainty is at least `0.95`.

Owner review is required for identity-sensitive communication, external commitment, high risk, and consequential risk. Disclosure is required by this plan for identity-sensitive communication and external commitment; broader product policy may require it elsewhere.

## 10. Drift control

`comparePersonaProfiles` accepts only consecutive versions of the same owner and profile. Its report includes maximum trait change, high-drift traits, timing-ratio change, added and removed habits, owner-review requirement, and promotion eligibility.

Removing an established habit, changing a trait materially, or changing timing by more than 50% requires owner review. The drift report has no action authority.

## 11. Executable validation

The implementation baseline at commit `e91707dff2cc3c1767a63f8f076e71bba957a6f9` passed hosted validation in UTC run window **2026-08-04**:

- Exosuit CI run `30868262475`;
- Security Audit run `30868262468`;
- read-only GitHub token permissions;
- immutable `npm ci` from committed lockfile;
- npm installation/audit: 145 packages installed, 146 audited, zero vulnerabilities;
- repository validator: 71 required artifacts passed;
- master-plan validator: 22 phased sections passed;
- Field validator: 84 artifacts and 26 source modules passed;
- strict TypeScript typecheck passed;
- focused Field suite: 31 files and 150 tests passed;
- all eight persona tests passed in both focused and full suites;
- Field fake-system pulse passed;
- full TypeScript suite: 63 files and 322 tests passed;
- production TypeScript build passed;
- Glove system pulse passed;
- PowerShell parsing passed;
- .NET Release build passed with zero warnings and zero errors;
- .NET suite: 48 tests passed, zero failed, zero skipped;
- npm high/critical and NuGet direct/transitive vulnerability audit jobs passed.

CodeQL remained skipped under the existing private-repository condition and is not claimed as passed.

## 12. Evidence boundary

The hosted evidence proves source contracts, unit/integration behavior, fake-system pulses, TypeScript build, PowerShell parsing, .NET build/tests, and supported dependency audits for the stated commit.

It does **not** prove:

- a trained personal model or similarity to the owner;
- live mouse/typing integration;
- actual typo or motor-correction generation;
- owner-profile UI, encrypted persistence, rollback, or deletion;
- Shadow calibration from real demonstrations;
- Assisted or Pilot acceptance;
- ChatGPT acceptance;
- production readiness.

## 13. Required next work

1. Add encrypted persona-profile persistence with atomic promotion, disable, rollback, and deletion.
2. Derive candidate traits and habits from processed demonstrations with provenance.
3. Add owner review/edit controls and held-out consistency/drift evaluation.
4. Connect timing and motor preferences only through the existing Glove authorization boundary.
5. Implement separate low-risk observed editing-process and motor-correction models.
6. Prove high-risk and final-submission suppression through live negative testing.
7. Keep personal-model, Assisted, Pilot, ChatGPT, and production gates denied until independently evidenced.
