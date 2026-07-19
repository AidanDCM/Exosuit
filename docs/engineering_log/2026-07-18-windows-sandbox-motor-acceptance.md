# Windows Sandbox physical-input acceptance

## Goal

Run bounded real pointer movement, left click, text input, and a harmless `CTRL+A` hotkey entirely inside disposable Windows Sandbox with separate local typed approval for every action.

## Files changed

- `.sandbox-launch/Exosuit-Acceptance.wsb`
- `.sandbox-launch/bootstrap.ps1`
- `.sandbox-launch/acceptance-runner.ps1`
- `docs/qa/evidence/2026-07-18-phase7-windows-sandbox-motor.json`
- `docs/qa/CODEX_WINDOWS_ACCEPTANCE.md`
- `docs/qa/ATOMIC_AUDIT_BASELINE.md`

## Parts & Pieces and donor patterns considered

The runner uses the existing loopback proposal/execute API, local control panel, exact typed-confirmation gate, fresh active-window checks, process allowlist, and provider verification. It deliberately does not call local approval endpoints. Windows Sandbox mapped-folder and LogonCommand patterns provide disposable setup and host-visible evidence. Clipboard, networking, screenshots, devices, printers, and vGPU remained disabled.

## Tests added or updated

No production test was added in this runner-only slice. The preceding process-identity regression added `WindowProcessIdentityFallsBackToNativeWindowHandle`. Live acceptance exercised four distinct critical proposals against only `Exosuit.AcceptanceFixture`.

## Commands actually run and results

- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --no-restore`: 28 passed; `NU1900` remained.
- Release builds for the Windows agent and acceptance fixture: passed.
- `pnpm run typecheck`: passed.
- `pnpm test`: 34 passed on approved unsandboxed rerun after esbuild workspace resolution was denied in the filesystem sandbox.
- `pnpm run build`: passed.
- `pnpm run test:pulse`: passed on approved unsandboxed rerun.
- Windows Sandbox runner: move pointer, click pointer, type text, and hotkey all returned `succeeded` with `passed` verification.
- Exact text verification observed `Exosuit physical validation successful`.

## Assumptions and unvalidated areas

The test covers one display, one DPI configuration, one disposable WinForms fixture, one point, one left click, one text string, and `CTRL+A`. It does not validate Notepad compatibility, multi-monitor behavior, consequential controls, screenshots, remote MCP, production accounts, motor interruption, or provider cancellation timeout. The guest audit ledger was not exported by this runner, so its hash chain is not claimed as captured evidence for this run.

## Security impact

Every raw action remained deny-by-default, allowlisted to the resolved `Exosuit.AcceptanceFixture` process, tied to the active fresh target window, and gated by a distinct local typed confirmation. The runner waited for the fixture to regain foreground after approval and could not approve proposals. A wrong-window attempt failed closed during runner development. No clipboard sharing, network access, screenshots, credentials, or consequential targets were used.

## Rollback or disable path

Delete `.sandbox-launch/` and the temporary `C:\tmp\exosuit-sandbox-evidence` folder. Set `EXOSUIT_ENABLE_PHYSICAL_INPUT=false`, omit the full-control acknowledgement, or remove the allowlist to prevent motor startup. Closing Windows Sandbox erases the guest.

## Next recommended slice

Export and verify the guest audit ledger during a repeat acceptance run, then test emergency-stop interruption and provider cancellation timeout inside a disposable environment before considering physical input release-ready.
