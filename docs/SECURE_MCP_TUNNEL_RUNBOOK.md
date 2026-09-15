# Secure MCP Tunnel Runbook

**Purpose:** Connect the private local Exosuit stdio MCP server to a developer-mode ChatGPT app without opening an inbound port or publishing the desktop agent.

**Source of truth:** Current OpenAI Secure MCP Tunnel and ChatGPT Apps SDK documentation. Re-check those pages during Codex validation because tunnel-client flags and product UI can change.

## Architecture

```text
ChatGPT developer-mode app
        |
OpenAI Secure MCP Tunnel control plane
        |
outbound HTTPS from tunnel-client
        |
local stdio command: npm run start:mcp
        |
TypeScript Exosuit gateway
        |
authenticated, time-bounded loopback HTTP
        |
.NET Windows agent
```

The tunnel reaches the MCP gateway, not the Windows agent. The Windows agent remains bound to loopback and protected by `EXOSUIT_AGENT_TOKEN`.

## Preconditions

- Windows agent and MCP gateway built from the reviewed commit.
- Node.js 22 or newer.
- .NET 8 runtime/SDK.
- A tunnel ID created in OpenAI Platform tunnel settings.
- A runtime API key intended for tunnel-client.
- The Platform organization and ChatGPT workspace/account association accepted by the current OpenAI tunnel setup.
- Developer mode enabled in ChatGPT.
- Fake-provider smoke test completed before the Windows provider is used.
- The full GitHub and Codex evidence boundaries understood.

## Secrets

Never commit:

- runtime API keys,
- real `EXOSUIT_AGENT_TOKEN` values,
- generated tunnel-client profiles containing credentials,
- audit logs containing private desktop context,
- application maps from unapproved applications,
- screenshots.

Store runtime values in the local environment or the tunnel-client's approved secret store.

## Build and fake-provider smoke test

From the repository root:

```powershell
npm ci --ignore-scripts
npm run typecheck
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
```

Start the .NET agent in fake mode:

```powershell
$env:EXOSUIT_AGENT_TOKEN = '<random-local-token-at-least-32-characters>'
$env:EXOSUIT_PROVIDER = 'fake'
$env:EXOSUIT_ENABLE_PHYSICAL_INPUT = 'false'
$env:EXOSUIT_ENABLE_SCREENSHOTS = 'false'
dotnet run --project apps/windows-agent/Exosuit.Agent.csproj
```

Start the gateway in another terminal:

```powershell
$env:EXOSUIT_AGENT_MODE = 'http'
$env:EXOSUIT_AGENT_URL = 'http://127.0.0.1:43117'
$env:EXOSUIT_AGENT_TOKEN = '<same-random-local-token>'
$env:EXOSUIT_GATEWAY_REQUEST_TIMEOUT_MS = '20000'
npm run start:mcp
```

Do not use a tunnel yet. Confirm both processes are healthy locally first.

## Initialize tunnel-client for stdio

Use the current tunnel-client release and built-in help. Do not hard-code a release URL in automation.

Representative setup using placeholders:

```powershell
$env:CONTROL_PLANE_API_KEY = '<runtime-api-key>'

tunnel-client init `
  --sample sample_mcp_stdio_local `
  --profile exosuit-local-stdio `
  --tunnel-id '<tunnel-id>' `
  --mcp-command 'npm run start:mcp'

tunnel-client doctor --profile exosuit-local-stdio --explain
tunnel-client run --profile exosuit-local-stdio
```

Run tunnel-client from the reviewed repository root. Confirm the tunnel-client process receives the required `EXOSUIT_AGENT_*` variables without printing their values.

## ChatGPT developer-mode app

1. In ChatGPT web, enable Developer mode under the current settings location.
2. Open developer-mode app management.
3. Create a new app and select **Tunnel**.
4. Choose the tunnel/profile associated with this Exosuit instance.
5. Description: `Private local desktop embodiment runtime. Observe first; stored maps are advisory; propose exact actions; local policy and approval remain authoritative.`
6. Set app permissions to **Always ask** for initial acceptance testing.
7. Start a new conversation and explicitly select the Exosuit app.

## Exact expected tool allowlist

Phase 1 acceptance runs the default `core` surface. **ChatGPT must discover exactly these thirteen tools and nothing else.**

Leave `EXOSUIT_MCP_SURFACE` unset, or set it explicitly:

```powershell
$env:EXOSUIT_MCP_SURFACE = 'core'
```

Desktop core, thirteen tools registered by `src/mcp.ts` and `src/motorMcp.ts`:

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

Stop if any tool is missing or an unexpected tool appears. Review the commit and MCP server before continuing. **Count the discovered tools; thirteen is correct for Phase 1.**

If you see twenty-seven, the coordinator surface is enabled. Stop, confirm `EXOSUIT_MCP_SURFACE` is unset or `core`, restart the gateway, and reconnect before continuing. Do not proceed through Phase 1 against the coordinator surface: it is `in_progress` in the master roadmap with no hosted CI and no interactive evidence.

The gateway prints its surface on startup, so verify before connecting ChatGPT:

```text
Exosuit MCP server connected over stdio. MCP surface: core (desktop core only; coordinator tools are not exposed). ...
```

### Coordinator surface, not part of Phase 1

Setting `EXOSUIT_MCP_SURFACE=full` additionally exposes fourteen coordinator tools registered by `src/coordinatorMcp.ts`: `desktop_refresh_workspace`, `desktop_get_workspace`, `desktop_list_windows`, `desktop_create_workflow`, `desktop_list_workflows`, `desktop_get_workflow`, `desktop_run_next_workflow_step`, `desktop_continue_approved_workflow_step`, `desktop_pause_workflow`, `desktop_resume_workflow`, `desktop_cancel_workflow`, `desktop_list_workflow_artifacts`, `desktop_get_workflow_audit`, and `desktop_list_agents`.

That surface belongs to Phase 2 acceptance and has its own promotion gate. An unrecognized `EXOSUIT_MCP_SURFACE` value fails startup rather than defaulting.

`tests/documentedToolSurface.test.ts` asserts the list above against the tools actually registered on the `core` surface, discovered over a real client/server transport pair. It fails if this section and the server disagree in either direction, and separately asserts that no coordinator tool is reachable on `core`.

Two of these tools can execute, but there is one authoritative execution path: `desktop_execute_proposal` and `desktop_execute_physical_proposal` both reach the same orchestrator method and the same single agent execute endpoint. `desktop_execute_physical_proposal` accepts a proposal ID only and cannot supply an approval token. `desktop_propose_physical_input` can only create a proposal; it cannot enable full control or bypass the local typed approval.

## Fake-provider acceptance sequence

Run each step separately and inspect the local panel/audit after every step.

1. `Get Exosuit status. Do not take any action.`
2. `Observe the fake desktop and list the active window and accessible elements.`
3. `Build a sanitized application map for fake Notepad.`
4. `List and retrieve that application map.`
5. `Freshly match the map to fake Notepad.`
6. Confirm that a physical-input proposal is blocked in sandbox mode.
7. `Propose setting the fake document text to Exosuit validation successful. Do not execute yet.`
8. Review the proposal locally if review is required.
9. Execute only the exact returned proposal.
10. Verify the result and inspect both audit tails.
11. Trigger emergency stop.
12. Confirm a later mutation proposal is blocked.

## Windows-provider promotion

Do not promote directly from fake provider to physical input.

### Observe-only

1. Enable the Windows provider with its exact local acknowledgement.
2. Keep mode `observe` and physical input/screenshots disabled.
3. Validate window and UI Automation element discovery only.
4. Build and inspect a Notepad application map.
5. Close/reopen Notepad and freshly match the map.

### Scoped semantic action

1. Add Notepad to the process allowlist.
2. Change mode locally to `scoped`.
3. Propose one semantic value-set action.
4. Approve it locally.
5. Verify the exact value through UI Automation.
6. Test wrong-window denial.
7. Test emergency stop.

### Physical input

Only after the preceding phases pass, restart with every exact full-control setting documented in `docs/CODEX_HANDOFF.md`.

1. Keep only Notepad/Calculator allowlisted.
2. Confirm the panel visibly warns that physical input is armed.
3. Test one harmless pointer move.
4. Test one in-window click.
5. Test physical text only in a fresh focused disposable field.
6. Test one harmless documented hotkey.
7. Test process, window, coordinates, focus, expiry, fingerprint, timeout, and emergency-stop denials.

Raw physical input must never be tested against credentials, authentication, financial, messaging, purchase, production, or destructive surfaces.

## Failure handling

- If tunnel-client is unhealthy, stop; do not improvise a public tunnel.
- If ChatGPT discovers an unexpected tool, stop and review the MCP commit.
- If the local agent token fails, rotate it and restart both local processes.
- If verification is failed or partial, do not continue automatically.
- If the active window changes unexpectedly, emergency-stop.
- If an unfocused field receives text, terminate the agent and return to GitHub review.
- If the audit chain fails verification, preserve files for forensic review; do not silently reset history.
- If any screenshot is captured, stop; Windows screenshot support is not approved in this version.

## Evidence to retain

- reviewed commit SHA,
- clean working-tree output,
- tunnel-client `doctor` output with secrets removed,
- exact discovered tool list,
- app permission level,
- local agent status before and after tests,
- application-map privacy inspection,
- proposal/result IDs,
- verification outcomes,
- redacted audit tails and chain verification,
- negative-test results,
- emergency-stop latency,
- unresolved issues.

Do not retain screenshots or private UI content.
