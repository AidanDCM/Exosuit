# Exosuit

Exosuit is a private, model-independent computer body for authorized AI pilots such as ChatGPT or Claude. It exposes narrow MCP tools while the local Windows runtime owns sensing, policy, approval, execution, verification, audit, deadlines, and emergency stopping.

The design goal is not hidden automation. It is **human flexibility, machine precision, and local user authority**.

## Current status

**GitHub validated; local Windows acceptance required.**

The repository currently includes:

- a tool-only MCP server suitable for OpenAI Secure MCP Tunnel,
- a real MCP client/server protocol integration test,
- fake desktop provider for deterministic CI,
- Windows UI Automation sensing and semantic actions,
- sanitized versioned application maps,
- proposal → policy → local approval → fresh recheck → execution → verification,
- immutable approval fingerprints,
- gateway and provider deadlines,
- dual tamper-evident audit ledgers,
- prompt-injection and loop guards,
- local control panel and emergency stop,
- transparent standard-Windows pointer, click, Unicode typing, and hotkey motor code,
- restart-only and allowlist-only physical-input activation,
- GitHub-hosted Linux and Windows build/test workflows,
- npm and NuGet vulnerability audits,
- owner, developer, security, architecture, test, audit, roadmap, and Codex handoff manuals.

The repository is **not approved for production use**, real accounts, consequential actions, or normal personal desktops until the required local and later roadmap promotion gates are completed.

## Planning authority

`docs/MASTER_SYSTEM_ROADMAP.md` is the authoritative future plan. It defines:

- multi-window workflow coordination,
- focus leasing and per-window locking,
- structured data transfer between applications,
- Windows virtual-desktop awareness,
- multiple VM/session agents,
- browser semantic companion architecture,
- privacy-preserving visual fallback,
- approved skills,
- operator cockpit,
- persistence and crash recovery,
- performance targets,
- signed packaging and rollback,
- production security review,
- cross-platform expansion.

`docs/ARCHITECTURE.md` describes what is implemented now. It must not be used as a substitute roadmap.

## Architecture

```text
ChatGPT / Claude / MCP host
            |
     private MCP tools
            v
TypeScript gateway
  - contracts
  - application memory
  - prompt-injection/loop guards
  - gateway deadline
  - gateway audit
            |
 authenticated loopback HTTP
            v
.NET Windows agent
  - fresh UI Automation state
  - deterministic policy
  - local approval fingerprints
  - provider deadlines
  - verification
  - local audit
  - emergency stop
            |
      provider adapters
  +---------+------------------+
  |                            |
fake sandbox              Windows UIA
                               |
                    optional local motor
                    standard Windows APIs
```

MCP carries intentions, not one cursor coordinate per animation frame. The local runtime handles motor interpolation and immediate interruption.

The current implementation coordinates one bounded proposal at a time through one agent. Multi-window workflows, virtual desktops, and multiple VM/session agents are planned but not yet implemented.

## MCP tools

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

Stored application maps are advisory memory only. They must be matched against a fresh observation before their current element IDs can be used.

## Safety defaults

| Capability | Default |
|---|---|
| provider | fake |
| fake mode | sandbox |
| Windows mode | observe |
| bind address | `127.0.0.1` |
| screenshots | disabled and not implemented in the Windows provider |
| physical input | disabled |
| full control | disabled; restart-only; cannot be enabled by MCP or the panel |
| credentials/secrets | hard denied |
| destructive targets | hard denied |
| unknown actions | denied |
| real semantic actions | local review |
| physical actions | critical risk + exact local typed review |

Physical input requires all exact local startup settings plus a non-empty process allowlist. Every physical action then requires a fresh active target window; pointer coordinates must be inside that window, and physical text requires a fresh enabled, visible, focused target field.

## Quick GitHub-safe validation

```bash
npm install --ignore-scripts
npm run typecheck
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
```

On Windows:

```powershell
dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release -warnaserror
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

Do not enable the Windows provider or physical input until following `docs/CODEX_HANDOFF.md` in a disposable Windows environment.

## Manuals and evidence

- [Master system roadmap](docs/MASTER_SYSTEM_ROADMAP.md)
- [Current architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Test plan](docs/TEST_PLAN.md)
- [Secure MCP Tunnel runbook](docs/SECURE_MCP_TUNNEL_RUNBOOK.md)
- [Codex local handoff](docs/CODEX_HANDOFF.md)
- [Parts & donor traceability](docs/qa/PARTS_AND_DONOR_TRACEABILITY.md)
- [GitHub phase final audit](docs/qa/GITHUB_PHASE_FINAL_AUDIT.md)
- [Issue and solution log](docs/logs/ISSUE_AND_SOLUTION_LOG.md)
- [Decision log](docs/logs/DECISION_LOG.md)

## Explicit exclusions

Exosuit must not implement or claim:

- stealth or undetectable automation,
- anti-bot or anti-cheat evasion,
- kernel or hardware impersonation for concealment,
- credential harvesting,
- privilege escalation,
- arbitrary remote shell execution,
- covert surveillance or recording,
- bypassing platform or application security controls.

## Next approved sequence

1. Validate the current core through the isolated Codex Windows and ChatGPT acceptance procedure.
2. Return to GitHub for the Multi-window Workspace Coordinator.
3. Validate multi-window behavior locally.
4. Build Windows virtual-desktop awareness.
5. Build the multi-agent/VM supervisor.

The exact dependencies, evidence gates, and later phases are maintained in `docs/MASTER_SYSTEM_ROADMAP.md`. The product PR remains draft until `docs/qa/CODEX_WINDOWS_ACCEPTANCE.md` is completed with evidence.
