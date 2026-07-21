# Exosuit

Exosuit is a private, model-independent computer embodiment platform for authorized AI pilots such as ChatGPT or Claude.

The repository contains two intentionally separate systems:

| System | Meaning | Responsibility |
|---|---|---|
| **Exosuit Glove** | the body, hand, and nervous system | sensing, planning, policy, execution, verification, workflow state, audit, and emergency stop |
| **Exosuit Field** | the controlled computer and teaching environment | isolated Windows session, stable display, applications, storage, task workspace, recording surface, and VM lifecycle |

The pilot supplies intent. The Glove decides how to observe and act within local policy. The Field supplies the computer environment in which the Glove learns and works. They share one repository but have separate identities, lifecycles, policies, evidence, tests, manuals, and failure states.

The goal is **human flexibility, machine precision, transparent operation, recoverable workflows, detailed owner teaching, and local user authority**—not hidden automation.

Read [`docs/GLOVE_FIELD_BOUNDARY.md`](docs/GLOVE_FIELD_BOUNDARY.md) before changing either subsystem. Read [`docs/FIELD_IMPLEMENTATION_STATUS.md`](docs/FIELD_IMPLEMENTATION_STATUS.md) for exact current Field evidence.

## Current status

**The Glove has a strong single-agent Windows core with bounded live acceptance. The Field now has broad pure/fake foundations for identity, policy, lifecycle, provisioning intent, teaching data, scene state, Shadow evaluation, and artifact boundaries, but no live VM, recording, predictive model, or Pilot runtime. Production use remains denied.**

### Glove foundation currently includes

- a tool-only MCP server suitable for a private ChatGPT app,
- real MCP client/server protocol tests,
- fake desktop provider for deterministic testing,
- Windows UI Automation sensing and semantic actions,
- standard Windows pointer, click, Unicode typing, and bounded hotkey motor code,
- restart-only and allowlist-only physical-input activation,
- proposal → deterministic policy → local approval → fresh recheck → execution → verification,
- immutable approval fingerprints,
- gateway/provider deadlines and local emergency stop,
- sanitized versioned application maps,
- dual tamper-evident audit ledgers,
- prompt-injection and loop guards,
- local approval/control panel,
- multi-window workspace/window generation contracts,
- workflow dependency graphs, step lifecycle, window locks, focus leases, and session queues,
- structured cross-window artifacts with provenance and integrity hashes,
- checkpoints, uncertain-effect recovery, idempotency keys, and coordinator audit timelines,
- virtual-desktop and multi-agent foundations,
- disabled-by-default visual, browser-companion, skill, and resource-governance foundations.

### Field foundation currently includes

- explicit `glove` and `field` subsystem vocabulary,
- Field identity and monotonically increasing generation,
- agent, machine, Windows-session, image, personal-state, and task-disk identity,
- fixed display contract,
- bounded Teach, Shadow, and Pilot policy schema,
- hard-denied host desktop, host-drive write, privilege escalation, and security-control changes,
- canonical policy hashing and short-lived HMAC-SHA256 Field attestation,
- separate Field lifecycle and Glove-agent binding,
- fake-first Field Manager with exact provisioned-policy binding and hash-linked Field audit,
- strict integrity-hashed Hyper-V Generation 2 provisioning plan with no arbitrary command field,
- consent-bound demonstration episodes and bounded ordered event streams,
- recursive secret-shaped payload redaction,
- AES-256-GCM terminal demonstration storage, tamper detection, atomic writes, and deletion,
- versioned Field scene graph and input-readiness guards,
- Shadow prediction-only contracts and similarity metrics with `executionAllowed: false`,
- Windows-specific Parts & Pieces path-scope adaptation,
- bounded size/SHA-256/classification artifact-transfer broker foundation,
- shared TypeScript/.NET Field wire fixture,
- TypeScript and .NET pure tests written,
- dedicated Field architecture, status, owner, developer, test, audit, and Parts & Pieces manuals.

### Field capabilities not implemented yet

- supported Hyper-V provider and image management,
- actual persistent personal-state and disposable task-disk lifecycle,
- host/guest transport,
- guest bootstrap, heartbeat, and display enforcement,
- real Teach Mode input or visual recording,
- live Windows scene-graph producer,
- actual Shadow retrieval/prediction model,
- personal task, motor, typing, language, or timing models,
- live filesystem/cross-VM artifact transport,
- credential broker,
- autonomous Pilot integration,
- live ChatGPT-to-Field acceptance.

## Evidence boundary

The single-agent Glove core has bounded Windows Sandbox evidence for semantic mutation, pointer movement, click, Unicode text input, `CTRL+A`, local approvals, emergency-stop interruption, and independently verified audit chains.

The Field foundation currently has source contracts, documentation, and tests written. That evidence does **not** prove Hyper-V, VM isolation, recording, behavioral learning, or autonomous operation. See:

- [`docs/FIELD_IMPLEMENTATION_STATUS.md`](docs/FIELD_IMPLEMENTATION_STATUS.md)
- [`docs/qa/ATOMIC_AUDIT_2026-07-21_GLOVE_FIELD_FOUNDATION.md`](docs/qa/ATOMIC_AUDIT_2026-07-21_GLOVE_FIELD_FOUNDATION.md)
- [`docs/qa/ATOMIC_AUDIT_2026-07-21_FIELD_FOUNDATION_EXPANSION.md`](docs/qa/ATOMIC_AUDIT_2026-07-21_FIELD_FOUNDATION_EXPANSION.md)

GitHub-hosted workflow jobs for the draft branch failed before checkout with zero allocated steps and no job logs. The repository does not mislabel runner/account failures as passing or failing code tests. Exact executable branch validation remains required.

## Architecture

```text
ChatGPT / Claude / another MCP host
                 |
          narrow MCP tools
                 v
        Exosuit Glove Supervisor
  - action and workflow planning
  - demonstration retrieval
  - personal policy selection
  - window/workspace coordination
  - verification, recovery, audit
                 |
       authenticated field boundary
                 v
       Exosuit Glove Agent in guest
  - fresh UI Automation state
  - optional visual state
  - deterministic local policy
  - local reflex and motor control
  - verification and emergency stop
                 |
                 v
           Exosuit Field
  - isolated Windows session
  - fixed display contract
  - approved applications
  - personal-state disk
  - disposable task workspace
  - Teach / Shadow / Pilot lifecycle
```

The host must not control the guest by treating VMConnect or an RDP viewer as the guest desktop. One Glove agent runs inside every controlled Windows session or VM.

## Field modes

### Teach

The owner controls the Field. The Glove records consent-bound task, input, visual, accessibility, system, correction, and outcome evidence. It does not inject input. The live recorder is not implemented.

### Shadow

The owner controls the Field. The Glove predicts the next intent, target, method, timing class, and expected result. It does not inject input. Prediction schemas and metrics exist; an actual predictor/runtime does not.

### Pilot

An authorized pilot controls the Field through the Glove within a host-created, signed, bounded policy. Pilot mode is planned; it is not enabled by the Field foundation.

## Current MCP surface

### Desktop Glove core

- `desktop_get_status`
- `desktop_observe`
- `desktop_find_elements`
- `desktop_build_application_map`
- `desktop_list_application_maps`
- `desktop_get_application_map`
- `desktop_match_application_map`
- `desktop_propose_action`
- `desktop_propose_physical_input`
- `desktop_execute_proposal`
- `desktop_emergency_stop`
- `desktop_get_audit_log`

### Coordinator

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

No model-facing Field Manager, policy, consent, recording, provisioning, or artifact-transfer tool is enabled by this branch. Future Field tools must not create consent, sign policy, expose arbitrary Hyper-V commands, accept arbitrary paths, or grant host access.

## Safety defaults

| Capability | Default |
|---|---|
| Glove desktop provider | fake |
| real Windows mode | observe |
| physical input | disabled |
| screenshots | disabled; no Windows capture implementation |
| Field VM | unimplemented |
| Teach recording | unimplemented and disabled |
| Shadow prediction | schemas/metrics only; no runtime |
| Pilot Field autonomy | unimplemented and denied |
| Field host desktop access | hard false in policy and provisioning plan |
| Field host-drive write | hard false in policy; broad mapping disabled |
| privilege/security changes | hard false in policy |
| credentials and secret-bearing controls | hard denied |
| arbitrary shell through MCP or Field plan | excluded |
| ordinary sensitive/untrusted artifact export | blocked |

## Validation

Install dependencies with scripts disabled, then run:

```bash
npm install --ignore-scripts
npm run validate:typescript
```

On Windows with .NET 8:

```powershell
npm run validate
```

Individual commands:

```bash
npm run validate:repository
npm run typecheck
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
```

```powershell
dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release -warnaserror
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

Do not enable the Windows provider or physical input outside the disposable acceptance procedure in `docs/CODEX_HANDOFF.md`. Do not implement live Field recording before the Field privacy audit and consent/stop design are reviewed.

## Planning, manuals, and evidence

### Shared and Glove

- [Glove/Field boundary](docs/GLOVE_FIELD_BOUNDARY.md)
- [Master system roadmap](docs/MASTER_SYSTEM_ROADMAP.md)
- [Implemented Glove architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Glove test plan](docs/TEST_PLAN.md)
- [Secure MCP Tunnel runbook](docs/SECURE_MCP_TUNNEL_RUNBOOK.md)
- [Codex/local acceptance handoff](docs/CODEX_HANDOFF.md)

### Field

- [Field implementation status](docs/FIELD_IMPLEMENTATION_STATUS.md)
- [Field architecture](docs/FIELD_ARCHITECTURE.md)
- [Field owner manual](docs/FIELD_OWNER_MANUAL.md)
- [Field developer manual](docs/FIELD_DEVELOPER_MANUAL.md)
- [Field test plan](docs/FIELD_TEST_PLAN.md)
- [Glove/Field Parts traceability](docs/qa/GLOVE_FIELD_PARTS_TRACEABILITY.md)
- [Field foundation Atomic Audit](docs/qa/ATOMIC_AUDIT_2026-07-21_GLOVE_FIELD_FOUNDATION.md)
- [Field foundation expansion audit](docs/qa/ATOMIC_AUDIT_2026-07-21_FIELD_FOUNDATION_EXPANSION.md)

### Logs

- [Parts and donor traceability](docs/qa/PARTS_AND_DONOR_TRACEABILITY.md)
- [Issue and solution log](docs/logs/ISSUE_AND_SOLUTION_LOG.md)
- [Decision log](docs/logs/DECISION_LOG.md)
- [Field foundation engineering log](docs/engineering_log/2026-07-21-glove-field-foundation.md)
- [Field expansion engineering log](docs/engineering_log/2026-07-21-field-foundation-expansion.md)

`docs/MASTER_SYSTEM_ROADMAP.md` controls future sequence and promotion gates. `docs/ARCHITECTURE.md` describes the implemented Glove. `docs/FIELD_ARCHITECTURE.md` defines Field design. `docs/FIELD_IMPLEMENTATION_STATUS.md` is the exact current Field implementation/evidence inventory.

## Explicit exclusions

Exosuit must not implement or claim:

- stealth or undetectable automation,
- anti-bot or anti-cheat evasion,
- kernel or hardware impersonation for concealment,
- credential harvesting,
- privilege escalation,
- arbitrary remote shell execution,
- recording without explicit owner consent,
- host-wide input capture,
- covert surveillance,
- bypassing application or platform security controls,
- that behavioral imitation proves a human performed an action.

## Current holds

- **PR state:** draft review required
- **Merge to build branch:** hold pending executable validation and review
- **Merge to main:** denied
- **Production use:** denied
- **Real accounts or consequential targets:** denied
- **Normal personal desktop use:** denied
- **Live Field VM:** unimplemented
- **Teach/Shadow/Pilot runtime:** unimplemented
- **Connected ChatGPT Field acceptance:** pending
- **Packaging, signing, updater, rollback, privacy operations, penetration testing, and release operations:** pending
