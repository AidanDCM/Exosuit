# Audited Windows Sandbox motor acceptance

## Goal

Repeat the complete bounded physical-input matrix in a fresh disposable Windows Sandbox and close the remaining Level 4 gap by exporting and verifying the guest audit ledger.

## Files changed

- `docs/qa/evidence/2026-07-19-phase9-audited-windows-sandbox-motor.json`
- `docs/qa/CODEX_WINDOWS_ACCEPTANCE_2026-07-19.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-19_ADDENDUM.md`
- `docs/engineering_log/2026-07-19-audited-windows-sandbox-motor.md`

The temporary `.sandbox-launch/` harness and raw evidence under `C:\tmp\exosuit-sandbox-evidence` are not release artifacts.

## Parts & Pieces and donor patterns considered

The run reused Exosuit's loopback proposal API, local control panel, exact typed-confirmation gate, fresh active-window checks, process allowlist, provider verification, audit export, and audit-chain verification. Windows Sandbox mapped-folder and LogonCommand patterns supplied a disposable environment and host-visible sanitized evidence. No approval automation or broader process allowlist was introduced.

## Tests added or updated

No production test was added in this evidence-only slice. The live acceptance exercised four separately approved critical actions against the disposable fixture. Existing automated regressions cover window-process identity fallback, emergency-stop persistence, blocked-before-execution audit events, and provider cancellation timeout.

## Commands actually run and results

- `pnpm run typecheck`: passed.
- `pnpm test`: 34 passed on an approved unsandboxed rerun after esbuild workspace resolution was denied inside the filesystem sandbox.
- `pnpm run build`: passed.
- `pnpm run test:pulse`: passed on an approved unsandboxed rerun.
- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --no-restore`: 29 passed; `NU1900` remained.
- Release builds for the Windows agent and acceptance fixture: passed with zero warnings and errors.
- Windows Sandbox move pointer, left click, text input, and `CTRL+A`: all `succeeded` with passed verification.
- Guest audit verification: valid across 33 events; no invalid sequence.

## Assumptions and unvalidated areas

The run covers one disposable WinForms fixture, one display/DPI configuration, one point, one click, one bounded string, and one allowlisted hotkey. It does not validate screenshots, multi-monitor/DPI behavior, consequential controls, production accounts, or Secure MCP Tunnel/ChatGPT connected operation.

## Security impact

Every raw action remained deny-by-default, process allowlisted, tied to the active freshly resolved fixture, gated by a distinct human local typed confirmation, and verified after execution. The runner did not possess or submit approval credentials. Redirection and networking remained disabled. The raw audit ledger was kept out of the repository.

## Rollback or disable path

Delete the temporary `.sandbox-launch/` harness and `C:\tmp\exosuit-sandbox-evidence`. Closing Windows Sandbox erased the guest. Set `EXOSUIT_ENABLE_PHYSICAL_INPUT=false`, omit the full-control acknowledgement, or remove the allowlist to prevent motor startup.

## Next recommended slice

Review the combined diff and publish only as a draft pull request with remaining connected-operation and display-configuration gaps explicit.
