# Scene producer user environment

- Goal: launch the unprivileged interactive scene producer with the target user token's environment rather than the LocalSystem service environment.
- Master-plan phase/gate: M2 / SCN-001; no promotion is claimed.
- Ownership: Field guest runtime; Glove authority is unchanged.
- Files changed: scene producer launcher, focused tests, failure matrix, Level 4 audit, and this log.
- Identity/generation/policy: exact session, SID, fixed path, recomputed digest, and SYSTEM-only launcher checks are unchanged. A rebuilt generation is required; generation 6 is not modified in place.
- Live evidence: G6 authenticated channel passed; a manually launched session-2 producer produced a fresh authenticated structural scene. The service-launched process exited before connecting.
- Implementation: `CreateEnvironmentBlock(primaryToken, inherit: false)` supplies the target user's environment to `CreateProcessAsUser`; `DestroyEnvironmentBlock` runs in `finally`.
- Tests: 20 focused launcher tests passed.
- Security/privacy: no new authority, recording, UI text, screenshot, secret, network, or input path. Environment bytes are supplied directly by Windows and are not logged.
- Failure behavior: environment creation failure denies launch; cleanup failure is surfaced; no scene is treated as ready without authenticated publication.
- Rollback: revert this slice and retain the prior fail-closed manual-only diagnosis.
- Next slice: full validation, immutable base derivation, fresh generation, automatic-producer live verification.

