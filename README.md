# Exosuit

Exosuit is a private, model-independent computer embodiment platform for owner-authorized AI pilots such as ChatGPT or an API model.

## Planning authority

- [`docs/MASTER_SYSTEM_ROADMAP.md`](docs/MASTER_SYSTEM_ROADMAP.md) — complete architecture and production authority;
- [`docs/PRODUCTION_BUILD_PHASES.md`](docs/PRODUCTION_BUILD_PHASES.md) — broad production build waves;
- [`docs/PRODUCT_PARITY_ROADMAP.md`](docs/PRODUCT_PARITY_ROADMAP.md) — seamless personal-agent direction;
- [`docs/BUILD_COMPLETION_PLAN.md`](docs/BUILD_COMPLETION_PLAN.md) — exact path from the current source foundation to personal MVP, daily driver, and production;
- [`docs/qa/BUILD_COMPLETION_TEST_MATRIX.md`](docs/qa/BUILD_COMPLETION_TEST_MATRIX.md) — required live, failure-injection, owner, security, and release tests;
- [`docs/qa/build-completion-manifest.json`](docs/qa/build-completion-manifest.json) — integrity-bound machine-readable phases, gates, evidence classes, and current status.

> ChatGPT or an API model handles intent, judgment, and conversation. Exosuit handles state, execution, safety, memory, recovery, and evidence.

MCP is the tool protocol, not the AI brain. ChatGPT MCP is the preferred interactive route. A configured API route is a bounded fallback for unattended continuation, recovery, local-cockpit initiation, or temporary MCP unavailability. Both routes use the same local policy, approvals, task state, persona, audit, and execution adapters.

## Glove and Field

| System | Meaning | Responsibility |
|---|---|---|
| **Exosuit Glove** | body, hand, and nervous system | sensing, policy, semantic and physical execution, verification, workflow state, recovery, audit, and emergency stop |
| **Exosuit Field** | controlled computer and teaching environment | isolated Windows session, stable display, applications, VM/storage lifecycle, task workspace, and owner-consented demonstration surface |

> **The Glove is not the VM. The Field is not the agent.**

They share one repository but retain separate identities, generations, lifecycles, policies, evidence, tests, manuals, failure states, and rollback paths.

## Product modes

- **Observe:** read and summarize current state with no physical-input authority.
- **Teach:** record an explicitly consented demonstration with visible recording state, privacy controls, provenance, and immediate stop.
- **Shadow:** predict likely actions without network, credential, command, administration, or input authority.
- **Correction:** capture structured differences when the owner corrects a prediction or takes over.
- **Assisted:** execute only approved low-risk chunks through ordinary policy, fresh observation, verification, checkpointing, and recovery.
- **Pilot:** denied until synthetic trials, repeated low-risk acceptance, process isolation, emergency-stop evidence, and explicit owner promotion are complete.

## Current implementation

### Glove and Field foundations

Implemented foundations include MCP protocol tests, fake and guarded Windows providers, UI Automation observation and semantic actions, restart-gated physical-input foundations, local policy and approvals, verification, audit, deadlines, recovery, emergency stop, durable workflow coordination, Field identity and lifecycle, Hyper-V desired state, authenticated channels, readiness, guest service, scene/Teach/storage foundations, demonstration processing, encrypted derived storage, Shadow retrieval, Correction, artifact transfer, recovery, diagnostics, guarded scripts, manuals, tests, and audits.

### Owner-governed persona

Implemented foundations include integrity-bound profile versions; AES-256-GCM profile, governance, model, bundle, and activation storage; owner-only approval, revocation, rollback, deletion, activation, and deactivation; evidence-bound derivation and held-out evaluation; separate typing, motor, language, attention, timing, habit, and verification models; and fixed advisory-only authority.

### Product task and convenience layer

Implemented repository-side foundations include:

- deterministic ChatGPT MCP/API brain routing with task-level API budget ceilings;
- integrity-bound resumable task sessions and short-lived chunks;
- AES-256-GCM durable task state with hashed filenames, atomic writes, wrong-key rejection, and authenticated ciphertext;
- automatic, grouped, and immediate approval classes;
- one automatic retry followed by explicit recovery escalation;
- trusted-local-adapter-only outcome recording;
- privacy-safe cockpit state and hash-chained events without raw goals, variables, screenshots, credentials, or persona text;
- deterministic host installation preflight contracts;
- quantitative personal-MVP and strong daily-driver benchmark gates requiring live evidence;
- Ed25519 release-manifest verification and non-executing install/update/repair/rollback/uninstall plans;
- diagnostic redaction;
- five reviewed initial recipes:
  - gather approved information;
  - research, normalize, deduplicate, and organize;
  - fill a form and stop before submission;
  - prepare a message and stop before sending;
  - download and organize approved files.

The product task layer cannot report execution success through MCP. A future trusted local adapter must re-observe, apply ordinary policy, execute, verify, and record a bounded result. Cockpit and release-lifecycle implementations are contracts, not finished graphical interfaces or host-changing executors. Release plans retain `executionAllowed: false`.

### Build-completion control

The repository now contains a machine-validated completion graph:

| Phase | Finish line |
|---|---|
| M0 | exact source baseline |
| M1 | real host and disposable Field |
| M2 | live scenes and trusted execution |
| M3 | consented Teach, isolated Shadow, and personal models |
| M4 | five Assisted recipes |
| M5 | ChatGPT/API connection, cockpit, and resume |
| M6 | installable personal MVP |
| P1 | strong daily-driver reliability |
| P2 | production security and release engineering |
| P3 | exact production candidate and operations |

The completion contract distinguishes source, unit, fake integration, Windows guest, Hyper-V, ChatGPT MCP, owner acceptance, security review, and release-operation evidence. Live gates cannot pass with synthetic-only evidence. Dependency cycles, missing gate IDs, missing rollback procedures, tampering, and unsupported promotion claims fail validation.

## Validation posture

Validated source head before the completion-plan addition:

```text
d91a9701d8faab4220441de9553eb1647c0164b8
```

Hosted evidence for that source head:

- Exosuit CI run `30926779304` passed;
- Security Audit run `30926782740` passed for supported jobs;
- repository validator: 71 required artifacts;
- master-plan validator: all 22 phased sections;
- Field validator: 84 required artifacts and 26 source modules;
- 47 focused files and **230 focused tests** passed;
- 79 full TypeScript files and **406 tests** passed;
- **48 .NET tests** passed with zero failures;
- TypeScript typecheck and production build passed;
- Glove and Field system pulses passed;
- PowerShell parsing passed;
- .NET build passed with zero warnings and errors;
- CycloneDX npm SBOM generated with **149 components**;
- npm audit reported zero vulnerabilities;
- NuGet reported no vulnerable direct or transitive packages.

See [`docs/qa/ATOMIC_AUDIT_2026-08-04_PRODUCT_PARITY_LAYER.md`](docs/qa/ATOMIC_AUDIT_2026-08-04_PRODUCT_PARITY_LAYER.md) for artifact IDs, hashes, repaired validation defects, and exact promotion boundaries. The completion-plan branch tip must receive its own exact-head CI evidence before these counts are updated.

These are repository and fake-provider results. Live Windows, Hyper-V, Teach, owner-derived calibration, process-level Shadow isolation, credential insertion, Assisted execution, ChatGPT-to-Field acceptance, graphical cockpit, installer execution, MVP, and production remain denied.

Still unproven:

- independent hosted CI attestation of the consolidated Glove/Field commit (local exact-head L0 and clean parity pass);
- repeatable Hyper-V lifecycle, isolation, destruction, and failure-injection evidence;
- production-authenticated host/guest transport, key storage, and rotation;
- production guest bootstrap and heartbeat without development auto-login/unattended setup;
- live scene production;
- live consented Teach recording;
- actual demonstration processing and retrieval;
- actual Shadow predictor;
- personal task, motor, typing, timing, language, and correction models;
- live cross-VM artifact transport;
- Pilot integration;
- ChatGPT-to-Field acceptance;
- real account or consequential website operation;
- production readiness.

## Current execution gate

The next mandatory phase is L0 in the master plan and GitHub issue #12.

On an authenticated Windows checkout of the exact branch head:

```powershell
./scripts/windows/Invoke-ExosuitFieldValidation.ps1
```

This runner is intended to preserve exact evidence for repository validation, the master-plan validator, Field validation, TypeScript, tests, builds, PowerShell parsing, .NET, and the read-only Hyper-V host check.

For working-tree feedback, `npm run build:fast` runs the independent contract and
typecheck lanes concurrently and writes non-promotional evidence beneath
`artifacts/build-fabric`. The active slice contract is
`development/current-slice.json`. The fast runner never substitutes for the complete
exact-head runner.

The optional accelerated Field owner service is installed through one reviewed UAC
transaction documented in `docs/FIELD_WINDOWS_RUNBOOK.md`. Its expiring standing policy
allows only exact-generation provisioning, authenticated read-only KVP observation, and
destruction through fixed hash-bound components. It has no MCP surface and grants no
desktop, recording, consent, key, export, or policy authority.

Hosted GitHub jobs for the draft branch have repeatedly failed before checkout with zero allocated steps and no logs. That is an infrastructure block—not a repository pass or failure.

## Current MCP surface

The exposed tool set is selected by `EXOSUIT_MCP_SURFACE`:

| Value | Tools exposed |
|---|---|
| unset or `core` | reviewed desktop core only, 13 tools |
| `product` | desktop core plus high-level product tasks, 23 tools |
| `full` | desktop core, high-level product tasks, and coordinator, 37 tools |

`core` remains the default. `product` and `full` are explicit opt-ins. Unknown values fail startup.

### Desktop core

- `desktop_get_status`
- `desktop_observe`
- `desktop_find_elements`
- `desktop_build_application_map`
- `desktop_list_application_maps`
- `desktop_get_application_map`
- `desktop_match_application_map`
- `desktop_propose_action`
- `desktop_execute_proposal`
- `desktop_emergency_stop`
- `desktop_get_audit_log`
- `desktop_propose_physical_input`
- `desktop_execute_physical_proposal`

### High-level product tools

Requires `EXOSUIT_MCP_SURFACE=product` or `full`.

- `exosuit_route_brain`
- `exosuit_list_recipes`
- `exosuit_create_task`
- `exosuit_list_tasks`
- `exosuit_get_task`
- `exosuit_start_task`
- `exosuit_plan_next_chunk`
- `exosuit_pause_task`
- `exosuit_resume_task`
- `exosuit_cancel_task`

These tools plan and checkpoint work. They do not expose an execution-success tool. Start and resume use a trusted local readiness provider instead of a model-supplied argument.

### Coordinator tools

Requires `EXOSUIT_MCP_SURFACE=full`.

- `desktop_refresh_workspace`
- `desktop_get_workspace`
- `desktop_list_windows`
- `desktop_create_workflow`
- `desktop_list_workflows`
- `desktop_get_workflow`
- `desktop_run_next_workflow_step`
- `desktop_continue_approved_workflow_step`
- `desktop_pause_workflow`
- `desktop_resume_workflow`
- `desktop_cancel_workflow`
- `desktop_list_workflow_artifacts`
- `desktop_get_workflow_audit`
- `desktop_list_agents`

## Product-task environment

| Variable | Meaning | Default |
|---|---|---|
| `EXOSUIT_MCP_SURFACE` | `core`, `product`, or `full` | `core` |
| `EXOSUIT_PRODUCT_TASK_DIR` | encrypted persistent task directory; must be paired with a key | memory only |
| `EXOSUIT_PRODUCT_TASK_KEY` | exact 32-byte task key encoded as hex or base64url; must be paired with a directory | unset |
| `EXOSUIT_PRODUCT_FIELD_READINESS` | development-only fake readiness switch | not ready |
| `EXOSUIT_AGENT_MODE` | `fake` or `http` desktop provider | `fake` |

Supplying only the task directory or only the key fails startup. Environment-supplied keys are not the final production key-management path; DPAPI/TPM sealing, rotation, recovery, and secure erasure remain required.

The only current positive task-readiness combination is:

```text
EXOSUIT_PRODUCT_FIELD_READINESS=development_fake
EXOSUIT_AGENT_MODE=fake
```

Real/http mode remains not ready until the authenticated Field-readiness service is connected and tested.

## Approval and recovery

### Automatic

Observing, reading, approved navigation, collecting information, drafting locally, and temporary local artifacts.

### Grouped owner approval

Reversible non-sensitive form filling, file organization, draft editing, and known reversible recipe chunks.

### Immediate owner approval

Sending, posting, submitting, purchasing, uploading, sharing, deleting, account changes, credential release, and financial, legal, destructive, identity-sensitive, or external commitments. Exosuit must not solve human-verification challenges for the owner.

Every trusted chunk ends in one of:

- `verified`;
- `retryable`;
- `needs_owner`;
- `safely_aborted`;
- `rolled_back`.

Ordinary low-risk recovery is: re-observe, compare, retry once only when safe, try one reviewed alternate, restore a checkpoint when possible, then ask the owner with evidence.

## Readiness contracts

### Host preflight

The source-level evaluator covers supported Windows edition/build, x64, administrator access, firmware virtualization, Hyper-V, CPU, memory, disk, Node.js, .NET, encrypted task state, Field-image integrity, and brain-route configuration. It does not probe or change the real computer. A passing result still retains:

```text
productionCandidate: false
requiresLiveValidation: true
```

### Personal-use MVP benchmark

Promotion requires at least 10 trials across five recipes, 90% completion, zero unapproved consequential actions, 100% successful emergency stops in attempted acceptance trials, 90% session-resume success, no more than 0.3 non-required interventions per trial, and live evidence. Synthetic-only evidence cannot promote the MVP.

The stronger daily-driver gate requires at least 100 trials, 97% completion, 95% recovery where attempted, 99% resumption, and no more than 0.1 non-required interventions per trial. The evaluator cannot approve production.

### Completion assessment

```bash
npm run validate:mvp-plan
npm run assess:mvp
```

`validate:mvp-plan` checks the manifest structure, integrity hash, required phases/gates, dependency graph, evidence classes, rollback procedures, and synthetic/live separation. `assess:mvp` reports weighted source/live completion, blockers, and the next executable phase without claiming readiness.

The stricter command:

```bash
npm run validate:mvp
```

is expected to fail until every personal-MVP gate has qualifying live evidence.

## Safety defaults

| Capability | Default |
|---|---|
| desktop provider | fake |
| fake mode | sandbox |
| Windows mode | observe |
| MCP surface | `core` |
| product task readiness | false except explicit fake development mode |
| durable task state | memory unless encrypted directory and key are paired |
| physical input | disabled |
| Field provisioning | dry-run unless exact local confirmation |
| host clipboard, broad drive mapping, host input | disabled |
| recording | disabled until consented live acceptance |
| Shadow execution | structurally false |
| Pilot autonomy | denied |
| model Field administration | blocked |
| arbitrary shell through MCP | excluded |
| lifecycle plans | non-executing |

## Validation commands

```bash
npm ci --ignore-scripts
npm run validate:repository
npm run validate:plan
npm run validate:mvp-plan
npm run validate:field-contract
npm run typecheck
npm run test:mvp-plan -- --reporter=verbose
npm run test:product -- --reporter=verbose
npm run test:field -- --reporter=verbose
npm run test:field-pulse -- --reporter=verbose
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
```

```powershell
dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore -warnaserror
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

For live Windows evidence, use the guarded Field validator only on an authenticated disposable acceptance environment:

```powershell
./scripts/windows/Invoke-ExosuitFieldValidation.ps1
```

The Windows validator now records both informational personal-MVP and production-readiness reports. Neither report is a promotion unless its exact evidence requirements pass.

## Remaining live and production holds

- production-authenticated repeated Hyper-V lifecycle/channel/readiness failure injection;
- real host-preflight collection;
- live scenes and consented Teach acceptance;
- real owner demonstrations and held-out similarity evaluation;
- DPAPI/TPM key handling and secure erasure;
- process-level Shadow no-input proof;
- trusted credential insertion;
- trusted local task-chunk executor;
- live Assisted execution for all five recipes;
- normal ChatGPT MCP acceptance;
- graphical cockpit and human-factors acceptance;
- signed Windows binaries and installer/service execution;
- repair, update, rollback, and uninstall execution;
- daily-driver reliability and compatibility matrix;
- full release provenance, .NET SBOM, private code scanning or equivalent, penetration testing, privacy review, incident response, and support operations.

## Explicit exclusions

Exosuit must not implement or claim stealth or undetectable automation, anti-bot or anti-cheat evasion, kernel or hardware concealment, credential harvesting, privilege escalation, arbitrary remote shell execution, recording without consent, covert surveillance, bypassing security controls, guaranteed indistinguishability from a person, or that behavioral imitation proves a human acted.

## Current holds

- PR #26 remains draft; merge to `main` is denied pending release-candidate reconciliation and live acceptance.
- Real-account or consequential autonomous use is denied.
- Real owner-derived persona activation is denied until live evidence and owner approval.
- Live Assisted, Pilot, and ChatGPT-to-Field promotion are denied.
- Personal-use MVP is denied until M0–M6 and the live benchmark gate pass.
- Daily-driver readiness is denied until P1 passes.
- Production is denied until P2–P3 and every production-readiness gate pass.
