# Owner Behavioral State Architecture

**Status:** planned architecture direction  
**Applies to:** personal learning, Shadow, Correction, Assisted, and Pilot behavior  
**Refines:** `docs/MASTER_SYSTEM_ROADMAP.md` sections 19-21 and phases L10-L11  
**Does not change:** current M1/M2 Field, channel, scene, execution, authority, privacy, or emergency-stop work

## 1. Decision

Exosuit will add one shared **Owner Behavioral State (OBS)** between task/attention reasoning and the existing personal expression models.

The current decomposition into task policy, attention, timing, motor, typing/editing, correction, language, and verification remains. The change is that those modules should no longer infer conflicting personal context independently. They consume one versioned state snapshot for the same scene/action interval.

```text
fresh scene + task context + recent owner behavior
                    |
                    v
             task / intent policy
                    |
                    v
          OWNER BEHAVIORAL STATE
                    |
      +-------------+-------------+
      |             |             |
      v             v             v
  attention      reasoning     timing/pacing
      |             |             |
      +---------+---+---+---------+
                |       |
                v       v
              motor   typing/editing
                |       |
                +---+---+
                    v
                 correction
                    |
                    v
                  language
                    |
                    v
                verification
                    |
                    v
             updated owner state
```

The goal is coherent personalization: the same underlying state should explain what is inspected, how much evidence is gathered, pacing, action expression, revisions, recovery choices, communication style, and verification depth.

**Non-goal:** OBS is not trained or evaluated against third-party bot, fraud, authenticity, anti-abuse, or detection systems. Evaluation uses owner-approved demonstrations, held-out owner sessions, synthetic fixtures, and Exosuit's own QA environment.

## 2. Why this is the next step

Independent models can each perform well while disagreeing about the situation. For example, one module may behave as if the owner is uncertain while another behaves as if the owner is fully committed. That makes the overall sequence inconsistent even when each subsystem looks reasonable by itself.

OBS provides one shared cause for the entire personalized sequence.

## 3. Initial state contract

Start with an explicit, inspectable state vector before considering a learned latent representation.

Conceptual fields:

```text
BehavioralStateSnapshot
  stateId
  ownerProfileId
  taskId
  workflowId
  fieldId
  fieldGeneration
  sceneVersion
  observedAt

  attentionMode
  confidence
  uncertainty
  familiarity
  urgency
  cognitiveLoad
  readingState
  explorationState
  recoveryState
  taskMomentum
  interactionTempo
  correctionLikelihood
  verificationNeed
  evidenceSufficiency
  communicationMode

  supportingObservationRefs[]
  recentBehaviorWindowRef
  estimatorModelVersion
  featureSchemaVersion
  provenance
```

State dimensions should become continuous or probabilistic where that improves calibration. Modules may abstain when the state estimate is uncertain. No module may silently invent a conflicting personal state.

## 4. State inference

The estimator may use approved fresh inputs:

- current versioned scene;
- current task/workflow state;
- system readiness and latency;
- recent attention/reading behavior;
- recent interaction behavior;
- recent corrections and reversals;
- recent verification behavior;
- approved demonstration retrieval;
- owner annotations where available;
- prior state snapshots.

Memory never overrides fresh observation. State inference records provenance and confidence.

## 5. Evidence accumulation

Add a first-class evidence state so pacing and verification can follow actual task uncertainty instead of cosmetic delay rules.

```text
EvidenceState
  requiredEvidence
  observedEvidence
  conflictingEvidence
  evidenceSufficiency
  decisionConfidence
  decisionThreshold
  unresolvedQuestions
```

Preferred flow:

```text
reasoning
-> attention allocation
-> evidence accumulation
-> commitment threshold
-> action selection
-> personal expression
-> result observation
-> verification
-> OBS update
```

## 6. Shared conditioning

All personalized expression modules consume the same OBS snapshot.

- **Attention:** inspection breadth, rereading, evidence-gathering depth.
- **Reasoning/task policy:** evidence depth, abstention, recovery, asking the owner; never authority expansion.
- **Timing:** conditioned on OBS and real system readiness.
- **Motor:** conditioned on OBS plus approved action/target context.
- **Typing/editing:** conditioned on OBS and communication task.
- **Correction:** unexpected outcomes update OBS before a recovery strategy is selected.
- **Language:** consumes the same confidence, uncertainty, and communication state.
- **Verification:** combines deterministic requirements with OBS-informed personal preferences; deterministic verification remains stronger.

## 7. Multiple timescales

OBS should support at least three horizons:

1. **Moment state** — current attention and immediate interaction context.
2. **Task state** — confidence, exploration, recovery, momentum, evidence sufficiency.
3. **Session state** — sustained tempo, repeated difficulty, long-running recovery patterns.

A later longitudinal layer may learn stable owner tendencies across task classes. Longitudinal context never overrides current scene truth or current policy.

## 8. Teach Mode additions

Existing synchronized Teach streams provide the core raw data. Add optional owner annotations such as:

```text
confident
unsure
exploring
familiar
rushed
confused
waiting
double_checking
recovering
changed_mind
```

These are weak-supervision labels, not permanent hard-coded states.

Training windows should join task/scene context, attention, interaction events, corrections, outcomes, verification, and optional annotations.

## 9. Training architecture

Preserve modular output models for rollback and owner control, but train/evaluate them conditionally on OBS.

Conceptually:

```text
P(attention,
  timing,
  motor,
  typing,
  correction,
  language,
  verification
  |
  owner_state,
  task_context,
  environment_state)
```

An initial implementation may use separate conditional models with a shared state contract. A later implementation may use a shared encoder/state-space model with specialized output heads, provided provenance, deletion, rollback, and per-module evaluation remain intact.

## 10. Behavioral Coherence Score

Add **Behavioral Coherence Score (BCS)** as a QA metric. It does not replace existing task or similarity metrics. It measures whether a complete sequence is consistent with one plausible state transition.

Evaluate relationships such as:

- uncertainty with evidence-gathering depth;
- uncertainty with revision and verification depth;
- familiarity with task commitment;
- errors with recovery and attention redistribution;
- confidence with action commitment and communication certainty;
- evidence sufficiency with decision timing;
- system readiness with waiting behavior.

A model that improves one isolated expression metric while degrading cross-modal coherence should not be promoted.

## 11. Promotion criteria

OBS promotion requires held-out owner data and comparison against the existing independent-model baseline.

Required evaluation families:

- state calibration and abstention;
- task correctness and evidence sufficiency;
- recovery and verification quality;
- per-module owner preference/similarity metrics;
- BCS and contradiction rate;
- stale-state rejection and rollback;
- deletion propagation;
- latency/resource budgets.

Promotion fails if personalization improves while task correctness, verification, recovery, emergency stop, or policy behavior worsens.

## 12. Runtime component

Introduce a first-class `OwnerStateCoordinator` conceptually between reasoning/attention and personal expression.

Each personalized action chunk should bind:

- source scene version;
- OBS state ID;
- task-policy version;
- expression-model versions;
- expected result;
- verification plan.

A stale OBS snapshot cannot authorize a mutation after its source scene becomes stale.

## 13. Roadmap integration

This direction refines existing phases without disrupting current Field development.

### L10 — Personal task and attention models

Add:

- evidence-state representation;
- OBS feature extraction;
- initial state schema;
- state-estimator baseline;
- optional owner-state annotations.

### L11 — Owner behavioral dynamics and expression models

Expand L11 to include:

- `OwnerStateCoordinator`;
- state inference and transition model;
- existing personal expression models conditioned on the shared state;
- correction and verification integration;
- BCS and cross-modal QA;
- per-module and joint held-out evaluation;
- versioning, rollback, disable controls, and deletion propagation.

L11 is not complete merely because individual models score well separately. It requires coherent state-conditioned performance across complete held-out owner sequences.

### L12 — Assisted Mode

Assisted skills may consume a promoted OBS profile but must continue to function with personalization disabled. OBS may alter expression and already-permitted strategy selection; it may not expand authority or permission scope.

## 14. Development slices

Implement after prerequisites are available:

### OBS-001 — Contracts and replay data

- versioned state and evidence contracts;
- synchronized replay fixture;
- provenance, deletion, and scene-binding tests.

### OBS-002 — State estimator baseline

- explicit estimator;
- confidence and abstention;
- calibration;
- owner-annotation comparison.

### OBS-003 — Attention, evidence, and timing integration

- shared-state conditioning;
- evidence accumulation;
- relationship tests.

### OBS-004 — Interaction expression integration

- existing motor and typing/editing modules consume the same state snapshot;
- existing per-module metrics retained;
- cross-modal tests added.

### OBS-005 — Correction, language, verification integration

- unexpected outcomes update state;
- recovery consumes recovery state;
- communication consumes confidence/communication state;
- learned verification preferences remain subordinate to deterministic verification.

### OBS-006 — Coherence evaluator

- BCS;
- contradiction-rate reporting;
- transition diagnostics;
- baseline comparison.

### OBS-007 — Shadow validation

- OBS operates with no execution authority;
- held-out owner-session evaluation;
- owner review and thresholds.

### OBS-008 — Assisted opt-in

- promoted profile only;
- visible enable/disable;
- deterministic fallback;
- rollback and audit.

## 15. Failure cases

Test at minimum:

- stale OBS snapshot;
- contradictory evidence;
- missing behavioral stream;
- low-confidence state;
- state oscillation;
- expression-module failure;
- deleted training episode;
- profile rollback;
- changed layout;
- slow system response;
- unexpected dialog;
- repeated recovery cycle;
- task-policy/state disagreement;
- stronger deterministic verification requirement;
- state-estimator overload.

Fallback is deterministic, task-correct behavior with personalization reduced or disabled.

## 16. Non-regression requirements

OBS work must not weaken:

- owner authority;
- Field administration boundaries;
- emergency stop;
- scene freshness;
- deterministic verification;
- credential isolation;
- deletion propagation;
- skill permission boundaries.

Current M1/M2 evidence and development remain valid and can continue independently until L10/L11 prerequisites are reached.

## 17. Success definition

The target is one coherent, personalized process:

```text
owner state
-> attention
-> evidence gathering / reasoning
-> timing
-> personal action expression
-> correction
-> language
-> verification
-> next owner state
```

Success means better personalization, task competence, recovery quality, calibration, and long-term consistency while preserving Exosuit's deterministic authority and verification boundaries.
