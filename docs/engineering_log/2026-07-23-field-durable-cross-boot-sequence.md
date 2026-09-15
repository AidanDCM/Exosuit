# Field durable cross-boot sequence

## Goal

Prevent authenticated guest-to-host channel sequence reuse across agent restarts and abrupt guest power loss, then prove replay-safe readiness on a real Hyper-V generation.

## Files changed

- `apps/windows-agent/FieldKvpRuntime.cs`
- `apps/windows-agent.Tests/FieldKvpRuntimeTests.cs`
- `docs/engineering_log/2026-07-23-field-durable-cross-boot-sequence.md`
- ignored local evidence and operator scripts under `artifacts/field-l4-v5-boot/`

## Parts & Pieces and donor patterns considered

The existing `FieldChannelReplayGuard` remains the host-owned fail-closed authority. The guest now reserves each outgoing wire sequence in channel-bound state beside its local channel secret before publishing an envelope. The initial value uses Unix milliseconds with sub-millisecond reservation space, stays within JavaScript's safe integer range, and never moves backward when the process restarts.

An initial implementation used `File.WriteAllText` followed by an atomic rename. A real Hyper-V `TurnOff` test proved that was not power-loss durable: the file length survived but its 207 content bytes returned as NULs. The runtime correctly failed closed rather than reset the sequence. The corrected implementation writes a unique temporary file with `FileOptions.WriteThrough`, calls `Flush(true)`, and only then atomically publishes it.

Recovery from the proven corrupt v10 state was explicit rather than automatic. The v11 state was seeded to `1784846702701053`, exactly one above the unchanged host ledger high-water mark `1784846702701052`. No generic corruption reset or clock-based bypass was added.

## Tests added or updated

- Added persistence across simulated runtime restart.
- Added rejection when persisted sequence state belongs to a different channel key.
- Windows-agent suite passes 44 tests.
- Real Hyper-V proof used the same host replay ledger before and after an abrupt power-off.

## Commands actually run

- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --no-restore`
- self-contained single-file `dotnet publish` for `win-x64`
- `npm run build`
- elevated PowerShell Direct deployment and read-only diagnostics
- authenticated `Read-ExosuitFieldGuestKvp.ps1` captures
- `EmergencyStop-G2.ps1`
- `Recover-G2.ps1`
- `verify-field-live-readiness.mjs`

## Results

- v11 agent SHA-256: `25f15cc59006551d6b05ea4103d74dfced2449ffdc66c918329f418381c5cdcc`
- Pre-stop authenticated high-water mark: `1784846702701094`
- Emergency stop: `Running` to `Off`
- First post-stop handshake: `1784846702701210`
- Post-unlock final replay high-water mark exceeded `1784846702701267`
- Final host readiness: `ready`
- Final boot ID: `12cf6007-aff2-45e8-a8df-af710bf663d2`
- Evidence: `artifacts/field-l4-v5-boot/generation-2/cross-boot-replay-proof/`
- Final readiness: `artifacts/field-l4-v5-boot/generation-2/cross-boot-final-readiness.json`

## Assumptions and unvalidated areas

The test proves one abrupt Hyper-V power loss on local NTFS storage. It does not establish behavior for storage hardware that falsely acknowledges flushes, repeated fault injection at every filesystem instruction, or sequence-space exhaustion.

The guest bootstrap status is a signed transport report and remains `not_ready` until the host joins bootstrap checks, current heartbeat, policy, and attestation. The final host join returned `ready`.

## Security impact

The change removes process-local sequence reuse and preserves fail-closed handling for missing, malformed, mismatched, or exhausted state. It does not expand capabilities, networking, permissions, or model authority. No secrets or private guest content were recorded.

## Rollback or disable path

Stop selecting the v11 guest executable or any base containing it and return to the previous reviewed base. Do not reuse a host replay ledger with a runtime that resets sequences. The emergency stop remains independent of the guest runtime and channel.

## Next recommended slice

Build and read-only review base generation v6 containing the v11 executable and the dual startup/logon task installer, then boot a fresh disposable generation directly from v6.
