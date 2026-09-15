# Scene runtime failure diagnostic

- Goal: preserve the exact fail-closed reason when live SCN-001 scene launch, intake, or publication fails.
- Master-plan phase/gate: M2 / SCN-001; this does not promote the gate.
- Ownership: Field guest runtime. Glove authority is unchanged.
- Files changed: `FieldSceneSession.cs`, focused .NET tests, this log, and the Level 4 audit.
- Identity/policy impact: diagnostics remain bound to the running Field generation; no policy is created or expanded.
- Parts & Pieces/donor patterns: existing bounded guest runtime error logging and overwrite-in-place diagnostics were followed.
- Question resolved: generation 5 published one manually launched scene, then the producer timed out against an absent listener; the service swallowed its precise cycle exception into in-memory invalidation.
- Tests: focused `FieldSceneSessionRunnerTests` and `FieldKvpRuntimeSceneHookTests` (19 passed).
- Evidence class: source/unit plus live failure observation; no live SCN-001 pass is claimed.
- Security/privacy: one fixed 1,000-character log records only exception stage/reason. It contains no secret, screenshot, UI text, scene payload, or channel token.
- Failure behavior: launch, accept, and publish still invalidate and never blind-retry a possibly successful publication.
- Rollback: revert this slice; scene production remains fail closed but loses persistent failure diagnosis.
- Next slice: publish a corrected immutable base, reproduce once, read the bounded diagnostic, then fix the proven platform failure.

