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
  - gateway audit chain
             |
             | authenticated loopback HTTP
             v
.NET Windows agent
  - local deterministic policy
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

### `src/agent.ts`

Two gateway clients:

- `FakeDesktopAgent` for deterministic tests and demonstrations,
- `HttpDesktopAgent` for the authenticated loopback Windows service.

### `src/orchestrator.ts`

The host-side control loop. It observes before proposals, searches elements, applies prompt-injection and loop guards, forwards proposals, refuses blind continuation after failed verification, and records gateway events.

### `src/mcp.ts`

The private tool-only ChatGPT app surface. Tools are narrow and annotated as read or write operations.

### `apps/windows-agent`

The local execution authority. It owns provider selection, policy, local approvals, control mode, audit records, and emergency stopping.

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
1. Host observes.
2. Host resolves stable window and element IDs.
3. Host proposes one bounded action with an expected result.
4. Gateway guards inspect loops and visible injection warnings.
5. Windows agent builds a fresh observation.
6. Local policy returns allow / review_required / block.
7. If needed, the user approves in the loopback control panel.
8. Execute endpoint builds another fresh observation and repeats policy.
9. Provider executes one semantic action.
10. Provider verifies expected evidence.
11. Both local and gateway ledgers record the result.
12. Failed verification stops the chain for recovery or human review.
```

## Stable identifiers

The fake provider has deterministic IDs. The Windows provider derives IDs from UI Automation runtime IDs and resolves them from a fresh tree before each action. Runtime IDs may still change across application restarts or virtualized controls, so callers must observe again rather than treating them as permanent application IDs.

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
5. app-specific selectors and application maps.
6. approved skills with explicit manifests.
7. optional motor driver after separate critical-risk audit.
8. streaming HTTP MCP transport only if deployment requires it.

No extension may weaken the local policy, audit, verification, or emergency-stop path.
