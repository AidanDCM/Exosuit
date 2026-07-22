# Exosuit

Exosuit is a private, model-independent computer embodiment platform for authorized AI pilots such as ChatGPT or Claude.

## Read the complete plan first

The full product, architecture, learning program, implementation order, tests, audits, failure cases, evidence gates, rollback, and production requirements are written in:

> **[`docs/MASTER_SYSTEM_ROADMAP.md`](docs/MASTER_SYSTEM_ROADMAP.md) — Exosuit Complete Master System Plan**

That document is the single planning authority for the repository. It covers the complete program from exact-head validation through Hyper-V, Teach, Shadow, Correction, personal task/motor/typing/timing/language models, Assisted Mode, synthetic Pilot, ChatGPT acceptance, owner acceptance, packaging, security, privacy, and production operations.

Do not treat a narrower architecture note, GitHub issue, PR description, or implementation-status file as a replacement for the master plan.

## One repository, two separate systems

| System | Meaning | Responsibility |
|---|---|---|
| **Exosuit Glove** | body, hand, and nervous system | sensing, planning support, policy, semantic and physical execution, verification, workflow state, recovery, audit, and emergency stop |
| **Exosuit Field** | controlled computer and teaching environment | isolated Windows session, stable display, applications, VM/storage lifecycle, task workspace, and owner-consented demonstration surface |

> **The Glove is not the VM. The Field is not the agent.**

They share one repository but retain separate identities, generations, lifecycles, policies, evidence, tests, manuals, failure states, and rollback paths.

The pilot supplies intent. The Glove observes and acts within local policy. The Field supplies the Windows environment in which the owner teaches and the Glove later works.

## Product goal

The target is a transparent, owner-authorized desktop agent that can:

- watch complete tasks performed inside the Field after explicit consent;
- record what was visible, what changed, what the owner did, how it was done, and when;
- learn task order, attention, reading, mouse, typing, timing, language, and correction patterns as separate versioned models;
- predict behavior in Shadow Mode without input authority;
- collect owner corrections;
- perform validated substeps in Assisted Mode;
- complete bounded workflows in Pilot Mode with fresh perception, verification, recovery, audit, and immediate local interruption.

The system may become highly personalized. It must not claim that an AI-performed action proves the owner personally performed it.

## Browser rule

A browser is an ordinary Windows application inside the Field.

The required product path does not depend on Playwright, DOM automation, an AI browser, or a browser extension as the main controller. Exosuit uses fresh Windows accessibility state, policy-bound visual state when needed, and ordinary guest-local mouse and keyboard input.

## Current status

### Glove

The Glove has substantial implemented source and bounded Windows evidence for:

- MCP contracts;
- fake desktop providers and protocol tests;
- Windows UI Automation observation and semantic actions;
- pointer movement, click, Unicode typing, and hotkeys;
- local policy and approval;
- multi-window workflow foundations;
- checkpoints and no-blind-retry recovery;
- tamper-evident audits;
- emergency stop.

### Field

The Field branch contains substantial source-only and fake/pure foundations for:

- Field identity and monotonically increasing generation;
- signed policy and attestation;
- Hyper-V Generation 2 desired state;
- immutable base image and disposable differencing OS overlay;
- optional persistent personal state and separate task disk;
- guarded Windows host, apply, rollback, bootstrap, destroy, and validation scripts;
- authenticated replay-resistant host/guest channel contracts;
- heartbeat and readiness contracts;
- typed guest command authorization;
- Teach recorder state and encrypted demonstration storage;
- visual retention policy;
- scene graph;
- Shadow comparison metrics with execution disabled;
- path and artifact boundaries;
- recovery and privacy-safe diagnostics;
- TypeScript/.NET wire fixtures;
- synthetic acceptance application;
- manuals, audits, threat model, failure matrix, and CI contracts.

### Not yet proven live

- current-head compilation and executable test evidence;
- real Hyper-V provisioning and isolation;
- live host/guest transport;
- guest bootstrap and heartbeat service;
- live scene production;
- live consented Teach recording;
- actual demonstration processing and retrieval;
- actual Shadow predictor;
- personal task, motor, typing, timing, language, and correction models;
- live cross-VM artifact transport;
- Pilot integration;
- ChatGPT-to-Field acceptance;
- real website operation;
- production readiness.

## Current execution gate

The next mandatory phase is L0 in the master plan and GitHub issue #12.

On an authenticated Windows checkout of the exact branch head:

```powershell
./scripts/windows/Invoke-ExosuitFieldValidation.ps1
```

This runner is intended to preserve exact evidence for repository validation, the master-plan validator, Field validation, TypeScript, tests, builds, PowerShell parsing, .NET, and the read-only Hyper-V host check.

Hosted GitHub jobs for the draft branch have repeatedly failed before checkout with zero allocated steps and no logs. That is an infrastructure block—not a repository pass or failure.

## Architecture summary

```text
Owner / local administration
         |
         +-------------------------+
         |                         |
         v                         v
Exosuit Glove Supervisor     Exosuit Field Manager
         |                         |
         +------ authenticated ----+
                        |
                        v
              Exosuit Field VM
     +--------------------------------------+
     | Glove Agent inside Windows session   |
     | - UI Automation and scene state      |
     | - policy-bound vision                |
     | - local reflex and motor             |
     | - Teach recorder                     |
     | - verification and emergency stop    |
     +--------------------------------------+
     | normal Windows desktop/applications  |
     +--------------------------------------+
```

The host must not operate the guest by treating VMConnect or an RDP viewer as the guest desktop. One Glove agent runs inside every controlled Windows session.

## Field modes

### Teach

The owner operates. Exosuit records only after explicit consent, with visible state and an independent stop. Teach never injects input.

### Shadow

The owner operates. Exosuit predicts the next intent, target, method, expected result, timing, and optional trajectory. Shadow cannot execute.

### Correction

The owner takes over when the system diverges. The difference becomes structured correction data.

### Assisted

Exosuit performs validated substeps while the owner remains the primary operator.

### Pilot

An authorized pilot operates a validated workflow through the Glove within a host-created, signed, bounded policy. Pilot does not administer the Field.

## Safety defaults

| Capability | Default |
|---|---|
| desktop provider | fake or observe-only until approved |
| physical input | disabled |
| Field provisioning | dry-run unless exact local confirmation |
| host clipboard, broad drive mapping, host input | disabled |
| base image | immutable parent only |
| runtime OS state | disposable differencing overlay |
| recording | disabled until consented live acceptance |
| Shadow execution | structurally false |
| Pilot autonomy | denied until phased validation |
| model Field administration | blocked |
| arbitrary shell through MCP | excluded |
| credentials in demonstrations or model context | prohibited |
| sensitive or untrusted ordinary export | blocked |

## Validation commands

```bash
npm install --ignore-scripts
npm run validate:repository
npm run validate:plan
npm run validate:field-contract
npm run typecheck
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

## Primary documents

- [Complete Master System Plan](docs/MASTER_SYSTEM_ROADMAP.md)
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

- PR #11 remains draft.
- Merge to `build/exosuit-mvp` is held pending L0 executable validation and review.
- Merge to `main` is denied.
- Live recording, Shadow prediction, Pilot operation, real accounts, and consequential tasks are denied.
- Packaging, signing, updater, privacy operations, penetration testing, and production support remain pending later master-plan phases.
