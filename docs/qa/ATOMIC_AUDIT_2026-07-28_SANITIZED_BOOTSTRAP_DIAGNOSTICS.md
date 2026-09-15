# Level 4 Addendum: Sanitized Bootstrap Diagnostics

**Date:** 2026-07-28

**Verdict:** source/static pass; live inspection pending

## Safety question

Can diagnosing a failed guest bootstrap expose secrets, UI text, environment context, configuration, or log content?

## Controls

- The existing canonical inspector still requires the exact VM be off.
- The overlay remains mounted read-only through bounded Storage-provider calls.
- Only bootstrap report digest, size, manifest digest, report timestamp, check names, booleans, observation timestamps, and derived failed names are projected.
- Check summaries, evidence objects, identity payload, configuration contents, log contents, and secret values are not projected.
- Malformed input fails the inspection; there is no unrestricted fallback.
- Dismount remains in `finally`.

## Hold

No diagnostic claim follows until focused tests pass and one live read-only inspection returns a bounded result. Production remains denied.

## Rollback

Revert the projection. No runtime component consumes it.
