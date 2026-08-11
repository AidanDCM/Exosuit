# Scene wire contract, and the two defects it found

- **Goal:** pin a signed **scene observation** across C# and TypeScript, the way
  `field-channel-v1.json` already pins a heartbeat.
- **Outcome:** the fixture worked. It found two real defects immediately, one fixed here and one
  left open because fixing it is a decision rather than a repair.

## Why the gap existed

`field-channel-v1.json` binds the envelope machinery across both languages — but only for a
heartbeat. Heartbeat payloads are flat dictionaries of primitives and pre-formatted strings.

A scene payload is a nested `DesktopObservation` with enums, a timestamp, and arrays, produced by
`FieldSceneProducerBoundary` in C# and consumed by `FieldSceneChannelReceiver` in TypeScript.
Those two agreed only because each was written from the same description. That is the same class
of gap the KVP chunk fixture closed, in a more consequential place.

The fixture is generated from the real C# producer boundary and signing path, not hand-authored.

## Defect 1 — envelope timestamps were not canonical. Fixed.

`SerializeEnvelope` wrote `"sentAt":"2026-08-11T12:00:01+00:00"`. The TypeScript schema requires
`.fffZ` and rejects the offset form, so every guest envelope failed to parse on the host before
any signature was considered.

Latent because the CHN-001 path verifies with the **C#** reader, which parses both. The TypeScript
receiver is the M2 scene path and had never seen a real guest envelope.

Fixed with `CanonicalUtcDateTimeOffsetConverter`. It changes **no signature and no hash**: signing
payloads are built from a separately formatted canonical string, and `payloadHash` covers the
payload. Only the JSON rendering of a timestamp changes. Read stays permissive, write strict —
this side should not break on a peer's formatting while never emitting a format a peer must
tolerate.

## Defect 2 — scene payload hashes disagree across languages. Open.

With the envelope parsing, the receiver rejects with `Field channel payload hash is invalid`.
C# declares one hash, TypeScript computes another. **Each language is self-consistent**: the C#
wire-contract tests pass 5/5, verifying C#'s own envelope including its hash.

Ruled out by measurement rather than reasoning: character escaping (emulating C#'s `+` escaping in
TypeScript produced a byte-identical string and hash), enum representation, field values, and key
ordering. The cause is not yet isolated and the write-up does not guess at it.

**Not fixed here.** The fix changes payload canonicalisation, which changes `payloadHash`, which
the signature covers — on the channel CHN-001 evidence has already passed on. That warrants a
deliberate decision about re-verifying existing artifacts, not a change made while chasing a test
failure, and not one landed immediately before a live session.

Full detail: `docs/qa/RESOLVED_2026-08-11_SCENE_PAYLOAD_HASH.md`.

**Update, same day:** both defects are now fixed and all seven cases pass. See
`docs/engineering_log/2026-08-11-scene-payload-hash-fix.md`.

## What this means for the runbook

The runbook's "where this is most likely to break first" list did not include this, and should
have. **SCN-001.L2 cannot pass as things stand.** A scene will reach the host, parse, and fail
hash verification — presenting as `scene rejected: Field channel payload hash is invalid`, with
the monitor invalidating on that reason. That is correct fail-closed behaviour and it is not the
ceremony passing. Running the session now would prove the transport and the fail-closed path, and
nothing about scene acceptance.

## Tests

Three TypeScript cases are **skipped and marked**, pointing at the defect document. Skipped rather
than deleted or weakened: the assertions are correct and the product is wrong. Deleting them would
erase the finding; loosening them would manufacture a green.

- **C#:** 5 — verifies the canonical signed scene envelope, no UI text in the fixture, structure
  preserved without content, and rejection under a wrong key ID and a wrong secret.
- **TypeScript:** 4 passing — parses as a scene envelope, rejects a wrong secret, rejects a
  mismatched heartbeat boot, rejects a mutated payload. 3 skipped on the open defect.

## Results

- Agent suite **250/250**; TypeScript **799 passed, 3 skipped** across 107 files.
- Typecheck, `validate:repository`, `validate:field-contract` all pass.
- SCN-001 remains `source_validated`. It is now further from promotion than it looked yesterday,
  which is the fixture doing its job.
