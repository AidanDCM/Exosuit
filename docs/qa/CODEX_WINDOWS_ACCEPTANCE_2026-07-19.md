# Audited Windows Sandbox acceptance

**Date:** 2026-07-19
**Status:** Bounded physical-input matrix passed; production use remains unapproved
**Evidence:** `docs/qa/evidence/2026-07-19-phase9-audited-windows-sandbox-motor.json`

## Result

A fresh disposable Windows Sandbox run repeated the complete bounded motor matrix against only `Exosuit.AcceptanceFixture`:

- pointer movement: `succeeded`, provider-evidence verification passed;
- one left click: `succeeded`, provider-evidence verification passed;
- text input: `succeeded`, expected and actual value matched `Exosuit physical validation successful`;
- `CTRL+A`: `succeeded`, provider-evidence verification passed.

Each action used a distinct critical proposal and a fresh exact local typed confirmation. The runner did not possess or submit approval credentials. The allowlisted fixture was restored to the foreground before every execution.

## Audit result

The guest ledger was exported after completion and independently verified as valid across 33 events with no invalid sequence:

- one `agent_started`;
- twenty `desktop_observed`;
- four `action_proposed`;
- four `proposal_approved`;
- four `action_executed`.

The raw ledger remains temporary and is not committed because audit payloads can contain UI text. This closes the earlier Phase 7 live-ledger verification gap.

## Safety and limitations

Networking, clipboard redirection, screenshots, device redirection, printers, and vGPU remained disabled. Closing Windows Sandbox erased the guest after host-visible evidence was captured.

This evidence covers one disposable WinForms fixture and one display/DPI configuration. It does not approve screenshots, consequential controls, production accounts, multi-monitor/DPI behavior, Secure MCP Tunnel, or connected ChatGPT operation.

## Automated verification

- TypeScript typecheck: passed.
- TypeScript build: passed.
- TypeScript tests: 34 passed.
- System pulse: passed.
- .NET tests: 29 passed; NuGet vulnerability metadata remained unreachable (`NU1900`), so no clean vulnerability-audit result is claimed.
- Windows agent Release build: passed with zero warnings and errors.
- Acceptance fixture Release build: passed with zero warnings and errors.
