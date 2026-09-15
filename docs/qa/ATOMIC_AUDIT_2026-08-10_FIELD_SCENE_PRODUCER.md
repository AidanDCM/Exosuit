# Level 4 Addendum: Session-Local Structural Scene Producer Boundary

**Date:** 2026-08-10

**Verdict:** compiled source/unit boundary pass; launcher, relay, and live SCN-001 evidence unproven

## Safety question

Can the LocalSystem Field service, a process in the wrong Windows session, a fake/non-observe provider, stale UIA data, hidden screenshots, UI text in ordinary or warning fields, inconsistent graph state, or an oversized tree become a transportable trusted scene?

## Implemented controls

- The producer rejects LocalSystem explicitly and requires a valid nonempty SID plus exact positive configured/process Windows session equality.
- It accepts only `windows-ui-automation` observations in `observe` mode and no screenshot bytes or MIME metadata.
- Observation age is bounded to five seconds by default with two seconds maximum future skew.
- Field/display/boot/agent identities, active window, unique windows/elements, element ownership, bounds, cursor, and modal state are checked.
- Window titles, non-sensitive element names, every element value, and all provider warning text are removed before serialization.
- Sensitive elements additionally lose automation ID and supported actions.
- Counts are capped at 32 windows, 128 elements, and 20 incoming warnings. Final camel-case/snake-enum wire JSON is capped at 12 KiB, leaving headroom inside the existing 16,000-character KVP envelope limit.
- Overflow rejects; it never silently truncates the scene.
- The boundary neither reads the SYSTEM channel key nor writes KVP, launches a process, records data, or executes input.

## Adversarial coverage

.NET tests cover valid structural serialization and absence of private title/value/password/warning/screenshot fields; SYSTEM and wrong-session denial; wrong provider and mutation-mode denial; screenshots and stale data; collection and serialized-byte overflow; out-of-display cursor; unknown modal window; and cross-window element identity.

## Residual risk and promotion limit

The caller SID and process session are arguments to the source boundary; live trust requires a reviewed launcher/relay to derive those facts from the operating system and verify the exact producer executable. There is no named pipe, process launch, KVP scene publication, heartbeat co-transaction, or host acquisition yet. UIA correctness and leakage must be inspected inside the real guest. SCN-001 remains source-validated only.

## Rollback

Do not call `FieldSceneProducerBoundary.Create`; delete the source/test files. Existing heartbeat/channel and host receiver behavior remain unchanged.
