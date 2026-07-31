# Exosuit Complete Master System Plan

**Status:** single authoritative planning document  
**Applies to:** the complete Exosuit repository  
**Systems covered:** Exosuit Glove and Exosuit Field  
**Planning revision:** 2026-07-28  
**Current development branch:** `codex/unify-glove-field`, integrating `build/exosuit-mvp` and the preserved Field line  
**Current draft PRs:** #1 and #11 are historical inputs; the consolidated branch remains unpromoted  
**Current executable promotion gate:** exact-head integrated L0 validation, followed by the remaining interactive gates

---

## 1. Document authority

This file is the controlling plan for the entire Exosuit program.

It defines:

- the final product;
- the permanent separation between the Glove and the Field;
- the complete target architecture;
- the owner, service, pilot, and model authority boundaries;
- the Teach, Shadow, Correction, Assisted, and Pilot operating stages;
- the behavioral-learning design;
- every implementation phase from source validation through production;
- required tests, failure injection, evidence, audits, manuals, rollback, and promotion gates;
- the order in which work is allowed to proceed.

Narrower documents explain implemented architecture, current evidence, operating procedures, or a specific subsystem. They may add detail, but they may not contradict this plan.

Document responsibilities:

| Document | Authority |
|---|---|
| `docs/MASTER_SYSTEM_ROADMAP.md` | complete future plan and execution order |
| `README.md` | concise product explanation and current status |
| `docs/GLOVE_FIELD_BOUNDARY.md` | permanent ownership boundary |
| `docs/ARCHITECTURE.md` | implemented Glove architecture only |
| `docs/FIELD_ARCHITECTURE.md` | Field architecture and subsystem design |
| `docs/FIELD_IMPLEMENTATION_STATUS.md` | exact current Field implementation and evidence |
| `docs/SECURITY_MODEL.md` | security rules and threat boundaries |
| `docs/TEST_PLAN.md` | shared and Glove evidence rules |
| `docs/FIELD_TEST_PLAN.md` | Field evidence rules |
| `docs/FIELD_WINDOWS_RUNBOOK.md` | Windows and Hyper-V execution procedure |
| `docs/qa/*` | audits, evidence, failure matrices, and release decisions |
| GitHub issues | bounded execution tasks, not architectural authority |

When a document conflicts with this file, development stops until the conflict is reconciled and recorded.

---

## 2. North Star

> Build a private, owner-authorized computer embodiment system in which an AI pilot can operate a complete Windows computer through an independent Glove, learn the owner's observable task behavior from consented demonstrations inside an independent Field, and later perform validated workflows with fresh perception, ordinary desktop interaction, deterministic policy, verification, audit, recovery, and immediate local interruption.

The intended experience is:

- human flexibility;
- machine precision;
- fluid mouse, keyboard, reading, waiting, and correction behavior;
- detailed owner teaching;
- persistent task understanding;
- transparent operation;
- recoverable long-running workflows;
- local user authority;
- independent evidence for what was observed, predicted, executed, and verified.

The system may become highly personalized. It must not claim that an AI-performed action proves a human personally performed it.

---

## 3. One repository, two products

Exosuit contains two intentionally separate systems.

| System | Metaphor | Owns |
|---|---|---|
| **Exosuit Glove** | body, hand, nervous system | sensing, scene interpretation, planning support, action proposals, local policy checks, semantic and physical execution, verification, workflow state, recovery, audit, and emergency stop |
| **Exosuit Field** | controlled world or training ground | isolated Windows environment, VM identity, display and input configuration, applications, storage layers, task workspace, consented recording surface, lifecycle, and environment evidence |

Permanent rule:

> **The Glove is not the VM. The Field is not the agent.**

They share contracts and repository infrastructure, but they retain separate:

- identities;
- generations;
- lifecycles;
- policies;
- audit streams;
- health states;
- tests;
- manuals;
- failure states;
- rollback procedures;
- promotion evidence.

### 3.1 Glove responsibilities

The Glove owns:

- UI Automation observation;
- optional policy-bound visual observation;
- active-window and element grounding;
- semantic actions;
- ordinary Windows mouse and keyboard input;
- focus leases and input serialization;
- expected-result verification;
- workflow graphs and checkpoints;
- interruption handling;
- no-blind-retry recovery;
- task, motor, typing, timing, and language policy application;
- emergency stop;
- action and workflow audit.

### 3.2 Field responsibilities

The Field owns:

- one exact `fieldId` and monotonically increasing `fieldGeneration`;
- one Windows guest identity and interactive session;
- immutable base-image identity;
- disposable OS overlay identity;
- optional persistent personal-state identity;
- disposable task-disk identity;
- fixed display and input configuration;
- approved applications and origins;
- Teach, Shadow, Correction, Assisted, and Pilot lifecycle state;
- demonstration recording surface;
- workspace directories;
- bounded import and export boundary;
- guest readiness and heartbeat evidence;
- destruction and replacement of one exact generation.

### 3.3 Shared responsibilities

Shared contracts include:

- Field references;
- policy and attestation identity;
- host/guest channel envelopes;
- scene versions;
- demonstration episode references;
- artifact manifests;
- support-bundle summaries;
- audit correlation IDs;
- compatibility versions.

Shared code must never blur which subsystem owns an authority decision.

---

## 4. Product definition

The finished product consists of these physical and logical components:

```text
Authorized owner
      |
      | creates policy, grants recording consent,
      | approves sensitive operations, controls stop
      v
Owner Cockpit / Local Field Administration
      |
      +--------------------+
      |                    |
      v                    v
Exosuit Glove          Exosuit Field Manager
Supervisor             host-only environment authority
      |                    |
      | authenticated      | provisions and destroys
      | typed channel      | exact Field generations
      +----------+---------+
                 |
                 v
      Exosuit Field VM / Windows session
      +---------------------------------------------+
      | Exosuit Glove Agent                         |
      | - UI Automation                             |
      | - policy-bound visual sensor                |
      | - scene graph producer                      |
      | - local reflex engine                       |
      | - ordinary mouse and keyboard motor         |
      | - Teach recorder                            |
      | - verification and emergency stop           |
      +---------------------------------------------+
      | Windows desktop and ordinary applications   |
      | browser, files, office apps, test apps, etc.|
      +---------------------------------------------+
```

The pilot may be ChatGPT, Claude, or another authorized MCP host. The pilot supplies goals and high-level decisions. It does not administer the Field, create consent, sign policies, rotate keys, or override local authority.

---

## 5. Browser rule

A browser is an ordinary Windows application inside the Field.

The primary Exosuit design does **not** depend on:

- Playwright;
- browser automation APIs;
- a DOM execution channel;
- an AI browser;
- a browser extension acting as the main controller;
- treating websites as a special execution environment.

The normal browser control hierarchy is:

1. fresh Windows UI Automation where available;
2. policy-bound desktop vision when UI Automation is insufficient;
3. application memory only as advisory context;
4. ordinary guest-local mouse and keyboard input;
5. state and artifact verification.

Any existing browser-companion experiments remain disabled research code. They are not part of the required product path, cannot become a prerequisite for website operation, and cannot weaken the normal desktop boundary.

---

## 6. Explicit non-goals

Exosuit must not implement or claim:

- stealth or undetectable automation;
- anti-bot or anti-cheat evasion;
- kernel, driver, hardware, or input-device impersonation for concealment;
- bypassing application or platform security controls;
- credential harvesting;
- privilege escalation;
- arbitrary remote shell execution through MCP;
- model-created consent;
- covert recording;
- host-wide surveillance;
- unauthorized account access;
- that personalized behavior proves the owner personally acted;
- guaranteed indistinguishability from a person;
- guaranteed competence on every unfamiliar desktop task.

The valid target is an owner-authorized, highly personalized, transparent and auditable desktop agent.

---

## 7. Current evidence boundary

### 7.1 Glove

The Glove has substantial implemented source and bounded Windows evidence for:

- MCP contracts;
- fake desktop tests;
- Windows UI Automation observation and semantic actions;
- pointer movement, click, Unicode typing, and hotkeys;
- policy and approval flows;
- workflow and coordinator foundations;
- checkpoints and recovery;
- audit chains;
- emergency stop.

Current Glove evidence does not automatically prove operation inside the final Field architecture.

### 7.2 Field

The preserved Field development line contains substantial source, fake/pure foundations, Windows tooling, and bounded live Hyper-V evidence for:

- identity and generation;
- policy and HMAC attestation;
- VM desired state;
- guarded PowerShell administration;
- fake lifecycle;
- authenticated channel contracts;
- heartbeat and bootstrap contracts;
- typed guest command authorization;
- Teach recording state;
- encrypted demonstration storage;
- visual-retention policy;
- scene state;
- Shadow comparison metrics;
- path and artifact boundaries;
- recovery;
- privacy-safe diagnostics;
- TypeScript/.NET wire fixtures;
- synthetic acceptance application;
- manuals, audits, and CI contracts;
- unattended base-image sealing and generation provisioning;
- v13 and v20 development generations that produced authenticated handshake,
  bootstrap, heartbeat, and bounded lifecycle evidence;
- a v21 development generation that exercised the compiled observation ledger
  across restart, retained polling, live-captured negative transitions, exact
  destruction, and post-destruction base immutability;
- an authenticated-at-rest observation-state envelope bound to the exact Field
  generation and channel key, with fail-closed corruption, rotation, and stale-
  generation source tests. Live protected-state injection remains pending.

Exact-head Field L0 validation passed on `e10e921` before consolidation, on the
hardened consolidated commit `7a7c435`, and on compiled-ledger commit `454fc85`.
Adapter commit `26251da` also passed an exact-head 15-step runner. The latest run
recorded locked install,
validators, all tests/builds/pulses, and the read-only host capability check.
Live evidence still uses development access and does not prove production
authentication or the complete failure matrix, so it remains feasibility and
bounded implementation evidence rather than production acceptance.

### 7.3 Current promotion posture

| Capability | Current posture |
|---|---|
| source architecture | implemented extensively; Glove/Field consolidation in progress |
| exact-head compilation and test execution | consolidated `7a7c435` L0 passed; clean parity also passed 12/12 |
| live Hyper-V Field | development evidence recorded; production acceptance denied |
| live Teach recording | denied until L4-L5 |
| live artifact transport | denied until L6 |
| actual Shadow prediction | denied until L7 |
| synthetic Pilot | denied until L8 |
| real website operation | denied until synthetic Pilot and later owner acceptance |
| production | denied |

No lower evidence level may be described using a higher status.

---

## 8. Status vocabulary

Every feature and phase uses one state:

| State | Meaning |
|---|---|
| `proposed` | idea exists; contracts and risks are incomplete |
| `planned` | objective, dependencies, contracts, tests, evidence, and rollback are written |
| `source_implemented` | source exists but executable evidence is incomplete |
| `source_validated` | exact-head compile, unit, fake integration, static, and audit checks pass |
| `windows_validated` | required Windows behavior passes in a disposable environment |
| `field_validated` | required Hyper-V guest and host behavior passes for one exact Field generation |
| `owner_validated` | the owner completes the acceptance matrix and approves promotion |
| `chatgpt_connected` | reviewed MCP operation passes from a normal ChatGPT conversation |
| `production_candidate` | packaging, privacy, security, recovery, and operations gates pass |
| `released` | signed build published with reproducible evidence and support policy |
| `blocked` | a named dependency or risk prevents advancement |

---

## 9. Evidence ladder

| Level | Evidence |
|---|---|
| E0 | document or proposal only |
| E1 | static source review |
| E2 | exact-head compile and unit tests |
| E3 | fake-provider integration and full synthetic pulse |
| E4 | local Windows execution in a disposable account or VM |
| E5 | Hyper-V host/guest lifecycle and isolation evidence |
| E6 | consented live Teach or Shadow evidence |
| E7 | synthetic Pilot evidence with fault injection |
| E8 | low-risk owner acceptance through ChatGPT |
| E9 | packaging, rollback, privacy, security, and operational evidence |

Every evidence record must include:

- exact commit SHA;
- branch;
- environment and tool versions;
- exact commands;
- complete result;
- preserved logs or artifacts;
- failures and repairs;
- unresolved risks;
- evidence owner;
- date;
- rollback or cleanup result.

---

## 10. System-wide authority model

Authority order:

1. owner and local emergency stop;
2. signed local Field and Glove policy;
3. local deterministic authorization and safety checks;
4. verified workflow state;
5. pilot proposal;
6. application content and stored demonstrations as untrusted data.

The model may:

- request observations;
- propose goals and actions;
- choose among allowed task strategies;
- use approved personal behavior profiles;
- receive sanitized status and evidence.

The model may not:

- create or expand policy;
- sign attestation;
- grant consent;
- enable recording;
- rotate channel keys;
- administer Hyper-V;
- choose arbitrary host paths;
- approve sensitive export;
- delete demonstrations;
- disable audit or emergency stop;
- silently increase runtime, action, storage, network, or privilege scope.

---

## 11. Field physical design

### 11.1 Hypervisor

The reference Field uses Hyper-V Generation 2.

Required defaults:

- Secure Boot enabled;
- TPM when supported and required by the chosen Windows image;
- nested virtualization disabled;
- production checkpoints only where reviewed;
- no broad host drive mapping;
- no host clipboard integration;
- no host input injection;
- no inbound guest connections;
- no host LAN access;
- viewer treated only as a viewer;
- Glove agent runs inside the controlled Windows session.

### 11.2 Storage layers

```text
Immutable golden Windows base VHDX
             |
             v
Disposable differencing OS overlay per Field generation

Optional encrypted persistent personal-state disk

Separate disposable task/workspace disk
```

Rules:

- the base image is never the normal writable boot disk;
- a generation boots from its own differencing overlay;
- persistent personal state is separately identified, encrypted, backed up, and revocable;
- task data is disposable by default;
- destruction is confined to one exact generation;
- base and personal-state paths are never accepted as generation-deletion targets;
- rollback or rebuild increments `fieldGeneration`;
- traffic from an older generation is rejected.

### 11.3 Display and input contract

Initial reference contract:

```yaml
display:
  monitor_count: 1
  resolution: 1920x1080
  scale_percent: 100
  browser_zoom_percent: 100
  dynamic_resolution: false

input:
  keyboard_layout: en-US
  mouse_sensitivity: fixed_and_recorded
  pointer_acceleration: fixed_and_recorded
  keyboard_repeat_delay: fixed_and_recorded
  keyboard_repeat_rate: fixed_and_recorded

desktop:
  taskbar_position: fixed
  taskbar_auto_hide: false
  sleep_during_session: disabled
  notifications_during_tasks: suppressed_or_bounded
  animations: reduced
  transparency: disabled
```

The exact environment used for teaching must match the environment used for replay and Pilot unless a deliberate adaptation experiment is being measured.

### 11.4 Filesystem layout

```text
C:\Exosuit\
├── Agent\
├── Config\
├── Logs\
├── Maps\
├── Models\
├── Checkpoints\
├── Demonstrations\
└── Diagnostics\

C:\Field\
├── Inbox\
├── Workspace\
├── Downloads\
├── Outbox\
└── Quarantine\
```

Transfer direction:

- host imports enter `Inbox` or `Quarantine`;
- normal exports leave from `Outbox` only;
- downloads remain inside the Field until inspected;
- sensitive export requires a separate owner-reviewed path;
- untrusted content cannot use the normal export path.

---

## 12. Field identity and lifecycle

A Field identity contains at least:

```text
fieldId
fieldGeneration
agentId
machineId
windowsSessionId
guestBootId
baseImageDigest
runtimeOverlayId
personalStateDiskId?
personalStateGeneration?
taskDiskId
displayContractHash
createdAt
contractVersion
```

Lifecycle:

```text
planned
→ provisioning
→ booting
→ bootstrap_pending
→ ready
→ teaching | shadowing | correcting | assisted | piloting
→ ready
→ stopping
→ stopped
→ destroyed
```

Fault states include:

```text
provisioning_faulted
bootstrap_faulted
channel_faulted
recorder_faulted
execution_faulted
recovery_required
destruction_incomplete
```

Mode entry requires:

- exact Field reference;
- current guest boot identity;
- valid unexpired policy;
- matching policy hash and attestation;
- healthy heartbeat;
- ready interactive desktop;
- unlocked session;
- Secure Desktop inactive;
- current display contract;
- required Glove capabilities;
- empty or appropriately owned input queue.

---

## 13. Host/guest communication

The production boundary uses a reviewed local transport, preferably Hyper-V sockets or another local authenticated channel that does not expose a normal inbound network service.

Logical channels:

```text
control      typed commands and results
observation  scene and desktop summaries
events       focus, dialog, process, file, and lifecycle events
artifacts    bounded manifests and staged byte transfer
training     demonstration, prediction, and correction references
heartbeat    guest liveness and readiness
emergency    independent stop signal
```

Every message binds:

- contract version;
- exact Field ID and generation;
- direction;
- key ID;
- message ID;
- sequence;
- nonce;
- sent and expiration time;
- payload hash;
- authenticated signature.

Required protections:

- replay rejection;
- non-increasing sequence rejection;
- duplicate nonce and message-ID rejection;
- wrong direction rejection;
- wrong generation rejection;
- expiration;
- key rotation;
- durable replay state;
- boot replacement invalidation;
- bounded message and payload sizes;
- channel failure that cannot leave input running blindly.

---

## 14. Perception and scene model

The Glove maintains a persistent, versioned scene rather than rebuilding the desktop from isolated screenshots.

Scene state includes:

- windows and generations;
- process identity;
- active and focused window;
- accessible controls;
- element ownership and bounds;
- modal dialogs;
- display state;
- cursor position;
- input-queue state;
- session lock;
- Secure Desktop;
- files and artifacts relevant to the workflow;
- meaningful state-change events.

Perception hierarchy:

1. fresh Windows UI Automation;
2. event-driven window, process, focus, file, and session state;
3. policy-bound visual observation;
4. advisory application and demonstration memory;
5. bounded physical exploration when ambiguity remains.

Freshness rules:

- every mutation binds a scene version;
- window generations invalidate stale targets;
- navigation or major visual change invalidates stale element grounding;
- session lock, Secure Desktop, display change, or heartbeat loss blocks input;
- memory never overrides fresh observation;
- unknown state fails closed.

---

## 15. Glove execution architecture

Three control loops are required.

### 15.1 Reasoning loop

Responsible for:

- interpreting the task;
- choosing a workflow and next intent;
- deciding when the situation is ambiguous;
- selecting a validated personal skill;
- choosing recovery or asking the owner.

### 15.2 Desktop coordination loop

Responsible for:

- scene updates;
- window and target identity;
- focus leases;
- dialogs and interruptions;
- task state;
- action chunk scheduling;
- expected-result verification;
- checkpoint and reconciliation.

### 15.3 Local motor/reflex loop

Responsible for:

- cursor trajectories;
- mouse down/up;
- left, right, middle, and double click;
- dragging;
- vertical and horizontal scrolling;
- key down/up;
- hotkeys;
- text entry;
- immediate cancellation;
- learned motor and timing profiles.

The pilot does not generate every cursor sample. The local Glove converts a high-level, policy-approved action into bounded physical behavior.

Required physical primitives:

```text
move_pointer
mouse_down
mouse_up
click
double_click
right_click
middle_click
drag
wheel
horizontal_wheel
key_down
key_up
press_key
type_text
hotkey
cancel_motor
```

---

## 16. Operating modes

### 16.1 Teach Mode

The owner controls the Field. Exosuit observes and records after explicit consent.

Teach Mode must:

- show a persistent visible recording indicator;
- provide an independent local stop;
- never inject input;
- stop on consent revocation;
- stop or pause on lock and Secure Desktop;
- exclude protected credentials and sensitive controls;
- enforce source, event, time, storage, frame, and byte budgets;
- encrypt and authenticate stored episodes;
- support deletion by episode and Field generation;
- produce deletion evidence;
- clearly distinguish successful action, exploration, mistake, correction, undo, waiting, and task completion.

### 16.2 Shadow Mode

The owner controls the Field. Exosuit predicts but cannot execute.

Shadow Mode predicts:

- next intent;
- target;
- method;
- expected result;
- reason or decision feature where supported;
- delay and timing class;
- optional motor trajectory family;
- confidence;
- abstention.

Shadow must have process-level or capability-level proof that it cannot reach semantic mutation, mouse, or keyboard execution.

### 16.3 Correction Mode

The agent proposes or begins a bounded action, and the owner takes over whenever behavior diverges.

A correction record contains:

- source observation;
- agent prediction or action;
- owner takeover point;
- owner replacement behavior;
- difference classification;
- resulting state;
- whether the agent's decision, target, method, timing, language, or motor behavior was wrong.

### 16.4 Assisted Mode

Exosuit performs validated substeps while the owner remains the primary operator.

Examples:

- opening a familiar application;
- arranging windows;
- entering non-sensitive repeated fields;
- waiting for a known readiness event;
- organizing approved output files;
- suggesting but not automatically sending communication.

### 16.5 Pilot Mode

An authorized pilot controls the Field through the Glove.

Pilot Mode requires:

- signed host-created policy;
- exact process, origin, capability, runtime, and action limits;
- healthy Field and Glove;
- current scene;
- approved route;
- expected result;
- verification;
- no-blind-retry recovery;
- local emergency stop;
- complete audit;
- validated task scope.

Pilot Mode does not provide Field administration.

---

## 17. Teach Mode capture design

Five synchronized streams are required.

### 17.1 Input stream

Capture with high-resolution timestamps:

- cursor samples;
- mouse buttons down/up;
- click intervals;
- wheel deltas and bursts;
- drag path;
- key down/up;
- shortcuts;
- backspace and delete;
- selection and cursor-edit operations;
- focus changes;
- reading and inactivity intervals.

### 17.2 Visual stream

Capture according to explicit policy:

- full frame on meaningful state change;
- active-window frame;
- cursor-region frame;
- visual difference reference;
- loading and animation state;
- sensitive regions redacted;
- external encrypted blobs rather than inline bytes;
- deterministic expiration.

### 17.3 Semantic Windows stream

Capture:

- window/process identity;
- active window;
- UI Automation tree changes;
- focused element;
- control type and patterns;
- enabled, selected, focused, and offscreen state;
- bounds;
- modal state;
- session state.

### 17.4 System-result stream

Capture:

- process launch and exit;
- file create, rename, modify, and download completion;
- clipboard state only where explicitly approved and content-safe;
- application-not-responding state;
- task artifact production;
- expected and actual result.

### 17.5 Annotation stream

The owner may mark:

- task goal;
- step boundary;
- success;
- mistake;
- correction;
- changed mind;
- reason;
- evidence considered;
- task complete;
- session abort.

Narration improves the model of **why**, but observation alone cannot guarantee access to an unspoken mental reason.

---

## 18. Demonstration episode model

A terminal episode contains:

```text
episodeId
fieldId
fieldGeneration
operatorIdentityReference
consentRecord
taskGoal
successCriteria
startedAt
endedAt
environmentVersion
applicationVersions
displayContract
orderedEvents
stepSegments
annotations
outcome
artifacts
redactionSummary
retentionPolicy
integrityHash
status: completed | aborted | faulted
```

Rules:

- consent predates recording;
- events have unique IDs and contiguous sequence numbers;
- timestamps are ordered and inside the session interval;
- terminal episodes only are persisted;
- secret-shaped keys are redacted before storage;
- raw frame bytes are not embedded in event metadata;
- storage is encrypted and authenticated;
- wrong-key and tampered records fail closed;
- every derived training product cites source episode IDs and processing version;
- deletion removes source and derived references according to policy.

---

## 19. Behavioral model decomposition

The system must not train one undifferentiated model for everything.

### 19.1 Task policy

Learns:

- what the owner tries to accomplish next;
- workflow order;
- stopping conditions;
- preferred applications and methods;
- decision priorities;
- rejection and selection criteria;
- verification habits;
- recovery strategy.

### 19.2 Attention and reading model

Learns:

- page regions inspected first;
- cursor resting behavior;
- reading duration by content type;
- scrolling and scanning patterns;
- information that triggers a decision;
- when the owner rereads or returns to an earlier section.

### 19.3 Motor model

Learns conditionally from:

```text
start position
+ target identity and geometry
+ action purpose
+ task state
+ uncertainty
+ urgency
+ familiarity
→ movement path, velocity, acceleration, correction, and click timing
```

It may model:

- curvature;
- overshoot;
- target settling;
- small corrections;
- pre-positioning toward likely targets;
- cursor rest locations;
- drag and scroll patterns.

It must not add generic random noise simply to appear human.

### 19.4 Typing and editing model

Learns:

- per-key and key-pair timing;
- burst and pause structure;
- normal misspellings;
- immediate versus delayed correction;
- backspace rhythm;
- mouse versus keyboard selection;
- capitalization and punctuation;
- sentence rereading;
- rewrite and shortening patterns.

The output is an editing process, not merely final text.

### 19.5 Language and communication model

Learns:

- vocabulary;
- sentence length;
- repetition and fillers;
- directness;
- humor and emphasis;
- explanation structure;
- spoken self-correction;
- written revision habits.

Identity-sensitive communications require appropriate disclosure or owner review.

### 19.6 Timing and behavioral-state model

Estimates context-dependent states such as:

```text
focused
casual
rushed
uncertain
exploring
reading
waiting_for_system
recovering_from_error
```

Timing is conditioned on state and system readiness. There is no single fixed owner delay.

### 19.7 Correction model

Learns whether the owner:

- ignores a minor issue;
- corrects immediately;
- finishes and returns later;
- rewrites a section;
- undoes;
- chooses another method;
- abandons the approach;
- asks for help.

### 19.8 Verification model

Learns how the owner confirms completion, but deterministic verification requirements remain policy-controlled and cannot be weakened by learned behavior.

---

## 20. Learning pipeline

```text
consented raw episode
→ integrity and privacy validation
→ event synchronization
→ step segmentation
→ semantic target grounding
→ intent and reason labeling
→ mistake/correction classification
→ task and motor feature extraction
→ episode indexing
→ similar-demonstration retrieval
→ Shadow prediction
→ owner comparison
→ correction collection
→ personal model training or adaptation
→ held-out evaluation
→ bounded skill compilation
→ Assisted Mode
→ synthetic Pilot validation
→ owner acceptance
```

### 20.1 Retrieval before fine-tuning

The first useful learning implementation should retrieve similar demonstrations and provide them as structured context. Fine-tuning or custom model training begins only after:

- sufficient clean data exists;
- labels and retention are reliable;
- evaluation datasets are held out;
- deletion can propagate to derived products;
- model provenance and rollback are defined.

### 20.2 Model versioning

Every personal model records:

```text
modelId
modelType
version
trainingEpisodeIds
excludedEpisodeIds
featureSchemaVersion
trainingCodeVersion
createdAt
evaluationReport
promotionState
rollbackVersion
retentionPolicy
```

No model is promoted only because training loss improved.

---

## 21. Shadow evaluation

Required metrics:

- next-intent accuracy;
- target-selection accuracy;
- method accuracy;
- expected-result accuracy;
- reason-feature agreement where labeled;
- mean and percentile timing error;
- normalized trajectory distance;
- scroll-pattern similarity;
- keyboard-versus-mouse choice agreement;
- typo and correction-process similarity;
- abstention quality;
- changed-layout robustness;
- interruption and popup handling;
- task completion prediction;
- calibration by confidence.

Evaluation splits must separate:

- repeated same-layout demonstrations;
- changed content;
- changed layout;
- unexpected dialog;
- slow loading;
- missing result;
- corrected mistake;
- unfamiliar task variant.

Shadow promotion requires no input authority and owner-reviewed performance thresholds established from real data rather than invented in advance.

---

## 22. Skills and personal policies

A validated task may compile into a signed skill manifest:

```text
skillId
version
ownerProfileId
allowedFieldProfiles
allowedExecutables (reviewed process name + executable SHA-256)
allowedOrigins (canonical origins only)
inputSchema
outputSchema
maximumSteps
maximumDuration
maximumArtifacts
riskCeiling
requiredApprovals
verificationPlan
recoveryPlan
personalTaskPolicyVersion
motorProfileVersion
typingProfileVersion
timingProfileVersion
retentionPolicy
signature
```

A skill:

- adapts to fresh observations;
- never blindly replays coordinates;
- may use learned style and order;
- cannot expand policy;
- cannot skip verification;
- cannot operate outside its application, origin, or artifact scope;
- supports disable, rollback, and revocation.

---

## 23. Credentials and sensitive controls

Credentials are never learned as behavioral data.

The target architecture uses a local credential broker that:

- stores secrets outside model-visible memory;
- binds use to an approved origin and account alias;
- fills secrets without returning them to the pilot;
- prevents secret values from entering demonstrations, visual blobs, logs, maps, support bundles, or artifacts;
- blocks unsupported recovery, payment, identity, and high-risk authentication flows;
- records only sanitized authentication status.

CAPTCHAs, human-verification prompts, or platform-required manual checks are treated as blocked or owner-required states, not bypass targets.

---

## 24. Artifact boundary

Every transfer includes:

```text
transferId
fieldId
fieldGeneration
direction
scopedPath
displayName
mediaType
classification
expectedBytes
expectedSha256
status
verification
createdAt
completedAt?
```

Required controls:

- fixed roots;
- no arbitrary drive or UNC paths;
- no traversal;
- no alternate data streams;
- no reserved Windows names;
- no ambiguous trailing spaces or dots;
- reparse-point ancestry inspection;
- TOCTOU mitigation;
- staged copy;
- size and hash verification at both ends;
- collision handling;
- cancellation and cleanup;
- quarantine and reclassification;
- owner review for sensitive export;
- immutable transfer evidence.

---

## 25. Workflow, persistence, and recovery

A workflow contains:

```text
workflowId
goal
requestedBy
fieldRef
agentRef
riskCeiling
stepGraph
artifactReferences
checkpointVersion
approvalPolicy
recoveryPolicy
status
```

Every meaningful step contains:

```text
stepId
dependencies
targetWindowRef
sourceSceneVersion
intent
method
inputArtifacts
expectedResult
verificationPlan
risk
retryPolicy
timeout
status
```

Recovery rules:

- no blind retry after a possible external effect;
- observe and reconcile first;
- duplicate action IDs and idempotency keys are rejected;
- stale policy, scene, generation, or target blocks execution;
- crash recovery resumes only from a verified checkpoint;
- recorder faults terminate or abort the episode;
- integrity failures quarantine data;
- trust-boundary changes require a new Field generation;
- emergency-stop failure is release-blocking;
- destruction failure remains visible until resolved.

---

## 26. Audit and diagnostics

Separate but correlated audit streams exist for:

- owner administration;
- Field lifecycle;
- Glove actions;
- workflows;
- recording;
- Shadow predictions and comparisons;
- model training and promotion;
- artifact transfer;
- credentials and sensitive approvals;
- deletion;
- emergency stop;
- release and update operations.

Audit requirements:

- append-only or tamper-evident chain;
- exact actor and authority class;
- exact Field generation;
- policy and model versions;
- sanitized evidence;
- no raw credentials or unnecessary private content;
- retention and deletion policy;
- independent verification tool.

Support bundles contain only:

- hashed private identity;
- lifecycle and health;
- aggregate counts;
- audit-chain status;
- error codes;
- performance summaries;
- configuration flags.

They exclude screen content, UI values, window titles, clipboard text, raw payloads, demonstration events, secrets, and artifact contents.

---

## 27. Manuals and audits required throughout development

Every meaningful phase updates or creates:

- owner manual;
- developer manual;
- test plan;
- operating runbook;
- architecture or contract reference;
- threat model;
- failure-injection matrix;
- Parts & Pieces traceability;
- engineering log;
- Level 4 audit where authority, recording, privacy, credentials, physical input, persistence, or VM isolation changes;
- rollback and disable instructions;
- exact implementation-status report.

Donor code and tests are references only. Exosuit must produce its own evidence.

---

# 28. Complete phased execution program

The following phases are mandatory and ordered. A later phase may be designed in advance, but live implementation and promotion cannot bypass dependencies.

---

## Phase L0 — Exact-head source validation

**Current tracking issue:** #12  
**Current state:** passed locally on exact hardened consolidated commit `7a7c435`; hosted CI attestation remains unavailable

### Objective

Compile, test, parse, and validate the complete current branch before adding more live capability.

### Deliverables

- repository validator result;
- Field validator result;
- strict TypeScript typecheck;
- focused Field tests;
- complete fake Field pulse;
- complete TypeScript suite;
- production build;
- existing Glove pulse;
- PowerShell parser validation;
- .NET restore;
- .NET Release build with warnings as errors;
- .NET tests;
- read-only host capability report;
- evidence directory with complete logs and summary JSON.

### Failure injection

- missing required file;
- broken wire fixture;
- type error;
- unit failure;
- PowerShell syntax failure;
- .NET warning or build failure;
- current-head mismatch;
- evidence write failure.

### Promotion gate

Every command executes against the exact head. Confirmed failures are repaired with regression tests and the entire suite reruns from the beginning.

### Rollback

Revert only confirmed repair commits. L0 performs no Hyper-V mutation.

---

## Phase L1 — Synthetic Hyper-V Field lifecycle

**Tracking issue:** #13  
**Depends on:** L0

### Objective

Prove creation, start, stop, rollback, destruction, and replacement of one disposable synthetic Field generation.

### Deliverables

- approved base-image registry entry and digest;
- immutable parent VHDX;
- disposable differencing OS overlay;
- separate disposable task disk;
- optional test personal-state disk;
- Generation 2 VM;
- Secure Boot and compute settings;
- Private or disabled network;
- exact generation-root confinement;
- VM configuration export;
- before/after disk hashes;
- destruction evidence;
- generation increment after rebuild.

### Failure injection

- wrong image digest;
- existing VM name;
- existing generation directory;
- wrong switch type;
- disk creation failure;
- VM configuration failure;
- rollback failure;
- reparse-point deletion attempt;
- incorrect typed confirmation.

### Promotion gate

Base and personal-state disks remain unchanged. All disposable resources are removed. Rebuild creates a new generation.

### Rollback

Stop and remove only the exact VM registration and disposable generation root.

---

## Phase L2 — Authenticated live channel and heartbeat

**Tracking issue:** #14  
**Depends on:** L1

### Objective

Connect one host and one guest using the signed channel and heartbeat contracts.

### Deliverables

- supported local transport;
- host and guest endpoints;
- protected key storage;
- key rotation;
- durable replay state;
- handshake;
- bootstrap status;
- heartbeat;
- event and command-result messages;
- emergency channel;
- shutdown path;
- liveness monitor;
- restart behavior.

### Failure injection

- payload mutation;
- wrong signature;
- wrong direction;
- wrong key ID;
- expired message;
- replayed message ID;
- replayed nonce;
- sequence rollback;
- wrong generation;
- clock skew;
- guest reboot;
- guest crash;
- heartbeat pause.

### Promotion gate

TypeScript and .NET accept the same canonical fixture and fail closed for every injected fault. Emergency stop remains independent of MCP.

### Rollback

Stop endpoints, revoke test keys, remove replay state, destroy the disposable generation.

---

## Phase L3 — Guest bootstrap, display, readiness, and replacement

**Tracking issue:** #15  
**Depends on:** L2

### Objective

Prove that a Field cannot become ready until exact guest identity, display, policy, session, channel, and heartbeat checks pass.

### Deliverables

- guest bootstrap service;
- manifest integrity verification;
- agent binary digest verification;
- directory initialization;
- display enforcement and report;
- session lock detection;
- Secure Desktop detection;
- policy and attestation binding;
- Field Manager readiness transition;
- clean stop;
- stale-process denial after replacement.

### Failure injection

- wrong manifest digest;
- mismatched generation;
- missing agent;
- wrong agent digest;
- bad display;
- missing directory;
- locked session;
- Secure Desktop;
- absent heartbeat;
- stale guest process;
- expired policy.

### Promotion gate

The host cannot declare ready before every required runtime check passes. Old generation traffic is rejected after rebuild or rollback.

### Rollback

Stop the guest agent, invalidate keys and attestation, destroy the generation.

---

## Phase L4 — Live scene production

**Tracking issue:** included in #16  
**Depends on:** L3

### Objective

Produce a continuous, versioned Windows scene from the guest.

### Deliverables

- top-level window registry;
- window generation tracking;
- active/focused window events;
- UI Automation element snapshots and changes;
- modal detection;
- process lifecycle events;
- display state;
- cursor state;
- lock and Secure Desktop events;
- input-queue ownership;
- scene version persistence;
- sanitized observation channel.

### Failure injection

- window close/reopen;
- process restart;
- modal appears mid-action;
- focus stolen by user;
- duplicate element IDs;
- stale scene version;
- large accessibility tree;
- UIA provider failure;
- display change;
- lock and unlock.

### Promotion gate

Every mutation can bind a fresh scene and exact window generation. Stale or unsafe state blocks input.

### Rollback

Disable scene producer and return the Field to observe-disabled state.

---

## Phase L5 — Consented Teach recording

**Tracking issue:** included in #16  
**Depends on:** L4 and approved privacy audit

### Objective

Record complete owner demonstrations inside the Field without input injection or secret capture.

### Deliverables

- visible persistent recording indicator;
- independent local stop;
- explicit consent and revocation;
- input capture scoped to the guest session;
- UI Automation and system event capture;
- optional policy-bound visual capture;
- sensitive-control exclusion;
- bounded queues and backpressure;
- episode segmentation markers;
- encrypted terminal storage;
- retention expiration;
- deletion and deletion certificate;
- support and privacy inspection tools.

### Failure injection

- consent absent or revoked;
- indicator failure;
- stop control failure;
- event overflow;
- disk full;
- visual budget exhaustion;
- sensitive control encountered;
- session lock;
- Secure Desktop;
- recorder crash;
- encrypted-store tampering;
- deletion interruption.

### Promotion gate

Teach records only with consent, visibly indicates recording, never injects input, protects credentials, stops independently, and produces reproducible encrypted and deletion evidence.

### Rollback

Disable all capture sources, delete the test generation and approved test episodes, verify deletion.

---

## Phase L6 — Live bounded artifact broker

**Tracking issue:** #17  
**Depends on:** L3; may proceed in parallel with L4-L5 after L0-L3

### Objective

Implement real staged cross-VM import and export behind the path and manifest contracts.

### Deliverables

- host-to-Field import;
- Field-to-host export;
- reparse ancestry inspection;
- TOCTOU mitigation;
- staging paths;
- hash and size verification at source and destination;
- collision policy;
- cancellation;
- quarantine;
- reclassification;
- sensitive export review;
- immutable evidence.

### Failure injection

- traversal;
- UNC or drive path;
- alternate data stream;
- reserved device name;
- reparse swap;
- partial copy;
- hash mismatch;
- disk full;
- destination collision;
- host or guest crash;
- cancellation.

### Promotion gate

No arbitrary host path is accepted. Every completed transfer has matching source and destination evidence.

### Rollback

Cancel transfers, delete staging files, quarantine uncertain outputs, destroy the test generation.

---

## Phase L7 — Demonstration processing and retrieval

**Depends on:** L5

### Objective

Turn raw demonstrations into usable, deletable, versioned structured episodes and retrieve relevant examples for a new task.

### Deliverables

- synchronization pipeline;
- step segmenter;
- target and intent grounding;
- mistake and correction labels;
- feature extraction;
- episode index;
- similarity retrieval;
- source lineage;
- derived-data deletion;
- held-out evaluation dataset;
- data-quality report.

### Tests

- duplicate and out-of-order events;
- incomplete episode;
- ambiguous target;
- owner correction;
- changed layout;
- deleted source episode;
- index corruption;
- retrieval of irrelevant examples;
- secret and sensitive-field exclusion.

### Promotion gate

Retrieved examples are relevant, traceable, privacy-compliant, and removable when source data is deleted.

### Rollback

Drop derived indexes and models; retain only approved encrypted source episodes.

---

## Phase L8 — Retrieval-backed Shadow predictor

**Tracking issue:** #18  
**Depends on:** L7

### Objective

Predict owner behavior without any input authority.

### Deliverables

- observation-to-demonstration retrieval;
- next-action predictor;
- intent, target, method, result, timing, and optional trajectory output;
- confidence calibration;
- abstention;
- provenance;
- process/capability isolation from execution;
- evaluation reports.

### Tests

- same workflow with different content;
- changed layout;
- unexpected popup;
- slow loading;
- owner mistake and correction;
- unknown task;
- low confidence;
- attempted access to execution capability.

### Promotion gate

Shadow provides measurable useful predictions and cannot reach any semantic or physical action path.

### Rollback

Disable and remove the predictor; retain comparison evidence and approved demonstrations.

---

## Phase L9 — Correction Mode

**Depends on:** L8

### Objective

Collect high-value examples where the system differs from the owner.

### Deliverables

- takeover control;
- divergence event;
- prediction-versus-owner comparison;
- decision, target, method, timing, motor, typing, and language error classification;
- correction dataset;
- replay in a fresh synthetic Field;
- updated evaluation.

### Tests

- takeover before action;
- takeover during safe motor movement;
- takeover after no-effect action;
- uncertain external effect;
- owner cancels the task;
- conflicting correction labels.

### Promotion gate

Takeover reliably stops the agent, captures the corrected behavior, and never duplicates a possible external effect.

### Rollback

Return to Shadow-only mode.

---

## Phase L10 — Personal task and attention models

**Depends on:** L8-L9 and sufficient approved demonstrations

### Objective

Learn how the owner chooses and orders actions, reads interfaces, and verifies results.

### Deliverables

- task policy;
- attention/reading model;
- correction policy;
- verification preference model;
- model registry and provenance;
- held-out evaluation;
- rollback versions;
- deletion propagation.

### Tests

- repeated task;
- task variant;
- changed content;
- changed layout;
- missing result;
- interruption;
- conflicting owner behavior;
- insufficient evidence;
- deleted training episode.

### Promotion gate

The model outperforms retrieval-only baseline on held-out data without reducing abstention quality or deterministic safeguards.

### Rollback

Revert to the last approved model or retrieval-only behavior.

---

## Phase L11 — Personal motor, typing, timing, and language models

**Depends on:** L5 data quality and L10 task decisions

### Objective

Reproduce the owner's observable operating style after the correct task action has already been selected.

### Deliverables

- contextual mouse trajectory model;
- scroll model;
- typing and editing-process model;
- timing and behavioral-state model;
- language style model;
- local bounded inference interfaces;
- profile versioning;
- similarity reports;
- owner-adjustable intensity and disable controls.

### Tests

- different target size and distance;
- confident versus uncertain action;
- fast and slow system readiness;
- typo and delayed correction;
- keyboard versus mouse selection;
- scroll burst behavior;
- motor cancellation;
- profile disabled;
- style never changes chosen task target or policy.

### Promotion gate

Style models improve measured similarity while task correctness, verification, stop latency, and policy behavior remain unchanged or improve.

### Rollback

Use deterministic default motor and direct text entry; preserve task policy.

---

## Phase L12 — Assisted Mode and bounded personal skills

**Depends on:** L9-L11

### Objective

Allow validated substeps and workflows to execute under owner supervision.

### Deliverables

- signed skill manifests;
- local enable/disable;
- permission diff on upgrade;
- bounded action chunks;
- skill simulation;
- checkpoint and resume;
- owner takeover;
- per-skill audit;
- revocation.

### Tests

- valid skill;
- expired or tampered skill;
- changed application version;
- origin change;
- unexpected dialog;
- action budget exhaustion;
- owner takeover;
- rollback to earlier skill.

### Promotion gate

The owner can understand, supervise, stop, disable, and roll back every skill.

### Rollback

Disable the skill and revert its manifest/model versions.

---

## Phase L13 — Synthetic Pilot workflow

**Tracking issue:** #19  
**Depends on:** L1-L12 as applicable, with minimum synthetic subset defined by the issue

### Objective

Complete one fully local synthetic workflow end to end inside a disposable Field.

### Required workflow

- provision generation;
- authenticate channel;
- establish readiness;
- launch deterministic fixture;
- observe and act through the Glove;
- handle delayed readiness and modal state;
- enter and edit text;
- produce synthetic download;
- verify every meaningful effect;
- export through artifact broker;
- stop and destroy Field;
- verify audit chain.

### Failure injection

- stale scene;
- wrong policy;
- action budget exhausted;
- unsupported route;
- no-effect action;
- uncertain effect;
- session lock;
- Secure Desktop;
- heartbeat loss;
- emergency stop during motor action.

### Promotion gate

The workflow succeeds repeatedly without blind retry, every fault fails closed or enters documented recovery, and emergency stop physically interrupts execution.

### Rollback

Disable Pilot, destroy the generation, revoke policy and keys.

---

## Phase L14 — ChatGPT MCP Field acceptance

**Depends on:** synthetic Pilot and reviewed MCP surface

### Objective

Allow ChatGPT to request Field status and operate one approved synthetic workflow through narrow MCP tools.

### Model-facing MCP principles

Allowed tool classes may include:

```text
field_get_status
field_get_scene_summary
field_list_approved_skills
field_start_approved_skill
field_get_workflow
field_pause_workflow
field_resume_workflow
field_cancel_workflow
field_get_sanitized_audit
field_emergency_stop
```

Not model-facing:

- create/destroy VM;
- create policy;
- sign attestation;
- grant consent;
- manage keys;
- arbitrary shell;
- arbitrary filesystem path;
- raw screenshot store;
- delete demonstrations;
- sensitive export approval.

### Tests

- normal ChatGPT conversation;
- reconnect;
- stale conversation request;
- tool timeout;
- duplicate request;
- prompt injection in page content;
- request outside skill scope;
- emergency stop outside the conversation.

### Promotion gate

A normal ChatGPT conversation completes the synthetic workflow without gaining Field administration or bypassing local controls.

### Rollback

Disable Field MCP tools and retain local-only operation.

---

## Phase L15 — Low-risk owner acceptance

**Depends on:** L14

### Objective

Validate carefully selected real desktop tasks that do not involve payments, irreversible submissions, identity claims, sensitive communication, or high-value accounts.

### Candidate tasks

- local file organization;
- public web research;
- draft creation without sending;
- data entry into a local synthetic or owner-controlled test application;
- downloading and organizing public documents;
- comparing public listings.

### Requirements

- owner present;
- bounded policy;
- no stored credentials initially;
- recording and Pilot status visible;
- complete audit;
- immediate stop;
- cleanup after each run;
- owner rating and correction log.

### Promotion gate

Repeated success and recovery across varied conditions with no serious privacy, authority, or duplicate-effect failure.

### Rollback

Return to synthetic-only Pilot.

---

## Phase L16 — Reliability, performance, and resource governance

**Depends on:** L13-L15 evidence

### Objective

Make long-running operation measurable and recoverable.

### Deliverables

- durable event log;
- verified checkpoints;
- restart recovery;
- idempotency and reconciliation;
- storage migration;
- backup and corruption detection;
- benchmark harness;
- percentile latency reports;
- CPU, memory, disk, frame, event, and model budgets;
- backpressure;
- overload degradation policy;
- performance regression gate.

Measure:

- observation latency;
- scene update latency;
- semantic proposal latency;
- motor start latency;
- focus-switch latency;
- emergency-stop latency;
- heartbeat and channel latency;
- recording overhead;
- model inference latency;
- audit and storage growth;
- maximum tracked windows and workflows.

### Promotion gate

Service targets are based on measured owner hardware and test profiles. Overload degrades safely rather than dropping verification or recording safeguards.

---

## Phase L17 — Owner cockpit and human factors

**Depends on:** core live modes

### Objective

Provide one local, understandable control center.

### Deliverables

- Field and Glove health;
- current mode;
- persistent recording indicator;
- current workflow and step;
- expected next effect;
- policy scope and expiration;
- model and skill versions;
- owner approvals;
- audit timeline;
- privacy and retention controls;
- episode and model deletion;
- per-Field and global stop;
- keyboard and accessibility support.

### Acceptance

The owner can always determine:

- whether recording is active;
- whether the AI can execute;
- which Field is controlled;
- what will happen next;
- what data will persist;
- how to stop;
- how to delete;
- how to roll back.

---

## Phase L18 — Packaging, signing, updates, and rollback

**Depends on:** stable live architecture and owner acceptance

### Deliverables

- Windows installer;
- signed binaries and scripts;
- reproducible build manifest;
- SBOM;
- versioned contract compatibility;
- staged release channels;
- atomic update;
- signed rollback;
- configuration and data migrations;
- uninstall and deletion path;
- release notes and known issues.

### Rules

- no update during an active workflow or recording;
- no auto-update before rollback is proven;
- incompatible host/guest versions fail closed;
- personal models and demonstrations are not silently migrated or uploaded.

---

## Phase L19 — Production security, privacy, and abuse review

**Depends on:** all authority-bearing features

### Deliverables

- complete threat model;
- privilege and process-isolation review;
- transport and key-management review;
- storage encryption review;
- credential-broker review;
- supply-chain and dependency policy;
- penetration test of local interfaces;
- privacy inventory;
- retention and deletion matrix;
- incident-response plan;
- release-blocking severity policy;
- abuse-case review;
- owner sign-off.

### Promotion gate

All critical and high findings are resolved or explicitly accepted by the owner with compensating controls and documented rationale.

---

## Phase L20 — Production candidate and operations

### Deliverables

- signed production candidate;
- production readiness review;
- compatibility matrix;
- safe-default verification;
- rollback drill;
- support policy;
- severity and response targets;
- operational dashboards without private content;
- post-release audit schedule;
- deprecation policy;
- owner documentation.

### Release gate

No production claim until every applicable phase is complete on the same compatible release line.

---

## Phase L21 — Future expansion

Only after the Windows reference implementation is stable:

- multiple simultaneous Field VMs;
- multi-agent supervisor;
- Windows virtual desktop coordination;
- remote or cloud sessions with an agent inside each session;
- macOS Accessibility agent;
- Linux AT-SPI agent;
- additional model pilots;
- optional experimental semantic companions that remain non-required and transparent.

Genuine parallel physical operation requires separate healthy sessions or agents. One Windows session retains one serialized input stream.

---

## 29. Current GitHub issue map

| Level | Issue | Purpose |
|---|---:|---|
| L0 | #12 | exact-head source/.NET/PowerShell validation |
| L1 | #13 | synthetic Hyper-V generation lifecycle |
| L2 | #14 | authenticated live channel and heartbeat |
| L3 | #15 | guest bootstrap, readiness, and replacement |
| L4-L5 | #16 | live scene and consented Teach recording |
| L6 | #17 | live artifact broker |
| L8 | #18 | retrieval-backed Shadow predictor |
| L13 synthetic subset | #19 | one synthetic Pilot workflow |

New issues for intervening phases are created only when their prerequisites pass and the exact implementation slice can be bounded.

---

## 30. Test strategy

Every implementation phase requires:

1. schema and contract tests;
2. positive unit tests;
3. negative tests;
4. property or fuzz tests where appropriate;
5. fake-provider integration;
6. full system pulse;
7. fault injection;
8. privacy and secret-leak checks;
9. exact-head local Windows tests where applicable;
10. cleanup and rollback verification;
11. audit-chain verification;
12. documentation and manual validation.

Test datasets use synthetic content unless the owner explicitly approves a controlled personal dataset.

No real payment, messaging, identity, employment submission, or consequential external action is used for early acceptance.

---

## 31. Failure classes that must always be covered

- stale identity or generation;
- stale scene or target;
- policy substitution or expiration;
- malformed or replayed channel message;
- guest reboot or crash;
- host crash;
- heartbeat loss;
- session lock;
- Secure Desktop;
- focus loss;
- unexpected dialog;
- UI Automation failure;
- visual capture failure;
- recorder overflow;
- disk full;
- encryption or integrity failure;
- path traversal or reparse attack;
- partial artifact transfer;
- no-effect action;
- possible unverified external effect;
- duplicate action delivery;
- motor cancellation;
- emergency-stop failure;
- rollback or destruction failure;
- incompatible version;
- corrupted checkpoint, audit, episode, model, or index;
- privacy deletion failure.

---

## 32. Definition of done for every phase

A phase is complete only when all applicable items exist:

- objective and non-goals;
- subsystem ownership;
- versioned contracts;
- threat and privacy review;
- implementation;
- positive tests;
- negative and failure-injection tests;
- fake or synthetic integration;
- exact environment evidence;
- audit events;
- owner and developer manuals;
- migration notes;
- rollback and disable path;
- preserved evidence;
- unresolved risks;
- owner or reviewer approval;
- promotion gate passed.

A green compiler alone is never enough evidence for Windows, Hyper-V, recording, learning, or Pilot behavior.

---

## 33. Definition of done for the complete system

The complete Exosuit system is production-ready only when:

- Glove and Field remain independently identifiable and stoppable;
- one exact Windows Field can be provisioned, verified, replaced, and destroyed safely;
- host/guest communication survives restart and rejects stale or replayed traffic;
- scene state remains fresh through normal desktop changes;
- Teach records only with visible consent and protects sensitive information;
- deletion covers source and derived data;
- Shadow has demonstrably no execution authority;
- correction and assisted modes produce measurable improvement;
- personal task, motor, typing, timing, and language profiles are versioned, evaluable, disableable, and reversible;
- synthetic Pilot completes varied workflows with recovery and emergency-stop evidence;
- ChatGPT operates only through narrow reviewed tools;
- low-risk owner acceptance passes repeatedly;
- performance and resource limits are measured;
- packaging, updates, and rollback are proven;
- security, privacy, and abuse reviews pass;
- support and incident procedures exist;
- no unresolved critical or high-risk issue remains.

Even then, the system is described as validated for its tested scope—not perfect or universally human-equivalent.

---

## 34. Immediate execution order

The current order is mandatory:

1. Run L0 using `scripts/windows/Invoke-ExosuitFieldValidation.ps1` on the exact branch head.
2. Repair only confirmed failures and rerun the complete suite.
3. Review and merge the source foundation into `build/exosuit-mvp` only if L0 and review pass.
4. Execute L1 synthetic Hyper-V lifecycle.
5. Execute L2 authenticated channel and heartbeat.
6. Execute L3 bootstrap, readiness, and replacement.
7. Implement and validate L4 scene production.
8. Complete the privacy review and implement L5 Teach recording.
9. Implement L6 artifact transport.
10. Process and index approved demonstrations.
11. Implement L8 Shadow prediction with no input authority.
12. Add Correction Mode and collect divergence data.
13. Train and validate personal task and attention models.
14. Train and validate motor, typing, timing, and language models.
15. Build bounded Assisted Mode skills.
16. Complete synthetic Pilot and fault injection.
17. Connect the reviewed Field MCP surface to ChatGPT.
18. Perform low-risk owner acceptance.
19. Complete reliability, performance, cockpit, packaging, privacy, security, and production gates.

No real account or consequential task is allowed merely because an earlier synthetic phase passed.

---

## 35. Change-control rules

Any change affecting the following requires a decision-log entry, threat-model update, test-plan update, rollback plan, and owner review:

- Glove or Field authority;
- physical input;
- recording;
- screenshots or visual blobs;
- credentials;
- host/guest transport;
- VM provisioning or destruction;
- persistent personal state;
- artifact transfer;
- model training or deletion;
- Pilot autonomy;
- consequential external actions;
- updates and release signing.

Roadmap changes must state:

- what evidence changed;
- why the current plan is insufficient;
- which phases or dependencies move;
- which tests and manuals change;
- whether existing evidence remains valid;
- rollback to the previous plan revision.

---

## 36. Known assumptions and unresolved decisions

The following remain evidence-dependent:

- final host/guest transport implementation;
- exact Windows image and licensing process;
- TPM requirement on target hardware;
- persistent personal-state contents and backup design;
- exact visual capture rate and retention;
- data volume required for each personal model;
- final Shadow promotion thresholds;
- final motor-model architecture;
- local versus remote training compute;
- model deletion and retraining economics;
- credential-broker technology;
- cockpit framework;
- installer and signing infrastructure;
- target performance on 16 GB versus 32 GB hosts;
- production support model.

These are not excuses to leave the plan incomplete. They are explicit decisions that must be resolved by the phase that first depends on them.

---

## 37. Planning honesty

This plan is designed to be complete, testable, and difficult to misinterpret. It is not called perfect.

Real compilation, Windows, Hyper-V, browser, recording, human-behavior, model-training, and owner-acceptance work will reveal constraints that source analysis cannot discover. When evidence contradicts the plan, the correct response is to:

1. stop promotion;
2. record the discovery;
3. add a regression or acceptance test;
4. update the threat and failure models;
5. revise this plan;
6. rerun the affected evidence gates.

The plan must remain comprehensive, but evidence remains the final authority over implementation claims.
