# Architecture

## System role

Exosuit is the model-independent body and nervous system for a computer-using AI. It is deliberately separate from any one brain, chat product, desktop cockpit, or application-specific workflow.

```text
ChatGPT / Claude / another MCP host
             |
             | meaningful MCP tool calls
             v
Node/TypeScript MCP gateway
  - tool descriptions and schemas
  - prompt-injection guard
  - loop/step guard
  - bounded local-agent requests
  - sanitized application-map memory
  - gateway audit chain
             |
             | authenticated, time-bounded loopback HTTP
             v
.NET Windows agent
  - local deterministic policy
  - immutable approval fingerprints
  - bounded provider operations
  - proposal and local approval state
  - emergency stop
  - local audit chain
  - provider interface
             |
        +----+-------------------+
        |                        |
Fake/sandbox provider    Windows UI Automation provider
(CI and safe demos)      (observe/semantic actions only)
```

## Why two policy layers

The MCP gateway cannot be trusted as the only safety boundary. A coding error, stale deployment, different MCP host, or direct local API caller could bypass it. The Windows process therefore re-observes the desktop and re-evaluates policy immediately before execution.

## Why MCP carries intentions, not motor frames

MCP calls are appropriate for semantic operations such as:

- observe the active window,
- find the textbox named Email,
- build or freshly match an advisory application map,
- propose setting a value,
- execute a locally approved proposal,
- stop the agent.

They are not appropriate for sending one cursor coordinate per display frame. Real-time interpolation, cancellation, focus monitoring, and hardware input belong in the local motor layer. The current release includes trajectory math but no raw input injection.

## Component inventory

### `src/contracts.ts`

Canonical TypeScript wire schemas and `DesktopAgent` interface. Every external value is parsed before use.

### `src/safety.ts`

Gateway-side deterministic guardrails:

- mode enforcement,
- credential and destructive target hard denies,
- consequential-action review,
- wrong-window denial,
- raw-input local-only rule,
- visible prompt-injection warnings,
- repetition and step-budget stopping.

### `src/audit.ts`

Tamper-evident append-only audit chain with secret redaction. The hash chain detects changes to prior entries but is not a substitute for operating-system access controls or remote notarization.

### `src/timeoutFetch.ts`

Bounds every gateway request to the local agent. Timeout is distinct from caller cancellation and becomes a typed `agent_request_timeout` error. The configurable value is restricted to 250 ms through 120 seconds.

### `src/applicationMap.ts`

Versioned advisory memory for application structure. A map may retain:

- process name,
- accessible control name and role,
- automation ID,
- supported semantic actions,
- relative geometry,
- fingerprints and revision metadata.

A map never retains:

- live element values,
- source element IDs,
- screenshot bytes,
- plain window titles,
- controls marked sensitive.

Maps can be memory-only or persisted under `EXOSUIT_APPLICATION_MAP_DIR`. Files are atomically replaced, bounded to a configured number of versions, and revalidated on hydrate. A stored map never authorizes an action. It must be matched to a fresh observation, and only the returned fresh element IDs may be used later.

### `src/agent.ts`

Two gateway clients:

- `FakeDesktopAgent` for deterministic tests and demonstrations,
- `HttpDesktopAgent` for the authenticated loopback Windows service.

### `src/orchestrator.ts`

The host-side control loop. It observes before proposals, searches elements, builds and freshly matches application maps, applies prompt-injection and loop guards, forwards proposals, refuses blind continuation after failed verification, and records gateway events.

### `src/mcp.ts`

The private tool-only ChatGPT app surface. Tools are narrow and annotated as read or write operations.

Current tools:

- status,
- observe,
- find elements,
- build/list/get/match application maps,
- propose action,
- execute proposal,
- emergency stop,
- audit review.

### `apps/windows-agent`

The local execution authority. It owns provider selection, policy, approval fingerprints, local approvals, control mode, audit records, provider deadlines, and emergency stopping.

### `IDesktopProvider`

A thin adapter boundary inspired by the emulator wrapper in `Pokemon-yellow-bot`. Planning and policy tests do not require a real Windows session.

### Fake provider

Simulates Notepad and Calculator with stable windows/elements. It is the full-chain CI target and the only provider enabled by default.

### Windows UI Automation provider

Reads Windows' accessibility tree and supports fresh semantic operations:

- focus window,
- invoke control,
- set value,
- select item,
- scroll item into view,
- bounded wait.

It does not implement shell execution, browser DOM access, screenshots, credential access, raw keyboard input, or raw pointer input.

## Action lifecycle

```text
1. Host checks status and observes.
2. Host resolves fresh window and element IDs directly, or freshly matches an advisory map.
3. Host proposes one bounded action with an expected result.
4. Gateway guards inspect loops and visible injection warnings.
5. The loopback request has a gateway deadline.
6. Windows agent builds a fresh observation under a provider deadline.
7. Local policy returns allow / review_required / block.
8. If needed, the user approves the exact proposal locally; a fingerprint binds approval to its immutable content.
9. Execute endpoint builds another fresh observation and repeats policy.
10. Provider executes one semantic action under a deadline.
11. Provider verifies expected evidence under a deadline.
12. Approval is consumed and both local and gateway ledgers record the result.
13. Failed verification stops the chain for recovery or human review.
```

## Application-map lifecycle

```text
fresh observation
  -> choose one window
  -> discard sensitive controls and all values
  -> convert volatile controls into semantic descriptors
  -> fingerprint title; do not store it
  -> save a versioned map

later task
  -> load map
  -> observe desktop again
  -> locate current process/window
  -> score semantic control matches
  -> return current IDs + confidence + warnings
  -> normal proposal/policy/approval/verification path still required
```

Application maps improve navigation speed but never weaken freshness or policy checks.

## Stable identifiers

The fake provider has deterministic IDs. The Windows provider derives IDs from UI Automation runtime IDs and resolves them from a fresh tree before each action. Runtime IDs may change across application restarts or virtualized controls, so callers must observe again or match an application map rather than treating stored IDs as permanent.

## Control modes

| Mode | Meaning | Current support |
|---|---|---|
| observe | inspect only | supported |
| guide | explain; human acts | policy supported |
| sandbox | fake/test actions | supported |
| scoped | allowlisted real process with local review | foundation implemented; local validation pending |
| skill_autopilot | approved bounded skill | policy placeholder; not enabled |
| full_control | broad raw input | blocked; no remote enable path |

## Relation to other repositories

- `Parts-and-Pieces` remains the reusable pattern library and safety/audit source.
- `AI-Desktop-Operating-System-` can become an optional cockpit or operator dashboard that speaks the Exosuit contract.
- MCP operator repos remain specialized hands when a structured API is safer than desktop control.
- Exosuit fills the gap when structured integrations are unavailable.

## Future extensions

Future work must arrive in isolated slices:

1. Windows observe-only local validation.
2. Local approval UX hardening.
3. dedicated VM semantic-action testing.
4. ephemeral screenshot provider with redaction.
5. richer app-specific selectors and parent/child control paths.
6. approved skills with explicit manifests.
7. optional motor driver after separate critical-risk audit.
8. streaming HTTP MCP transport only if deployment requires it.

No extension may weaken the local policy, audit, verification, deadline, approval-binding, or emergency-stop path.
