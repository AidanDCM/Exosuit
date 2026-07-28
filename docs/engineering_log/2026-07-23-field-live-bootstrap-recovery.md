# Field live bootstrap recovery

## Goal

Correct the first-boot and live-channel defects found by the disposable Generation 1 guest proof, then produce a complete authenticated guest-readiness join without widening the guest network boundary.

## Files changed

- `scripts/windows/Initialize-ExosuitFieldGuest.ps1`
- `scripts/windows/SetupComplete-ExosuitFieldGuest.cmd`
- `scripts/windows/Start-ExosuitFieldGuest.ps1`
- `scripts/windows/Read-ExosuitFieldGuestKvp.ps1`
- `apps/windows-agent/FieldKvpRuntime.cs`
- `tests/windowsFieldScripts.test.ts`
- `src/fieldLiveReadiness.ts`
- `tests/fieldLiveReadiness.test.ts`
- `docs/engineering_log/2026-07-23-field-live-bootstrap-recovery.md`

## Parts & Pieces and donor patterns considered

The lock check now uses the Windows WTS extended session state in both bootstrap and the authenticated heartbeat. This replaces the `LogonUI.exe` heuristic, which live Windows 11 IoT evidence proved remains present in an unlocked active session. SetupComplete invokes the installer as a PowerShell expression so `-Confirm:$false` is parsed as a switch value rather than a process argument string.
The startup wrapper now records PowerShell command success immediately after the bootstrap script instead of comparing an unset `$LASTEXITCODE` with zero.
Large signed envelopes are split into bounded numbered KVP records. A small versioned index containing the chunk count and SHA-256 is written last; the host requires every chunk and verifies the reconstructed digest before existing replay and HMAC verification.
The SYSTEM heartbeat treats the shell as ready only when `explorer.exe` exists in the exact active console session; `GetShellWindow()` was removed because a session-0 service cannot use it to observe the session-1 shell.
WTS session enumeration selects the actual `WTSActive` interactive session before falling back to the physical console session, so enhanced Hyper-V sessions and basic console sessions share one lock, shell, and secure-desktop identity.
Session 0 is explicitly excluded because Windows reports the non-interactive Services station as active; only positive WTS session IDs can satisfy interactive desktop readiness.
The WTS extended-info parser reads `SessionFlags` at byte offset 16 after `Level`, `SessionId`, and `SessionState`; the previous offset 12 read the active connection state as if it were the lock flag.
The host obtains a fresh KVP snapshot for each signed record and retries a transient mixed chunk snapshot only while continuing to require the marker digest. A 1,000-character chunk bound keeps the 958-character heartbeat atomic while leaving larger bootstrap records chunked.
Handshake and bootstrap records refresh every four minutes against their five-minute signed TTL. This leaves a one-minute validity margin without continuously replacing multi-record bootstrap chunks.
The guest is published as a true self-contained single-file executable. Live deployment exposed that the prior 151-KB `.exe` was only an app host and the changed managed code remained in an adjacent DLL; the reviewed executable digest now covers the code that executes.
The readiness join uses 15-second degraded and 30-second fault thresholds because measured synchronous Hyper-V KVP collection latency is approximately ten seconds. The ordinary heartbeat monitor retains its stricter 5-second/15-second defaults, and channel authentication, expiry, HMAC, and durable replay checks remain unchanged.
Bootstrap check and report timestamps use the same canonical UTC millisecond `Z` wire format as the authenticated .NET channel; PowerShell's offset-formatted round-trip representation is not emitted on the contract.

## Tests added or updated

The Windows script contract test requires active-console session binding, the corrected WTS offset, bounded coherent KVP retries, and the corrected SetupComplete command form. Live-readiness tests cover acceptance immediately below the KVP-specific 15-second threshold and denial at the threshold. The .NET suite remains at 43 passing tests.

## Commands actually run

- `npm test -- --run tests/windowsFieldScripts.test.ts`
- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj`
- `dotnet publish apps/windows-agent/Exosuit.Agent.csproj -c Release -r win-x64 --self-contained true -t:Rebuild -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None ...`
- `npm test -- --run tests/fieldLiveReadiness.test.ts tests/fieldHeartbeat.test.ts tests/windowsFieldScripts.test.ts`
- `npm run build`
- elevated `Invoke-FieldPowerShellDirect.ps1`
- elevated `Read-ExosuitFieldGuestKvp.ps1`
- `node scripts/verify-field-live-readiness.mjs ...`

## Results

Live evidence before this fix is under `artifacts/field-l4-live/20260723T164349Z/collected-guest-diagnostics/` and `collected-guest-diagnostics-2/`. Every bootstrap check through policy binding passed; only `session_unlocked` failed. The second report proved active session `1` still owned a `LogonUI.exe` process while the desktop was visibly unlocked, requiring the WTS session flag rather than process inference.
`collected-guest-diagnostics-3/` then proved every bootstrap check passed, while the task returned `1`; inspection isolated the remaining failure to the wrapper's unset `$LASTEXITCODE` comparison.
Focused Windows tests passed 6/6; focused readiness, heartbeat, and Windows tests passed 11/11; the .NET suite passed 43/43; and the TypeScript build passed.
The deployed single-file v9 agent SHA-256 is `9689b01948cf1cb7844c92e0e87f39be959b83a6055bfa9734336c69a5dc8a45`.
Authenticated KVP evidence is under `artifacts/field-l4-live/20260723T164349Z/kvp-unlocked-proof-10/`. The durable replay ledger accepted handshake, bootstrap, and heartbeat in sequence; HMAC, expiry, identity, and digest verification passed.
`artifacts/field-l4-live/20260723T164349Z/final-readiness-v9-proven.json` returned `status: ready` for Field `993a45ef-3412-46ce-9862-5efe5a9dbfb1`, generation `1`, boot `291b381f-554c-49db-9b0a-32a2b20747ff`, completed at `2026-07-23T21:25:48.596Z`.

## Assumptions and unvalidated areas

This proves one disposable Windows 11 IoT evaluation guest on this host. It does not prove arbitrary hardware, long-duration soak behavior, real input, networking, or application-specific automation. The replacement immutable base still requires construction and read-back review before promotion.

## Security impact

The change narrows lock detection to the active interactive session and corrects the documented WTS structure layout. Failure to query remains fail closed. KVP chunk digests, HMAC, expiry, identity, and durable replay remain mandatory. The readiness-only latency allowance reflects measured host transport delay; it does not change command authorization, the general heartbeat monitor, emergency stop, network isolation, clipboard state, or guest permissions.

## Rollback or disable path

Stop the `ExosuitFieldGuest` scheduled task to disable the runtime. Stop and destroy the disposable generation to remove the guest overlay and task disk. Revoke/remove its host-side channel and attestation secrets after evidence collection. Revert this slice to restore the prior source behavior; do not promote an older app-host-only package.

## Next recommended slice

Build a replacement immutable base containing the exact reviewed single-file agent and guest scripts, mount it read-only for hash review, then run the clean Level 0 validator on the source commit.
