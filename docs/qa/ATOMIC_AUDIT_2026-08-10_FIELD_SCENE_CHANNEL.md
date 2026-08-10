# Level 4 Addendum: Authenticated Structural Scene Channel

**Date:** 2026-08-10

**Verdict:** source/unit contract pass; interactive producer and live SCN-001 evidence unproven

## Safety question

Can an unauthenticated, replayed, cross-generation, wrong-boot, wrong-session, oversized, text-bearing, or screenshot-bearing message become a trusted Field scene or consume scene state?

## Implemented controls

- Only authenticated guest-to-host `scene_observation` envelopes using the configured key are accepted.
- The exact Field ID/generation, boot ID, Glove agent ID, and configured Windows session ID must match.
- The message requires a positive durable channel sequence; that sequence is the scene version, and the receiver requires a persisted replay-state path so restart cannot admit the same message again.
- Signature, payload hash, expiry, type, size, structural schema, heartbeat freshness, session binding, observation freshness, cursor/modal consistency, and capture-time ordering are checked before replay or scene state advances.
- Structural-only transport rejects window titles, non-sensitive element names, all element values, screenshot bytes/MIME metadata, and sensitive automation IDs/actions.
- Payload bytes, windows, elements, warnings, strings, and existing scene-schema collections remain bounded.
- The receiver returns read-only scene state. It does not execute input, grant policy, create consent, administer a Field, or enable the Windows provider.

## Adversarial coverage

Unit tests cover successful monotonic receipt; raw title and screenshot rejection; wrong boot, session, and agent; wrong message type; payload overflow; replay; capture-time regression; and use of the next valid scene version after rejected attempts. Existing channel tests cover signature, payload hash, expiry, direction, Field generation, key, nonce, message ID, and durable replay behavior.

## Residual risk and promotion limit

The LocalSystem Field guest service runs in session 0 and is not a valid UI Automation producer for the interactive desktop. This slice deliberately does not launch a producer, relay scene data, write a KVP scene record, enable UI text, or enable input. The next implementation must introduce a reviewed session-local Glove agent and an authenticated, bounded local relay to the SYSTEM-owned transport without sharing Field administration authority. Live UIA accuracy, modal/cursor collection, lock/Secure Desktop transitions, backpressure, restart behavior, and leakage inspection remain required for SCN-001.

## Rollback

Remove `scene_observation` from the shared message vocabulary and stop constructing `FieldSceneChannelReceiver`. Existing handshake/bootstrap/heartbeat behavior and the source-only scene adapter remain unchanged.
