# Secure MCP Tunnel Runbook

**Purpose:** Connect the private local Exosuit stdio MCP server to a developer-mode ChatGPT app without opening an inbound port or publishing the desktop agent.

**Source of truth:** Current OpenAI Secure MCP Tunnel and ChatGPT Apps SDK connection documentation. Re-check those pages during Codex validation because tunnel-client flags and product UI can change.

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
authenticated loopback HTTP
        |
.NET Windows agent
```

The tunnel reaches the MCP gateway, not the Windows agent. The Windows agent remains bound to loopback and protected by `EXOSUIT_AGENT_TOKEN`.

## Preconditions

- Windows agent and MCP gateway code built from the reviewed commit.
- Node.js 22 or newer.
- .NET 8 runtime/SDK.
- A tunnel ID created in OpenAI Platform tunnel settings.
- A runtime API key intended for tunnel-client.
- The Platform organization and ChatGPT workspace/account association accepted by the OpenAI tunnel setup.
- Developer mode enabled in ChatGPT.
- Fake-provider smoke test completed before the Windows provider is used.

## Secrets

Never commit:

- runtime API keys,
- tunnel IDs tied to a real account unless the ID is explicitly classified as non-secret,
- `EXOSUIT_AGENT_TOKEN`,
- generated tunnel-client profile files if they contain credentials,
- audit logs containing private desktop context.

Store runtime values in the local environment or the tunnel-client's approved secret store.

## Build and fake-provider smoke test

From the repository root:

```powershell
npm install --ignore-scripts
npm run typecheck
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
```

Start the .NET agent in fake mode in one terminal:

```powershell
$env:EXOSUIT_AGENT_TOKEN = '<random-local-token-at-least-32-characters>'
$env:EXOSUIT_PROVIDER = 'fake'
dotnet run --project apps/windows-agent/Exosuit.Agent.csproj
```

Start the MCP gateway in another terminal:

```powershell
$env:EXOSUIT_AGENT_MODE = 'http'
$env:EXOSUIT_AGENT_URL = 'http://127.0.0.1:43117'
$env:EXOSUIT_AGENT_TOKEN = '<same-random-local-token>'
npm run start:mcp
```

Do not use a tunnel yet. First inspect both processes locally and confirm the fake system path is healthy.

## Initialize tunnel-client for stdio

Use the current tunnel-client release and its built-in help. Do not hard-code a release URL in automation.

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

Run tunnel-client from the repository root, or use an absolute command that first changes to the reviewed checkout. Confirm the tunnel-client environment also contains the three `EXOSUIT_AGENT_*` variables required by the stdio MCP process.

## ChatGPT developer-mode app

1. In ChatGPT web, enable Developer mode under the current security/login settings location.
2. Open the developer-mode plugin/app management page.
3. Create a new app and select **Tunnel**.
4. Choose the tunnel/profile associated with this Exosuit instance.
5. Use a clear description: `Private local desktop embodiment runtime. Observe first; propose exact semantic actions; local policy and approval remain authoritative.`
6. Confirm ChatGPT discovers only the expected narrow tools:
   - `desktop_get_status`
   - `desktop_observe`
   - `desktop_find_elements`
   - `desktop_propose_action`
   - `desktop_execute_proposal`
   - `desktop_emergency_stop`
   - `desktop_get_audit_log`
7. Set the app permission level to **Always ask** for first acceptance testing.
8. Start a new conversation and explicitly select the Exosuit app.

## Acceptance sequence

Run each step separately and inspect the local control panel/audit after every step.

1. `Get Exosuit status. Do not take any action.`
2. `Observe the fake desktop and list the active window and accessible elements.`
3. `Find the Document text element. Do not modify it.`
4. `Propose setting the fake document text to Exosuit validation successful. Do not execute yet.`
5. Review the proposal locally.
6. Execute only the exact returned proposal.
7. Verify the returned result and inspect both audit tails.
8. Trigger emergency stop.
9. Confirm a later mutation proposal is blocked.

## Windows-provider promotion

Do not promote directly from fake provider to broad desktop control.

Use a disposable Windows account or VM and this order:

1. Enable the Windows provider with its exact local acknowledgement variable.
2. Keep mode `Observe` and screenshots disabled.
3. Validate window and UI Automation element discovery only.
4. Add Notepad to the local process allowlist.
5. Change mode locally to `Scoped`.
6. Propose one semantic value-set action.
7. Approve it locally.
8. Verify the exact value through UI Automation.
9. Test wrong-window denial.
10. Test emergency stop and process termination fallback.

Raw pointer/keyboard input and screenshot capture are separate future slices and must not be enabled during this acceptance sequence.

## Failure handling

- If tunnel-client is unhealthy, stop; do not expose the service through an improvised public tunnel.
- If ChatGPT discovers an unexpected tool, stop and review the MCP server commit.
- If the local agent token fails, rotate it and restart both local processes.
- If verification is failed or partial, do not continue automatically.
- If the active window changes unexpectedly, use emergency stop.
- If the audit chain fails verification, preserve the files and enter forensic review; do not silently reset history.

## Evidence to retain

- reviewed commit SHA,
- tunnel-client `doctor` output with secrets removed,
- discovered tool list,
- local agent status before and after the test,
- proposal and result IDs,
- redacted audit tail,
- emergency-stop result,
- failed/blocked negative tests,
- exact ChatGPT app permission level.

Do not retain screenshots unless the separate screenshot privacy slice has been reviewed and enabled.
