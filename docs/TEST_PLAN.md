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
| fake agent | execute and verify | emergency-stop lock |
| system pulse | observe → find → propose → execute → verify → audit → stop | action after stop blocked |

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
| wire format | snake_case enum compatibility with TypeScript |

Commands:

```bash
dotnet build apps/windows-agent/Exosuit.Agent.csproj
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
```

## CI jobs

### TypeScript

- install from `package.json`,
- typecheck,
- unit/integration tests,
- build,
- dedicated system pulse.

### Windows agent

- restore on a GitHub-hosted Windows runner,
- build Windows agent,
- run .NET tests,
- upload test results when available.

### Code scanning

CodeQL scans JavaScript/TypeScript and C# separately. A CodeQL success does not prove application safety; it is one static-analysis layer.

## Required local Codex tests

Run in a dedicated Windows user or VM before any real account or production file is present.

### Startup/authentication

- weak token prevents startup,
- fake provider starts without Windows capability,
- Windows provider requires the exact local acknowledgement,
- service listens only on 127.0.0.1,
- missing/wrong token returns 401,
- control panel is reachable locally and not framed.

### Observe-only UI Automation

- enumerate Notepad and Calculator,
- active window matches foreground window,
- element roles/names/states are sensible,
- password controls omit values,
- max-element cap is respected,
- disappeared windows/elements produce a clean failure.

### Safe semantic action

Use only a disposable Notepad document:

1. observe Notepad,
2. resolve the Edit control,
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
- emergency-stop before execution and verify denial,
- emergency-stop during a bounded wait and verify cancellation,
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
- app logs contain no private field contents beyond explicit task evidence.

### ChatGPT MCP acceptance

After local tests pass:

1. run the MCP server in `http` agent mode,
2. launch OpenAI Secure MCP Tunnel with the stdio command,
3. add the endpoint as a private developer-mode app,
4. select Exosuit in a new ChatGPT web conversation,
5. ask for status and observe-only information,
6. run the disposable Notepad task,
7. confirm ChatGPT uses proposal then execution rather than inventing success,
8. confirm local approvals appear and remain authoritative,
9. issue “stop” and verify the local stop event,
10. export evidence into the local validation report.

## Fault injection cases

- invalid JSON from agent,
- HTTP timeout/disconnect,
- expired proposal,
- modified active window,
- missing element,
- disabled/offscreen element,
- provider exception,
- verification mismatch,
- corrupted audit line,
- changed prior audit event,
- repeated identical action,
- task step-budget exhaustion.

Each escaped fault must become a regression test.

## Promotion gate

The repository may be described as **GitHub validated** only when CI runs are green. It may be described as **Windows validated** only after the local matrix is completed with evidence. It may be described as **ChatGPT connected** only after the private app acceptance test succeeds.
