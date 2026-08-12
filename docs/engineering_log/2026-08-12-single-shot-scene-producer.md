# Single-shot scene producer

- Goal: align producer lifetime with the relay's reviewed one-connection, one-frame intake contract.
- Master-plan phase/gate: M2 / SCN-001; no promotion is claimed.
- Ownership: Field guest runtime; Glove authority is unchanged.
- Live evidence: in G9 a manually invoked producer delivered its first frame, remained running, and later failed its second connection with `TimeoutException`. The host observed the first scene value, but it was stale by the time authentication was attempted.
- Change: one producer process now observes, sanitizes, sends exactly one structural scene, and exits. The SYSTEM session runner owns cadence and arms a fresh one-use intake before any later producer launch.
- Identity/policy: exact Field, generation, boot, session, SID, digest, display, SYSTEM launcher, Windows-derived client identity, and signing rules are unchanged.
- Tests: focused producer/session/pipe tests passed 39/39, including exactly one observation/send and no transport retry.
- Security/privacy: no new authority, screenshot, UI text, recording, secret, input, execution, or network path.
- Failure behavior: a send failure terminates without retry. A successful send exits instead of attempting an unauthorized second connection.
- Storage/rollback: source-only; live validation requires a fresh immutable base and disposable generation. Revert to restore the mismatched looping producer.
- Next: full validation, fresh base/generation, then capture the automatic scene within its freshness window.
