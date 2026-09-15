# Level 4 Addendum: Host KVP Value Reassembly

**Date:** 2026-08-11

**Verdict:** pass as a pure function; unwired and unproven against a real guest snapshot

## Safety question

Can a missing or corrupt scene value be mistaken for a valid one, or be quietly answered with
the last good scene?

## Implemented controls

- Three distinct outcomes — absent, unreadable, ok — so a caller cannot conflate an empty slot
  with a failed digest. Asserted directly by a test comparing the two.
- The reader is stateless, so no last-good value exists to fall back to even accidentally.
- The chunk manifest is identified by exact schema, not by resembling JSON, because scene
  payloads are JSON objects too. A manifest failing the schema is treated as a plain value
  rather than sending the host walking an unbounded key set.
- Chunk count is bounded at 32.
- A missing chunk is named in the failure reason.
- A chunk beyond the declared count is a hard failure: the snapshot holds fragments of two
  writes, and joining the declared prefix would yield a value never published as such.
- Digest is verified over the joined text, matching the guest writer and the existing
  PowerShell reader, so both sides agree on the format.
- Failures return reasons rather than throwing, because every failure has the same correct
  response and a thrown error tends to be caught where it becomes silence.

## Evidence and residual risk

Fifteen tests; typecheck and build pass.

Unproven: no real guest KVP snapshot has been read through this. The module is not wired into
any host path, and `FieldSceneChannelReceiver` — which would verify the envelope after
reassembly — is not connected to it. Format agreement with the guest writer is argued from
reading both implementations plus the existing PowerShell reader, not demonstrated end to end.
SCN-001 remains `source_validated`.

## Rollback

Delete the module and its tests. Nothing depends on it yet.
