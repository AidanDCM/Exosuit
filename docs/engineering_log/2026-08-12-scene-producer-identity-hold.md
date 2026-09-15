# Scene producer identity-resolution hold

- Goal: keep the unprivileged single-shot producer alive long enough for the SYSTEM relay to derive and hash one stable Windows client identity.
- Master-plan phase/gate: M2 / SCN-001; no promotion is claimed.
- Ownership: Field guest runtime; Glove authority is unchanged.
- Live evidence: G10 delivered a frame, but the relay rejected it with `Field scene relay could not resolve one stable connected-client identity`; the 188 MB single-file producer exited while the relay hashed its pinned image.
- Change: production holds the producer process for 10 seconds after its one send completes. The hold is bounded to 0..30 seconds and is cancellation-aware. Tests and non-production callers default to no hold.
- Identity/policy: identity remains Windows-derived; no client assertion is trusted. The existing post-hash liveness check, exact PID/session/SID/path/digest checks, and one-frame budget remain.
- Tests: focused client, producer, resolver, pipe, intake, and session tests cover the bounded hold and existing identity path.
- Security/privacy: no scene content, UI text, screenshot, secret, input, recording, execution, or new authority.
- Failure behavior: cancellation ends the hold; out-of-range holds fail before connection. A process that dies before the hash still fails closed.
- Storage/rollback: source only; fresh immutable base/generation required. Revert to restore the observed short-lived-client rejection.
- Next: full validation and fresh-generation automatic authenticated capture.
