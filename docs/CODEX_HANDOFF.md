# Codex Local Validation Handoff

## Scope and roadmap boundary

This handoff validates **Phase 1 — Current core: interactive Windows and ChatGPT acceptance** from `docs/MASTER_SYSTEM_ROADMAP.md`.

It does not validate or imply implementation of:

- multi-window workflow scheduling,
- focus leases or per-window locks,
- native Windows virtual-desktop coordination,
- multiple VM/session agents,
- browser semantic companion,
- screenshot/vision fallback,
- approved workflow skills,
- production packaging or operations.

After this handoff passes, return to GitHub for Phase 2 Multi-window Workspace Coordinator. Do not improvise future roadmap phases inside the local acceptance session.

## Purpose

GitHub has validated the current Exosuit contracts, fake end-to-end chain, MCP protocol, Windows-targeted compilation, pure native tests, motor simulation, repository contract, and supported dependency-security gates. Codex must validate behavior that requires a real interactive Windows desktop and a live private ChatGPT app connection.

Start in a disposable Windows VM or dedicated local Windows account containing no real credentials, messages, financial data, browser sessions, private documents, or production files.

## Reviewed source

- Repository: `AidanDCM/Exosuit`
- Branch: `build/exosuit-mvp`
- Product PR: #1, draft
- Master roadmap: `docs/MASTER_SYSTEM_ROADMAP.md`
- GitHub evidence: `docs/qa/GITHUB_PHASE_FINAL_AUDIT.md`

Record the exact checkout SHA. Do not test an uncommitted or modified tree without documenting the diff.

## Phase 0 — Environment isolation

1. Create a disposable Windows user or VM snapshot.
2. Install Node.js 22 and .NET 8.
3. Clone the reviewed branch.
4. Confirm `git status --short` is empty.
5. Do not sign into personal browsers, email, banking, social media, stores, work systems, or password managers.
6. Create a dedicated directory containing disposable files only.
7. Keep Task Manager or a terminal ready to terminate the agent.
8. Keep the local Exosuit control panel visible during all action tests.

## Phase 1 — Reproduce GitHub gates locally

```powershell
npm ci --ignore-scripts
npm run typecheck
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose

dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release -warnaserror
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

Stop if any gate fails. Preserve logs and record the issue before changing code.

## Phase 2 — Fake-provider host

Set a random local token of at least 32 characters.

```powershell
$env:EXOSUIT_AGENT_TOKEN = '<random-local-token>'
$env:EXOSUIT_PROVIDER = 'fake'
$env:EXOSUIT_ENABLE_PHYSICAL_INPUT = 'false'
$env:EXOSUIT_ENABLE_SCREENSHOTS = 'false'
dotnet run --project apps/windows-agent/Exosuit.Agent.csproj
```

Validate:

- service binds only to `127.0.0.1`,
- missing/wrong token returns 401 for `/v1`,
- local panel loads,
- status is `sandbox`,
- physical input is false,
- screenshot capture is false,
- fake Notepad observation works,
- proposal → execute → verification works,
- emergency stop blocks later actions,
- audit chain verifies.

## Phase 3 — Windows observe-only provider

Restart with:

```powershell
$env:EXOSUIT_PROVIDER = 'windows'
$env:EXOSUIT_ENABLE_WINDOWS_PROVIDER = 'I_UNDERSTAND_WINDOWS_UI_AUTOMATION_RISK'
$env:EXOSUIT_ENABLE_PHYSICAL_INPUT = 'false'
$env:EXOSUIT_INITIAL_MODE = 'observe'
$env:EXOSUIT_FULL_CONTROL_ACK = ''
$env:EXOSUIT_ALLOWED_PROCESSES = 'notepad,calculator'
dotnet run --project apps/windows-agent/Exosuit.Agent.csproj
```

Open only Notepad and Calculator. Validate:

- status is `observe`,
- provider is Windows UI Automation,
- active window matches the foreground window,
- accessible names, roles, IDs, actions, bounds, enabled/focused/offscreen states are sensible,
- password/secret values are not returned,
- observation caps work,
- disappeared windows and controls produce bounded failures,
- mutation proposals are blocked,
- no physical cursor or keyboard action occurs.

Repeat at 100%, 125%, and 150% scaling and on a second monitor if available.

## Phase 4 — Application-map privacy and rematching

Using disposable Notepad:

1. Build a fresh application map.
2. Inspect persisted JSON.
3. Confirm no live values, runtime IDs, screenshots, plain window titles, tokens, or sensitive controls.
4. Close and reopen Notepad.
5. Freshly match the map.
6. Confirm current element IDs are returned.
7. Change the title and confirm a fingerprint warning.
8. Remove/change a target and confirm it remains unmatched.
9. Confirm matching never creates, approves, or executes an action.
10. Confirm later actions still pass fresh observation, policy, approval, deadline, and verification.

## Phase 5 — Scoped semantic action

Use the disposable `apps/windows-agent.AcceptanceFixture` application. The tested
Windows 11 Notepad editor exposes a `Document` without a writable `ValuePattern`,
so it is not a valid semantic `set_element_value` acceptance target. Passing this
fixture phase does not validate Notepad compatibility.

1. Change mode locally from `observe` to `scoped`.
2. Observe `Exosuit Disposable Acceptance Fixture` and resolve the
   `Exosuit acceptance text` field.
3. Propose setting `Exosuit semantic validation successful`.
4. Confirm local review is required.
5. Approve in the local panel.
6. Execute the exact proposal.
7. Confirm the value through UI Automation.
8. Change focus after preparing a second proposal and confirm wrong-window denial.
9. Close the target after preparing a proposal and confirm missing-target denial.
10. Confirm approval is consumed.
11. Inspect local and gateway audit events.

Do not test Save, Send, Submit, Purchase, Delete, authentication, or any consequential control.

## Phase 6 — Full-control startup denial tests

Before enabling physical input, prove every incomplete configuration fails closed:

- physical input with fake provider,
- physical input without `full_control`,
- physical input without exact acknowledgement,
- physical input without an allowlist,
- `full_control` while physical input is false,
- misspelled acknowledgement,
- Windows provider without its UI Automation acknowledgement.

The agent must refuse startup or remain unable to execute physical input.

## Phase 7 — Full-control motor test

Use a disposable VM snapshot. Restart with all exact settings:

```powershell
$env:EXOSUIT_PROVIDER = 'windows'
$env:EXOSUIT_ENABLE_WINDOWS_PROVIDER = 'I_UNDERSTAND_WINDOWS_UI_AUTOMATION_RISK'
$env:EXOSUIT_ENABLE_PHYSICAL_INPUT = 'true'
$env:EXOSUIT_INITIAL_MODE = 'full_control'
$env:EXOSUIT_FULL_CONTROL_ACK = 'I_UNDERSTAND_RAW_INPUT_CAN_CONTROL_THIS_DESKTOP'
$env:EXOSUIT_ALLOWED_PROCESSES = 'notepad,calculator'
$env:EXOSUIT_ENABLE_SCREENSHOTS = 'false'
dotnet run --project apps/windows-agent/Exosuit.Agent.csproj
```

Confirm the local panel visibly warns that physical input is armed.

### Pointer movement

- target a point inside active Notepad,
- confirm critical typed-review classification,
- approve locally,
- execute,
- observe bounded eased movement,
- verify endpoint and audit evidence.

### Click

- click only inside a disposable Notepad text area,
- verify active-window and process scope,
- confirm one left click,
- confirm approval is consumed.

### Text

- focus the disposable Notepad field first,
- fresh observation must report it focused,
- propose `Exosuit physical validation successful`,
- confirm an unfocused field is denied,
- approve and execute,
- verify exact text through UI Automation.

### Hotkey

- use a harmless allowlisted combination such as `CTRL+A` in disposable Notepad,
- confirm unsupported keys are rejected,
- approve locally and verify the result.

## Phase 8 — Fault injection and emergency stop

Prove:

- pointer outside fresh window is blocked,
- nonallowlisted process is blocked,
- inactive target window is blocked,
- unfocused text field is blocked,
- active window changed between proposal and execution is blocked,
- modified approved proposal fails fingerprint validation,
- expired proposal is blocked,
- provider timeout fails and consumes approval,
- emergency stop interrupts movement,
- emergency stop interrupts typing,
- provider cancellation timeout still leaves Exosuit permanently stopped,
- restart is required after emergency stop.

Measure emergency-stop latency.

## Phase 9 — MCP gateway over loopback

In a second terminal:

```powershell
$env:EXOSUIT_AGENT_MODE = 'http'
$env:EXOSUIT_AGENT_URL = 'http://127.0.0.1:43117'
$env:EXOSUIT_AGENT_TOKEN = '<same-random-local-token>'
$env:EXOSUIT_GATEWAY_REQUEST_TIMEOUT_MS = '20000'
$env:EXOSUIT_MCP_SURFACE = 'core'
npm run start:mcp
```

`core` is the default, so the assignment above is belt-and-braces rather than required. It is written explicitly because this phase and Phase 10 both check the discovered tool list, and an inherited `full` from an earlier shell would silently widen the surface under test. Confirm the startup line reports `MCP surface: core` before continuing.

Validate:

- non-loopback URL rejected,
- weak token rejected,
- gateway timeout distinguishable from caller cancellation,
- MCP tool list matches the reviewed current-core surface, which is exactly the thirteen tools in `docs/SECURE_MCP_TUNNEL_RUNBOOK.md`; discovering twenty-seven means the coordinator surface is enabled and this phase must stop and restart with `EXOSUIT_MCP_SURFACE=core`,
- physical proposal cannot enable full control,
- execution respects local approval state,
- hostile visible instructions block mutation,
- failed verification stops continuation.

## Phase 10 — Secure MCP Tunnel

Follow `docs/SECURE_MCP_TUNNEL_RUNBOOK.md` and current official OpenAI instructions.

1. Initialize a private stdio tunnel for `npm run start:mcp`.
2. Run tunnel diagnostics.
3. Add it as a private developer-mode ChatGPT app.
4. Set permissions to **Always ask** initially.
5. Confirm only reviewed Exosuit tools are discovered: exactly thirteen, matching the runbook allowlist. Stop if fourteen coordinator tools appear.
6. Start a new conversation and explicitly select Exosuit.

Do not expose the Windows agent directly or improvise a public tunnel.

## Phase 11 — ChatGPT acceptance sequence

1. `Get Exosuit status. Do not take action.`
2. `Observe Notepad and list accessible elements.`
3. `Build a sanitized map for Notepad.`
4. Close/reopen Notepad and freshly match the map.
5. `Propose setting the disposable text field through UI Automation. Do not execute.`
6. Approve locally.
7. `Execute the exact proposal and verify it.`
8. In the full-control VM only: propose one harmless pointer move without executing.
9. Approve locally and execute.
10. Ask for the audit tail.
11. Say `Stop Exosuit now.`
12. Confirm later mutation is blocked.

ChatGPT must not claim success before a verified result returns.

## Evidence package

Preserve, with secrets and private content removed:

- exact commit SHA,
- clean working-tree proof,
- local build/test logs,
- environment variable names and boolean states but not token values,
- tunnel diagnostic output,
- discovered tool list,
- status snapshots,
- proposal IDs and statuses,
- verification results,
- redacted audit tails and chain verification,
- emergency-stop latency,
- negative-test results,
- DPI/monitor/session matrix,
- application-map privacy inspection,
- unresolved issues.

Write the report as `docs/qa/CODEX_WINDOWS_ACCEPTANCE.md` and attach it to PR #1.

## Stop conditions

Stop immediately and return to GitHub review when:

- an unexpected process receives input,
- focus changes without denial,
- an unfocused field receives text,
- an outside-window pointer target is accepted,
- approval can be reused or modified,
- an action continues after failed verification,
- emergency stop does not halt promptly,
- a credential or sensitive value appears in output or logs,
- a screenshot is captured,
- ChatGPT discovers an unexpected tool,
- the tunnel exposes anything beyond the reviewed MCP server.

## After Phase 1 passes

Do not merge unrelated roadmap implementation into the local evidence report. Complete Phase 1 evidence, update PR #1, and then begin the Multi-window Workspace Coordinator as a separate GitHub phase governed by `docs/MASTER_SYSTEM_ROADMAP.md` and `docs/TEST_PLAN.md`.
