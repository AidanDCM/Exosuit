# Level 4 Addendum: Field Scene Observation Adapter

**Date:** 2026-07-28

**Verdict:** source/fake read-only adapter pass; live scene transport and consent evidence unproven

## Safety question

Can an ordinary Windows observation be mistaken for a fresh trusted Field scene, leak screenshots or sensitive UI text, claim readiness across a stale/wrong generation heartbeat, or consume scene identity after a rejected update?

## Implemented controls

- The adapter has no provider execution method and imports only observation, heartbeat, display, and scene contracts.
- It requires the exact Field ID/generation and a bounded-fresh heartbeat.
- Observation timestamps are bounded and screenshot bytes/MIME metadata are rejected.
- Structural-only is the default text policy: window titles, element names, and values are removed.
- UI text can pass only through the explicit `consented_ui_text` policy, which runtime wiring does not enable.
- Sensitive elements are always reduced to a `[SENSITIVE]` placeholder with no value, automation ID, or supported actions. The underlying scene graph now enforces the same invariant independently.
- Desktop readiness, lock, Secure Desktop, and queue-busy state derive from the accepted heartbeat rather than model input.
- Display, cursor, modal, window, element, and active-window consistency remain schema/scene validated.
- A denied observation does not consume the next monotonic scene version.

## Residual risk and promotion limit

The existing .NET UI Automation observer is not yet transported through an authenticated guest-to-host scene channel. Cursor/modal facts still require trusted guest collection. UIA element names can contain document content, so `consented_ui_text` needs owner privacy acceptance and live leakage testing. No claim is made for large-tree backpressure, UIA failure recovery, lock/Secure Desktop transitions, or process-level Shadow isolation.

This work does not enable screenshot capture, Teach recording, semantic mutation, physical input, Assisted Mode, or Pilot.

## Rollback

Do not construct `FieldSceneObservationAdapter`; retain the fake scene graph and structural contracts. Revert the adapter without affecting the existing Glove observer or execution defaults.
