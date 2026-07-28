# ADR: Reuse from Parts & Pieces and Other Aidan Repositories

**Date:** 2026-07-17  
**Status:** Accepted for initial MVP

## Decision

Build Exosuit as a new, focused model-independent body/MCP repository while adapting proven safety, audit, test, and adapter patterns from the account. Do not merge Exosuit into the existing AI Desktop OS and do not copy donor code blindly.

## Why a separate repository

`AI-Desktop-Operating-System-` is the broader cockpit, IDE, review center, and future operator UI. Exosuit has a smaller responsibility: expose one stable local desktop-control contract to authorized brains and host applications. Separation allows:

- independent security review,
- use by ChatGPT without the full cockpit,
- use by the existing cockpit later,
- isolated Windows/native dependencies,
- a narrow MCP surface,
- simpler deployment and rollback.

## Reuse decisions

| Donor | Part/pattern | Decision | Exosuit application |
|---|---|---|---|
| Parts & Pieces | `desktop_control_harness` | Blueprint adapted | modes, route preference, fake provider first, verification, emergency stop, deny tests |
| Parts & Pieces | TypeScript `command-broker` | Principles strengthened | single policy chokepoint, deterministic risk, deny-by-default; desktop actions replace shell regex as primary object |
| Parts & Pieces | `event_ledger` | Ported and strengthened | append-only JSONL plus SHA-256 predecessor hash and secret redaction |
| Parts & Pieces | `reconciliation` | Pattern adapted | expected verification versus actual provider evidence |
| Parts & Pieces | `loop_detector` | Ported in TypeScript | repeated action and step-budget stopping |
| Parts & Pieces | `system_pulse` | Pattern adapted | end-to-end fake signal through observation, policy, execution, verification, audit, and stop |
| Parts & Pieces | `check_runner` | Concept retained | PASS/REVIEW/FAIL will be used in release reporting; initial CI still uses ordinary exit codes |
| Parts & Pieces | `path_scope` | Deferred | no model-supplied file paths exist in MVP; mandatory before file tools |
| Parts & Pieces | `mcp-app-template` | Shape adapted | TypeScript MCP SDK, narrow registry, Zod schemas |
| Parts & Pieces | `tool_gateway` / `mcp_gateway` | Blueprint adapted | Exosuit orchestrator and proposal/execute split |
| Parts & Pieces | owner manual/log templates | Adopted | owner manual, decision/issue/changelog, per-entry engineering log |
| Parts & Pieces | Codex handoff template | Adopted | explicit local-validation handoff and acceptance evidence |
| AI Desktop OS | permission engine | Generalized | allow/review/block contract with hard local denies |
| AI Desktop OS | desktop-control architecture | Adopted | semantic route, observation, verification, recovery, active indicator, stop |
| AI Desktop OS | safety model | Adopted and enforced | hard denies, screenshot policy, prompt-injection hierarchy, test matrix |
| AI Desktop OS | Atomic Audit | Adopted at Level 4 | baseline forensic report and updates for execution changes |
| AI Desktop OS | existing UI shell | Not copied | remains an optional future cockpit/client |
| mcp-platform | MCP service layout | Adapted | SDK, Zod, stdio startup, structured tool results |
| Pokemon Yellow bot | thin runtime adapter | Adopted | `IDesktopProvider` separates live Windows from testable planning/policy |
| Futures Trading via Parts | consistency/system pulse discipline | Adapted | invariant checks and full-chain break map |
| Dev Orchestrator | North-star/controlled slice philosophy | Adopted | phased build and explicit handoff |

## Intentional departures

### Hash chain added to event ledger

The reusable ledger tolerated malformed lines, which is useful for general logs. Exosuit instead fails startup when a previously loaded valid event chain no longer verifies. Execution audit evidence should fail loudly rather than silently skip corruption. Malformed trailing data remains a future recovery-policy question.

### Policy duplicated in gateway and Windows agent

A generic gateway-only policy is insufficient for desktop control. The local process must independently protect the machine and perform fresh state checks.

### No browser DOM or Playwright dependency

The route remains available in the architecture, but the MVP prioritizes OS accessibility and native desktop semantics. A future browser companion or CDP adapter must be an explicit provider with its own policy and tests.

### No raw input engine in MVP

The account's desktop-control safety documents classify broad input as critical. Exosuit therefore includes only pure trajectory math. Input injection requires a separate audit, VM tests, visible indicator, and local-only temporary enablement.

### No direct command broker execution

Exosuit does not expose shell commands. If terminal/file capabilities are added, they must use the Parts command broker and path scope rather than be embedded in the desktop provider.

## Rejected shortcuts

- one unrestricted `control_computer` MCP tool,
- coordinates as the primary action language,
- model-owned approval,
- approval asserted in prompt text,
- a single gateway audit log,
- permanent runtime element IDs,
- screenshots stored by default,
- agent binding to all interfaces,
- remote endpoint capable of enabling full control,
- calling a compile-only build “desktop validated.”

## Consequences

### Positive

- safer default posture,
- deterministic CI without a desktop,
- easier local fault isolation,
- clear compatibility point for ChatGPT, Claude, and the existing cockpit,
- reusable provider interface,
- honest evidence claims.

### Costs

- policy exists in two languages and must stay contract-tested,
- local approvals add friction,
- UI Automation alone will not cover every application,
- full fluid motor behavior arrives later,
- deployment needs both Node and .NET components.

## Follow-up

After the initial PR:

1. run GitHub CI and repair all static/type/build failures,
2. run a cross-language fixture test for serialized contracts,
3. complete the Codex local validation matrix,
4. feed escaped bugs back into Parts & Pieces when broadly reusable,
5. consider making the existing AI Desktop OS a first-party Exosuit cockpit.
