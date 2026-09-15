# Level 4 Addendum: Field Scene Producer Launch and KVP Scene Publication

**Date:** 2026-08-10

**Verdict:** source/local pass; live cross-session launch and host-side scene read unproven

## Safety question

Can a scene be produced from the wrong desktop, by the wrong user, from a replaced binary, or
published to the host without having passed the relay signing boundary?

## Implemented controls

- Both paths refuse a non-SYSTEM caller before doing anything else. The launcher refuses on
  identity before it queries any user token.
- Session zero is refused as an expected session and as an observed session. A service-session
  process cannot observe the interactive desktop, so allowing it would let a scene be produced
  from the wrong desktop entirely — the failure the service-session decision exists to prevent.
- The observed session must equal the expected session, and the session's owning user SID must
  equal the approved interactive-user SID. The SID must be a local `S-1-5-21-` account;
  SYSTEM, Everyone, blank, and mismatched SIDs all fail closed.
- The producer image is pinned by path *and* by digest, and the digest is recomputed from the
  file about to run, opened without delete sharing. A path check alone would let a replaced
  binary inherit the producer's standing; a caller-supplied digest would prove nothing.
- The launcher starts one fixed image and never a caller-supplied command line. The producer
  runs under the interactive user's own duplicated token, not SYSTEM's, and is placed on
  `winsta0\default` rather than inheriting the service window station.
- All validation completes before `CreateProcessAsUser` is called, so a refusal never leaves a
  partially launched process.
- The KVP writer publishes only an envelope whose message type is a scene observation and whose
  Field generation matches the channel configuration. It writes; it never signs. The envelope
  must already have come through `FieldSceneRelayBoundary`.
- The scene value name is distinct from the handshake, bootstrap, and heartbeat control values,
  so scene publication cannot overwrite the control channel.

## Evidence and residual risk

Twenty-three focused tests cover acceptance plus every refusal above; the full agent suite is
130/130. The launch decision is deliberately separated from the launch so refusals are testable
without a real interactive session and without SYSTEM.

Unproven: real LocalSystem-to-interactive `CreateProcessAsUser` across a session boundary,
`WTSQueryUserToken` under lock and Secure Desktop, hosts with several interactive sessions, PID
reuse and producer-exit races, the installed agent path ACL (assumed, not evidence), an actual
host-side read of the scene value, backpressure, and scene cadence under sustained production.
The three SCN-001 pieces — intake, launcher, writer — are not yet wired into one supervised
producer lifecycle. Evidence is source/local only. This is not a live SCN-001 pass and promotes
nothing.

## Rollback

Remove `FieldSceneProducerLauncher` and `FieldKvpRuntime.PublishScene` with their tests, and
revert `GetActiveInteractiveSessionId` to private. No runtime path calls either today.
