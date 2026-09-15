# CHN-001 repeated-observation identity

## Goal and gate

Allow a compiled observer to re-verify an unchanged authenticated KVP envelope without
misclassifying its new local verification timestamp as message mutation. This is a shared
CHN-001 M1 acquisition correction and does not promote the gate.

## Change and impact

- Files changed: CHN harness merge logic/tests, atomic audit, and failure matrix.
- Field identity, generation, VM GUID, policy, boot ID, key ID, nonce, sequence, message
  type, validity window, payload hash, verification status, and transport remain exact.
- Only observer-local `verifiedAt` is excluded from immutable envelope comparison. The
  first accepted verification time is retained so later observation cannot rewrite history.
- Parts & Pieces/donor patterns: none; behavior was derived from the compiled Exosuit
  observer against the live v26 guest.
- No payload, secret, screenshot, guest text, or token enters source or test fixtures.

## Validation and evidence boundary

The first capture succeeded. The second failed before session mutation because the same
handshake ID had a later `verifiedAt`; all signed/security metadata remained identical.
Regression coverage proves re-verification deduplicates while the existing changed-message
and reused-nonce cases still fail closed. Run focused and complete validation after commit.
This is not evidence for any CHN ceremony, stop, cleanup, or promotion.

## Rollback and next slice

Rollback is to revert this commit, restoring rejection of repeated observer verification.
Next, begin a fresh exact-commit session and acquire three distinct live heartbeats before
the separately authorized failure-injection and emergency-stop ceremonies.

