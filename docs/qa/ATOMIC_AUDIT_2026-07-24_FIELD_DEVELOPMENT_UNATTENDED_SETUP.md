# Atomic audit: Field development unattended setup

## Verdict

Source-level design is fail-closed and ready for a fresh live generation. Live behavior is not yet claimed.

Source validation passed: typecheck, build, 240 TypeScript tests, 44 .NET tests, Glove system pulse, Field system pulse, focused script-contract tests, and PowerShell parsing.

## Boundary

- Development-only.
- Hyper-V Generation 2.
- Private isolated switch.
- Disposable differencing OS overlay and task disk.
- No personal-state disk.
- Standard local user; no administrator membership.
- No password or channel secret in the unattended answer file.
- Fixed reviewed specialize command only.

## Evidence

- v8 VM: `Exosuit-Field-12d2be10-9d87-4144-b07a-13662ba5f99f-G1`
- Host state: running with healthy heartbeat, KVP, shutdown, and time synchronization integration services.
- Console state: Windows OOBE country selection.
- PowerShell Direct: unavailable because the guest had no completed user profile.
- Authenticated Field KVP: absent because the setup-complete runtime had not started.

## Required live closure

1. Build and hash reviewed base v9.
2. Provision a fresh v9 development generation.
3. Prove OOBE completes without owner input.
4. Prove the generated user is enabled and not an administrator.
5. Prove the seed password and answer file are removed.
6. Prove PowerShell Direct authentication.
7. Prove bootstrap, authenticated KVP heartbeat, identity, display, policy, and attestation.
8. Restart and prove the same sequence is durable.
