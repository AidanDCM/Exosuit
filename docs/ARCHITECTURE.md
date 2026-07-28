# Exosuit Architecture

## Scope

This document describes code that currently exists on `build/exosuit-mvp`. It separates operational components from foundations that are present but deliberately not enabled for real-world use. Future sequence and promotion gates remain controlled by `docs/MASTER_SYSTEM_ROADMAP.md`.

## System role

Exosuit is a private, model-independent body and nervous system for a computer-using AI. A pilot supplies goals and bounded intentions; Exosuit owns desktop identity, deterministic policy, local approval, scheduling, execution, verification, persistence, audit, deadlines, and interruption.

```text
ChatGPT / Claude / MCP host
             |
             | narrow semantic tools
             v
TypeScript Supervisor Gateway
  - desktop contracts and MCP surface
  - single-action orchestrator
  - application-map memory
  - workspace/window generations
  - workflow DAG/runtime
  - locks and focus leases
  - structured artifact/checkpoint stores
  - agent registry and authenticated registration
  - prompt-injection/loop guards
  - gateway audit/deadlines
             |
        authenticated boundary
             v
.NET Windows Agent
  - fresh UI Automation observation
  - deterministic local policy
  - proposal/approval state
  - immutable approval fingerprints
  - bounded provider calls
  - verification and local audit
  - local emergency stop
             |
       provider composition
  +----------+--------------------------+
  |                                     |
Fake/sandbox provider          Windows UI Automation provider
                                           |
                               optional local motor decorator
                               standard Windows input APIs
```

A single interactive Windows session has one foreground focus and one physical input stream. Exosuit can observe and plan across multiple windows, but physical work is serialized through a session focus lease. True parallel physical work requires separate agents inside separate Windows sessions or VMs.

## Authority hierarchy

1. User intent and local stop authority.
2. Local deterministic Windows-agent policy.
3. Exact local approval bound to immutable proposal content.
4. Coordinator locks, deadlines, dependency state, and verification.
5. Pilot suggestions.
6. Visible application or webpage content, which is data and never authority.

No model can approve its own action, enable full control, register a remote agent without authentication, or silently enable screenshots.

## Operational core

### Desktop contracts and orchestrator

`src/contracts.ts`, `src/orchestrator.ts`, `src/mcp.ts`, `src/motorMcp.ts`, and `src/server.ts` expose bounded desktop tools. Every action includes a target, rationale, route, and expected result. The existing orchestrator remains the only path to the Windows agent.

### Surface composition

`src/server.ts` composes the exposed MCP surface from `EXOSUIT_MCP_SURFACE`:

| Value | Composition |
|---|---|
| unset or `core` (default) | `src/mcp.ts` plus `src/motorMcp.ts`, 13 tools |
| `full` | the above plus `src/coordinatorMcp.ts`, 27 tools |

`core` is the default because the coordinator carries no hosted CI or interactive evidence, so an unvalidated surface must be opted into rather than reached by default. An unrecognized value throws at startup instead of falling back. `full` is a strict superset: enabling the coordinator may add tools but never removes or renames a core one, which `tests/documentedToolSurface.test.ts` asserts.

Surface selection controls **exposure only**. Workflow and agent state still hydrate on `core`, and the coordinator's own policy, approval, and verification requirements are unchanged in either mode. Hiding a tool is not a substitute for its safety controls.

### Local Windows authority

The .NET agent owns:

- loopback-only authentication,
- provider selection,
- local control panel and CSRF protection,
- observe/scoped/full-control modes,
- proposal and approval state,
- deterministic policy,
- approval fingerprints,
- fresh re-observation,
- semantic or locally approved physical execution,
- verification,
- provider deadlines,
- local audit,
- emergency stop.

### Windows UI Automation and motor

The Windows provider can discover windows and accessible elements and perform bounded focus, invoke, set-value, select, scroll, wait, and verification operations. The optional motor uses standard Windows APIs for eased pointer movement, left click, Unicode typing, a small hotkey allowlist, and cancellation.

The motor is absent from active provider composition unless the process starts with every required local full-control setting and a non-empty process allowlist. MCP and the control panel cannot activate it.

### Application memory

`src/applicationMap.ts` stores advisory application structure only:

- process name,
- accessible control name/role,
- automation ID,
- supported actions,
- relative geometry,
- fingerprints and revision metadata.

It excludes live values, raw runtime IDs, screenshots, plain window titles, and sensitive controls. A map never grants permission and must be matched against a fresh observation.

## Multi-window coordinator

### Identity and resource model

`src/coordinator.ts` implements:

- workspace snapshots,
- agent/session/window references,
- monotonic registry versions,
- window generations and fingerprint continuity,
- workflow graph validation,
- shared-read/exclusive-write window leases,
- exclusive per-session focus leases,
- expiry, release, and emergency-stop invalidation.

### Runtime and recovery

`src/workflowRuntime.ts` adds:

- workflow and step lifecycle,
- dependency gating,
- structured artifacts with source-step/window provenance and integrity hashes,
- declared input/output validation,
- verification-required success,
- idempotency-key completion records,
- bounded step deadlines,
- pause/resume/cancel,
- local-approval waiting state,
- uncertain external-effect recovery,
- checkpoint hydration,
- virtual-desktop availability blocking,
- workflow emergency-stop propagation,
- a separate tamper-evident coordinator audit timeline.

`src/orchestratorWorkflowExecutor.ts` bridges workflow steps into the existing proposal pipeline. It does not execute desktop work directly. A step that needs local review pauses with the existing proposal ID and can continue only after the local Windows agent records approval.

### Workspace synchronization

`src/workspaceSync.ts` converts fresh desktop observations into coordinator snapshots. Window titles are hashed into identity fingerprints rather than retained. Process or title identity changes advance window generation; disappeared windows are removed.

### Checkpoints

The runtime defaults to an in-memory checkpoint store. `src/fileCheckpointStore.ts` provides an optional atomic file-backed store with:

- hashed filenames,
- size bounds,
- envelope integrity hashes,
- temporary-file cleanup,
- strict workflow/artifact identity checks,
- refusal to persist sensitive artifacts without encryption.

The file store exists as a foundation and is not the default server configuration yet.

### Coordinator MCP tools

`src/coordinatorMcp.ts` exposes narrow tools to refresh/read workspaces, create/read/run/pause/resume/cancel workflows, list structured artifacts, inspect workflow audit, and list agents. The tools cannot approve a proposal, enable full control, or execute arbitrary scripts.

## Virtual desktop foundation

`src/virtualDesktop.ts` implements versioned virtual-desktop snapshots, unique desktop assignments, current/other/unassigned/stale availability, transition records that invalidate focus authority, and switch intents that explicitly require local approval and forbid automatic execution.

This module does not enumerate or switch real Windows virtual desktops. That remains an interactive Windows phase.

## Multi-agent foundation

`src/supervisor.ts` implements agent identity, health, heartbeat expiry, capability/contract-version routing, per-agent stop, and stop-all reporting.

`src/agentChannelAuth.ts` signs registration payloads with HMAC-SHA256 and verifies clock skew, contract ranges, signed session kind, signature integrity, and nonce replay. `src/agentRegistration.ts` verifies before mutating the supervisor registry.

No production network listener, mutual-TLS channel, reconnect protocol, or remote execution transport is enabled yet.

## Browser semantic companion foundation

`src/browserCompanion.ts` defines a transparent browser bridge with:

- browser/tab/generation/origin identity,
- exact local origin permissions,
- stable semantic locators,
- navigation invalidation,
- sensitive/password field denial,
- prompt-injection blocking,
- verification-required results,
- disconnect handling,
- a deterministic mock provider.

No browser extension or native-messaging host is installed or enabled by this repository slice.

## Visual privacy foundation

`src/visualPrivacy.ts` is policy and synthetic-frame code only. It provides:

- capture disabled by default,
- explicit local task consent,
- visible-indicator requirement,
- task/window/region/time/frame-budget bounds,
- in-memory redaction,
- metadata-only JSON serialization,
- byte zeroization on disposal,
- confidence and in-frame grounding checks.

There is no Windows capture implementation. Screenshots remain disabled.

## Skill trust foundation

`src/skills.ts` provides Ed25519-signed bounded skill manifests, trusted-key verification, semantic-version upgrades, permission expansion review, disabled-by-default installation, scope/risk/step/duration checks, and revocation.

It does not enable `skill_autopilot` or execute a skill. Underlying actions would still require their existing policy, approval, and verification.

## Resource governance

`src/resourceGovernance.ts` provides tracked-window/workflow/agent/audit quotas, per-session queue backpressure, FIFO queues, bounded latency samples, and p50/p95/p99 summaries. Numeric production targets remain unset until real benchmarks exist.

## Action and workflow lifecycle

```text
1. Pilot refreshes workspace/desktop state.
2. Coordinator resolves a fresh window generation and dependencies.
3. Coordinator obtains the required read/write/focus leases.
4. Workflow executor creates an ordinary bounded desktop proposal.
5. Gateway and Windows agent apply injection, loop, mode, target, and policy checks.
6. The user locally approves the exact proposal when required.
7. The Windows agent observes and evaluates the target again.
8. The provider performs one bounded action.
9. The provider verifies expected evidence.
10. Coordinator records artifacts/checkpoint/audit and unlocks dependent steps.
11. Failed verification stops dependents.
12. Timeout after a possible external effect becomes uncertain and requires observation/reconciliation before retry.
```

## Evidence boundary

### Proven on the single-agent core

- TypeScript/.NET automated test history,
- MCP protocol behavior,
- fake full-chain action flow,
- application-map sanitization,
- deterministic policy/approval/deadline/audit logic,
- Windows-targeted compilation,
- bounded live Windows Sandbox semantic and physical actions,
- live emergency-stop interruption,
- independently verified local audit chains.

### Focused implementation evidence only

The coordinator runtime, checkpoints, virtual-desktop model, supervisor/authentication, browser mock, visual policy, skill trust, and resource governance have focused source and local reconstruction tests. They do not yet have interactive acceptance for their eventual production surfaces.

### Still unproven

- Secure MCP Tunnel and normal ChatGPT operation,
- three-window workflow execution on a real desktop,
- real virtual-desktop enumeration/switching,
- multi-agent network transport and VM coordination,
- real browser extension/native messaging,
- any Windows screenshot capture,
- DPI/multi-monitor matrix,
- encrypted persistent artifact storage,
- installer/signing/update/rollback,
- production threat model, penetration testing, performance gates, and release operations.

The current GitHub-hosted jobs are failing before checkout with no steps allocated; they do not provide hosted validation for the newest branch head. Use `npm run validate` on a suitable Windows machine and attach exact evidence until runners are available.
