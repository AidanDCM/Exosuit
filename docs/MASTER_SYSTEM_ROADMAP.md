# Exosuit Master System Roadmap

**Status:** Authoritative planning document  
**Applies to:** `AidanDCM/Exosuit`  
**Canonical development branch:** `build/exosuit-mvp` until the local acceptance gate is complete  
**Last major planning revision:** 2026-07-22

## Purpose

This document is the single authoritative plan for taking Exosuit from its GitHub-validated core to a reliable multi-window, virtual-desktop, multi-session computer embodiment platform.

Other documents have narrower responsibilities:

- `README.md` explains the project and current status.
- `docs/ARCHITECTURE.md` describes the architecture that currently exists.
- `docs/SECURITY_MODEL.md` defines security boundaries and hard rules.
- `docs/TEST_PLAN.md` defines evidence levels and test matrices.
- `docs/CODEX_HANDOFF.md` defines the immediate local Windows validation procedure.
- `docs/qa/GITHUB_PHASE_FINAL_AUDIT.md` records evidence for the completed GitHub core phase.

When future-work lists conflict, this roadmap controls. It is a living engineering plan, not a promise that no discovery during real desktop testing will require revision.

## North Star

> Build a private, model-independent body that allows an authorized AI pilot to perceive, coordinate, and operate applications across windows and approved computer sessions while the user retains final authority through local policy, explicit approval, verification, audit, deadlines, and immediate interruption.

The target experience is:

- human flexibility,
- machine precision,
- nervous-system-level responsiveness,
- transparent operation,
- recoverable workflows,
- user-owned authority.

## Explicit non-goals

Exosuit must not implement or claim:

- stealth or undetectable automation,
- anti-bot or anti-cheat evasion,
- kernel or hardware impersonation for concealment,
- credential harvesting,
- privilege escalation,
- arbitrary remote shell execution,
- covert surveillance or recording,
- bypassing platform or application security controls,
- unattended consequential actions without an approved policy and evidence path.

## Status vocabulary

Every feature, milestone, and release must use one of these states:

| State | Meaning |
|---|---|
| proposed | idea recorded; architecture and risks not yet reviewed |
| planned | contracts, dependencies, tests, and promotion gate defined |
| in_progress | implementation exists on a branch but evidence is incomplete |
| github_validated | static review, unit tests, fake integration, CI, and supported security checks pass |
| windows_validated | interactive Windows behavior passes the local evidence matrix |
| chatgpt_connected | the reviewed MCP surface passes acceptance in a normal ChatGPT conversation |
| production_candidate | packaging, upgrades, rollback, privacy, performance, and threat-model gates pass |
| released | signed version published with reproducible evidence and support policy |
| blocked | cannot advance until a named risk, dependency, or evidence gap is resolved |

A lower state must never be described using a higher-state label.

## Current baseline

The current GitHub-validated core includes:

- TypeScript MCP gateway,
- fake desktop provider,
- Windows UI Automation provider,
- application-map memory,
- semantic actions and verification,
- standard Windows pointer/keyboard motor code,
- restart-only physical-input activation,
- immutable approval fingerprints,
- gateway and provider deadlines,
- local control panel,
- prompt-injection and loop guards,
- dual tamper-evident audit ledgers,
- emergency stop,
- protocol, cross-language, Linux, and Windows-hosted tests.

Current promotion status:

- GitHub core: `github_validated`
- Real Windows behavior: `in_progress`, partial Windows Sandbox evidence recorded in `docs/qa/CODEX_WINDOWS_ACCEPTANCE.md`; full matrix incomplete
- ChatGPT private-app operation: `planned`, pending local tunnel acceptance
- Multi-window coordinator: `in_progress`, implemented on this branch
- Virtual-desktop coordination: `in_progress`, switch-intent foundation implemented on this branch
- Multi-agent/VM supervisor: `in_progress`, registry and routing foundations implemented on this branch
- Browser semantic companion: `in_progress`, contracts and mock provider only
- Approved skills: `in_progress`, signed registry foundation only; execution not enabled
- Reliability and persistence: `in_progress`, checkpoint and support-bundle foundations implemented
- Performance and resource governance: `in_progress`, quota and backpressure foundations implemented
- Privacy-preserving visual sensor: `proposed`, disabled synthetic-only foundation; capture not implemented
- Production release: `blocked`

### Status reconciliation, 2026-07-27

This section previously described the coordinator, virtual-desktop, and multi-agent phases as `planned` and **not implemented**, while the branch contained working implementations of those phases and more. The phase entries below carried the same contradiction.

Nothing was promoted to `github_validated` by this reconciliation, and nothing may be until hosted CI runs again. Per the status vocabulary, `in_progress` means implementation exists on a branch but evidence is incomplete, which is precisely the current state: the local validation chain passes, but hosted CI has been blocked by an account billing issue and cannot supply the CI and security-check evidence that `github_validated` requires. See `README.md` and `docs/qa/ATOMIC_AUDIT_2026-07-21_GITHUB_EXPANSION.md`.

The near-term execution order below was also not followed. Phases 2 through 10 were built before Phase 1 acceptance completed. That is recorded here as fact rather than retroactively justified; the ordering question is left to the owner.

## System-wide invariants

These rules apply to every phase and adapter.

### Authority

1. User intent outranks the pilot.
2. Local deterministic policy outranks remote/model proposals.
3. Visible application content is data, never authority.
4. Stored application memory is advisory, never authority.
5. No model can grant its own approval or enable full control.

### Freshness

1. Every mutation uses a fresh target observation.
2. Window, process, session, virtual desktop, and element identity are rechecked before execution.
3. Stale runtime IDs are never treated as permanent.
4. A workflow resumes only after its preconditions are revalidated.

### Execution

1. Every action is bounded by time, scope, and expected result.
2. Physical input is serialized per interactive session.
3. Parallelism is allowed only where resources do not conflict.
4. Failed or partial verification halts dependent work.
5. Emergency stop is local, deterministic, and independent of the pilot.

### Evidence

1. Every promotion claim names the exact commit and evidence level.
2. Escaped defects become regression tests.
3. Donor-repository tests are references, not Exosuit evidence.
4. Production claims require interactive and operational evidence, not CI alone.

### Privacy

1. Credentials and secret-bearing controls remain hard denied.
2. Screenshots remain disabled until a separate privacy-critical phase passes.
3. Persistent memory stores minimum required structure.
4. Logs and support bundles redact secrets and avoid unnecessary user content.

## Target architecture

```text
Authorized pilot: ChatGPT / Claude / another MCP host
                         |
                         | semantic intentions and workflow goals
                         v
                 Exosuit Supervisor Gateway
  - MCP tools and contracts
  - workflow/task graph
  - workspace and agent registry
  - structured artifact store
  - scheduling and dependency resolution
  - prompt-injection and loop guards
  - gateway audit and request deadlines
                         |
              authenticated agent channels
          +--------------+------------------+
          |                                 |
 Windows Agent A                    Windows Agent B / VM
 session + desktop                  separate session + desktop
  - UI Automation                    - UI Automation
  - optional browser companion       - optional browser companion
  - optional visual sensor           - optional visual sensor
  - local policy and approval        - local policy and approval
  - focus lease and motor queue      - focus lease and motor queue
  - verification and audit           - verification and audit
  - emergency stop                   - emergency stop
```

A single interactive Windows session has one foreground focus and one physical mouse/keyboard stream. Exosuit may observe and reason about many windows concurrently, but physical actions are serialized through a focus lease. Genuine physical parallelism requires separate Windows sessions or agents.

## Canonical domain model

The coordinator phase must introduce versioned contracts for these entities.

### Agent identity

```text
agentId
machineId
windowsSessionId
userSessionKind
capabilities
healthState
lastHeartbeatAt
softwareVersion
contractVersion
```

### Workspace

```text
workspaceId
agentId
windowsSessionId
currentVirtualDesktopId
windowRegistryVersion
status
lastObservedAt
```

### Window identity

```text
windowId
windowGeneration
agentId
windowsSessionId
virtualDesktopId
processId
processName
windowFingerprint
isActive
isVisible
isMinimized
isOnCurrentVirtualDesktop
bounds
lastObservedAt
```

`windowGeneration` prevents a closed and reopened window from being mistaken for the original instance.

### Workflow

```text
workflowId
requestedBy
createdAt
status
riskCeiling
agentScope
stepGraph
artifactReferences
checkpointVersion
approvalPolicy
recoveryPolicy
```

### Workflow step

```text
stepId
workflowId
dependsOn
agentId
workspaceId
targetWindowRef
actionIntent
inputArtifactRefs
outputArtifactNames
preconditions
expectedResult
riskLevel
retryPolicy
recoveryPolicy
timeout
status
```

### Structured artifact

```text
artifactId
name
value or encrypted reference
sourceStepId
sourceWindowRef
capturedAt
classification
retentionPolicy
integrityHash
```

Clipboard use is a fallback. Cross-window data normally travels through structured artifacts with provenance.

### Resource control

```text
focusLease
windowReadLock
windowWriteLock
agentExecutionSlot
approvalLease
```

Leases expire and are invalidated by emergency stop, agent disconnect, target generation change, or failed verification.

## Concurrency model

### Permitted concurrency

- read-only observation across multiple windows,
- planning and dependency analysis,
- structured API or MCP calls that do not share a locked resource,
- work on separate agents or separate Windows sessions,
- independent verification reads.

### Serialized per Windows session

- foreground focus changes,
- pointer movement,
- click,
- physical typing,
- hotkeys,
- any semantic action known to require foreground activation,
- approval dialogs owned by the same local control panel.

### Locking rules

1. A mutating step requires a window write lock.
2. Observations use read locks unless the provider documents lock-free safety.
3. A focus lease is exclusive within one Windows session.
4. Locks are ordered by stable resource key to avoid deadlock.
5. Lost heartbeat or deadline expiry releases coordinator leases but does not assume the desktop action failed safely; recovery begins with fresh observation.
6. Two steps may never modify the same window generation concurrently.

## Phase plan

## Phase 0 — Governance and source-of-truth reconciliation

**Status:** github_validated

### Objective

Create one planning authority, remove contradictory status language, and make roadmap presence part of CI.

### Deliverables

- this master roadmap,
- architecture document limited to implemented architecture,
- README linking current status to this roadmap,
- test plan extended for future evidence levels,
- Codex handoff explicitly scoped to the current core,
- CI repository contract requiring this roadmap,
- PR description referencing the authoritative roadmap.

### GitHub acceptance

- required file exists and is non-empty,
- repository contract passes,
- links resolve within the repository,
- no current document claims an unimplemented feature is complete.

### Promotion gate

Phase 0 becomes `github_validated` when CI passes on the reconciled documentation commit.

### Completion evidence

Phase 0 is `github_validated`. The reconciled documentation and repository contract passed in the GitHub validation recorded by `docs/qa/GITHUB_PHASE_FINAL_AUDIT.md`. This status closes only the governance and source-of-truth phase; it does not promote real Windows behavior, ChatGPT connectivity, or any later roadmap capability.

## Phase 1 — Current core: interactive Windows and ChatGPT acceptance

**Status:** in_progress

**Implementation note (2026-07-27):** partial evidence exists. `docs/qa/CODEX_WINDOWS_ACCEPTANCE.md` records Windows Sandbox evidence for a scoped semantic action, the seven full-control startup denials, wrong-window and missing-target denials, emergency-stop interruption, and a verified audit chain, pinned to a 2026-07-18 commit that predates the coordinator expansion. The fake-provider chain was re-validated on the current head on 2026-07-27.

Still missing: the Secure MCP Tunnel step, ChatGPT private-app acceptance, the DPI and multi-monitor matrix, and application-map privacy inspection against real applications. The promotion gate below is **not** met.

### Objective

Prove the current single-agent, single-interactive-session core on an actual Windows desktop and through ChatGPT.

### Deliverables

- `docs/qa/CODEX_WINDOWS_ACCEPTANCE.md`,
- local startup and authentication evidence,
- observe-only UI Automation evidence,
- application-map privacy inspection,
- scoped semantic Notepad action,
- full-control denial matrix,
- live pointer/click/type/hotkey tests in a disposable environment,
- emergency-stop latency measurements,
- Secure MCP Tunnel evidence,
- ChatGPT private-app acceptance.

### Dependencies

- Phase 0 documentation reconciliation,
- disposable Windows VM or dedicated test account,
- current official OpenAI tunnel/client instructions.

### Promotion gate

All tests in `docs/CODEX_HANDOFF.md` pass on one exact commit. PR #1 remains draft until the evidence report is attached.

## Phase 2 — Multi-window Workspace Coordinator

**Status:** in_progress

**Implementation note (2026-07-27):** Implemented on this branch: `src/coordinator.ts`, `src/workflowRuntime.ts`, `src/coordinatorMcp.ts`, `src/orchestratorWorkflowExecutor.ts`, `src/workspaceSync.ts`, and fourteen coordinator MCP tools. Local tests pass. There is no hosted CI evidence and no interactive three-window evidence, so the promotion gate below is **not** met.

This surface is **not exposed by default**. It requires `EXOSUIT_MCP_SURFACE=full`; the default `core` composition omits it so Phase 1 acceptance runs against the reviewed thirteen-tool surface. Coordinator acceptance is Phase 2 work with its own gate.

**Gate coverage (2026-07-28):** the thirteen GitHub tests listed below are now all covered. Ten were already implemented; three gaps were audited and closed — failed verification blocking dependent steps, three windows observed concurrently, and crash/restart resume from a verified checkpoint. See `docs/engineering_log/2026-07-28-close-phase-two-github-gate-gaps.md`.

This does **not** promote Phase 2. The GitHub half of the gate is complete, but it has never run on hosted CI, and the local Windows tests below — three interactive windows, focus switching, minimize/restore, user-initiated focus changes, an intervening dialog, and a target restart — remain entirely unexecuted. They need the same disposable environment as Phase 1.

### Objective

Allow one pilot to perceive, reason across, and coordinate multiple windows in one Windows session without confusing identity, focus, data, or execution order.

### Deliverables

- window registry with generation tracking,
- workspace snapshot contract,
- workflow DAG and step lifecycle,
- structured artifact store with provenance,
- per-window read/write locks,
- exclusive foreground focus lease,
- session execution queue,
- checkpoint and resume logic,
- unexpected-dialog detection,
- deterministic recovery states,
- multi-window audit timeline,
- MCP tools for workflow create/read/pause/resume/cancel and step execution.

### Proposed MCP surface

```text
desktop_get_workspace
desktop_list_windows
desktop_create_workflow
desktop_get_workflow
desktop_pause_workflow
desktop_resume_workflow
desktop_cancel_workflow
desktop_execute_workflow_step
```

The final tool names remain subject to contract review; tools must stay narrow and avoid arbitrary workflow scripting.

### GitHub tests

- three fake windows observed concurrently,
- dependency-ordered data transfer A → B → C,
- parallel read-only steps,
- serialized physical actions,
- write-lock conflict denial,
- focus-lease expiry,
- window close/reopen generation change,
- unexpected modal dialog,
- failed verification blocks dependent steps,
- checkpoint serialization and hydration,
- crash/restart resume from last verified checkpoint,
- cancellation and emergency-stop propagation,
- no clipboard required for structured transfer.

### Local Windows tests

- Notepad + Calculator + browser or test application,
- repeated focus switching,
- minimized/restored windows,
- user manually changes focus during a workflow,
- dialog appears between steps,
- one target restarts,
- measured scheduler latency and recovery behavior.

### Promotion gate

No workflow may be called multi-window validated until fake DAG tests and interactive three-window tests pass on the same reviewed contracts.

## Phase 3 — Windows Virtual Desktop Awareness

**Status:** in_progress

**Implementation note (2026-07-27):** Switch-intent lifecycle implemented in `src/virtualDesktop.ts` with local tests. There is no native virtual-desktop evidence from a real Windows session, so the promotion gate below is **not** met.

### Objective

Track windows across native Windows virtual desktops and pause/resume workflows safely when a target is unavailable on the current desktop.

### Deliverables

- `virtualDesktopId` in window/workspace identity,
- current-desktop detection,
- desktop-change event stream,
- target availability state,
- pause reason `virtual_desktop_unavailable`,
- locally approved desktop-switch action where supported,
- post-switch fresh observation and generation validation,
- policy that forbids silent desktop switching by default.

### Design constraint

Public, supported Windows interfaces are preferred. Undocumented virtual-desktop COM APIs cannot become a production dependency without a separate compatibility and maintenance decision.

### GitHub tests

- fake windows distributed across virtual desktops,
- workflow pauses when target desktop is inactive,
- desktop switch invalidates focus lease,
- wrong desktop blocks execution,
- target moves between desktops,
- desktop disappears or identifier changes,
- resume requires fresh observation.

### Local Windows tests

- two or more native virtual desktops,
- manual desktop switching,
- locally approved `Win+Ctrl+Left/Right` fallback if enabled,
- windows moved between desktops,
- task view open/closed,
- emergency stop during a switch.

### Promotion gate

Virtual-desktop support must never be inferred from window titles. Desktop identity and fresh availability evidence are required.

## Phase 4 — Multi-agent and VM/remote-session Supervisor

**Status:** in_progress

**Implementation note (2026-07-27):** Registry, routing, and authenticated registration implemented in `src/supervisor.ts`, `src/supervisorRouter.ts`, `src/supervisorStore.ts`, `src/agentRegistration.ts`, and `src/agentChannelAuth.ts`. There is no real multi-VM or remote-session evidence, so the promotion gate below is **not** met.

### Objective

Coordinate separate Exosuit agents running in distinct Windows VMs, local users, cloud desktops, or remote sessions.

### Deliverables

- authenticated agent registry,
- heartbeat and health states,
- capability negotiation,
- contract-version negotiation,
- agent-scoped audit identity,
- per-agent emergency stop,
- global stop-all operation,
- workflow routing by capability and session,
- structured artifact transfer between agents,
- encrypted transport and mutual authentication,
- offline/reconnect and stale-agent recovery,
- supervisor persistence.

### Concurrency rule

Each interactive session owns its own focus lease and physical queue. Separate healthy agents may execute in parallel when workflow dependencies permit.

### GitHub tests

- two simulated agents execute independent branches,
- one agent disconnects mid-step,
- stale heartbeat prevents new work,
- version mismatch blocks unsafe routing,
- artifact integrity survives transfer,
- one agent emergency-stop does not corrupt another branch,
- global stop reaches all available agents and records unreachable agents,
- coordinator restart hydrates agent/workflow state.

### Local tests

- host + Windows VM,
- two Windows VMs where resources permit,
- RDP or cloud session with agent inside the session,
- network interruption,
- VM suspend/resume and snapshot rollback,
- clock skew and session reauthentication.

### Promotion gate

The host must never attempt to operate the internals of a VM merely by treating its display window as the guest desktop. One agent runs inside each controlled Windows session.

## Phase 5 — Browser Semantic Companion

**Status:** in_progress

**Implementation note (2026-07-27):** Contracts, guard, and mock provider implemented in `src/browserCompanion.ts` and `src/browserCompanionGuard.ts`. **No browser extension exists and none is installed.** There is no real browser evidence, so the promotion gate below is **not** met.

### Objective

Provide rich browser structure without making Playwright the required execution engine and without claiming invisibility.

### Preferred architecture

A user-installed browser extension or native companion exposes a narrow, permissioned semantic bridge for the currently authorized tab:

- DOM/accessibility summaries,
- stable locators,
- form state,
- navigation events,
- element actions,
- explicit origin and tab identity,
- user-visible permission state.

### Deliverables

- browser-companion threat model,
- extension/native-messaging protocol,
- origin allowlist,
- tab generation and navigation identity,
- sensitive-field redaction,
- browser action adapter,
- fallback order: application API → browser companion → UI Automation → vision → physical input,
- explicit audit records for browser-origin data.

### GitHub tests

- mock browser companion,
- navigation invalidates stale locators,
- origin change requires fresh permission,
- iframe/shadow DOM locator behavior,
- password fields denied,
- hostile page text treated as untrusted,
- extension disconnect fallback,
- semantic result verified through an independent signal.

### Local tests

- Chromium-based browser in a disposable profile,
- multiple tabs and windows,
- navigation and reload,
- forms without credentials,
- extension permission changes,
- browser update compatibility.

### Promotion gate

The companion must be transparent and user-installed. Detection resistance is not a requirement or acceptance criterion.

## Phase 6 — Privacy-preserving Visual Sensor

**Status:** proposed pending dedicated privacy review

**Implementation note (2026-07-27):** this status is deliberately left at `proposed` even though `src/visualPrivacy.ts` exists on the branch. That module is a disabled, synthetic-only consent and redaction foundation. **No screen capture is implemented in the Windows provider, screenshots remain disabled by default, and nothing here authorizes enabling them.** The critical privacy audit named in the promotion gate below has not happened, and it remains a hard precondition. Do not read the presence of the module as progress toward capture.

### Objective

Provide a fallback for canvas, remote-desktop surfaces, custom-rendered applications, and controls absent from accessibility APIs.

### Deliverables

- local capture indicator,
- explicit enablement and per-task consent,
- region/window-scoped capture,
- sensitive-region redaction,
- ephemeral image lifecycle by default,
- no raw image in audit or application maps,
- retention and deletion policy,
- image-to-element grounding with confidence,
- visual change detection,
- verification independent of the pilot's unsupported claim.

### GitHub tests

- synthetic images only,
- redaction fixtures,
- region-bound enforcement,
- no-persistence assertions,
- confidence threshold behavior,
- prompt-injection text remains untrusted,
- capture disabled by default.

### Local tests

- disposable custom/canvas application,
- multiple DPI settings,
- protected or blank surfaces,
- capture indicator and deletion,
- privacy inspection of all storage and logs.

### Promotion gate

This phase requires a new critical privacy audit before implementation is enabled in the Windows provider.

## Phase 7 — Approved Skills and Workflow Library

**Status:** in_progress

**Implementation note (2026-07-27):** Signed manifest and durable registry implemented in `src/skills.ts` and `src/skillStore.ts`. **Skill execution is not enabled.** Coordinator validation has not completed, so the original sequencing precondition remains unmet.

### Objective

Turn repeatedly validated workflows into bounded reusable skills without giving the pilot arbitrary scripting authority.

### Skill manifest

```text
skillId
version
allowedAgents
allowedApplications
allowedOrigins
inputSchema
outputSchema
maximumSteps
maximumDuration
riskCeiling
requiredApprovals
verificationPlan
recoveryPlan
retentionPolicy
signature
```

### Deliverables

- signed skill manifests,
- schema validation,
- permission diff on upgrade,
- local install/enable/disable UI,
- per-skill audit identity,
- bounded retries and timeouts,
- skill simulation against fake providers,
- revocation and rollback.

### Promotion gate

A skill cannot reduce the approval or verification requirements of its underlying actions unless a separate user-approved policy explicitly allows that exact scope.

## Phase 8 — Operator Cockpit and Human Factors

**Status:** planned

### Objective

Provide a clear local interface for trust, supervision, approvals, workflow state, agent health, and emergency control.

### Deliverables

- signed desktop cockpit, likely Tauri or an equivalent reviewed shell,
- workspace/window visualization,
- workflow DAG and current-step view,
- clear proposal diff,
- approval countdown and expiry,
- agent/session/desktop indicators,
- audit timeline,
- privacy controls,
- application-map management,
- global and per-agent stop,
- accessibility and keyboard navigation,
- human-factors testing.

### Acceptance criteria

- user can identify exactly what will happen before approval,
- user can distinguish read, semantic mutation, and physical input,
- user can stop the system without finding the ChatGPT conversation,
- no secret is displayed or copied unnecessarily,
- dangerous mode is visibly persistent rather than shown only at activation.

## Phase 9 — Reliability, Persistence, and Recovery

**Status:** in_progress

**Implementation note (2026-07-27):** Checkpoint persistence, encrypted checkpoints, and support bundles implemented in `src/fileCheckpointStore.ts`, `src/encryptedCheckpointStore.ts`, `src/runtimeFactory.ts`, and `src/supportBundle.ts`. There is no crash/restart evidence against a real workload, so the promotion gate below is **not** met.

### Objective

Make long-running workflows recoverable without silently repeating external effects.

### Deliverables

- durable workflow event log,
- verified checkpoints,
- idempotency keys,
- external-effect classification,
- exactly-once intent with at-least-once infrastructure assumptions,
- restart recovery state machine,
- orphaned approval cleanup,
- dead-letter workflow state,
- support bundle generator,
- storage migrations,
- corruption detection and backup policy.

### Recovery rule

After uncertainty, Exosuit observes and reconciles before retrying. It never assumes a timed-out external action did not occur.

### GitHub tests

- crash before action,
- crash during action,
- crash after action before checkpoint,
- duplicate delivery,
- stale checkpoint,
- ledger/storage corruption,
- migration forward and rollback,
- recovery does not duplicate a simulated external effect.

## Phase 10 — Performance and Resource Governance

**Status:** in_progress

**Implementation note (2026-07-27):** Quotas, backpressure, and latency percentiles implemented in `src/performance.ts` and `src/resourceGovernance.ts`. **No benchmark numbers have been established**; this phase requires targets derived from local benchmarks rather than invented in advance.

**Benchmark harness added (2026-07-28):** `scripts/benchmark.mjs`, run with `npm run benchmark`. First baseline recorded in `docs/qa/evidence/2026-07-28-phase10-benchmark-baseline.md`. It covers observation, proposal, execute-and-verify, emergency-stop, and audit-append latency with p50/p95/p99, plus scheduler scaling, memory per tracked window, and audit growth. Focus-switch latency, motor start latency, CPU while observing, and maximum agents are reported as **not covered**, because a fake-provider number for them would be misleading.

These remain **measurements, not targets.** Setting service targets is an owner decision and needs real-desktop numbers as well.

**Finding — the workflow scheduler is superlinear in step count.** With a no-op executor, median total time was 0.2 ms at 1 step, 9.7 ms at 10, 172.3 ms at 50, and 1023.6 ms at 100. Ten times the steps cost roughly a hundred times the time, and per-step cost degraded from 0.24 ms to 10.24 ms.

**Profiled and partially addressed (2026-07-28).** CPU profiling attributed 64.6% of self-time to `structuredClone`. `runUntilBlocked` deep-copied the entire workflow record on every iteration through `get`, cloned every ready step through `readySteps`, and discarded another full copy returned by `runNext`. Internal scheduling now reads the live record; public accessors still return copies, guarded by a mutation-verified isolation test.

That removed roughly a quarter of the cost at 100 steps and **did not change the complexity class.** The remaining dominant cost, still about half of self-time, is `#saveCheckpoint`: it clones the whole workflow and the store then re-parses and serializes it, once per step, which is O(n) per step by construction.

**Still open, and an owner decision.** Making this linear requires either incremental or delta checkpointing, or dropping the defensive clone in `#saveCheckpoint` and requiring stores not to retain the record. Both change persistence behavior, so the change-control rule applies: decision-log entry, threat-model update, test-plan update, rollback plan, and owner review before implementation. Until then a maximum workflow length should be set as an explicit Phase 10 quota, because unbounded superlinear cost is a denial-of-service shape.

### Objectives

Define measurable responsiveness and resource limits instead of relying on subjective fluidity.

### Initial target classes

- observation latency,
- semantic-action proposal latency,
- focus-switch latency,
- motor start latency,
- emergency-stop latency,
- workflow scheduler overhead,
- memory per tracked window,
- audit/storage growth,
- CPU while idle and observing,
- maximum windows, workflows, and agents.

Exact numeric service targets must be established from local benchmarks rather than invented in advance.

### Deliverables

- benchmark harness,
- repeatable test machines/profiles,
- percentile reporting,
- resource quotas,
- backpressure,
- overload degradation policy,
- performance regression gate.

## Phase 11 — Packaging, Updates, Signing, and Rollback

**Status:** planned

### Deliverables

- Windows installer,
- signed binaries and packages,
- reproducible build manifest,
- SBOM,
- versioned gateway/agent contracts,
- upgrade compatibility matrix,
- staged update channels,
- atomic update and rollback,
- configuration migration,
- uninstall and data-removal path,
- release notes and known-issues policy.

### Promotion gate

No auto-update before signed rollback has been proven. The system must never update the local body in the middle of an active workflow.

## Phase 12 — Production Security and Privacy Review

**Status:** planned

### Deliverables

- full threat model and abuse-case review,
- local privilege and process-isolation review,
- transport/mutual-authentication review,
- storage encryption decision,
- secret lifecycle and rotation,
- dependency and supply-chain policy,
- penetration test of local interfaces,
- privacy inventory and retention matrix,
- secure support-bundle process,
- incident response plan,
- release-blocking security severity policy.

### Promotion gate

Production-candidate status requires all critical and high findings resolved or formally accepted with owner sign-off and compensating controls.

## Phase 13 — Cross-platform Expansion

**Status:** proposed; Windows remains the reference implementation

### Candidate agents

- macOS Accessibility (`AXUIElement`),
- Linux AT-SPI,
- platform-neutral browser companion,
- remote/cloud session agents.

### Rule

Cross-platform work begins only after contracts are proven through the Windows coordinator and multi-agent phases. Platform-specific behavior must not be hidden behind false claims of identical capability.

## Phase 14 — Release and Operations

**Status:** blocked until prior gates

### Deliverables

- production readiness review,
- signed release,
- support and deprecation policy,
- operational dashboards that avoid private user content,
- issue severity and response targets,
- compatibility matrix,
- rollback drill,
- user documentation,
- safe defaults verification,
- post-release audit schedule.

## Near-term execution order

The next work must occur in this order unless a blocking discovery forces a documented change:

1. Complete Phase 0 reconciliation and CI validation.
2. Complete Phase 1 Codex Windows/ChatGPT acceptance for the current core.
3. Return to GitHub for Phase 2 Multi-window Workspace Coordinator.
4. Validate Phase 2 locally across at least three windows.
5. Build Phase 3 Virtual Desktop Awareness.
6. Build Phase 4 Multi-agent/VM Supervisor.
7. Choose Phase 5 browser companion or Phase 8 cockpit based on real validation findings.
8. Do not start visual capture until the Phase 6 privacy review is approved.
9. Build skills only after workflows and recovery semantics are stable.
10. Begin packaging and production review only after core reliability, multi-window, and local supervision are proven.

## Definition of done for every phase

A phase is complete only when all of the following exist:

- written objective and non-goals,
- versioned contracts,
- security/privacy review appropriate to risk,
- implementation,
- positive tests,
- negative and fault-injection tests,
- audit events,
- manuals and migration notes,
- exact evidence level recorded,
- promotion gate passed,
- unresolved risks explicitly listed,
- rollback or disable path.

## Change-control rule

Any roadmap change affecting authority, credentials, physical input, screenshots, remote agents, persistence, or consequential actions requires:

1. a decision-log entry,
2. threat-model update,
3. test-plan update,
4. rollback/disable plan,
5. owner review before implementation is enabled.

## Planning honesty

This roadmap is intentionally comprehensive, but it is not called perfect. Real Windows, browser, VM, networking, and human-factors tests will reveal constraints that cannot be discovered from repository analysis alone. The correct response is to revise the roadmap with evidence, not conceal the discovery or weaken the promotion gate.
