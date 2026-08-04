# Exosuit

Exosuit is a private, model-independent computer embodiment platform for owner-authorized AI pilots such as ChatGPT or an API model.

## Planning authority

The complete architecture, implementation order, evidence gates, failure cases, rollback rules, security controls, privacy requirements, and production criteria are defined in:

- [`docs/MASTER_SYSTEM_ROADMAP.md`](docs/MASTER_SYSTEM_ROADMAP.md) — complete system plan;
- [`docs/PRODUCTION_BUILD_PHASES.md`](docs/PRODUCTION_BUILD_PHASES.md) — practical build waves;
- [`docs/PRODUCT_PARITY_ROADMAP.md`](docs/PRODUCT_PARITY_ROADMAP.md) — seamless personal-agent product direction.

The product rule is:

> ChatGPT or an API model handles intent, judgment, and conversation. Exosuit handles state, execution, safety, memory, recovery, and evidence.

MCP is the tool protocol, not the AI brain. ChatGPT MCP is the preferred interactive route. A configured API route is a bounded fallback for unattended continuation, recovery, local-cockpit initiation, or temporary MCP unavailability. Both routes must use the same local policy, approvals, task state, persona, audit, and execution adapters.

## One repository, two separate systems

| System | Meaning | Responsibility |
|---|---|---|
| **Exosuit Glove** | body, hand, and nervous system | sensing, policy, semantic and physical execution, verification, workflow state, recovery, audit, and emergency stop |
| **Exosuit Field** | controlled computer and teaching environment | isolated Windows session, stable display, applications, VM/storage lifecycle, task workspace, and owner-consented demonstration surface |

> **The Glove is not the VM. The Field is not the agent.**

They share one repository but retain separate identities, generations, lifecycles, policies, evidence, tests, manuals, failure states, and rollback paths.

## Product modes

### Observe

Read and summarize current state. No physical-input authority.

### Teach

Record an explicitly consented owner demonstration with visible recording state, immediate stop, privacy controls, and exact provenance.

### Shadow

Predict likely next actions without network, credential, command, administration, or input authority. Compare predictions with actual owner behavior.

### Correction

Capture structured differences when the owner corrects a prediction or takes over a task.

### Assisted

Execute only approved low-risk chunks through ordinary local policy, fresh observation, verification, checkpointing, and recovery. Consequential effects remain immediately owner-approved.

### Pilot

Remain denied until synthetic trials, repeated low-risk acceptance, process isolation, emergency-stop evidence, and explicit owner promotion are complete.

## Current implementation

### Glove

Implemented foundations include:

- MCP contracts and real client/server protocol tests;
- fake desktop providers and guarded Windows provider foundations;
- Windows UI Automation observation and semantic actions;
- restart-gated, allowlisted physical-input foundations;
- local policy, approvals, fresh re-observation, verification, audit, deadlines, recovery, and emergency stop;
- workflow DAGs, window generations, locks, focus leases, queues, artifacts, checkpoints, and durable coordinator state.

### Field

Implemented foundations include:

- Field identity, generation, policy, attestation, lifecycle, and Field Manager;
- Hyper-V desired state, immutable base, disposable overlay, versioned personal state, and task disks;
- authenticated channel, canonical timestamps/origins, replay controls, heartbeat, bootstrap, readiness, and guest service;
- scene observation, Teach/storage/privacy foundations, demonstration processing, encrypted derived storage, retrieval-backed Shadow, and Correction foundations;
- path confinement, artifact manifests, recovery, diagnostics, guarded PowerShell tooling, manuals, tests, and audits.

### Owner-governed persona

Implemented foundations include:

- integrity-bound, consecutively versioned persona profiles;
- AES-256-GCM profile, governance, model, bundle, and activation storage;
- owner-only approval, retirement, revocation, rollback, deletion, activation, and deactivation;
- evidence/provenance-bound candidate derivation and held-out stability evaluation;
- separate typing, motor, language, attention, timing, habit, and verification models;
- fixed advisory-only authority with no text, coordinate, input, credential, approval, or Field-administration authority.

### Product task layer

Implemented source-only foundations include:

- deterministic ChatGPT MCP/API brain routing with API task-budget ceilings;
- integrity-bound, resumable product task sessions;
- file-backed checkpoint persistence and tamper rejection;
- automatic, grouped, and immediate approval classes;
- one automatic retry followed by explicit recovery state;
- short-lived, non-executable task chunks bound to task hash and checkpoint version;
- trusted-local-adapter-only outcome recording;
- five initial reviewed recipes:
  - gather approved information;
  - research, normalize, and organize;
  - fill a form and stop before submission;
  - prepare a message and stop before sending;
  - download and organize approved files;
- a separate opt-in product MCP surface that exposes goals and recipes rather than raw pointer operations.

The product task layer cannot claim execution success through MCP. A future trusted local adapter must re-observe, apply ordinary policy, execute, verify, and then record a bounded outcome.

## Current validation posture

Hosted CI is operating. The owner-governed persona implementation baseline previously passed:

- 194 focused Field/persona/safety/release tests;
- 366 full TypeScript tests;
- 48 .NET tests;
- strict TypeScript typecheck and production build;
- Glove and Field system pulses;
- PowerShell parsing;
- .NET build with zero warnings and errors;
- npm and NuGet supported dependency audits;
- deterministic npm SBOM generation.

The newer product-task layer is undergoing exact-head hosted validation. Its focused brain-routing, persistence, approval, recovery, and MCP-boundary tests have passed. Live Windows, Hyper-V, Teach, Shadow, Assisted, credential insertion, ChatGPT-to-Field, packaging, and production promotion remain denied until their own evidence gates pass.

## Current MCP surface

The exposed tool set is selected by `EXOSUIT_MCP_SURFACE`:

| Value | Tools exposed |
|---|---|
| unset or `core` | reviewed desktop core only, 13 tools |
| `product` | desktop core plus high-level product tasks, 23 tools |
| `full` | desktop core, high-level product tasks, and coordinator, 37 tools |

`core` remains the default. `product` and `full` are explicit opt-ins. An unrecognized value fails startup rather than guessing. The gateway reports the selected surface and hydrated state on startup.

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

Both execution tools use the authoritative local execution and policy path. The physical-input proposal cannot supply an approval token.

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

These tools plan and checkpoint work. They do not expose an execution-success or trusted-outcome tool. Product task start and resume use a trusted local Field-readiness provider rather than a model-supplied readiness argument. Until live readiness is integrated, only an explicitly enabled fake development process may report ready.

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
| `EXOSUIT_PRODUCT_TASK_DIR` | optional persistent product-task directory | memory only |
| `EXOSUIT_PRODUCT_FIELD_READINESS` | development-only fake readiness switch | not ready |
| `EXOSUIT_AGENT_MODE` | `fake` or `http` desktop provider | `fake` |

The only current positive task-readiness combination is:

```text
EXOSUIT_PRODUCT_FIELD_READINESS=development_fake
EXOSUIT_AGENT_MODE=fake
```

This is for fake development acceptance only. Real/http agent mode remains not ready until the authenticated Field-readiness service is connected and tested.

## Approval policy

### Automatic

- observing and reading;
- opening approved local applications;
- navigating approved interfaces without external effects;
- collecting information;
- drafting locally;
- creating temporary local artifacts.

### Grouped owner approval

- filling multiple non-sensitive fields without submission;
- reversible file organization;
- editing a local draft;
- running a known reversible recipe chunk.

### Immediate owner approval

- sending, posting, submitting, purchasing, uploading, or sharing;
- deleting or changing account settings;
- financial, legal, destructive, identity-sensitive, or external commitments;
- credential release;
- human-verification challenges, which Exosuit must not solve for the owner.

## Recovery contract

Every trusted execution chunk must end in one of:

- `verified`;
- `retryable`;
- `needs_owner`;
- `safely_aborted`;
- `rolled_back`.

The ordinary low-risk recovery sequence is:

1. Re-observe.
2. Compare actual and expected state.
3. Retry once only when idempotent or proven not applied.
4. Try one reviewed alternate method.
5. Restore the latest safe checkpoint when possible.
6. Ask the owner with clear evidence.

## Architecture summary

```text
Owner
  |
  v
ChatGPT MCP or bounded API fallback
  |
  v
High-level Exosuit task surface
  |
  +---------------- Product task state / approvals / recovery
  |
  v
Glove policy and execution path
  |
  +---------------- authenticated channel ----------------+
  |                                                        |
  v                                                        v
Local supervisor                                      Field Manager
                                                           |
                                                           v
                                                   Exosuit Field VM
                                            +----------------------------+
                                            | guest-local Glove agent    |
                                            | scene / Teach / verification|
                                            | normal Windows applications |
                                            +----------------------------+
```

The host must not operate the guest by treating VMConnect or an RDP viewer as the guest desktop. One Glove agent runs inside every controlled Windows session.

## Safety defaults

| Capability | Default |
|---|---|
| desktop provider | fake |
| fake mode | sandbox |
| Windows mode | observe |
| MCP surface | `core` |
| product task Field readiness | false except explicit fake development mode |
| bind address | `127.0.0.1` |
| physical input | disabled |
| Field provisioning | dry-run unless exact local confirmation |
| host clipboard, broad drive mapping, host input | disabled |
| base image | immutable parent only |
| runtime OS state | disposable differencing overlay |
| recording | disabled until consented live acceptance |
| Shadow execution | structurally false |
| Pilot autonomy | denied |
| model Field administration | blocked |
| arbitrary shell through MCP | excluded |
| credentials in demonstrations or model context | prohibited |
| sensitive or untrusted ordinary export | blocked |

## Validation commands

```bash
npm ci --ignore-scripts
npm run validate:repository
npm run validate:plan
npm run validate:field-contract
npm run typecheck
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

On an authenticated Windows checkout, use the guarded Field validator for live evidence:

```powershell
./scripts/windows/Invoke-ExosuitFieldValidation.ps1
```

Do not enable the Windows provider or physical input outside the documented disposable acceptance procedure.

## Personal-use MVP acceptance

A real personal-use MVP requires evidence that the target Windows machine can repeatedly:

- cold-start and authenticate the Field;
- produce reliable live scenes;
- record consented Teach demonstrations;
- run no-input Shadow predictions;
- complete at least five bounded low-risk recipes in Assisted Mode;
- stop before consequential effects unless immediately approved;
- survive interruption and resume from checkpoints;
- execute emergency stop and Field reset reliably;
- provide complete task evidence through ChatGPT and the local cockpit.

Initial targets are at least 90% completion on supported recipes, zero unapproved consequential actions, 100% emergency-stop activation in acceptance trials, at least 90% session-resume success, and under 30% non-required owner intervention.

## Remaining live and production holds

- production-authenticated, repeated Hyper-V lifecycle/channel/readiness failure injection;
- live Windows scene production and consented Teach privacy/recording acceptance;
- real owner demonstrations and held-out owner-similarity evaluation;
- DPAPI/TPM-backed keys, rotation, recovery, and secure-erasure evidence;
- process-level Shadow sandbox/no-input proof;
- trusted credential insertion and external-vault integration;
- live low-risk Assisted execution with downstream reauthorization;
- synthetic Pilot and normal ChatGPT MCP acceptance;
- local cockpit and human-factors acceptance;
- signed installer, repair, update, rollback, and uninstall;
- complete release SBOM/provenance, private code scanning, penetration testing, privacy review, incident response, and support operations.

## Primary documents

- [Complete Master System Plan](docs/MASTER_SYSTEM_ROADMAP.md)
- [Product parity roadmap](docs/PRODUCT_PARITY_ROADMAP.md)
- [Glove/Field boundary](docs/GLOVE_FIELD_BOUNDARY.md)
- [Field implementation status](docs/FIELD_IMPLEMENTATION_STATUS.md)
- [Implemented Glove architecture](docs/ARCHITECTURE.md)
- [Field architecture](docs/FIELD_ARCHITECTURE.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Shared/Glove test plan](docs/TEST_PLAN.md)
- [Field test plan](docs/FIELD_TEST_PLAN.md)
- [Windows and Hyper-V runbook](docs/FIELD_WINDOWS_RUNBOOK.md)
- [Field owner manual](docs/FIELD_OWNER_MANUAL.md)
- [Field developer manual](docs/FIELD_DEVELOPER_MANUAL.md)
- [Field threat model](docs/qa/FIELD_THREAT_MODEL.md)
- [Field failure-injection matrix](docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md)
- [Execution issue index](docs/qa/FIELD_EXECUTION_ISSUE_INDEX.md)

## Explicit exclusions

Exosuit must not implement or claim:

- stealth or undetectable automation;
- anti-bot or anti-cheat evasion;
- kernel or hardware concealment;
- credential harvesting;
- privilege escalation;
- arbitrary remote shell execution;
- recording without owner consent;
- covert surveillance;
- bypassing platform security controls;
- guaranteed indistinguishability from a person;
- that behavioral imitation proves a human acted.

## Current holds

- PR #26 remains draft and merge to `main` remains denied pending exact release-candidate reconciliation and live acceptance.
- Real-account or consequential autonomous use remains denied.
- Real owner-derived persona activation remains denied until live evidence and owner approval.
- Live Assisted, Pilot, and ChatGPT-to-Field promotion remain denied.
- Production remains denied.
