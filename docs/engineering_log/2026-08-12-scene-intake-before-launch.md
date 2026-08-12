# Scene intake before producer launch

- Goal: remove the live automatic-producer connection race by arming the one-use scene intake before process creation.
- Master-plan phase/gate: M2 / SCN-001; no promotion is claimed.
- Ownership: Field guest runtime. Glove authority is unchanged.
- Files changed: `FieldSceneSession.cs`, focused .NET tests, failure matrix, Level 4 audit, and this log.
- Identity/generation/policy: exact Field, generation, boot, session, SID, executable digest, and SYSTEM-only launch checks are unchanged. A fresh immutable base and generation are required for live validation.
- Live evidence: G7 authenticated channel passed with three increasing heartbeats. Its valid scene session launched no persistent producer and published no scene. Source inspection showed process creation preceded construction of the producer's one-use named-pipe listener.
- Implementation: each cycle arms the exact-boot listener first, then launches if needed, then accepts. Launch failure explicitly disarms and disposes the listener. Arm failure prevents launch and invalidates.
- Tests: focused runner and runtime-hook tests cover arm-before-launch-before-accept, one arm per cycle, arm refusal, and launch-failure disarm.
- Security/privacy: no new authority, recording, screenshot, UI text, secret, network, or input path.
- Failure behavior: listener creation failure denies launch; launch failure releases the listener; acceptance and publication retain existing fail-closed handling and no blind retry.
- Storage: source only. Live validation requires a new immutable base and disposable overlay; v30 and G7 are not modified.
- Rollback: revert this slice and retain the diagnosed automatic-launch race.
- Next slice: full validation, derive the next immutable base, and rerun automatic scene production in a fresh generation.
