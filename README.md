# Exosuit

Exosuit is a private, model-independent computer embodiment platform for authorized AI pilots such as ChatGPT or Claude.

The repository contains two intentionally separate systems:

| System | Meaning | Responsibility |
|---|---|---|
| **Exosuit Glove** | the body, hand, and nervous system | sensing, planning, policy, execution, verification, workflow state, audit, and emergency stop |
| **Exosuit Field** | the controlled computer and teaching environment | isolated Windows session, stable display, applications, storage, task workspace, recording surface, and VM lifecycle |

The pilot supplies intent. The Glove decides how to observe and act within local policy. The Field supplies the computer environment in which the Glove learns and works. They share one repository but have separate identities, lifecycles, policies, evidence, tests, manuals, and failure states.

The goal is **human flexibility, machine precision, transparent operation, recoverable workflows, detailed owner teaching, and local user authority**—not hidden automation.

Read [`docs/GLOVE_FIELD_BOUNDARY.md`](docs/GLOVE_FIELD_BOUNDARY.md) before changing either subsystem. Read [`docs/FIELD_IMPLEMENTATION_STATUS.md`](docs/FIELD_IMPLEMENTATION_STATUS.md) for exact Field evidence and limitations.

## Current status

**The Glove has a strong single-agent Windows core with bounded live acceptance. The Field has broad source-only and fake/pure foundations—including guarded Hyper-V tooling—but no current-head executable validation, live authenticated VM integration, real recording hooks, predictive model, or Pilot runtime. Production use remains denied.**

### Glove foundation

- tool-only MCP server suitable for a private ChatGPT app,
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
- multi-window workflows, focus leases, queues, artifacts, checkpoints, and recovery,
- virtual-desktop and multi-agent foundations,
- disabled-by-default visual, browser-companion, skill, and resource-governance foundations.

### Field source foundation

- explicit `glove` and `field` subsystem vocabulary,
- Field ID and monotonically increasing generation,
- agent, machine, Windows-session, image, personal-state, task-disk, and boot identity,
- fixed single-monitor display contract,
- bounded Teach, Shadow, and Pilot policy,
- hard-denied host desktop, broad host-drive write, privilege escalation, and security-control changes,
- canonical policy hashing and short-lived HMAC-SHA256 Field attestation,
- separate Field lifecycle and Glove-agent binding,
- fake-first Field Manager with exact provisioned-policy binding and hash-linked Field audit,
- Hyper-V Generation 2 desired-state plan with immutable base image, disposable differencing OS overlay, optional persistent personal-state disk, and separate disposable task disk,
- local owner/service/pilot administration separation,
- authenticated replay-resistant host/guest message contracts,
- guest heartbeat and liveness evaluation,
- guest bootstrap manifest and readiness evaluator,
- typed guest commands with exact policy, scene, action-budget, route, and capability checks,
- Teach recorder state machine with explicit consent, visible-state contract, pause/resume/abort/fault, and no input authority,
- consent-bound demonstration episodes and ordered event streams,
- recursive secret-shaped payload redaction,
- AES-256-GCM terminal demonstration storage, tamper detection, atomic writes, and deletion,
- visual consent, region/change-only modes, external blob references, redaction, budgets, and retention,
- versioned Field scene graph and input-readiness guards,
- Shadow prediction-only contracts and metrics with `executionAllowed: false`,
- Windows-specific Parts & Pieces path-scope adaptation,
- bounded size/SHA-256/classification artifact broker,
- deterministic no-blind-retry recovery,
- privacy-safe support bundles,
- TypeScript/.NET shared Field and signed-channel fixtures,
- full fake Field system pulse,
- guarded PowerShell host checks, plan resolver, apply/rollback, guest bootstrap, destruction, and evidence runner,
- dedicated architecture, status, owner, developer, runbook, test, threat, failure-injection, audit, and Parts & Pieces documentation.

### Not live or not proven

- current-head TypeScript, .NET, and PowerShell execution evidence,
- supported reviewed Hyper-V provider integrated behind `FieldProvisioner`,
- actual VM creation and isolation evidence,
- base-image immutability and destruction-confinement evidence,
- real host/guest transport, persistent replay state, and key rotation,
- running guest bootstrap and heartbeat service,
- live Windows scene producer,
- real Teach input/UI Automation hooks and visible recorder UI,
- visual capture/blob store and deletion evidence,
- demonstration segmentation/retrieval or actual Shadow predictor,
- personal task, motor, typing, language, or timing models,
- live filesystem/cross-VM artifact transfer,
- credential broker,
- Pilot integration into the Windows policy/execution loop,
- connected ChatGPT-to-Field acceptance,
- installer, signing, updater, penetration test, or production operations.

## Evidence boundary

The single-agent Glove core has bounded Windows Sandbox evidence for semantic mutation, pointer movement, click, Unicode text input, `CTRL+A`, local approvals, emergency-stop interruption, and independently verified audit chains.

The Field has source contracts, fake/pure implementations, scripts, and tests written. That does **not** prove Hyper-V isolation, live recording, behavioral learning, or autonomous operation.

GitHub-hosted workflow jobs for the draft branch have repeatedly failed before checkout with zero allocated steps and no job logs. The repository does not mislabel runner/account failures as passing or failing code tests. Exact executable branch validation remains required.

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
  - verification, recovery, audit
                 |
        authenticated Field boundary
                 v
       Exosuit Glove Agent in guest
  - fresh Windows UI Automation
  - optional bounded visual state
  - deterministic local policy
  - typed guest command authorization
  - local reflex and motor control
  - verification and emergency stop
                 |
                 v
           Exosuit Field VM
  - immutable parent base VHDX
  - disposable OS differencing overlay
  - optional persistent personal state
  - separate disposable task disk
  - fixed display contract
  - Teach / Shadow / Pilot lifecycle
```

The host must not control the guest by treating VMConnect or an RDP viewer as the guest desktop. One Glove agent runs inside every controlled Windows session or VM.

## Field modes

### Teach

The owner controls the Field. The Glove records consent-bound task, input, visual, accessibility, system, correction, and outcome evidence. It does not inject input. The state machine and storage exist; live hooks and visible UI do not.

### Shadow

The owner controls the Field. The Glove predicts the next intent, target, method, timing class, and expected result. It does not inject input. Prediction schemas and metrics exist; an actual predictor/runtime does not.

### Pilot

An authorized pilot controls the Field through the Glove within a host-created, signed, bounded policy. Guest command authorization exists as a pure module; it is not wired into a live agent or enabled.

## Current MCP surface

The current MCP surface remains the existing Glove desktop and coordinator tools. No model-facing Field administration, policy, consent, recording, provisioning, key-management, deletion, sensitive-export, or raw Hyper-V tool is enabled.

A model cannot administer the Field. Future read/status tools must preserve that boundary.

## Safety defaults

| Capability | Default |
|---|---|
| Glove desktop provider | fake |
| real Windows mode | observe |
| physical input | disabled |
| screenshots | disabled; no Windows capture implementation |
| Field provisioning scripts | dry-run/no apply unless exact local confirmation |
| filtered NAT | apply held |
| host clipboard/broad drive mapping/host input | disabled |
| base image | immutable parent only |
| runtime OS state | disposable differencing overlay |
| Teach recording | source state machine only; live hooks disabled |
| Shadow | schemas/metrics only; execution literal false |
| Pilot Field autonomy | denied |
| Field administration by model | blocked |
| credentials and secret-bearing controls | hard denied |
| arbitrary shell through MCP, Field plan, or guest command | excluded |
| ordinary sensitive/untrusted artifact export | blocked |

## Validation

Install dependencies with scripts disabled, then run:

```bash
npm install --ignore-scripts
npm run validate:field
npm run validate:typescript
```

On Windows, use the evidence-preserving runner:

```powershell
./scripts/windows/Invoke-ExosuitFieldValidation.ps1
```

Individual commands include:

```bash
npm run validate:repository
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

Do not enable real Field operation outside the sequence in [`docs/FIELD_WINDOWS_RUNBOOK.md`](docs/FIELD_WINDOWS_RUNBOOK.md).

## Planning, manuals, and evidence

### Shared and Glove

- [Glove/Field boundary](docs/GLOVE_FIELD_BOUNDARY.md)
- [Master system roadmap](docs/MASTER_SYSTEM_ROADMAP.md)
- [Implemented Glove architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Glove test plan](docs/TEST_PLAN.md)
- [Codex/local acceptance handoff](docs/CODEX_HANDOFF.md)

### Field

- [Field implementation status](docs/FIELD_IMPLEMENTATION_STATUS.md)
- [Field architecture](docs/FIELD_ARCHITECTURE.md)
- [Field owner manual](docs/FIELD_OWNER_MANUAL.md)
- [Field developer manual](docs/FIELD_DEVELOPER_MANUAL.md)
- [Field test plan](docs/FIELD_TEST_PLAN.md)
- [Windows and Hyper-V runbook](docs/FIELD_WINDOWS_RUNBOOK.md)
- [Field threat model](docs/qa/FIELD_THREAT_MODEL.md)
- [Field failure-injection matrix](docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md)
- [Glove/Field Parts traceability](docs/qa/GLOVE_FIELD_PARTS_TRACEABILITY.md)
- [Field foundation audits](docs/qa/ATOMIC_AUDIT_2026-07-21_GLOVE_FIELD_FOUNDATION.md)
- [Field expansion audit](docs/qa/ATOMIC_AUDIT_2026-07-21_FIELD_FOUNDATION_EXPANSION.md)

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
- **Live Field VM:** unproven and disabled
- **Teach/Shadow/Pilot runtime:** disabled
- **Connected ChatGPT Field acceptance:** pending
- **Packaging, signing, updater, release rollback, privacy operations, penetration testing, and production support:** pending
