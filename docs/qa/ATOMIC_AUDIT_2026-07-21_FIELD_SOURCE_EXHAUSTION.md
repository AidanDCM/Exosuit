# Forensic Atomic Audit: Exosuit Field Source-Only Exhaustion

**Audit level:** 4 — Forensic Atomic Audit  
**Started:** 2026-07-21T14:00:00-04:00  
**Completed:** 2026-07-21T15:30:00-04:00  
**Branch:** `agent/field-foundation`  
**Scope:** all Field source, tests, Windows tooling, manuals, and validation gates added before live Windows/Hyper-V execution becomes unavoidable

## 1. Audit Scope

This audit asks whether every useful, responsible source-only component has been built or concretely specified before work must move to an executable Windows/Hyper-V environment.

Included:

- Field identity, policy, attestation, lifecycle, and administration;
- provisioning desired state and Windows host scripts;
- authenticated host/guest channel and heartbeat;
- guest bootstrap and typed guest commands;
- Teach, encrypted demonstration storage, visual retention, scene, Shadow, artifact, recovery, and diagnostics;
- TypeScript/.NET parity;
- test, fake pulse, CI, validator, runbook, threat, and failure-injection surfaces.

Excluded from a passing verdict:

- actual command execution;
- Hyper-V isolation;
- real input/visual hooks;
- live guest transport;
- actual predictor or personal models;
- Pilot execution;
- production readiness.

## 2. Evidence Register

| Evidence | Class | Result |
|---|---|---|
| repository files on branch | source | present |
| TypeScript tests | written | present, unexecuted |
| .NET tests | written | present, unexecuted |
| shared Field fixture | arithmetic/source | present |
| shared signed channel fixture | arithmetic/source | independently recomputed |
| fake Field pulse | written | present, unexecuted |
| PowerShell parser CI | written | present, unexecuted |
| guarded Hyper-V scripts | source | present, unexecuted |
| hosted GitHub Actions | infrastructure | jobs fail before checkout; no repository steps |
| local Windows/Hyper-V | live | absent |

## 3. Timestamped Work Log

The detailed log is `docs/engineering_log/2026-07-21-field-source-exhaustion.md`.

Key timeline:

- identified missing channel, heartbeat, bootstrap, recorder, visual, recovery, diagnostics, and admin boundaries;
- implemented independent modules and tests;
- added TypeScript/.NET shared signed channel fixture;
- added full fake system pulse;
- added standalone Field validator and focused package commands;
- designed guarded Windows host, provisioning, guest, destruction, and evidence scripts;
- discovered immutable-base boot gap and added disposable differencing OS overlay;
- repaired static test/schema/script defects;
- added CI, runbook, threat model, failure matrix, and evidence runner;
- preserved draft/hold posture.

## 4. System Inventory

### Glove-owned

- pilot/MCP surface;
- task reasoning and workflow;
- desktop policy and action execution;
- verification, recovery, audit, emergency stop.

### Field-owned

- VM/environment identity and generation;
- host provisioning/destruction;
- guest bootstrap/channel/heartbeat;
- Teach/Shadow/Pilot environment modes;
- demonstrations and visual references;
- scene state;
- artifact boundary;
- Field recovery and diagnostics.

### Shared

- action contracts;
- Field reference carried on communication;
- audit vocabulary;
- redaction and integrity primitives;
- cancellation/deadline semantics.

## 5. System Map

```text
local owner / Field service
        |
        | local administration authority
        v
Field desired state -> guarded Hyper-V scripts -> Field VM generation
                                                |
pilot -> Glove supervisor -> authenticated channel -> guest Glove agent
                                                |
                                      bootstrap / heartbeat / scene
                                                |
                                   typed guest command authorizer
                                                |
                             Windows UIA / bounded motor / verification

Teach: owner input -> recorder -> encrypted episode store
Shadow: observation -> prediction-only record -> actual comparison
Artifacts: scoped path -> hash/size/classification -> bounded transfer
Recovery: failure report -> deterministic action plan -> stop/reconcile/rebuild
```

## 6. Atomic Breakdown

### Unit: Field administration authority

**Location:** `src/fieldAdminAuthority.ts`  
**Purpose:** Prevent pilot/model authority from becoming environment, consent, key, deletion, or sensitive-export authority.  
**Failure severity:** Critical.  
**Evidence found:** explicit actors, operation matrix, local transport requirement, interactive owner requirement, `modelMaySatisfyReview:false`, tests.  
**Evidence missing:** live local transport and UI.  
**Verdict:** strong source boundary; live enforcement pending.

### Unit: provisioning plan

**Location:** `src/fieldProvisioningPlan.ts`  
**Purpose:** Define exact Hyper-V desired state without arbitrary command strings.  
**Failure severity:** Critical.  
**Evidence found:** strict schema, integrity hash, immutable base, disposable differencing overlay, separate task disk, host integration denies, ordered steps, tests.  
**Evidence missing:** actual provider and VHD/VM inspection.  
**Verdict:** correct source shape after overlay correction.

### Unit: guarded provisioning scripts

**Location:** `scripts/windows/*.ps1`  
**Purpose:** inspect, resolve, optionally create, bootstrap, validate, and destroy a Field generation.  
**Failure severity:** Critical.  
**Evidence found:** dry-run default, exact confirmation, digest and path checks, private-switch requirement, filtered-NAT hold, rollback, evidence output, static tests, planned parser CI.  
**Evidence missing:** PowerShell parsing and execution.  
**Verdict:** source-ready for executable review, not approved for use.

### Unit: authenticated channel

**Location:** `src/fieldChannel.ts`, `.NET FieldChannelFoundation.cs`  
**Purpose:** authenticate bounded host/guest messages and deny replay/reordering.  
**Failure severity:** Critical.  
**Evidence found:** exact generation/direction/sequence/nonce/key/time/payload binding, constant-time signature comparison, TS/.NET tests, shared signed fixture.  
**Evidence missing:** transport, persistent replay state, key rotation.  
**Verdict:** pure contract complete; production persistence and transport pending.

### Unit: heartbeat

**Location:** `src/fieldHeartbeat.ts`, `.NET foundation`  
**Purpose:** prevent operation after guest death, reboot, lock, Secure Desktop, or stale state.  
**Failure severity:** High.  
**Evidence found:** boot/agent/generation/sequence/time checks and health thresholds.  
**Evidence missing:** live emitter and monitor wiring.  
**Verdict:** pure logic complete.

### Unit: bootstrap

**Location:** `src/fieldBootstrap.ts`, guest script  
**Purpose:** prove exact guest identity, directory, display, binary, key ID, policy, session, Secure Desktop, and heartbeat readiness.  
**Failure severity:** High.  
**Evidence found:** exact check registry, manifest/report digest binding, script precheck.  
**Evidence missing:** actual guest service completion of Secure Desktop and heartbeat checks.  
**Verdict:** precheck/evaluator complete; guest integration pending.

### Unit: guest command authorizer

**Location:** `src/fieldCommand.ts`  
**Purpose:** ensure the guest independently blocks stale, wrong-mode, wrong-policy, wrong-scene, over-budget, or shell actions.  
**Failure severity:** Critical.  
**Evidence found:** typed discriminated commands and negative tests.  
**Evidence missing:** .NET/runtime port and execution-loop integration.  
**Verdict:** host-side reference complete; must be enforced in guest before Pilot.

### Unit: Teach recorder

**Location:** `src/teachRecorder.ts`, `demonstration.ts`  
**Purpose:** capture owner-authorized demonstrations without action authority.  
**Failure severity:** Critical privacy.  
**Evidence found:** consent, visible-state contract, no-input literal, state machine, source allowlist, terminal fault handling, tests.  
**Evidence missing:** Windows hooks, visible UI, independent physical stop.  
**Verdict:** pure state machine complete; live recording denied.

### Unit: demonstration persistence

**Location:** `encryptedDemonstrationStore.ts`  
**Purpose:** store only valid terminal teaching evidence with confidentiality/integrity/deletion.  
**Failure severity:** High.  
**Evidence found:** AES-GCM, authenticated identities, redaction, timeline validation, atomic writes, limits, tamper/wrong-key behavior, deletion tests.  
**Evidence missing:** key management, deletion certificates, retention worker.  
**Verdict:** strong pure component; operations pending.

### Unit: visual retention

**Location:** `visualRetention.ts`  
**Purpose:** prevent visual collection from becoming unlimited recording.  
**Failure severity:** Critical privacy.  
**Evidence found:** explicit consent, external refs, no inline bytes, redaction literal, capture modes, budget/TTL tests.  
**Evidence missing:** capture and blob-store implementation.  
**Verdict:** policy complete; sensor denied.

### Unit: scene graph

**Location:** `fieldScene.ts`  
**Purpose:** represent current guest state and prevent input under stale/unsafe conditions.  
**Failure severity:** High.  
**Evidence found:** version, identity, focus, modal, cursor, lock/Secure Desktop/queue checks.  
**Evidence missing:** Windows producer and event loss/reconnect behavior.  
**Verdict:** pure graph complete.

### Unit: Shadow evaluation

**Location:** `shadowLearning.ts`  
**Purpose:** compare predictions without creating execution authority.  
**Failure severity:** Medium/High if boundary collapses.  
**Evidence found:** `executionAllowed:false`, exact observation/generation, intent/target/method/result/timing/trajectory metrics.  
**Evidence missing:** retrieval and actual predictor.  
**Verdict:** evaluator complete; predictor absent by design.

### Unit: path and artifact boundary

**Location:** `fieldPathScope.ts`, `fieldArtifactBroker.ts`  
**Purpose:** prevent filesystem escape and artifact substitution/leakage.  
**Failure severity:** Critical.  
**Evidence found:** Windows path aliases/traversal/ADS/device/reparse controls, direction roots, size/hash/classification lifecycle.  
**Evidence missing:** live copy, reparse enumeration, TOCTOU-safe final verification.  
**Verdict:** prerequisite complete; live broker held.

### Unit: recovery

**Location:** `fieldRecovery.ts`  
**Purpose:** prevent blind retry and define rebuild/review outcomes.  
**Failure severity:** Critical.  
**Evidence found:** explicit failure codes/actions, bounded retry, uncertain-effect reconciliation, generation replacement, emergency-stop block.  
**Evidence missing:** host/guest coordinator wiring.  
**Verdict:** deterministic policy complete.

### Unit: support bundle

**Location:** `fieldSupportBundle.ts`  
**Purpose:** provide useful diagnostics without content/identity leakage.  
**Failure severity:** High privacy.  
**Evidence found:** strict aggregate schema, hashed ID, forbidden key/value scanning, integrity hash, tests.  
**Evidence missing:** automatic data collector and owner inspection.  
**Verdict:** pure bundle complete.

### Unit: system pulse and validation

**Location:** `fieldSystemPulse.test.ts`, `validate-field.mjs`, `Invoke-ExosuitFieldValidation.ps1`, CI  
**Purpose:** prove full fake chain and preserve executable evidence.  
**Failure severity:** High process risk.  
**Evidence found:** full chain written, source/static validator, one-command evidence runner, CI artifact capture.  
**Evidence missing:** actual execution due runner/local limitation.  
**Verdict:** maximum useful source preparation reached; execution is now unavoidable.

## 7. Assumption Ledger

| Assumption | Why it matters | Evidence | Risk if wrong | Verification |
|---|---|---|---|---|
| Windows host supports Hyper-V | VM provider depends on it | host-check script | Field cannot run | execute host check |
| configured isolated switch is Private | prevents host/LAN access | apply script checks type | network exposure | Hyper-V inspection/packet test |
| HMAC secret remains host/guest private | channel integrity | contract only | forgery | key storage/rotation review |
| in-memory replay state is enough for prototype only | restart resets memory | explicit residual risk | replay after restart | persist sequence/nonce window |
| UI agent can report Secure Desktop accurately | input readiness depends on it | planned check | unsafe input attempt | live UAC/lock test |
| task/personal disks attach in stable guest order | bootstrap/storage mapping | not proven | wrong data mounted | disk identity protocol |
| PowerShell scripts parse and cmdlet arguments are valid | provisioning depends on it | parser CI written | apply failure | Windows CI/local run |
| path checks plus reparse inspection can avoid escape | artifact/destruction safety | pure checks | host file access/deletion | NTFS acceptance matrix |
| AES key management will be provided externally | demo confidentiality | store accepts key | loss/leak | key vault/DPAPI design |

## 8. Question Ledger

| Question | Answer | Evidence | Unresolved? |
|---|---|---|---|
| Are Glove and Field separate? | yes | boundary/docs/types | no |
| Can pilot administer Field? | no | admin policy/tests | live enforcement pending |
| Can Teach or Shadow act? | no | literals/tests | live process proof pending |
| Can VM use immutable base directly? | no; disposable differencing overlay added | plan/scripts/tests | live proof pending |
| Is channel replay-safe across restart? | not yet | in-memory guard only | yes |
| Is filtered NAT safe? | not implemented; apply held | script | yes |
| Can support bundles leak UI content? | schema rejects named fields/values | tests | collector review pending |
| Can artifact bytes change after verification? | current pure broker does not solve live TOCTOU | gap documented | yes |
| Can PowerShell scripts be called safely? | typed files/confirmation/path/digest checks; unexecuted | source/static tests | yes |
| Has any current-head test passed? | no executable evidence captured | runner failure/local absence | yes |

## 9. North Star Traceability Matrix

| Requirement | Implementation | Test | Status |
|---|---|---|---|
| separate Glove and Field | boundary/types/docs | repository validator | written |
| isolated reproducible Windows environment | provisioning plan/scripts | plan/static tests | live pending |
| owner teaching | recorder/store/visual policy | unit tests | hooks pending |
| autonomous bounded operation | typed guest command/recovery | unit tests | integration pending |
| fresh perception | scene/bootstrap/heartbeat | unit tests | producer pending |
| learned behavior | Shadow metrics and episode source | unit tests | model pending |
| local authority | admin policy | unit tests | UI/transport pending |
| verification and recovery | command/recovery/artifact | tests | live pending |
| audit and diagnostics | manager audit/support bundle/evidence runner | tests | live pending |
| immediate interruption | existing Glove stop plus guest emergency command | tests written | physical proof pending |

## 10. Data Flow Review

- Model intent enters Glove, not Field administration.
- Administration operations require local transport and actor scope.
- Guest traffic is signed and generation-bound.
- Teach data enters only after consent and cannot issue motor commands.
- Demonstration metadata is redacted and encrypted.
- Visual content is referenced, bounded, redacted, and separately retained.
- Artifacts use scoped directories, declared classification, size, and hash.
- Diagnostics use hashes and aggregates only.

Unresolved data flows:

- live transport bytes;
- key delivery/storage;
- visual blob storage;
- live artifact copy and final-destination verification;
- personal-state disk unlock/mount.

## 11. Control Flow Review

The designed control order is:

```text
owner creates policy/plan
-> service verifies and provisions
-> guest bootstraps
-> authenticated heartbeat
-> Field ready
-> mode entered locally
-> pilot observes/proposes through Glove
-> guest rechecks exact command context
-> executes/verifies or blocks
-> failure reconciles/stops/rebuilds
-> owner exports output and destroys generation
```

No source path allows model policy creation, consent, shell provisioning, VM deletion, key rotation, or sensitive export.

## 12. Autonomous Testing Plan

Automated source suite:

- repository validator;
- Field validator;
- TypeScript typecheck;
- focused Field tests;
- Field full fake pulse;
- full TypeScript tests/build;
- Glove pulse;
- PowerShell parser;
- .NET build warnings-as-errors;
- .NET tests and coverage;
- CI artifacts.

Live matrix: `docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md`.

## 13. Test Execution Log

No repository tests executed in this session.

Hosted runs did not allocate steps. The signed channel fixture arithmetic was recomputed independently and matched the committed values. This is not a substitute for test execution.

## 14. Failure Mode Review

Critical failure groups:

- authority collapse;
- stale/cross-generation commands;
- replay/key compromise;
- base-image mutation;
- path/reparse escape;
- hidden recording or credential leakage;
- blind retry after possible external effect;
- failed/incomplete destruction;
- emergency-stop failure.

Each has source controls and written tests; each still needs the corresponding live row where applicable.

## 15. Security, Safety, and Risk Review

See `docs/qa/FIELD_THREAT_MODEL.md`.

Current source posture is deny-by-default. The largest residual risks are integration gaps rather than missing pure contracts:

- transport and key lifecycle;
- Windows agent enforcement;
- actual Hyper-V configuration;
- hooks and visual privacy;
- live artifact TOCTOU;
- physical emergency stop.

## 16. Performance and Scalability Review

Current explicit bounds:

- channel TTL and replay-memory cap;
- heartbeat thresholds;
- action/runtime limits;
- demonstration event caps;
- visual frame, byte, count, and retention limits;
- artifact transfer size limits;
- fixed VM CPU/memory ranges.

No performance claims exist. Benchmarks require live environments.

## 17. Maintainability Review

Positive:

- small typed modules;
- fake-first interfaces;
- separate subsystem docs;
- TypeScript/.NET shared fixtures;
- focused test commands;
- one-command evidence runner;
- static script guards;
- exact status inventory.

Risks:

- policy duplicated across TypeScript, .NET, and PowerShell;
- canonical signing format requires fixture discipline;
- many source modules are not integrated, so drift is possible;
- PowerShell scripts need execution and may expose host-version differences.

## 18. Documentation and Manual Update Review

Updated or added:

- README and AGENTS;
- Field implementation status;
- Windows/Hyper-V runbook;
- threat model;
- failure-injection matrix;
- engineering log;
- this audit.

Further updates are required after every executable test failure, fix, and live acceptance result.

## 19. Missing Pieces

### Executable source validation

- current-head Node/npm install;
- TypeScript typecheck/tests/build;
- .NET restore/build/tests;
- PowerShell parse/static/runtime execution.

### Live platform

- actual image build and registry;
- private switch;
- VM apply/rollback/destroy evidence;
- base-image immutability proof;
- transport/key/replay persistence;
- guest service wiring;
- live scene/Teach/visual/artifact/Pilot integration;
- installation/signing/operations.

## 20. Improvement Plan

Priority order:

1. execute full validation runner;
2. fix exact errors and rerun;
3. persist channel sequence/key rotation safely;
4. run dry-run/PowerShell parser and Pester-style local tests;
5. provision synthetic disposable Field;
6. integrate guest channel and heartbeat;
7. prove bootstrap and destruction;
8. add live scene producer;
9. add Teach hooks under privacy acceptance;
10. add Shadow predictor with no-input proof;
11. add live artifact broker with final-destination hash and reparse protections;
12. integrate one synthetic Pilot workflow with emergency-stop evidence.

## 21. Beginner Explanation

The Field is the room; the Glove is the robot body inside the room. This branch has built the room's blueprints, locks, ID cards, record books, training forms, emergency rules, and a guarded construction procedure. It has not yet proven the room was successfully built on a real Windows machine. The next step is not more guessing or more paperwork: it is running the complete validation and then building one disposable test room.

## 22. Final Audit Verdict

**Verdict: REVIEW — source-only ceiling reached; executable and live validation required.**

The branch now contains the maximum practical source, pure/fake implementation, tests, guarded scripts, and documentation that can be responsibly added without a running authenticated checkout and disposable Windows/Hyper-V environment.

Do not merge or enable live capability until executable validation passes. Do not interpret the volume of source or tests as evidence that the live Field works.

## 23. Manual Updates Required Before Closeout

After executable validation:

- attach exact command outputs and commit SHA;
- update this audit with failures/root causes/fixes/retests;
- update Field implementation status;
- update threat/failure matrices with actual W/H evidence;
- update PR validation section;
- keep draft if any release-blocking row remains.
