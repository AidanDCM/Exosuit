# Field base PowerShell Direct sealing

## Goal

Remove Sysprep from the Windows Setup `auditUser` synchronous command path after live v18 evidence proved that Audit mode launched a second `/REBOOT` Sysprep UI after the canonical `/shutdown` run succeeded, invalidating the image before its first deployed specialize pass.

## Files changed

- `scripts/windows/Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1`
- `scripts/windows/Invoke-ExosuitFieldBaseAuditSeal.ps1`
- `tests/windowsFieldScripts.test.ts`
- this engineering log
- `docs/qa/ATOMIC_AUDIT_2026-07-29_FIELD_BASE_POWERSHELL_DIRECT_SEAL.md`

## Parts & Pieces and donor patterns considered

The slice retains Exosuit's existing fixed-action service dispatch, exact identity checks, consumed one-use authorization, component digests, receipt binding, isolated maintenance VM, immutable donor, and offline promotion review. The previous v18 builder and v17/v18 offline inspectors supplied the failure evidence; they are evidence donors, not proof that v19 works.

Microsoft's current Sysprep documentation states that the Audit-mode UI opens automatically, only one Sysprep instance may run at a time, command-line Sysprep is supported, and automating Sysprep through `Microsoft-Windows-Deployment\RunSynchronous` is unsupported. Microsoft documents PowerShell Direct as a host-local, network-independent way to invoke a script in a running local Windows VM using valid guest credentials.

## Change

The maintenance bootstrap now stops after SYSTEM maintenance and receipt validation. It cannot launch Sysprep. The new audit seal script:

- requires the built-in Audit administrator SID ending in `-500`;
- revalidates the complete SYSTEM receipt and maintenance script digest;
- waits for exactly one automatic Audit-mode Sysprep process;
- accepts only the canonical system binary with the exact `/REBOOT` UI command line;
- terminates that UI and requires all Sysprep processes to exit;
- writes a receipt bound to the SYSTEM maintenance receipt;
- launches only `/generalize /oobe /shutdown /quiet`.

The host-side v19 builder will invoke maintenance and sealing as separate PowerShell Direct operations after Windows Setup audit passes have returned. That live builder is local evidence tooling and is not claimed by this source slice.

## Tests added or updated

`tests/windowsFieldScripts.test.ts` now asserts that the bootstrap contains no Sysprep launch and that the audit seal includes exact identity, receipt, automatic-UI, no-competing-process, and canonical argument guards.

## Commands actually run and results

- PowerShell parser over both changed scripts: pass, zero parse errors.
- `npm test -- --run tests/windowsFieldScripts.test.ts`: pass, 8/8.
- `npm run validate` with `%USERPROFILE%\.dotnet` first on `PATH`: pass. Repository, master-plan, and Field validators passed; typecheck passed; 314/314 TypeScript tests passed; build passed; system and Field pulses passed; 48/48 .NET tests passed.

## Assumptions and unvalidated areas

- Source tests do not prove the exact Audit UI process command line on the next image.
- Source tests do not prove PowerShell Direct readiness or guest credential application.
- v19 must capture host orchestration, both guest receipts, powered-off state, exact target digest, read-only promotion, and a fresh deployed guest boot.
- The v18 guest remains preserved as negative evidence and must not be repaired or promoted.

## Security impact

This reduces authority coupling: Windows Setup no longer launches Sysprep. The model and MCP still cannot approve Field creation or enable control. PowerShell Direct stays host-local and requires Hyper-V administrator authority plus a one-use guest credential. The seal rejects unexpected Sysprep binaries or arguments and preserves the SYSTEM/Audit principal split.

## Rollback or disable path

Revert this slice and do not build or promote v19. The verified v18 image remains immutable evidence but is not deployable. No current production capability depends on the new seal script.

## Next recommended slice

Build v19 from the immutable v10 donor using a one-use Audit administrator credential and host-orchestrated PowerShell Direct, then deploy one fresh isolated generation and prove bootstrap, authenticated KVP, heartbeat, identity, display, policy, and attestation.
