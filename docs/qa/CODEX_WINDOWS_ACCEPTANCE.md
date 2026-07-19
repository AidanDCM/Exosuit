# Codex Windows Acceptance

**Date:** 2026-07-18
**Status:** Partial Phase 1 evidence; production use remains unapproved
**Evidence artifact:** `docs/qa/evidence/2026-07-18-phase5-scoped-semantic.json`

## Scope completed

- Windows UI Automation agent bound to `127.0.0.1` with a strong local token.
- Screenshots and physical input remained disabled.
- Local user changed `observe` to `scoped` in the loopback control panel.
- The disposable WinForms fixture exposed one focused `AcceptanceText` edit control.
- A scoped `set_element_value` proposal required local click approval.
- Execution succeeded only after fresh target resolution and local approval.
- Verification passed with exact expected and actual value equality.
- Changing focus to the control panel blocked execution through `wrong-window-deny`.
- Closing the target blocked execution through `target-resolution-required`.
- The local audit hash chain verified after the session.

## Defect found and corrected

The first missing-target run removed the approval but left the proposal status as `approved`. A retry therefore produced a false `approval_fingerprint_mismatch` event. The execution block path now marks the proposal `denied` when consuming approval. The patched regression produced a normal terminal block on retry and no fingerprint-mismatch event.

## Automated evidence

- TypeScript typecheck: passed
- TypeScript build: passed
- TypeScript tests: 34 passed
- System pulse: passed
- .NET tests: 27 passed
- Acceptance fixture Release build: passed with zero warnings and errors
- NuGet vulnerability metadata: `NU1900` offline warning; no clean vulnerability-audit result claimed

## Not yet validated

All other phases in `docs/CODEX_HANDOFF.md` remain open, including startup-denial permutations, physical input, DPI and multi-monitor behavior, emergency-stop latency, application-map persistence against live apps, gateway timeout behavior, and ChatGPT Secure MCP Tunnel acceptance. Passing the fixture does not validate modern Windows 11 Notepad.

## Promotion decision

Phase 5 scoped semantic action is locally validated against the disposable fixture. Exosuit remains unapproved for production use, real accounts, consequential actions, screenshots, or broad physical control.
## Phase 6 startup denial evidence

Evidence artifact: `docs/qa/evidence/2026-07-18-phase6-startup-denials.json`

All seven incomplete startup configurations failed closed with exit code `1`: fake provider with physical input, missing full-control mode, missing acknowledgement, missing allowlist, full-control mode while physical input was disabled, misspelled acknowledgement, and Windows provider without its UI Automation acknowledgement. A loopback panel attempt to select `full_control` returned HTTP `400` and left mode at `Sandbox`.

The agent entry point was updated so expected configuration failures return a deterministic sanitized error instead of entering Windows crash handling. No physical input executed and screenshots remained disabled.
## Phase 8 fake emergency-stop evidence

Evidence artifact: `docs/qa/evidence/2026-07-18-phase8-fake-emergency-stop.json`

A fake-provider action was prepared, emergency stop activated in 8.06 ms, the prepared action was denied and blocked without verification, and later mutation was blocked by `emergency-stop-lock`. The execution attempt is recorded as `action_blocked_before_execution`; the audit chain verified. Physical input and screenshots remained disabled.

This does not validate real motor interruption, provider cancellation timeout, or stop latency during movement/typing. Those checks remain gated on an explicitly confirmed disposable VM snapshot.
## Windows Sandbox Phase 7 motor acceptance

A disposable Windows Sandbox run completed four separately approved physical-input actions against only `Exosuit.AcceptanceFixture`:

- bounded pointer movement: succeeded, provider-evidence verification passed;
- one left click: succeeded, provider-evidence verification passed;
- text input: succeeded, exact element value verified as `Exosuit physical validation successful`;
- `CTRL+A`: succeeded, provider-evidence verification passed.

The corrected provider resolved the fixture as PID `7096`, process `Exosuit.AcceptanceFixture`, rather than PID `0`/`Idle`. Each action required a distinct exact local typed confirmation. The runner did not possess or submit the approval CSRF token and waited for the fixture to regain foreground after the approval panel. An earlier wrong-window execution attempt failed closed.

This is bounded local acceptance evidence, not production approval. The guest audit ledger was not exported during this run, so no live hash-chain validation is claimed. Multi-monitor/DPI coverage, emergency-stop interruption of a live motor action, provider cancellation timeout, screenshots, consequential controls, and production use remain unvalidated. See `docs/qa/evidence/2026-07-18-phase7-windows-sandbox-motor.json`.
## Windows Sandbox real emergency-stop interruption

A locally invoked control-panel emergency stop cancelled an in-flight 2,000-code-unit bounded typing action. The action returned `cancelled` with verification not checked. The session remained stopped, and a later mutation proposal was blocked by `emergency-stop-lock`; restart remained required.

The guest audit chain verified as valid across 11 events. The audit timestamps place `action_cancelled` 2.40 ms after `emergency_stop`. The separately measured 9982.46 ms includes the human reaction interval and polling, so it is not treated as internal stop latency. The real Windows provider reported `providerCancellationTimedOut=false`. A hanging fake-provider regression covers the cancellation-timeout branch and proves stop persistence plus audit events.

See `docs/qa/evidence/2026-07-18-phase8-windows-sandbox-emergency-stop.json`. Pointer interruption, multi-monitor/DPI, screenshots, consequential controls, and production use remain unvalidated.
