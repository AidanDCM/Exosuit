# Exosuit Persona and Behavioral Dynamics

**Subsystem status:** source foundation  
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

- click;
- type;
- move the pointer;
- approve an action;
- create consent;
- change Field policy;
- lower a risk classification;
- bypass human-verification requirements;
- represent an AI action as proof that a person performed it.

Every produced plan contains:

```text
actionAuthority: none
```

The downstream Glove remains responsible for current observation, deterministic authorization, action execution, verification, recovery, audit, and emergency stop.

## 2. Design rule

> Personality may shape safe behavior. Personality may never create authority.

The subsystem is deliberately separate from:

- Field administration;
- guest command authorization;
- credential brokering;
- application and origin authorization;
- approval fingerprints;
- physical-input enablement;
- consequential-action policy;
- emergency stop.

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

Profiles are integrity-bound with canonical SHA-256.

A modified profile fails integrity verification until it is recreated as a new reviewed version. Versions advance one step at a time, and an approved profile requires explicit owner approval.

### 3.1 Stable traits

The first source contract represents:

- cautiousness;
- patience;
- exploration;
- directness;
- expressiveness;
- thoroughness.

Trait values range from `-1` through `1`.

These are behavioral controls, not clinical or psychological diagnoses. They should eventually be estimated from consented demonstrations and corrected by the owner.

### 3.2 Habits

A habit records:

- stable ID;
- plain-language description;
- confidence;
- evidence count;
- last observation time.

Examples include:

- reading a primary control label before clicking;
- resting the cursor away from text while reading;
- preferring keyboard selection over drag selection;
- verifying file names immediately after export;
- completing forms from top to bottom.

Habits must remain evidence-backed. A model may not silently invent a high-confidence owner habit.

### 3.3 Timing profile

Timing includes:

- minimum and maximum thinking delay;
- base reaction time;
- reading time per 100 characters;
- uncertainty multiplier;
- risk multiplier;
- familiarity discount;
- urgency discount;
- bounded deterministic variation.

Timing is context-dependent. The system does not use one universal human delay and does not add arbitrary sleeps merely to look human.

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

The source contract recognizes:

- Teach;
- Shadow;
- Correction;
- Assisted;
- Pilot.

An unapproved profile may be evaluated in a non-executing mode such as Shadow. Assisted and Pilot planning require an owner-approved profile.

This check does not itself authorize Assisted or Pilot operation. Those modes still require every normal Field and Glove gate.

### 4.2 Task stages

The stages are:

- `drafting`;
- `reviewing`;
- `committing`.

Bounded imperfection modeling is permitted only during an eligible low-risk drafting context. Review and commit stages suppress imperfections.

### 4.3 Risk escalation

The persona layer may only preserve or raise risk.

Risk automatically escalates when context includes:

- identity-sensitive communication;
- external commitment;
- financial or legal effect;
- destructive effect;
- mandatory human verification.

External commitments, financial/legal effects, destructive effects, and human-verification requirements become consequential.

## 5. Behavioral state

The source implementation selects one state from:

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

State selection is deterministic from the approved profile and current context.

Examples:

- an unavailable desktop becomes `waiting_for_system`;
- active recovery becomes `recovering_from_error`;
- high or consequential risk becomes `careful`;
- high uncertainty becomes `uncertain`;
- substantial text may become `reading`;
- low familiarity may become `exploring`;
- high urgency may become `rushed` only after higher-priority safety states are considered.

## 6. Thinking-time model

The current foundation combines:

- base reaction time;
- estimated reading duration;
- task complexity;
- uncertainty;
- effective risk;
- familiarity;
- urgency;
- selected behavioral state;
- profile-bound deterministic variation.

The output is clamped to the approved profile's minimum and maximum delay.

The deterministic variation is derived from:

```text
profileHash + deterministicSeed + contextId
```

This makes a plan reproducible for testing and audit. It does not produce cryptographic randomness and is not an execution-security mechanism.

## 7. Verification intensity

Verification intensity is increased by:

- cautiousness;
- thoroughness;
- uncertainty;
- effective risk.

Learned style cannot lower mandatory deterministic verification. A task can require stronger checks than the persona prefers, but never weaker checks than policy requires.

## 8. Imperfection policy

The profile contract requires:

```text
strategy: observed_distribution_only
purpose: personalization_not_evasion
immediateCorrectionRequired: true
```

The source foundation exposes only bounded eligibility and probability ceilings. It does not generate a typo, choose a wrong target, or inject a misclick.

A future downstream model may preserve an observed low-risk editing or motor-correction process only when all of the following are true:

- the task is in the drafting stage;
- risk is below the configured suppression threshold;
- the context is not identity-sensitive;
- the action is not an external commitment;
- there is no financial, legal, or destructive effect;
- human verification is not required;
- the system is ready;
- the plan is not abstaining;
- the profile is integrity-valid;
- the behavior comes from an observed distribution;
- immediate correction remains required;
- no more than one imperfection is allowed per action chunk.

The source ceilings are intentionally strict:

- draft typo probability: at most 15%;
- draft misclick probability: at most 5%;
- action-chunk imperfection count: at most one.

A real trained profile should generally use substantially lower observed rates.

### 8.1 Mandatory suppression

Imperfections are suppressed for:

- reviewing;
- committing;
- medium or greater risk by default;
- identity-sensitive communication;
- external commitments;
- financial or legal effects;
- destructive effects;
- unavailable desktop state;
- human-verification requirements;
- abstention;
- Teach input capture;
- Correction capture.

This subsystem must not be used to create activity intended to defeat bot, fraud, identity, employment, examination, or platform-integrity controls.

## 9. Abstention and owner review

The source plan abstains when:

- the system is not ready;
- human verification is required;
- uncertainty reaches the configured source ceiling of `0.95`.

Owner review is required for:

- identity-sensitive communication;
- external commitment;
- high risk;
- consequential risk.

Disclosure is required by the persona plan for identity-sensitive communication and external commitment. Product policy may require disclosure in additional situations.

## 10. Drift control

`comparePersonaProfiles` compares consecutive profile versions.

The drift report includes:

- maximum stable-trait change;
- traits whose absolute change exceeds `0.25`;
- maximum timing-ratio change;
- added habits;
- removed habits;
- whether explicit owner approval is required;
- whether the next profile is eligible for promotion.

A comparison is rejected if it crosses owner identity, profile identity, or nonconsecutive versions.

Removing an established habit, changing a trait materially, or changing timing by more than 50% requires owner review.

The source report has no action authority.

## 11. Current test coverage

Focused tests are written for:

1. integrity-bound profile creation and tamper detection;
2. deterministic non-executing behavior plans;
3. bounded low-risk drafting allowances;
4. consequential-risk escalation and imperfection suppression;
5. longer thinking and stronger verification under uncertainty and risk;
6. desktop-unavailable and human-verification abstention;
7. owner approval requirements for Assisted and Pilot planning;
8. drift detection and consecutive version enforcement;
9. rejection of evasion-oriented or excessive imperfection policy.

Run:

```bash
npm run test:persona
```

The test is also part of the focused Field suite and the complete TypeScript suite.

## 12. Evidence boundary

This source slice does not prove:

- a trained personal model;
- similarity to the owner;
- live mouse or typing integration;
- actual typo or motor-correction generation;
- live owner-profile editing;
- encrypted profile persistence;
- model rollback in a running Field;
- Shadow calibration from real demonstrations;
- Assisted or Pilot acceptance;
- production readiness.

The full repository suite must execute on the exact current commit before this slice receives executable validation status.

## 13. Required next work

1. Run exact-head typecheck, focused tests, full tests, build, and both system pulses.
2. Add encrypted persona-profile persistence with atomic version promotion and rollback.
3. Derive candidate traits and habits from processed demonstrations with provenance.
4. Add owner review/edit/delete controls.
5. Add held-out consistency and drift evaluation.
6. Connect timing and motor preferences only through the existing Glove authorization boundary.
7. Implement a separate low-risk observed editing-process model.
8. Implement a separate low-risk motor-correction model.
9. Prove that high-risk and final-submission contexts suppress all imperfection paths.
10. Keep personal-model, Assisted, Pilot, ChatGPT, and production gates denied until their independent evidence exists.
