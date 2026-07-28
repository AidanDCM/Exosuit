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

### Hosted CI is blocked by account billing, not by this repository

GitHub-hosted workflow jobs fail before checkout with no steps allocated. **The cause is account billing, not workflow configuration.** Every job in every workflow carries the same GitHub annotation:

> The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings

`.github/workflows/runner-smoke.yml` isolates this. Its only steps echo a line, and both its `ubuntu-latest` and `windows-latest` jobs fail identically with that annotation. A workflow that does nothing but request a runner cannot fail for a configuration reason, so YAML, `runs-on` labels, job dependencies, caching, and lockfiles are all excluded.

**Do not attempt to fix this by editing workflows.** Several past commits changed the detection gate, job independence, and npm cache settings while chasing this; none could have worked. The fix is in GitHub account settings under Billing & plans: resolve the failed payment or raise the Actions spending limit. This repository is private, so Actions draws on a monthly free-minutes allowance, and `windows-latest` bills at roughly twice the Linux rate.

Until billing is restored, hosted CI is unavailable and no hosted evidence may be claimed. Run the reproducible local validation chain and attach exact evidence instead:

```bash
npm run validate:typescript
```

Re-run `runner-smoke.yml` from the Actions tab to check whether billing has been restored. It is the cheapest available probe; keep it.

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

The exposed surface is selected by `EXOSUIT_MCP_SURFACE`:

| Value | Tools exposed |
|---|---|
| unset or `core` (default) | desktop core only, 13 tools |
| `full` | desktop core plus coordinator, 27 tools |

`core` is the default because the coordinator is `in_progress` with no hosted CI and no interactive evidence, and `docs/CODEX_HANDOFF.md` requires that a tunnel session discover only reviewed tools. An unrecognized value fails startup rather than defaulting. The gateway prints its surface on startup.

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

The desktop core is thirteen tools. Both execution tools route through one authoritative execution path and one local policy path; the physical variant cannot supply an approval token.

### Coordinator

Requires `EXOSUIT_MCP_SURFACE=full`. Not exposed by default and not part of Phase 1 acceptance.

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
| MCP surface | `core`; coordinator tools require explicit `EXOSUIT_MCP_SURFACE=full` |
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

### If `dotnet --list-sdks` reports no SDKs

Check for a user-local install before concluding the SDK is missing:

```powershell
& "$env:USERPROFILE\.dotnet\dotnet.exe" --list-sdks
```

A machine can carry two .NET installs: a user-local one at `%USERPROFILE%\.dotnet` that has the SDK, and a hostfxr-only one at `C:\Program Files\dotnet` that does not. If the Program Files path comes first on `PATH`, `dotnet --list-sdks` returns empty and the SDK looks absent while it is installed and usable.

This cost two development sessions, which recorded ".NET tests: not run because no .NET SDK is installed" when the tests were runnable the whole time. Either put `%USERPROFILE%\.dotnet` ahead on `PATH`, or invoke that binary by full path.

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
