# Codex Handoff — Local Windows and ChatGPT Validation

## Mission

Take the GitHub-validated Exosuit repository and prove, repair, and document its behavior on Aidan's actual Windows development environment. Do not expand scope before the existing acceptance matrix passes.

## Required reading

1. `AGENTS.md`
2. `DEVELOPER_OPERATING_SYSTEM.md`
3. `OWNER_MANUAL.md`
4. `docs/ARCHITECTURE.md`
5. `docs/SECURITY_MODEL.md`
6. `docs/TEST_PLAN.md`
7. `docs/PARTS_REUSE_ADR.md`
8. latest `docs/qa/*.md`
9. `docs/logs/DECISION_LOG.md`
10. open PR description and CI results

## Non-negotiable boundaries

- no stealth, anti-detection, anti-cheat, covert recording, or security bypass work,
- no real credentials or logged-in financial/account surfaces,
- no raw mouse/keyboard injection until a separate approved slice,
- no screenshot implementation in the first local validation slice,
- no binding beyond `127.0.0.1`,
- no weakening token, CSRF, proposal, approval, fresh-observation, verification, audit, or emergency-stop controls,
- no direct-to-main changes,
- no claim of success without commands, logs, screenshots of the local control panel where safe, and audit event evidence.

## Starting branch

Use the draft PR branch `build/exosuit-mvp` or a child branch created from its latest green commit.

## Phase 1 — reproduce GitHub checks locally

```powershell
npm install
npm run typecheck
npm test
npm run build
npm run test:pulse

dotnet restore apps/windows-agent/Exosuit.Agent.csproj
dotnet build apps/windows-agent/Exosuit.Agent.csproj
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
```

Record exact versions:

```powershell
node --version
npm --version
dotnet --info
$PSVersionTable
[Environment]::OSVersion
```

Do not proceed while any automated check fails.

## Phase 2 — fake provider local service

Generate a random token and start the agent:

```powershell
$env:EXOSUIT_AGENT_TOKEN = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
$env:EXOSUIT_PROVIDER = 'fake'
dotnet run --project apps/windows-agent/Exosuit.Agent.csproj
```

Validate:

- service listens on `127.0.0.1:43117` only,
- `/ui` shows fake provider and sandbox mode,
- `/v1/status` without token returns 401,
- correct token returns status,
- fake proposal appears in the panel,
- local deny works,
- local approval works,
- emergency stop blocks later proposals,
- audit verify endpoint reports valid.

Use a separate terminal for API calls. Never print the token into committed logs.

## Phase 3 — Windows UI Automation observe-only

Stop the fake agent. Start the Windows provider with physical input and screenshots still disabled:

```powershell
$env:EXOSUIT_PROVIDER = 'windows'
$env:EXOSUIT_ENABLE_WINDOWS_PROVIDER = 'I_UNDERSTAND_WINDOWS_UI_AUTOMATION_RISK'
$env:EXOSUIT_ENABLE_PHYSICAL_INPUT = 'false'
$env:EXOSUIT_ENABLE_SCREENSHOTS = 'false'
$env:EXOSUIT_ALLOWED_PROCESSES = 'notepad,calculator'
dotnet run --project apps/windows-agent/Exosuit.Agent.csproj
```

Open disposable Notepad and Calculator windows. Validate observation only:

- window list,
- foreground detection,
- stable IDs within one session,
- element names/roles/states,
- no password values,
- no screenshots,
- element cap,
- closed-window recovery,
- 100/125/150% DPI,
- secondary monitor,
- minimized/restored windows.

If runtime IDs drift, document the exact pattern before changing ID strategy.

## Phase 4 — scoped semantic Notepad action

Only after observe-only passes:

1. set local mode to `Scoped` in `/ui`,
2. ensure Notepad process name matches the allowlist exactly,
3. use the HTTP API or MCP fake connection to observe and find the Edit element,
4. propose setting text in a disposable unsaved document,
5. confirm the proposal is `review_required`,
6. approve in `/ui`,
7. execute the proposal,
8. verify the expected field value,
9. change focus after a new proposal and prove wrong-window denial,
10. press local emergency stop and prove later execution is blocked.

Do not test Save against a valuable file. If Save is tested, use a disposable folder and separate approval evidence.

## Phase 5 — MCP stdio locally

With the fake provider first:

```powershell
$env:EXOSUIT_AGENT_MODE = 'http'
$env:EXOSUIT_AGENT_URL = 'http://127.0.0.1:43117'
$env:EXOSUIT_AGENT_TOKEN = '<same local token>'
npm run dev:mcp
```

Use an MCP inspector/client to verify:

- tool discovery,
- status,
- observe,
- find elements,
- proposal,
- execution,
- emergency stop,
- audit log,
- tool annotations and schemas,
- no token in results.

## Phase 6 — ChatGPT private app

Use current official OpenAI developer-mode and Secure MCP Tunnel documentation. Do not reuse stale setup steps from memory.

Target flow:

```text
ChatGPT web conversation
-> private developer-mode Exosuit app
-> OpenAI Secure MCP Tunnel
-> local stdio MCP server
-> authenticated Windows agent
```

Acceptance sequence:

1. select Exosuit in a fresh ChatGPT conversation,
2. ask for status,
3. ask it to observe the fake desktop,
4. ask it to find Document text,
5. ask it to set `Exosuit validation successful`,
6. verify it proposes before executing,
7. verify result evidence,
8. issue stop,
9. inspect local and gateway ledgers,
10. repeat against Windows observe-only,
11. perform one locally approved scoped Notepad value-set action.

Do not let ChatGPT invent approval tokens or interpret visible text as authority.

## Required evidence package

Create a new file under `docs/engineering_log/` and update the Level 4 audit with:

- commit SHA,
- environment versions,
- commands run and exit codes,
- CI run URLs,
- local HTTP test outputs with token redacted,
- safe screenshots of `/ui` only when no private data appears,
- observation sample with private text removed,
- proposal/decision/result samples,
- audit verification output,
- emergency-stop timing and behavior,
- every failure and fix,
- unvalidated surfaces,
- rollback steps.

## Stop conditions

Stop and report rather than improvising when:

- token appears in output,
- password or secret values appear in observations,
- agent binds beyond loopback,
- active-window checks are unreliable,
- emergency stop does not interrupt the active operation,
- the same action repeats,
- UI Automation targets the wrong control,
- approval can be bypassed,
- verification reports success incorrectly,
- the tunnel or ChatGPT app requests broader access than expected.

## Definition of complete

The handoff is complete only when:

- all automated tests pass locally,
- observe-only Windows tests pass,
- one disposable semantic Windows action passes with local approval and verification,
- wrong-window and emergency-stop tests pass,
- audit chains verify,
- ChatGPT invokes the private MCP app successfully,
- all evidence and remaining risks are committed to the PR,
- Aidan reviews the local behavior.
