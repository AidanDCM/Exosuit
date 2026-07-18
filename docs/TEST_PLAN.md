# Exosuit Test Plan

## Authority and scope

This document defines how Exosuit claims are proven. The implementation sequence and feature dependencies are controlled by `docs/MASTER_SYSTEM_ROADMAP.md`.

A feature is never considered complete merely because it compiles or because its donor pattern worked elsewhere.

## Evidence levels

1. **Static review** — contracts and code paths appear internally consistent.
2. **Unit test** — pure logic behaves as asserted.
3. **Fake-provider integration** — the full software chain works without a real desktop.
4. **GitHub-hosted platform build/test** — target-specific assemblies compile and pure tests execute on hosted runners.
5. **Interactive Windows integration** — real UI Automation, focus, control panel, motor, and desktop behavior work in an isolated session.
6. **Multi-window integration** — a real workflow coordinates multiple windows with locks, focus leases, checkpoints, and recovery.
7. **Virtual-desktop integration** — native desktop identity, pause/resume, and switching rules work interactively.
8. **Multi-agent/session integration** — separate agents or VMs coordinate through authenticated supervisor contracts.
9. **ChatGPT MCP acceptance** — a normal ChatGPT conversation calls the reviewed private app and receives verified results.
10. **Production-candidate evidence** — packaging, signing, update/rollback, performance, privacy, threat-model, and operational gates pass.

Lower evidence never implies a higher level.

## Current automated TypeScript matrix

| Area | Positive tests | Deny/failure tests |
|---|---|---|
| contracts | valid bounded actions and canonical fixture | malformed action, missing expectation, oversized keys, schema drift |
| permission | observe and sandbox semantic action | mutation in read-only mode, credentials, raw input, wrong window |
| consequential targets | local review classification | no automatic execution |
| prompt injection | clean accessible labels | hostile visible instructions flagged and mutation blocked |
| loop control | normal progression | repeated action and step-budget stop |
| audit | append, redact, verify | tampering detected |
| HTTP agent | loopback URL and strong token | remote URL and weak token rejected |
| gateway deadline | successful response and bounded default | timeout, malformed setting, caller-cancellation distinction |
| application-map sanitization | safe descriptors and fingerprints | sensitive controls, values, runtime IDs, and plain titles excluded |
| application-map matching | fresh IDs and confidence | sensitive fresh controls and missing controls remain unmatched |
| application-map persistence | atomic save, hydrate, version increment | invalid files skipped and old versions pruned |
| fake agent | semantic execute and verify | emergency-stop lock |
| MCP protocol | discovery, annotations, map/proposal/execute/stop | physical proposal blocked in sandbox, unexpected tool mismatch |
| system pulse | observe → find → propose → execute → verify → audit → stop | mutation after stop blocked |

Commands:

```bash
npm run typecheck
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
```

## Current automated .NET matrix

| Area | Tests |
|---|---|
| local policy | sandbox allow, observe deny, sensitive deny, wrong-window deny, raw-input denial |
| full-control startup | incomplete configuration fails closed; exact contract enables test state |
| raw-input policy | allowlist, active window, in-window coordinates, focused-field requirement, typed review |
| fake provider | semantic value set and verification |
| motor math | exact endpoints and finite coordinates |
| simulated motor | move, click, type, hotkey, cancellation, bounded profile |
| standard Windows motor | P/Invoke and composition compile with warnings as errors |
| audit ledger | redaction, hash verification, tamper failure |
| approval binding | stable fingerprint, modified proposal rejection, approval removal |
| provider deadline | hung operation times out, caller cancellation remains distinct, configuration bounded |
| wire format | snake-case enums and canonical fixture compatibility with TypeScript |

Commands:

```powershell
dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release -warnaserror
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

## CI jobs

### TypeScript

- install dependencies with scripts disabled,
- strict typecheck,
- unit/integration tests,
- production build,
- full-chain system pulse,
- diagnostics artifact.

### Windows agent

- restore on GitHub-hosted Windows,
- warnings-as-errors build,
- .NET tests,
- TRX and coverage artifacts.

### Repository contract

Required non-empty documents include:

- README,
- owner/developer operating manuals,
- master system roadmap,
- current architecture,
- security model,
- test plan,
- reuse ADR,
- Codex handoff,
- audit baseline and donor traceability,
- issue, decision, and internal change logs,
- contributor/PR instructions.

The contract also scans non-document source for committed credential-shaped values.

### Dependency security

For the current private repository:

- npm direct/transitive vulnerability audit fails on high or critical advisories,
- NuGet direct/transitive vulnerability audit,
- reports retained as artifacts.

Conditional CodeQL jobs may run when repository settings support SARIF upload.

## Phase 1 — Interactive core acceptance

Run only in a disposable Windows VM or dedicated test account. The complete sequence is in `docs/CODEX_HANDOFF.md`.

Required categories:

### Startup and authentication

- weak token prevents startup,
- Windows provider requires exact acknowledgement,
- service listens only on loopback,
- missing/wrong token returns 401,
- incomplete physical-input configuration fails closed,
- control panel cannot enable full control.

### Observe-only UI Automation

- enumerate Notepad and Calculator,
- active window matches the foreground window,
- accessible roles/names/states/actions/bounds are sensible,
- sensitive values omitted,
- caps and disappeared targets fail cleanly.

### Application memory

- persisted map has no live values, runtime IDs, screenshots, plain titles, or sensitive controls,
- reopened application rematches to current IDs,
- changed title produces warning,
- missing control remains unmatched,
- map never creates permission or execution.

### Scoped semantic action

- disposable Notepad action,
- local review,
- fresh execution check,
- result verification,
- approval consumption,
- wrong-window and missing-target denial.

### Physical input

- restart-only activation,
- pointer movement and click inside allowlisted active window,
- typing only into fresh focused field,
- harmless documented hotkey,
- out-of-window, wrong-process, inactive-window, unfocused-field, expired, modified, and timed-out denials,
- emergency-stop latency during movement and typing.

### Display and environment

- 100%, 125%, and 150% DPI,
- primary and secondary monitor,
- minimized/restored window,
- virtualized controls,
- standard versus elevated target,
- lock/unlock and remote-session transitions.

### ChatGPT acceptance

- Secure MCP Tunnel health,
- exact expected tool allowlist,
- normal ChatGPT conversation performs status/observe/map/propose/execute/verify/stop,
- ChatGPT never claims success before verified result,
- local approvals remain authoritative.

## Phase 2 — Multi-window Workspace Coordinator test matrix

### GitHub/fake tests

- at least three fake windows in one workspace,
- stable window generation tracking,
- workflow DAG validation and cycle rejection,
- A → B → C structured artifact flow,
- artifact provenance and integrity hash,
- parallel read-only observations,
- one physical execution slot per session,
- focus lease acquisition, expiry, cancellation, and recovery,
- per-window read/write lock conflicts,
- deadlock-avoidance ordering,
- window close/reopen generation invalidation,
- unexpected modal dialog pauses workflow,
- failed verification blocks dependent steps,
- workflow checkpoint save/hydrate,
- crash before/during/after action,
- no duplicate simulated external effect after uncertain recovery,
- emergency stop cancels queued/dependent work,
- audit timeline reconstructs the workflow.

### Interactive Windows tests

- coordinate Notepad, Calculator, and a disposable browser/test app,
- user manually changes focus during execution,
- target minimized/restored,
- one target closes and reopens,
- modal dialog appears between steps,
- structured transfer works without clipboard,
- physical actions remain serialized,
- latency and recovery measured.

### Promotion gate

Multi-window support requires both fake DAG evidence and interactive three-window evidence on compatible contracts.

## Phase 3 — Virtual-desktop test matrix

### GitHub/fake tests

- windows across several fake desktop IDs,
- inactive desktop blocks action,
- workflow pauses with explicit reason,
- desktop switch invalidates focus lease,
- target moves to another desktop,
- desktop ID disappears/changes,
- resume begins with fresh observation.

### Interactive Windows tests

- two or more native virtual desktops,
- manual switching,
- optional locally approved switch gesture,
- window movement between desktops,
- Task View transitions,
- emergency stop during switch,
- no silent automatic desktop movement by default.

## Phase 4 — Multi-agent/VM test matrix

### GitHub/simulated tests

- authenticated registration,
- heartbeat and stale-agent state,
- contract/capability negotiation,
- two independent agent branches execute concurrently,
- one agent disconnects mid-step,
- structured artifact transfer integrity,
- per-agent stop,
- global stop with unreachable-agent reporting,
- supervisor restart and state hydration,
- version mismatch prevents unsafe routing.

### Local/VM tests

- agent inside a Windows VM,
- two agents in separate sessions where resources permit,
- VM suspend/resume and snapshot rollback,
- network interruption and reconnect,
- RDP/cloud session behavior,
- no host-side assumption that a VM display window exposes guest internals.

## Phase 5 — Browser companion test matrix

- origin/tab/generation identity,
- navigation invalidates stale locators,
- permission and origin allowlists,
- password and sensitive-field denial,
- iframe and shadow-root fixtures,
- hostile page text remains untrusted,
- extension disconnect fallback,
- browser version compatibility,
- independent verification of semantic result.

## Phase 6 — Visual sensor test matrix

This phase remains blocked until privacy review.

Required evidence:

- capture off by default,
- local visible capture indicator,
- explicit per-task enablement,
- window/region bounds enforced,
- sensitive-region redaction fixtures,
- image data ephemeral by default,
- no image bytes in logs or application maps,
- deletion/retention verification,
- confidence thresholds and uncertain-state stopping.

## Phase 7+ — Skills, recovery, packaging, and production

Each later roadmap phase must add its own detailed test section before implementation begins. At minimum:

### Skills

- manifest schema/signature,
- scope and permission-diff review,
- bounded steps/duration/risk,
- simulation,
- revocation and rollback.

### Reliability and persistence

- duplicate delivery,
- uncertain external effect,
- crash/restart checkpoints,
- migrations and rollback,
- corruption and support-bundle redaction.

### Performance

- benchmark harness,
- percentile latency,
- emergency-stop latency,
- idle/active resource limits,
- overload and backpressure.

### Packaging and updates

- signed installer,
- SBOM,
- reproducible build manifest,
- staged update,
- atomic rollback,
- no update during active workflow,
- uninstall/data-removal verification.

### Security and privacy

- full threat model,
- abuse cases,
- transport and local interface review,
- penetration test,
- retention inventory,
- incident response and release-blocking severity policy.

## Universal fault-injection catalog

- invalid or schema-incompatible agent response,
- gateway timeout/disconnect,
- provider timeout,
- expired or modified proposal,
- active-window change,
- target generation change,
- missing/disabled/offscreen/unfocused element,
- provider exception,
- verification mismatch,
- malformed application-map file,
- stale title fingerprint,
- unmatched map controls,
- corrupt audit or workflow event,
- repeated identical action,
- task step-budget exhaustion,
- lost focus lease,
- lock conflict or deadlock attempt,
- agent heartbeat loss,
- supervisor restart,
- virtual-desktop mismatch,
- duplicate external-effect delivery.

Every escaped fault becomes a regression test.

## Promotion rules

- **GitHub validated:** CI and supported security audits pass on the reviewed commit.
- **Windows validated:** Phase 1 local matrix passes with evidence.
- **Multi-window validated:** Phase 2 fake and interactive evidence passes.
- **Virtual-desktop validated:** Phase 3 fake and interactive evidence passes.
- **Multi-agent validated:** Phase 4 simulated and real-session evidence passes.
- **ChatGPT connected:** private app acceptance passes against the reviewed tool list.
- **Production candidate:** packaging, rollback, performance, threat-model, privacy, and operational gates pass.

No document, PR, release note, or user-facing message may promote a feature beyond its proven evidence state.
