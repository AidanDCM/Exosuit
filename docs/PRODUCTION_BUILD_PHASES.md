# Exosuit Production Build Phases

**Status:** execution companion to `docs/MASTER_SYSTEM_ROADMAP.md`
**Authority:** the master roadmap controls whenever this document and the roadmap differ
**Applies to:** completion of Exosuit Glove and Field through production candidate
**Starting branch:** `codex/issue-20-personal-disk-identity` from PR #11 head `e0c6c357a7c4898605eb9c334f18549501380da5`

## How we will build

We will complete one evidence-gated wave at a time. A wave is complete only when its mapped L-level promotion gates pass on an exact commit and its unresolved risks are recorded. Source code, fake tests, compilation, live Windows behavior, owner acceptance, and production approval remain separate evidence classes.

Every reviewable slice must:

1. preserve Glove/Field authority separation and deny-by-default behavior;
2. add or change one bounded capability or one risk boundary;
3. include positive, negative, stale-generation, interruption, and rollback tests appropriate to the change;
4. update contracts, manuals, threat/failure matrices, and the engineering log when affected;
5. run the complete required validation matrix, not only focused tests;
6. stop on an uncertain external effect, failed verification, identity mismatch, or emergency-stop failure;
7. keep the production-readiness manifest denied until every release gate has evidence.

## Wave 0 — Reproducible exact-head foundation

**Maps to:** L0
**Target readiness after exit:** trustworthy source baseline; no live Field capability

### Build

- finish the mutable personal-state identity repair and review its cross-language contract;
- commit and review `package-lock.json`, switch CI and validation to `npm ci`, and resolve release-relevant dependency findings;
- implement durable bounded replay state and one canonical signed timestamp representation in TypeScript and .NET;
- replace arbitrary URL/process strings with canonical origin and reviewed executable identities;
- install/use the .NET 8 SDK and repair only failures observed by the full validator;
- restore usable CI runner execution or preserve equivalent authenticated Windows evidence.

### Exit gate

- repository, plan, Field-contract, TypeScript, Field, pulse, PowerShell, .NET, and dependency checks pass on one exact clean commit;
- no unresolved issue #20–#23 contract blocker remains;
- the production manifest records evidence but remains denied;
- PR #11 may be considered for merge to the build branch, not `main`.

### Stop conditions

- dependency graph is not reproducible;
- TypeScript/.NET wire fixtures disagree;
- PowerShell or .NET validation cannot execute;
- a security test fails or a failure is hidden by infrastructure reporting.

## Wave 1 — Operational Field substrate

**Maps to:** L1–L4
**Depends on:** Wave 0
**Target readiness after exit:** one synthetic, isolated, observable Field generation

### Build

- implement a supported Hyper-V provider behind the existing Field provisioner interface;
- create one Generation 2 VM from an immutable base and disposable differencing overlay;
- attach optional encrypted personal state by exact stable ID/generation and a separate disposable task disk;
- implement authenticated live host/guest transport, protected keys, rotation, durable replay protection, heartbeat, and boot identity;
- run guest bootstrap as a service and enforce display, session-lock, Secure Desktop, attestation, and readiness rules;
- implement a live Windows scene producer with fresh window/element generations and modal/focus state.

### Exit gate

- create, start, stop, destroy, and replace one synthetic Field without changing the base image;
- stale generation, replay, wrong key, lock, Secure Desktop, heartbeat loss, and display mismatch fail closed;
- destruction affects only the exact disposable generation;
- live scene state matches the guest desktop and cannot authorize action by itself.

### Stop conditions

- host controls the guest through viewer pixels or host input injection;
- base or personal-state storage becomes a deletion target;
- transport loses replay state on restart;
- readiness remains true during lock, Secure Desktop, or heartbeat failure.

## Wave 2 — Consented teaching and bounded data movement

**Maps to:** L5–L7
**Depends on:** Wave 1; L6 may proceed beside L4–L5 only as allowed by the master roadmap
**Target readiness after exit:** safe, reviewable demonstration collection and retrieval

### Build

- implement live Teach input/UI Automation recording with explicit consent, persistent visible indication, and independent local stop;
- implement privacy-bound visual capture with approved regions, redaction, encrypted blob storage, retention, and deletion certificates;
- implement live artifact transfer through confined Inbox/Outbox roots with reparse/TOCTOU defenses and sensitive-export review;
- segment encrypted demonstrations into versioned episodes and build bounded retrieval with provenance and deletion propagation.

### Exit gate

- Teach records only after owner consent and never injects input;
- emergency stop ends recording independently of model, transport, or VM viewer;
- no credentials, raw visual bytes, or private content appear in logs or metadata;
- artifact transfer preserves hash, size, classification, direction, and Field generation;
- deleted demonstrations disappear from retrieval and derived indexes.

### Stop conditions

- recording begins without consent or a visible indicator;
- sensitive regions or credentials leave the approved boundary;
- file paths escape the Field roots or cross a reparse point unchecked;
- deletion cannot be demonstrated end to end.

## Wave 3 — Prediction, correction, and personal models

**Maps to:** L8–L11
**Depends on:** Wave 2
**Target readiness after exit:** evaluated personal prediction with zero action authority

### Build

- implement a retrieval-backed Shadow predictor for intent, target, method, expected result, timing, and optional trajectory;
- implement Correction Mode and bind corrections to exact scene, demonstration, model, and Field generations;
- train separate versioned task/attention, motor, typing/editing, timing/state, language, and verification models;
- create held-out evaluation datasets and promotion thresholds for each model family.

### Exit gate

- Shadow remains structurally unable to inject input;
- held-out results beat documented baselines without leakage between train and evaluation sets;
- model rollback, deletion propagation, provenance, and generation invalidation work;
- no personal model can weaken policy, verification, deadlines, audit, isolation, or stop.

### Stop conditions

- prediction and execution share an unreviewed authority path;
- training data includes credentials or unconsented episodes;
- one opaque model replaces separately auditable behavior components;
- performance claims lack held-out evidence.

## Wave 4 — Bounded assistance, Pilot, and ChatGPT acceptance

**Maps to:** L12–L15
**Depends on:** Wave 3 and current-head Glove Windows acceptance
**Target readiness after exit:** low-risk owner-accepted operation, not production

### Build

- implement Assisted Mode with bounded, signed, locally enabled personal skills;
- complete one synthetic Pilot workflow through the existing Glove proposal, policy, approval, execution, verification, recovery, audit, and stop pipeline;
- validate the exact MCP surface through a normal private ChatGPT connection;
- run low-risk owner acceptance on disposable accounts and data.

### Exit gate

- Assisted and Pilot cannot administer Fields, expand policy, grant consent, rotate keys, or approve exports;
- failed or uncertain verification blocks dependent work and reconciles before retry;
- ChatGPT never claims success before verified results return;
- the owner can identify the active mode, Field generation, recording state, current action, and stop control;
- every primitive has measured emergency-stop latency within the approved target.

### Stop conditions

- approval, policy, or consent can be supplied by model text;
- an action continues after focus, scene, generation, or verification changes;
- a normal ChatGPT conversation discovers an unexpected tool;
- any consequential or real-account workflow is used during initial acceptance.

## Wave 5 — Reliability, performance, and owner control

**Maps to:** L16–L17
**Depends on:** Wave 4
**Target readiness after exit:** operationally manageable release candidate foundation

### Build

- implement durable migrations, crash recovery, corruption handling, overload/backpressure, and no-duplicate-effect reconciliation;
- establish latency, resource, capacity, and emergency-stop service targets;
- build the owner cockpit for status, permissions, approvals, recording, Fields, workflows, audits, deletion, and emergency stop;
- complete accessibility and human-factors evaluation.

### Exit gate

- restart at every action boundary produces a deterministic safe state;
- overload degrades safely without losing stop or audit behavior;
- performance and stop targets pass under representative load;
- owner controls remain understandable and accessible during failure.

## Wave 6 — Release engineering and independent security review

**Maps to:** L18–L19
**Depends on:** Wave 5
**Target readiness after exit:** signed, rollback-capable production candidate

### Build

- create signed installer, SBOM, reproducible build manifest, staged updater, atomic rollback, uninstall, and verified data removal;
- complete threat modeling, privacy inventory, abuse cases, penetration testing, key/storage review, retention review, and incident response exercises;
- resolve all release-blocking findings and document accepted residual risk.

### Exit gate

- clean install, upgrade, failed-update rollback, uninstall, and removal pass on supported Windows configurations;
- shipped artifacts and manifests are signed and reproducible;
- independent security/privacy review has no unresolved release blocker;
- update cannot proceed during active execution or recording.

## Wave 7 — Production candidate and operations

**Maps to:** L20
**Depends on:** Wave 6
**Target readiness after exit:** owner-approved production release

### Build

- freeze one exact candidate commit and version;
- populate every machine-readable production gate with current evidence;
- execute the complete candidate matrix across clean install, upgrade, rollback, supported displays/sessions, failure injection, ChatGPT, and owner workflows;
- establish monitoring, support, incident escalation, backup/recovery, release notes, and rollback ownership.

### Exit gate

- `npm run validate:production` passes against the exact signed candidate;
- every production gate is `pass` with evidence and no unresolved blocker;
- owner approval and production decision are explicit;
- rollback and emergency procedures have named operators and rehearsed evidence.

## Cross-wave evidence ledger

For every wave, record:

- exact commit and candidate version where applicable;
- source, unit, fake integration, platform build, live Windows/Hyper-V, ChatGPT, owner, and operational evidence separately;
- tests run, failures observed, repairs made, and complete rerun results;
- security/privacy impact and retained data classes;
- rollback/disable procedure;
- unresolved risks and the next permitted wave.

## Immediate execution order

1. Finish review and .NET validation of the personal-state identity slice.
2. Complete dependency reproducibility and switch validation/CI to `npm ci`.
3. Complete durable replay/canonical timestamps and canonical origin/executable identity.
4. Run the entire L0 validator on one exact clean commit.
5. Repair only observed failures and rerun L0 from the beginning.
6. Begin Wave 1 with one disposable synthetic Hyper-V Field generation.

No later wave may be used to claim production progress until its dependencies and promotion gates pass.
