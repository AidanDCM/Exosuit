# Field provisioning KVP startup

Date: 2026-08-01

## Goal and gate

Remove the live startup ordering defect that withheld authenticated Hyper-V KVP
until the disposable guest desktop became unlocked. This is Field Phase 2/3
bootstrap-and-channel work and does not satisfy the production promotion gate.

Subsystem ownership is Field guest environment plus the shared authenticated
observation boundary. Glove action policy, input, recording, transfer, and MCP
authority are unchanged.

## Live evidence that drove the change

Exact source head `0630a07e2d2453fc67c82c76698a79a14aaffb10` produced self-contained agent SHA-256
`037058d12a9ad1f6ff2133349829d7a95793c8289a34cd8ea60599d1f48249ae` and immutable
base `C:\ProgramData\Exosuit\Images\exosuit-field-base-v23.vhdx`, SHA-256
`2a9e1c96aabd6d83b590167be4cb9ed6492da4065f27536200e8f182c676db02`.
Development Field `d793dbbb-1395-4b60-96e2-1e713e34dd33`, generation 1, used only
the isolated switch, its disposable OS overlay, and its disposable task disk.

Provisioning passed after two read-only host denials and one Hyper-V memory-start
rollback. The first boot converted the seed to a 643-byte protected envelope and
produced an all-pass bootstrap report. Short observations and a restart
observation failed closed because `Exosuit.Field.Handshake` was absent. A later
90-attempt observation ran from 22:53:08Z through 23:09:18Z and also denied. The
read-only post-stop inspection proved the bootstrap report did not become
all-pass until 23:09:33Z, fifteen seconds after the observer ended. The runtime
error log remained empty. The exact VM was gracefully stopped and is Off.

This proves conversion and idempotent protected restart reached the bootstrap
gate. It does not prove authenticated protected-secret KVP publication.
Production remains denied. Evidence is under ignored local path
`artifacts/local-live/field-v23/d793dbbb-1395-4b60-96e2-1e713e34dd33/generation-1`.
The final offline inspection SHA-256 is
`4628bff46df5ef97b5e532a6c4841cf4d02cb943ee3cf580e52e2b5eb38864a3`.

## Change

- `scripts/windows/Start-ExosuitFieldGuest.ps1` now requires one complete
  bootstrap precheck, protects the secret, validates the exact receipt, and only
  then starts the authenticated KVP child.
- While locked, KVP may publish authenticated `provisioning`; the launcher keeps
  refreshing bootstrap until `session_unlocked` passes.
- Early guest exit, bootstrap failure, or desktop timeout stops the exact child
  before launcher denial, preventing an orphan emitter.
- Tests cover unlocked, already-protected, protection denial,
  locked-then-unlocked ordering, and never-unlocked cleanup.

## Identity, policy, security, and privacy

Every message remains bound to the configured Field ID, generation, agent, key,
direction, sequence, nonce, and expiry. The pilot cannot create or expand policy.
The change exposes no input, recording, screenshot, guest UI, secret, or host
write channel. Locked and Secure Desktop states remain non-ready and no action is
permitted. No data can cross from another Field or the host through this change.
The base, overlay, task disk, and personal-state rules are unchanged. Parts &
Pieces atomic-audit and fail-closed process patterns were retained; no donor code
was copied.

## Commands and results

- PowerShell parser for the launcher: passed.
- `npm test -- --run tests/windowsFieldScripts.test.ts --reporter=verbose`: passed,
  10 tests.
- `npm run validate:repository`, `validate:plan`, and
  `validate:field-contract`: passed.
- `npm run typecheck`, `npm run test:field -- --reporter=verbose`, and
  `npm run test:field-pulse -- --reporter=verbose`: passed; 159 Field tests and
  one Field pulse passed.
- `npm test -- --reporter=verbose`, `npm run build`, and
  `npm run test:pulse -- --reporter=verbose`: passed; 331 tests and one main
  pulse passed.
- The PATH-resolved runtime-only `dotnet` host had no SDK. Using the installed
  repository SDK at `C:\Users\Aidan\.dotnet\dotnet.exe`, restore passed, Release
  build passed with zero warnings/errors, and 74 .NET tests passed.
- Exact-head run `20260801T232354Z` failed before steps because PATH selected a
  runtime-only `dotnet`; it supports no passing claim. Run `20260801T232408Z`
  used the installed user SDK and passed through 159 Field tests, then exposed a
  full-suite-only harness flake: the locked-then-unlocked synthetic case used the
  same one-second deadline as the deliberate never-unlocked timeout. The former
  now has a ten-second test-only deadline; the denial case remains one second.
  A new exact-head run is required.
- Live proof of corrected ordering: pending a new immutable base/generation.

## Rollback and next slice

Revert the asynchronous guest-process adapters and restore the prior blocking
desktop loop. That restores the diagnosed delayed-observation behavior but does
not weaken secret protection or receipt validation. Disable/destroy remains
confined to the exact disposable generation; do not modify immutable v23.

Next: full exact-head validation, then a new immutable base proving authenticated
`provisioning` before unlock, transition to `ready`, protected restart, guest
crash, lock, Secure Desktop, heartbeat loss, and emergency stop.
