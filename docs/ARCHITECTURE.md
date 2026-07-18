# Exosuit Architecture

## Scope

This document describes the architecture currently implemented in the repository. Future system phases, including multi-window workflow coordination, Windows virtual desktops, multiple VM/session agents, browser semantic access, visual perception, skills, packaging, and production operations, are governed by `docs/MASTER_SYSTEM_ROADMAP.md`.

## System role

Exosuit is a private, model-independent body and nervous system for a computer-using AI. It is separate from any one pilot, chat product, desktop cockpit, or application-specific workflow.

```text
ChatGPT / Claude / another MCP host
             |
             | narrow semantic MCP tools
             v
TypeScript MCP gateway
  - schemas and tool descriptions
  - prompt-injection and loop guards
  - bounded local-agent requests
  - sanitized application-map memory
  - gateway audit chain
             |
             | authenticated loopback HTTP
             v
.NET Windows agent
  - fresh desktop observation
  - deterministic local policy
  - immutable approval fingerprints
  - bounded provider operations
  - proposal and approval state
  - verification
  - local audit chain
  - emergency stop
             |
       provider composition
  +----------+--------------------------+
  |                                     |
Fake/sandbox provider          Windows UI Automation provider
(CI and safe demos)            (semantic sensing/actions)
                                           |
                               optional local motor decorator
                               standard Windows input APIs
```

## Core design rules

1. MCP carries meaningful intentions, not individual cursor animation frames.
2. The Windows agent independently re-observes and re-evaluates every action before execution.
3. The model cannot approve its own proposal or enable full control.
4. Stored application memory is advisory and must be rematched to fresh state.
5. Execution is incomplete until expected evidence is verified.
6. Failed or partial verification stops dependent continuation.
7. Emergency stop is local and does not depend on ChatGPT or the tunnel.
8. No component is designed for stealth, anti-detection, credential harvesting, privilege escalation, or security bypass.

## Gateway components

### `src/contracts.ts`

Canonical TypeScript wire schemas and the `DesktopAgent` boundary. External values are parsed before use.

### `src/safety.ts`

Gateway-side deterministic guards:

- mode enforcement,
- credential and destructive-target denial,
- consequential-action review,
- wrong-window denial,
- physical-input local-only rule,
- visible prompt-injection warnings,
- repetition and step-budget stopping.

### `src/audit.ts`

Tamper-evident append-only audit chain with secret redaction.

### `src/timeoutFetch.ts`

Bounds gateway requests to the loopback agent and distinguishes deadline expiry from caller cancellation.

### `src/applicationMap.ts`

Versioned advisory application memory. It may retain:

- process name,
- accessible control name and role,
- automation ID,
- supported semantic actions,
- relative geometry,
- fingerprints and revision metadata.

It does not retain:

- live element values,
- runtime/source element IDs,
- screenshots,
- plain window titles,
- controls marked sensitive.

A map never grants permission. It must be matched to a fresh observation before the returned current element IDs can be used.

### `src/orchestrator.ts`

Current single-agent orchestration loop:

- obtains status and observations,
- searches accessible elements,
- builds and freshly matches application maps,
- applies gateway guards,
- proposes one bounded action,
- executes one returned proposal,
- records gateway events,
- refuses blind continuation after failed verification.

The current orchestrator is not yet a multi-window workflow scheduler. That work is Phase 2 of the master roadmap.

### MCP server

`src/server.ts` composes the current MCP surface:

- `desktop_get_status`
- `desktop_observe`
- `desktop_find_elements`
- `desktop_build_application_map`
- `desktop_list_application_maps`
- `desktop_get_application_map`
- `desktop_match_application_map`
- `desktop_propose_action`
- `desktop_propose_physical_input`
- `desktop_execute_proposal`
- `desktop_emergency_stop`
- `desktop_get_audit_log`

There is one authoritative execution tool. The physical-input tool only creates a specially classified proposal.

## Windows-agent components

### Agent host

The local execution authority owns:

- provider selection,
- loopback authentication,
- local control panel and CSRF protection,
- deterministic policy,
- proposal and approval state,
- approval fingerprints,
- execution and verification,
- provider deadlines,
- local audit,
- emergency stopping.

### Provider interface

`IDesktopProvider` separates policy/orchestration from desktop implementation. The fake provider supports deterministic CI and the Windows provider uses UI Automation.

### Windows UI Automation provider

Supports fresh semantic operations such as:

- discover active/open windows,
- inspect accessible element names, roles, states, IDs, actions, and geometry,
- focus a window,
- invoke a control,
- set a value,
- select an item,
- scroll into view,
- bounded waiting,
- expected-state verification.

Browser DOM access and screenshots are not part of the current provider.

### Physical motor

The optional local motor uses standard documented Windows APIs:

- bounded eased pointer movement,
- left click,
- Unicode typing,
- a small documented hotkey allowlist,
- cancellation.

The motor performs no hardware impersonation or concealment.

It is not included in the active provider unless the process is deliberately restarted with all exact local conditions:

1. Windows provider selected,
2. Windows UI Automation risk acknowledgement,
3. physical-input flag enabled,
4. `EXOSUIT_INITIAL_MODE=full_control`,
5. exact full-control acknowledgement,
6. non-empty process allowlist.

MCP and the local control panel cannot enable full control.

## Action lifecycle

```text
1. Pilot checks status and obtains fresh observation.
2. Pilot resolves a fresh window/element directly or through a fresh map match.
3. Pilot proposes one bounded action with an expected result.
4. Gateway checks loops and visible prompt-injection warnings.
5. The gateway-to-agent request has a deadline.
6. Windows agent observes the desktop again under a provider deadline.
7. Local policy returns allow / review_required / block.
8. If required, the user approves the exact proposal locally.
9. A fingerprint binds approval to immutable proposal content.
10. Execute observes and evaluates the target again.
11. The provider performs one bounded semantic or approved physical action.
12. The provider verifies expected evidence.
13. Approval is consumed and both ledgers record the result.
14. Failed verification stops continuation for recovery or human review.
```

## Physical-action checks

Every physical action requires:

- locally enabled full-control startup state,
- a fresh target window,
- the target window to be active,
- an allowlisted process,
- pointer coordinates inside the fresh window when applicable,
- a fresh enabled, visible, focused, non-sensitive target for physical text,
- critical-risk classification,
- exact local typed approval,
- unchanged approval fingerprint,
- bounded execution and verification.

## Current identity model

The fake provider uses deterministic IDs. The Windows provider derives IDs from fresh UI Automation state. Runtime IDs may change across restarts or virtualized controls, so callers must observe again or freshly match an application map.

The current contracts do not yet include:

- window generation,
- workflow identity,
- focus leases,
- per-window locks,
- virtual-desktop identity,
- agent/session identity for multiple VMs.

Those contracts are planned in Phases 2–4 of the master roadmap.

## Current control modes

| Mode | Meaning | Current status |
|---|---|---|
| observe | inspect only | implemented |
| guide | explain while the human acts | policy implemented |
| sandbox | deterministic fake actions | implemented |
| scoped | allowlisted real semantic action with review | implemented; local acceptance pending |
| skill_autopilot | approved bounded skills | reserved; not enabled |
| full_control | allowlisted reviewed physical input | implemented; restart-gated; local acceptance pending |

## Evidence boundary

GitHub evidence currently proves:

- contracts and cross-language fixture compatibility,
- MCP protocol behavior,
- fake full-chain action flow,
- application-map sanitization and matching,
- policy, approval, deadline, audit, and emergency-stop logic,
- Windows-targeted compilation,
- motor simulation and Windows API structure compilation.

It does not prove:

- real UI Automation quality against interactive applications,
- real pointer and keyboard behavior,
- live focus interruption,
- DPI/multi-monitor behavior,
- native virtual desktops,
- VM/remote-session coordination,
- Secure MCP Tunnel and normal ChatGPT operation.

The immediate local acceptance procedure is in `docs/CODEX_HANDOFF.md`. The complete build sequence is in `docs/MASTER_SYSTEM_ROADMAP.md`.
