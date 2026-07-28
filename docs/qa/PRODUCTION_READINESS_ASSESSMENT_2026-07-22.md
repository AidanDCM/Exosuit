# Exosuit Glove and Field Production Readiness Assessment — 2026-07-22

**Repository:** `AidanDCM/Exosuit`  
**Branch:** `agent/field-foundation`  
**Assessed head:** `8f7c09d8542a675f4f19eaef05456b6cf09f436e`  
**Draft PR:** #11  
**Verdict:** **NOT PRODUCTION READY**

## 1. Scope

This assessment covers both independent products in the repository:

- **Exosuit Glove** — sensing, local policy, planning support, semantic and physical execution, verification, workflow state, recovery, audit, and emergency stop.
- **Exosuit Field** — isolated Windows environment, VM/storage lifecycle, authenticated boundary, teaching surface, scene state, demonstration storage, artifact boundary, and behavioral-learning environment.

The permanent boundary remains:

> The Glove is not the VM. The Field is not the agent.

Production readiness requires each subsystem to pass its own evidence gates and the authenticated Glove–Field integration to pass as a combined system.

## 2. Validation actions performed in this assessment

### 2.1 Repository and PR inspection

- resolved PR #11 and exact head;
- inspected the complete changed-file inventory;
- inspected the master plan, architecture, shared test plan, Field test plan, implementation status, CI workflow, package scripts, Field contracts, Field Manager, Field registry, provisioning plan, authenticated channel, .NET channel implementation, and guarded Hyper-V provisioning script;
- compared written claims against implementation/evidence boundaries.

### 2.2 GitHub Actions execution attempts

The current-head runs were inspected:

- Exosuit CI run `29937098181`;
- Security Audit run `29937098268`.

All failed jobs were re-run once through the GitHub Actions API.

Both attempts produced the same result:

- every executable job completed as `failure`;
- every job returned `steps: null`;
- every job returned no log URL;
- no checkout, install, compiler, validator, test, build, PowerShell parser, dependency audit, or artifact upload executed.

This proves a persistent runner/account allocation failure. It is **not** a repository test failure and **not** a pass.

### 2.3 Source-level validation

Source and contract review confirms that the repository contains substantial deny-by-default architecture and extensive tests. Source review cannot establish runtime correctness, VM isolation, input safety, or production performance.

## 3. Glove status

### 3.1 Implemented

The Glove currently contains:

- tool-only MCP gateway and bounded desktop contracts;
- fake desktop provider and full-chain fake pulse;
- Windows UI Automation observation and semantic actions;
- ordinary Windows pointer movement, left click, Unicode typing, and bounded hotkeys;
- restart-only physical-input activation and process allowlisting;
- deterministic local Windows policy;
- exact proposal and approval fingerprints;
- fresh target re-observation;
- expected-result verification;
- local audit and emergency stop;
- application-map sanitization and fresh rematching;
- workspace/window generations;
- workflow DAG, locks, focus leases, session queues, artifacts, checkpoints, deadlines, uncertain-effect recovery, and coordinator audit;
- virtual-desktop, supervisor, skill-trust, visual-policy, browser-companion, and resource-governance foundations that remain disabled or unproven live.

### 3.2 Existing evidence

Prior evidence described by the repository includes bounded Windows Sandbox acceptance for:

- semantic Notepad mutation;
- pointer movement and click;
- Unicode typing and `CTRL+A`;
- local approvals;
- emergency-stop interruption;
- independent audit-chain verification.

That evidence applies to the earlier single-agent core and does not prove the current combined branch or production operation.

### 3.3 Glove completion required

Before production, the Glove still requires:

1. exact-current-head TypeScript and .NET execution;
2. dependency and supply-chain audit with reproducible lockfiles;
3. normal ChatGPT MCP acceptance through the reviewed connection path;
4. real three-window workflow acceptance with focus theft, modal interruption, close/reopen, checkpoint, and uncertain-effect recovery;
5. DPI, multi-monitor, lock/unlock, standard/elevated target, and remote-session matrices;
6. native virtual-desktop acceptance if retained;
7. real authenticated multi-agent/session transport if retained;
8. complete mouse primitives required by the product: right/middle/double click, mouse down/up, drag, wheel/horizontal scroll, key down/up, and named key press;
9. measured cancellation and emergency-stop latency for every physical primitive;
10. durable, encrypted workflow/artifact persistence and migration tests;
11. benchmark targets, overload behavior, and resource limits;
12. signed packaging, installation, update, rollback, and uninstall;
13. penetration testing and abuse-case review;
14. operational support, incident response, and release policy.

## 4. Field status

### 4.1 Implemented source foundation

The Field currently contains source contracts or pure/fake implementations for:

- identity, generation, display, policy, and HMAC attestation;
- Field lifecycle and exact Glove-agent binding;
- Hyper-V Generation 2 desired state;
- immutable parent image and disposable differencing OS overlay;
- optional persistent personal-state and separate disposable task disks;
- local owner/service/model administration separation;
- authenticated host/guest messages with field generation, direction, key, sequence, nonce, payload hash, expiry, and HMAC;
- heartbeat, boot identity, and health assessment;
- guest bootstrap and readiness evaluation;
- typed guest commands and Pilot action-budget/policy/scene enforcement;
- consent-bound Teach recorder state machine with no input authority;
- demonstration episodes and AES-256-GCM terminal storage;
- bounded visual-retention policy;
- versioned scene graph;
- Shadow records with `executionAllowed: false` and comparison metrics;
- Windows path confinement and artifact manifests;
- no-blind-retry recovery;
- privacy-safe support bundles;
- fake Field system pulse;
- guarded PowerShell host checks, provisioning, rollback, guest bootstrap, destruction, and evidence collection.

### 4.2 Field completion required

Before production, the Field still requires:

1. exact-current-head executable validation;
2. supported Hyper-V provider integrated behind `FieldProvisioner`;
3. real base-image registry, image build process, signing, and patch policy;
4. proven VM creation, isolation, stop, rollback, destruction, and generation replacement;
5. live authenticated transport with protected key storage, rotation, persistent replay state, restart handling, and clock-skew tests;
6. running guest bootstrap and heartbeat service;
7. live display/session/Secure Desktop readiness enforcement;
8. live Windows scene producer;
9. live consented input/UI Automation recording with persistent indicator and independent local stop;
10. privacy-approved visual capture, encrypted blob store, expiration, and deletion certificates;
11. demonstration processing, segmentation, retrieval, and deletion propagation;
12. actual Shadow predictor with process-level proof of no input authority;
13. Correction Mode and feedback storage;
14. personal task, attention, motor, typing, language, timing, correction, and verification models;
15. held-out evaluation and rollbackable model versions;
16. Assisted Mode and bounded personal skills;
17. live artifact transfer with reparse and TOCTOU protection;
18. credential broker with origin/account binding and no secret return to the model;
19. synthetic Pilot workflow with physical emergency stop and reconciliation;
20. ChatGPT-to-Field MCP acceptance;
21. low-risk owner acceptance;
22. performance, packaging, security, privacy, and operational gates.

## 5. Release-blocking findings

### PR-01 — No executable current-head evidence

**Severity:** release blocker  
GitHub created jobs but allocated zero steps and no logs, including after one explicit retry. No current-head compile, test, build, script parse, or dependency audit exists.

**Required resolution:** execute `scripts/windows/Invoke-ExosuitFieldValidation.ps1` on an authenticated Windows checkout or restore functioning GitHub runners, attach complete evidence, and repair only observed failures.

### PR-02 — No reproducible Node dependency lock

**Severity:** high / release blocking for supply-chain reproducibility  
The repository uses `npm install` because no committed `package-lock.json` is present. Dependency resolution and audit results can drift between runs.

**Required resolution:** generate and review a lockfile using the supported Node/npm version, switch CI to `npm ci --ignore-scripts`, rerun dependency audits, and document lockfile update policy.

### PR-03 — Test-plan inconsistency and truncation

**Severity:** high  
The shared test plan ends at an unfinished `Phase 7+` heading and still defines a browser-companion phase despite the authoritative plan treating the browser as an ordinary desktop application. The Field test plan ends during the Pilot recovery list and lacks completed promotion/evidence sections.

**Required resolution:** replace both plans with complete Glove/Field-aligned matrices tied to L0–L20 and production gates.

### PR-04 — Master-plan validator is not invoked by CI

**Severity:** high  
`npm run validate:plan` exists, but the CI workflow manually invokes repository and Field validators without invoking the plan validator. The claimed planning enforcement is therefore not active.

**Required resolution:** add a required plan-validation step and preserve its evidence artifact.

### PR-05 — Writable personal-state disk conflicts with whole-file digest identity

**Severity:** release blocker  
The Field identity and provisioning plan require an exact SHA-256 digest for the persistent personal-state VHDX, and provisioning verifies the current whole-file hash before attachment. A legitimately writable persistent disk changes after use, so its original digest cannot remain a stable identity.

**Required resolution:** separate immutable artifact integrity from mutable disk identity. Use a stable disk ID plus generation/version and an authenticated metadata manifest; use content hashing only for immutable snapshots or explicitly sealed versions. Update contracts, fixtures, PowerShell, tests, and rollback semantics.

### PR-06 — Replay state is not production durable

**Severity:** high  
TypeScript replay state is bounded but in memory. .NET replay sets are in memory and unbounded. Restart can lose replay history; long-running guests can accumulate unbounded memory.

**Required resolution:** design bounded persistent replay/sequence state with atomic updates, boot/generation binding, key rotation, corruption handling, and restart tests. Bound .NET memory even before persistence.

### PR-07 — Cross-language timestamp canonicalization is under-constrained

**Severity:** high  
TypeScript signs caller-supplied ISO timestamp strings as provided, while .NET canonicalizes `DateTimeOffset` to exactly three fractional digits. Semantically equivalent noncanonical timestamps can fail cross-language signature verification.

**Required resolution:** require and generate one canonical UTC timestamp wire format on both sides before signing, reject alternate valid ISO forms, and add fixtures for zero, three, and excessive fractional digits plus offsets.

### PR-08 — Origin rules are URLs, not canonical origins

**Severity:** high  
Policy schemas accept any URL string for `allowedOrigins`, including paths, query strings, fragments, mixed case, and default-port variants. Authorization should compare canonical origins, not arbitrary URL text.

**Required resolution:** parse and store normalized `scheme://host:port` origins, restrict schemes, reject userinfo/path/query/fragment, and test equivalent/default-port and Unicode-domain cases.

### PR-09 — Real runtime surfaces remain absent

**Severity:** release blocker  
The live Hyper-V provider, transport, scene producer, Teach hooks, visual store, predictor, personal models, artifact transport, credential broker, and Pilot integration do not exist or are not wired.

**Required resolution:** complete the ordered master-plan phases with exact evidence. Production cannot be inferred from source foundations.

### PR-10 — Packaging and operations are absent

**Severity:** release blocker  
There is no signed installer, SBOM, reproducible release manifest, update/rollback mechanism, migration policy, penetration test, incident response procedure, compatibility matrix, or production support plan.

## 6. Production-readiness verdict by subsystem

| Subsystem | Source maturity | Executable current-head evidence | Live evidence | Production verdict |
|---|---|---|---|---|
| Glove single-action core | strong | absent on current head | bounded earlier sandbox evidence | not ready |
| Glove coordinator | substantial source/fake foundation | absent | interactive multi-window absent | not ready |
| Glove advanced foundations | planned/source only | absent | absent | not ready |
| Field contracts and fake runtime | substantial source/fake foundation | absent | absent | not ready |
| Field VM and transport | guarded scripts/contracts | absent | absent | not ready |
| Teach/Shadow/personal learning | policy/data foundations only | absent | absent | not ready |
| Pilot integration | command authorization foundation only | absent | absent | not ready |
| Packaging/security/operations | mostly planned | absent | absent | not ready |

## 7. Required execution order

1. Repair CI/runner availability or obtain an authenticated Windows checkout.
2. Complete L0 exact-head source, .NET, PowerShell, and dependency validation.
3. Correct the mutable personal-state identity design before live disk use.
4. Complete L1–L3: VM lifecycle, transport, bootstrap/readiness.
5. Complete Glove current-head Windows and ChatGPT acceptance.
6. Complete L4–L6: scene, Teach, artifact transfer.
7. Complete L7–L9: processing, Shadow, Correction.
8. Complete L10–L12: personal models and Assisted Mode.
9. Complete L13–L15: synthetic Pilot, ChatGPT Field acceptance, low-risk owner acceptance.
10. Complete reliability, cockpit, packaging, security/privacy, and operations.
11. Conduct final production readiness review on one signed release candidate.

## 8. Final decision

**Merge to `build/exosuit-mvp`: HOLD** until L0 executes and observed failures are repaired.  
**Merge to `main`: DENIED.**  
**Real account or consequential use: DENIED.**  
**Teach recording: DENIED until privacy and live consent/stop evidence.**  
**Shadow/personal-model promotion: DENIED until no-input and held-out evaluation evidence.**  
**Pilot autonomy: DENIED.**  
**Production release: DENIED.**

The repository is an ambitious and increasingly well-structured development system. It is not an operational production system yet.