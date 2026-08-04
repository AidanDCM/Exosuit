# Atomic audit: Product parity and seamless-use layer

- **Date:** 2026-08-04
- **Branch:** `codex/unify-glove-field`
- **Validated source head:** `d91a9701d8faab4220441de9553eb1647c0164b8`
- **Scope:** product direction, brain routing, high-level MCP tasks, encrypted task state, cockpit contracts, preflight, measurable MVP gates, signed release lifecycle contracts, and diagnostic redaction
- **Verdict:** repository-side source, unit, integration, build, Windows/.NET, SBOM, and supported dependency-audit validation passed; live desktop, MVP, and production promotion remain denied

## 1. Product direction

The committed product direction is defined in `docs/PRODUCT_PARITY_ROADMAP.md`.

The controlling rule is:

> ChatGPT or an API model handles intent, judgment, and conversation. Exosuit handles state, execution, safety, memory, recovery, and evidence.

ChatGPT MCP is the preferred interactive route. The OpenAI API is a bounded fallback for unattended continuation, recovery, local-cockpit initiation, or temporary MCP unavailability. Both routes use the same local policy and task contracts.

This pass does not claim that MCP itself is an AI brain.

## 2. Brain routing

`src/brainRouting.ts` implements deterministic route selection among:

- `chatgpt_mcp`;
- `openai_api`;
- fail-closed `none`.

Routing considers:

- interactive versus unattended continuation;
- required MCP write capability;
- MCP connectivity;
- API configuration;
- remaining API budget;
- per-task API ceiling;
- estimated task cost.

The route decision contains no credentials and grants no desktop execution authority.

## 3. Product task control

`src/personalTaskControl.ts` implements:

- integrity-bound task sessions and short-lived chunks;
- checkpoint versions and stale-chunk rejection;
- pause, resume, cancel, retry, recovery-required, completed, failed, and cancelled states;
- automatic, grouped, and immediate approval classes;
- one automatic retry before explicit recovery escalation;
- trusted-local-adapter-only outcome recording;
- fixed `actionAuthority: none` and `executionAllowed: false` on task plans and chunks.

Five reviewed initial recipes are included:

1. Gather approved information.
2. Research, normalize, deduplicate, and organize.
3. Fill a form and stop before submission.
4. Prepare a message and stop before sending.
5. Download and organize approved files.

The task layer does not move the pointer, type, submit, send, authorize, or report its own execution success.

## 4. High-level MCP surface

`src/productMcp.ts` adds an opt-in high-level product surface:

- `exosuit_route_brain`;
- `exosuit_list_recipes`;
- `exosuit_create_task`;
- `exosuit_list_tasks`;
- `exosuit_get_task`;
- `exosuit_start_task`;
- `exosuit_plan_next_chunk`;
- `exosuit_pause_task`;
- `exosuit_resume_task`;
- `exosuit_cancel_task`.

The normal model interface is task-level rather than raw pointer-level.

There is deliberately no MCP tool that can mark a task chunk successfully executed. A trusted local adapter must independently re-observe, apply ordinary policy, execute, verify, and record the bounded result.

MCP surfaces are:

| Surface | Tools | Posture |
|---|---:|---|
| `core` | 13 | default |
| `product` | 23 | opt-in high-level product tools |
| `full` | 37 | opt-in product and coordinator tools |

Unknown surface values fail startup.

## 5. Encrypted task persistence

`src/encryptedProductTaskStore.ts` implements:

- AES-256-GCM;
- unique random 96-bit IVs;
- authenticated additional data bound to task identity fingerprint and checkpoint version;
- hashed filenames;
- atomic temporary write and rename;
- strict plaintext and envelope size limits;
- wrong-key rejection;
- ciphertext-tamper rejection;
- task-hash verification after decryption;
- invalid records excluded from discovery.

Durable task mode requires both:

- `EXOSUIT_PRODUCT_TASK_DIR`;
- `EXOSUIT_PRODUCT_TASK_KEY`, decoding to exactly 32 bytes.

A half-configured durable state fails startup. Environment-supplied keys are a development/configuration contract only; DPAPI/TPM-backed production key acquisition, rotation, recovery, and secure erasure remain unproven.

## 6. Cockpit contracts

`src/cockpitState.ts` defines privacy-safe cockpit state and event contracts.

The state can expose:

- Field and brain connectivity;
- task recipe, lifecycle, progress, checkpoint, and approval class;
- recording and consent state;
- persona version/status by hashed identifier;
- pause, resume, cancel, reset, and emergency-stop availability.

The state structurally excludes:

- raw screenshots;
- credentials;
- raw task goals;
- raw task variables;
- raw persona text.

Cockpit events form a hash chain and contain reason codes rather than sensitive payload content. Active Teach or Correction recording cannot be represented without active consent and an independent stop control.

No graphical cockpit application was built or accepted in this pass.

## 7. Installation preflight

`src/productReadiness.ts` evaluates supplied host observations for:

- supported Windows edition/build and x64 architecture;
- administrative access;
- firmware virtualization;
- Hyper-V availability and enablement;
- processor, memory, and disk capacity;
- Node.js and .NET prerequisites;
- encrypted product-task configuration;
- Field image presence, hash, signature, and Generation 2 compatibility;
- MCP/tunnel or API brain configuration;
- Secure Boot and TPM production hardening.

Preflight is advisory and non-invasive. It does not inspect or modify the real host by itself.

A passing preflight can mark a machine only as a `liveFieldCandidate`. It always retains:

```text
productionCandidate: false
requiresLiveValidation: true
```

## 8. Measurable MVP and daily-driver gates

`evaluateProductBenchmark` calculates:

- completion rate;
- recovery rate;
- session-resume rate;
- emergency-stop success;
- non-required intervention rate;
- unapproved consequential actions;
- duration;
- model calls;
- estimated model cost;
- recipe coverage;
- live versus synthetic evidence.

Personal-use MVP promotion requires at least:

- 10 trials;
- five distinct recipes;
- 90% completion;
- zero unapproved consequential actions;
- 100% emergency-stop acceptance on attempted stops;
- 90% session-resume success;
- no more than 0.3 non-required interventions per trial;
- at least one live trial.

Synthetic-only evidence can never promote the MVP.

The strong daily-driver gate additionally requires at least 100 trials, 97% completion, 95% recovery where recovery was attempted, 99% session resumption, and no more than 0.1 non-required interventions per trial.

Production promotion is fixed false in this source-level evaluator.

## 9. Release lifecycle contracts

`src/productLifecycle.ts` implements source-level release controls:

- Ed25519 signed release-manifest verification;
- trusted-key selection;
- canonical manifest hashing;
- component SHA-256 and size metadata;
- relative path confinement and path uniqueness;
- component identity uniqueness;
- signed stable executable requirement;
- required gateway, Windows agent, and cockpit components;
- version-direction rules for install, update, repair, and rollback;
- explicit rollback compatibility declarations;
- deterministic install/update/repair/rollback/uninstall plans;
- backup, service stop/start, staging, replacement, migration, health-check, removal, preservation, and owner-data deletion steps;
- explicit owner confirmation before deletion of owner data;
- diagnostic-field redaction and size bounding.

All lifecycle plans retain:

```text
executionAllowed: false
```

This is not a Windows installer, updater, repair executor, rollback executor, or uninstaller. Those require target-host implementation and acceptance.

## 10. Hosted validation evidence

### Exosuit CI

- **Run:** `30926779304`
- **Result:** passed
- **Validated source head:** `d91a9701d8faab4220441de9553eb1647c0164b8`

Validated results:

- immutable dependency installation completed;
- deterministic CycloneDX npm SBOM generated with **149 components**;
- repository safety validator passed **71 required artifacts**;
- master-plan validator passed all **22 phased sections**;
- Field validator passed **84 required artifacts and 26 source modules**;
- strict TypeScript typecheck passed;
- focused Field/persona/product/safety/release suite passed **47 files and 230 tests**;
- Field fake-system pulse passed;
- full TypeScript suite passed **79 files and 406 tests**;
- production TypeScript build passed;
- Glove system pulse passed;
- PowerShell parsing passed;
- .NET Release build passed with **0 warnings and 0 errors**;
- .NET suite passed **48 tests**, with **0 failures**.

Evidence artifacts:

- `typescript-field-validation`: artifact `8899466661`, ZIP SHA-256 `e1827763cae9ea5028f0663aa8ac19509f0115928a45548211dd15afaec52d79`;
- `windows-field-validation`: artifact `8899444849`, ZIP SHA-256 `50a434a6d41ffb200119608fa3a9f20d19680599c95e78d9303eae09262aed24`.

The generated SBOM and evidence correspond to the validated source head and its pull-request workflow checkout. A final signed release must regenerate and bind release evidence to the final release manifest.

### Security Audit

- **Run:** `30926782740`
- **Result:** supported jobs passed

Validated results:

- npm audit reported **0 info, low, moderate, high, critical, and total vulnerabilities** across a 149-component dependency inventory;
- npm evidence artifact `8899421312`, ZIP SHA-256 `745be3d89e7c609bdb005757501a2aac346a70dae14f9bfb2a97b55488258398`;
- NuGet auditing reported no vulnerable direct or transitive packages for `Exosuit.Agent.Tests` from the configured sources;
- NuGet evidence artifact `8899429598`, ZIP SHA-256 `481dc6571ffcdb42eaf1a1e815ea68120096244ba2f76851d829682394f68769`.

CodeQL jobs remain outside the current supported private-repository workflow condition and are not claimed as passed.

## 11. Validation defects found and repaired

Hosted validation identified stale product-surface expectations in documentation/protocol/startup tests after adding the third MCP surface. The repository was reconciled to explicitly distinguish `core`, `product`, and `full` rather than weakening discovery checks.

A benchmark regression test initially expected a sub-90% resume result from only one failed resume among ten trials, which equals exactly 90%. The test evidence was corrected to cross the actual threshold; the production code and threshold were not loosened.

## 12. Unproven live and product areas

- real Windows and Hyper-V preflight collection;
- production-authenticated Field lifecycle and readiness;
- real ChatGPT Secure MCP Tunnel or equivalent connection;
- normal ChatGPT MCP end-to-end acceptance;
- API fallback runtime and billing verification;
- graphical local cockpit and human-factors acceptance;
- live scene production;
- consented Teach recording;
- real owner demonstrations and model calibration;
- process-level Shadow isolation;
- trusted credential insertion;
- live Assisted execution;
- emergency-stop behavior against physical input;
- signed Windows binaries and installer execution;
- service installation, repair, update, rollback, and uninstall execution;
- DPAPI/TPM key sealing and recovery;
- full release provenance, .NET SBOM, private code scanning or equivalent, penetration testing, privacy review, incident response, and support operations.

## 13. Promotion posture

- repository-side source and hosted test validation: **passed for the stated source head**;
- product parity direction and task-level foundation: **validated foundation**;
- encrypted task persistence and cockpit contracts: **validated foundation**;
- preflight, benchmark, and release lifecycle contracts: **validated foundation**;
- personal-use MVP: **denied pending live evidence**;
- live Assisted/Pilot/ChatGPT promotion: **denied**;
- production: **denied**.
