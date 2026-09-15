# Level 4 Addendum: Field Task Dispatch Diagnostics

**Date:** 2026-07-28

**Verdict:** source/static pass; live evidence pending

## Safety question

Can offline Task Scheduler diagnosis expose unrelated activity, identities, command arguments, or environment details?

## Controls

- The exact VM must be off and its overlay remains read-only.
- Events are filtered to the exact `\ExosuitFieldGuest` task.
- Only numeric event ID, level, record ID, and UTC timestamp are projected.
- Event messages and property values are excluded.
- SetupComplete text is reduced locally to a fixed category; raw text and excerpts are excluded.
- Task XML projection is limited to enabled/start-when-available/multiple-instance settings in addition to the already reviewed principal/action/trigger metadata.
- Dismount remains bounded and runs in `finally`.

## Hold

No dispatch claim follows until tests pass and a live read-only inspection returns bounded evidence. Production remains denied.

## Rollback

Revert the task-event and setting projection. No runtime component consumes it.
