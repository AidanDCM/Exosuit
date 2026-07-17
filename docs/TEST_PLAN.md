# Test Plan

## Evidence levels

Tests must state what they prove:

1. **Static review** — contracts and code paths appear internally consistent.
2. **Unit test** — pure logic behaves as asserted.
3. **Fake-provider integration** — the full software chain works without a real desktop.
4. **GitHub-hosted Windows build/test** — .NET and Windows-targeted assemblies compile and pure tests execute.
5. **Local Windows integration** — real UI Automation and control-panel behavior work in an interactive session.
6. **ChatGPT MCP acceptance** — the normal ChatGPT conversation calls the connected private app and receives verified results.

Lower evidence levels never imply higher ones.

## Automated TypeScript matrix

| Area | Positive tests | Deny/failure tests |
|---|---|---|
| contracts | valid bounded action | missing expectation, oversized key list |
| permission | observe, sandbox semantic action | observe-mode mutation, credentials, raw input, wrong window |
| consequential targets | local review classification | no automatic execution |
| prompt injection | clean labels | hostile visible instructions flagged |
| loop control | normal progression | repeated action and step budget stop |
| audit | append, redact, verify | tampering detected |
| HTTP agent | loopback URL and strong token | remote URL and weak token rejected |
| gateway deadline | successful response, bounded default | local timeout, malformed setting, caller cancellation distinction |
| application map sanitization | safe descriptors and fingerprints | sensitive controls, live values, source IDs, plain titles excluded |
| application map matching | fresh IDs and confidence | sensitive fresh controls and missing controls remain unmatched |
| application map persistence | atomic save, hydrate, version increment | invalid files skipped, old versions pruned |
| fake agent | execute and verify | emergency-stop lock |
| system pulse | observe → find → propose → execute → verify → audit → stop | action after stop blocked |
| wire fixture | TypeScript parses canonical JSON | schema drift fails parsing |

Commands:

```bash
npm run typecheck
npm test
npm run build
npm run test:pulse
```

## Automated .NET matrix

| Area | Test |
|---|---|
| local policy | sandbox allow, observe deny, sensitive deny, wrong-window deny, raw-input deny |
| fake provider | semantic value set and verification |
| motor math | exact endpoints and finite coordinates |
| audit ledger | redaction, hash verification, tamper failure |
| approval binding | stable fingerprint, changed proposal rejection, approval removal |
| provider deadline | hung operation times out, caller cancellation remains distinct, configuration bounded |
| wire format | snake_case enum and canonical fixture compatibility with TypeScript |

Commands:

```bash
dotnet build apps/windows-agent/Exosuit.Agent.csproj
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
```

## CI jobs

### TypeScript

- install from `package.json` with scripts disabled,
- strict typecheck,
- unit/integration tests,
- production build,
- dedicated system pulse,
- upload typecheck diagnostics.

### Windows agent

- restore on a GitHub-hosted Windows runner,
- build with warnings as errors,
- run .NET tests,
- upload build diagnostics, TRX, and coverage evidence.

### Repository contract

- require owner/developer/security/architecture/test/audit/reuse documentation,
- require the pull-request safety checklist,
- scan non-document source for committed credential-shaped strings.

### Dependency security

This private personal repository does not have GitHub Code Security enabled, so CodeQL SARIF upload is not an available gate. The supported private-repository security gate is:

- npm direct/transitive vulnerability audit, failing on high or critical advisories,
- NuGet direct/transitive vulnerability audit,
- uploaded reports retained as evidence.

CodeQL jobs remain conditional and automatically run if the repository becomes public or receives GitHub Code Security.

## Required local Codex tests

Run in a dedicated Windows user or VM before any real account or production file is present.

### Startup/authentication

- weak token prevents startup,
- fake provider starts without Windows capability,
- Windows provider requires the exact local acknowledgement,
- service listens only on 127.0.0.1,
- missing/wrong token returns 401,
- gateway timeout is shorter than an unacceptable hang and longer than normal local calls,
- control panel is reachable locally and not framed.

### Observe-only UI Automation

- enumerate Notepad and Calculator,
- active window matches foreground window,
- element roles/names/states are sensible,
- password controls omit values,
- max-element cap is respected,
- disappeared windows/elements produce a clean failure.

### Application-map memory

- build a Notepad map from a fresh observation,
- inspect the persisted file and confirm there are no live values, raw element IDs, screenshots, plain window titles, or password controls,
- close and reopen Notepad so runtime IDs change,
- match the stored map and confirm current IDs are returned,
- change the window title and confirm a warning appears,
- remove or rename a control and confirm it remains unmatched,
- confirm matching never creates or executes a proposal,
- confirm any later action still passes through fresh policy, approval, deadline, and verification.

### Safe semantic action

Use only a disposable Notepad document:

1. observe Notepad,
2. resolve the Edit control directly or through a freshly matched map,
3. propose setting `Exosuit validation successful`,
4. verify local review requirement in scoped mode,
5. approve locally,
6. execute,
7. confirm the field value,
8. invoke Save only against a disposable path and after review,
9. verify expected state,
10. inspect audit events.

### Safety and interruption

- change focus after proposal and verify wrong-window block,
- close target after proposal and verify missing-target block,
- mutate an approved proposal in a test harness and verify fingerprint rejection,
- emergency-stop before execution and verify denial,
- emergency-stop during a bounded wait and verify cancellation,
- make a test provider hang and verify the local deadline,
- make the local agent hang and verify the gateway deadline,
- repeat a failed task and verify no blind continuation,
- show hostile visible text and verify the gateway blocks mutation,
- verify full control cannot be enabled through MCP or the panel.

### Display/environment

- 100%, 125%, and 150% DPI,
- primary and secondary monitor,
- minimized/restored window,
- virtualized list where runtime IDs may change,
- standard user versus elevated target,
- lock/unlock and remote-session transitions.

### Privacy

- audit files contain no token,
- password value is not returned,
- screenshot bytes are absent,
- control panel does not expose token,
- application-map files contain no live values, element IDs, or plain window titles,
- app logs contain no private field contents beyond explicit task evidence.

### ChatGPT MCP acceptance

After local tests pass:

1. run the MCP server in `http` agent mode,
2. launch OpenAI Secure MCP Tunnel with the stdio command,
3. add the tunnel as a private developer-mode app,
4. select Exosuit in a new ChatGPT web conversation,
5. ask for status and observe-only information,
6. build/list/get/match a fake-provider application map,
7. run the disposable Notepad task,
8. confirm ChatGPT uses proposal then execution rather than inventing success,
9. confirm local approvals appear and remain authoritative,
10. issue “stop” and verify the local stop event,
11. export evidence into the local validation report.

## Fault injection cases

- invalid JSON from agent,
- gateway HTTP timeout/disconnect,
- provider timeout,
- expired proposal,
- modified approved proposal,
- modified active window,
- missing element,
- disabled/offscreen element,
- provider exception,
- verification mismatch,
- malformed application-map file,
- stale application-map title fingerprint,
- unmatched application-map controls,
- corrupted audit line,
- changed prior audit event,
- repeated identical action,
- task step-budget exhaustion.

Each escaped fault must become a regression test.

## Promotion gate

The repository may be described as **GitHub validated** only when CI and supported dependency-security audits are green on the reviewed commit. It may be described as **Windows validated** only after the local matrix is completed with evidence. It may be described as **ChatGPT connected** only after the private app acceptance test succeeds.
