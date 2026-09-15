# Level 4 addendum: visual redaction containment

**Date:** 2026-07-28
**Subsystem:** Glove visual privacy foundation
**Capability change:** stricter validation only; capture remains disabled by default

## Atomic unit

`EphemeralVisualFrame` copies RGBA bytes into an ephemeral buffer, applies approved frame-local redactions, hashes the resulting bytes, reports redaction metadata, and zeroizes the buffer on disposal.

## Finding

The low-level redactor clamped coordinates to frame dimensions. That is safe for memory access, but unsafe for evidence: a wholly out-of-frame redaction changed no pixel while `redactedRegionCount` still increased. A partially outside region was silently smaller than requested. Downstream evidence could therefore claim more privacy treatment than occurred.

## Required invariant

Every redaction is parsed and proven wholly contained in `{x: 0, y: 0, width: frame.width, height: frame.height}` before the constructor copies any source bytes. Only then may redaction and metadata accounting occur.

The consent region may use desktop coordinates; redactions use frame-local coordinates because the byte buffer begins at local pixel `(0, 0)`.

## Failure behavior

- partial overflow: reject the entire frame;
- full overflow: reject the entire frame;
- malformed/zero/negative region: schema rejection;
- valid contained region: redact exact pixels and count exactly once;
- rejection: no frame object or privacy metadata is produced.

## Evidence

Unit tests cover partial overflow, full overflow, nonzero desktop-origin consent, exact contained redaction, pixel bytes, and count. Existing disabled-by-default, approval, indicator, lease, frame-budget, grounding, ephemeral JSON, and disposal tests remain required.

## Residual risk

No live capture provider, protected-surface detector, indicator process, independent stop, retention service, or privacy acceptance exists. This guard does not promote visual capture.

## Rollback

Revert the containment commit. The stronger safe rollback is to keep visual capture disabled, which remains the default.

