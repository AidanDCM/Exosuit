# Level 4 atomic audit: CHN-001 lifecycle append boundary

## Decision

Approved for source validation. An active CHN acquisition may coexist with one
tracked evidence-state change: an append to the signed Field lifecycle ledger for
the session's exact Field, generation, and host machine. Source identity remains the
exact unchanged `HEAD` commit. This does not approve CHN evidence or promotion.

## Trigger

The first authenticated G2 capture succeeded, but the harness's all-files clean-tree
rule made the required sequence impossible: signing `created` and `booted` dirtied the
tracked lifecycle ledger, while the post-attestation heartbeat had to be captured only
after those events. Backdating, hiding the diff, or importing it later would weaken the
evidence boundary, so G2 was stopped before any lifecycle event was written.

## Authority and identity

- No Field, Glove, policy, input, recording, model, or promotion authority changes.
- The session still requires its exact `HEAD` commit; source migration is not implied.
- Only `docs/qa/completion/field-lifecycle.json` may differ from `HEAD`.
- The committed events must remain a byte-semantics-equivalent canonical prefix.
- The committed and working ledgers must both pass signature, hash-chain, sequence,
  role, purpose, machine, and lifecycle-state verification.
- Every appended event must name the active session's exact Field, generation, and
  machine. Cross-generation or cross-machine events fail closed.

## Failure behavior

Acquisition stops before capture/import/finalization for source/config changes,
ledger deletion or truncation, committed-prefix mutation, invalid signatures or hash
links, non-contiguous events, invalid lifecycle transitions, another Field generation,
or another machine. The exception is unavailable when a non-default completion state
directory is selected.

## Security and privacy

This narrows an impossible operational rule without weakening source integrity. It
does not expose keys or guest data, and it does not log screenshots, UI text, secrets,
or raw messages. Signed lifecycle state remains visible for review and is never hidden
with index flags or a stash.

## Rollback

Revert this slice and discard any unpromoted fresh-generation session. Never edit a
signed lifecycle event. If accepted evidence is later invalid, use the append-only
revocation/remediation process.
