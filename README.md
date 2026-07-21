# Exosuit

Exosuit is a private, model-independent computer body for authorized AI pilots such as ChatGPT or Claude. The pilot supplies intent; the local runtime owns sensing, policy, approval, scheduling, execution, verification, audit, deadlines, persistence, and emergency stopping.

The goal is **human flexibility, machine precision, transparent operation, and local user authority**—not hidden automation.

## Current status

**Strong single-agent Windows core with bounded live acceptance; multi-window and later product foundations are in active development. Production use remains denied.**

The current branch includes:

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
- narrow MCP workflow create/read/run/pause/resume/cancel tools,
- virtual-desktop identity, availability, transition, and local switch-intent foundations,
- multi-agent health/capability registry and authenticated replay-resistant registration foundations,
- transparent browser semantic companion contracts and mock provider,
- disabled-by-default synthetic visual privacy/consent foundation,
- signed bounded skill-manifest and permission-upgrade foundation,
- quotas, queue backpressure, and latency percentile foundations.

### Evidence boundary

The single-agent Windows core has bounded Windows Sandbox evidence for semantic mutation, pointer movement, click, Unicode text input, `CTRL+A`, local approvals, emergency-stop interruption, and independently verified audit chains.

The newer workflow, virtual-desktop, multi-agent, browser, visual-policy, skill, and resource-governance slices are GitHub-source implementations with focused local reconstruction tests. They are **not** yet approved as interactive Windows, connected ChatGPT, multi-window, virtual-desktop, multi-agent, browser-extension, visual-capture, or production evidence.

As of the latest development cycle, GitHub-hosted workflow jobs are failing before checkout with no steps allocated. The repository does not mislabel that runner/account failure as passing hosted CI. Run the reproducible local validation command and attach exact evidence until hosted runners are available again.

## Architecture

```text
ChatGPT / Claude / another MCP host
                 |
          narrow MCP tools
                 v
       Exosuit Supervisor Gateway
  - single-action orchestrator
  - workflow DAG/runtime
  - workspace and agent registries
  - structured artifact/checkpoint stores
  - prompt-injection and loop guards
  - gateway deadlines and audit
                 |
       authenticated agent boundary
                 v
           .NET Windows agent
  - fresh UI Automation state
  - deterministic policy
  - local approval fingerprints
  - bounded provider operations
  - verification and local audit
  - emergency stop
                 |
      fake provider / Windows UIA
                 |
     optional locally gated motor
```

A single Windows session has one foreground focus and one physical mouse/keyboard stream. Exosuit may observe and plan across many windows, but physical actions are serialized through a focus lease. Genuine physical parallelism requires separate healthy agents inside separate Windows sessions or VMs.

## Current MCP surface

### Desktop core

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

Workflow tools do not approve their own work. Desktop steps still enter the ordinary proposal, local policy, approval, fresh observation, execution, and verification pipeline.

## Safety defaults

| Capability | Default |
|---|---|
| desktop provider | fake |
| fake mode | sandbox |
| Windows mode | observe |
| bind address | `127.0.0.1` |
| physical input | disabled |
| full control | restart-only; cannot be enabled by MCP or the panel |
| screenshots | disabled; no Windows capture implementation |
| visual policy | disabled; synthetic foundation only |
| browser companion | mock/contracts only; no installed extension |
| remote agents | registry/auth contracts only; no production transport |
| skills | signed registry foundation only; execution not enabled |
| credentials and secret-bearing controls | hard denied |
| destructive targets | hard denied |
| real semantic actions | local review |
| physical actions | critical risk + exact local typed confirmation |

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

The individual commands remain available:

```bash
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

Do not enable the Windows provider or physical input outside the disposable acceptance procedure in `docs/CODEX_HANDOFF.md`.

## Planning and evidence

- [Master system roadmap](docs/MASTER_SYSTEM_ROADMAP.md)
- [Implemented architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Test plan](docs/TEST_PLAN.md)
- [Secure MCP Tunnel runbook](docs/SECURE_MCP_TUNNEL_RUNBOOK.md)
- [Codex/local acceptance handoff](docs/CODEX_HANDOFF.md)
- [Parts and donor traceability](docs/qa/PARTS_AND_DONOR_TRACEABILITY.md)
- [GitHub-phase audit](docs/qa/GITHUB_PHASE_FINAL_AUDIT.md)
- [Issue and solution log](docs/logs/ISSUE_AND_SOLUTION_LOG.md)
- [Decision log](docs/logs/DECISION_LOG.md)

`docs/MASTER_SYSTEM_ROADMAP.md` controls future sequence and promotion gates. `docs/ARCHITECTURE.md` must describe only what exists.

## Explicit exclusions

Exosuit must not implement or claim:

- stealth or undetectable automation,
- anti-bot or anti-cheat evasion,
- kernel or hardware impersonation for concealment,
- credential harvesting,
- privilege escalation,
- arbitrary remote shell execution,
- covert surveillance or recording,
- bypassing application or platform security controls.

## Current holds

- **PR state:** draft
- **Merge to main:** hold
- **Production use:** denied
- **Real accounts or consequential targets:** denied
- **Normal personal desktop use:** denied
- **Connected ChatGPT acceptance:** pending
- **Interactive three-window validation:** pending
- **Native virtual-desktop validation:** pending
- **Multi-agent/VM transport validation:** pending
- **Browser extension and real browser execution:** pending
- **Windows visual capture:** unimplemented and disabled
- **Packaging, signing, updater, rollback, penetration testing, and release operations:** pending
