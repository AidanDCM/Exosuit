# Engineering Log — Initial Exosuit MVP

**Date:** 2026-07-17  
**Branch:** `build/exosuit-mvp`

## Goal

Build everything that can be responsibly designed and GitHub-validated before moving to Codex for interactive Windows and ChatGPT-MCP validation.

## What changed

- Established Exosuit as a separate private repository/body layer.
- Reviewed Parts & Pieces and relevant account repositories before implementation.
- Defined a cross-language protocol for observations, elements, actions, proposals, decisions, results, status, and audit events.
- Built a TypeScript MCP gateway with deterministic guards and a fake agent.
- Built a .NET loopback agent with local policy, approval panel, fake provider, and Windows UI Automation provider.
- Added dual tamper-evident audit chains and secret redaction.
- Added emergency stop, wrong-window protection, proposal expiry, fresh pre-execution policy checks, and verification requirements.
- Added automated tests and a full-chain fake system pulse.
- Added owner/developer/security/architecture/test/reuse/audit/handoff documentation.

## Parts and donors considered

- Parts & Pieces command broker, desktop control harness, event ledger, reconciliation, loop detector, system pulse, MCP template, path scope, check runner, audit/manual templates.
- AI Desktop OS permission engine, desktop-control architecture/safety model, Atomic Audit, control modes, and review workflow.
- mcp-platform SDK/server shape.
- Pokemon Yellow bot runtime adapter separation.
- Dev Orchestrator slice discipline.
- Futures Trading consistency/system-pulse patterns as harvested into Parts & Pieces.

See `docs/PARTS_REUSE_ADR.md` for decisions.

## Tests added

### TypeScript

- schema rejection,
- policy allow/review/block,
- credential/destructive/raw-input/wrong-window denial,
- prompt-injection warnings,
- loop and step budget,
- audit redaction and tamper detection,
- loopback URL and token requirements,
- fake semantic execution,
- emergency stop,
- full-chain system pulse.

### .NET

- policy parity,
- sensitive/raw/wrong-window denies,
- fake provider execution/verification,
- trajectory endpoints,
- audit redaction/tampering,
- snake_case wire enums.

## Commands run

None yet. Files were authored through the GitHub connector. The first commit must trigger CI before any test result is claimed.

## Current evidence

- static architecture/code review only,
- official OpenAI documentation reviewed for Apps SDK, MCP tools, developer mode, and Secure MCP Tunnel,
- donor repo source and manuals reviewed.

## Remaining risks

- TypeScript SDK/type compatibility,
- .NET Windows assembly/compiler compatibility,
- cross-language contract drift,
- UI Automation runtime behavior,
- control-panel usability,
- cancellation latency,
- audit reload behavior,
- private ChatGPT app/tunnel setup,
- interactive focus/DPI/multi-monitor behavior.

## Rollback/disable

- keep branch unmerged,
- stop the MCP process,
- stop the Windows agent,
- use fake provider,
- leave Windows provider acknowledgement unset,
- leave physical input/screenshots disabled,
- press emergency stop,
- rotate the local agent token.

## Next slice

1. Commit all files.
2. Run GitHub Actions.
3. Inspect and fix every failure.
4. Update audit and engineering evidence.
5. Open/refresh draft PR.
6. Hand the green branch to Codex for local validation only.
