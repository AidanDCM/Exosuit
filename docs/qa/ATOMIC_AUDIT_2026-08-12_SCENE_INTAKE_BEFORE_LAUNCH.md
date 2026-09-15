# Level 4 atomic audit: scene intake before launch

**Date:** 2026-08-12  
**Gate:** M2 / SCN-001  
**Decision:** source validation only; live promotion denied

## Authority and identity

The change only reorders two existing Field-owned operations. The listener remains LocalSystem-owned and exact Field/generation/boot/SID bound. The producer remains the approved unprivileged interactive user at the digest-pinned path. Neither side gains policy, recording, input, execution, or signing authority.

## Failure analysis

- Intake cannot arm: no producer is launched; readiness invalidates with a bounded reason.
- Producer cannot launch: the armed one-use listener is disposed; readiness invalidates.
- Producer connects or writes uncertainly: existing one-frame intake and no-blind-retry rules remain.
- Lock, Secure Desktop, boot change, process death, replay, overflow, heartbeat loss, and emergency stop behavior are unchanged.

## Data and storage

No payload, UI text, screenshot, secret, or environment value is logged. No host transfer or cross-Field path is added. The immutable base is not edited; live proof requires a derived base and fresh disposable generation.

## Evidence boundary

Focused unit tests can prove ordering and cleanup. They cannot prove Windows process scheduling or live pipe connection. SCN-001 remains unpromoted until a fresh-generation automatic producer publishes authenticated structural scenes and the remaining ceremonies pass.
