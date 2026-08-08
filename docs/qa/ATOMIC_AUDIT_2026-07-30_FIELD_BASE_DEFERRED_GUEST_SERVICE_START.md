# Atomic audit: Field base deferred guest service start

- Date: 2026-07-30
- Scope: guest service activation boundary during Windows Setup
- Verdict: source correction pending validation; v19 Generation 1 failed closed

## Finding

The immutable v19 base carried `ExosuitFieldGuest` as an Automatic LocalSystem
service. On the first disposable boot, SCM started it during Windows
`specialize`. The launcher consumed the seeded development configuration,
created `development-access-configured.json`, and requested a forced restart.
Windows Setup then failed while deleting its Sysprep OfflineState value with
Win32 `0x13`, leaving `IMAGE_STATE_UNDEPLOYABLE`.

The host correctly withheld readiness: no handshake, bootstrap, or heartbeat was
accepted. The generation was stopped and inspected read-only.

## Boundary

The sealed base may contain only a fixed Manual LocalSystem service definition.
`SetupComplete.cmd` is the activation boundary: it re-runs the fixed installer
in its default Automatic mode and starts the service only after disposable
development configuration is complete.

Manual staging cannot be combined with `-Start`. Both SYSTEM maintenance and
Audit sealing bind their receipts to `ManualUntilSetupComplete`.

## Required proof

1. Focused script contract test passes.
2. Full repository, plan, Field, TypeScript, .NET, and pulse validation passes.
3. Exact-head agent publication matches the new commit.
4. A new immutable base records Manual staging and canonical sealing.
5. A fresh generation reaches Windows Setup completion, Automatic runtime
   activation, authenticated KVP, heartbeat, identity, display, policy, and
   attestation.
6. The failed v19 generation remains negative evidence and is never promoted.

## Rollback

Revert the source slice and keep v19 unpromoted. No live capability depends on
this change.
