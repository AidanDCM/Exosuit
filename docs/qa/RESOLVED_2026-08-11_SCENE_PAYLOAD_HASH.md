# RESOLVED — a guest scene could not be verified by the host

**Found:** 2026-08-11, by the scene wire-contract fixture.
**Status:** RESOLVED 2026-08-11. Both fixes applied and verified. No longer blocks SCN-001.
**Severity:** every scene the guest publishes would be rejected by the host.

## Two defects, one found while fixing the other

### 1. Envelope timestamps were not canonical — FIXED

`FieldKvpRuntime.SerializeEnvelope` wrote `"sentAt":"2026-08-11T12:00:01+00:00"`. The TypeScript
envelope schema requires `yyyy-MM-ddTHH:mm:ss.fffZ` and rejects the offset form outright, so every
guest envelope failed to parse on the host before any signature was even considered.

It was latent because the guest→host path exercised by CHN-001 verifies with the **C#** reader,
which parses both forms. The TypeScript receiver is the M2 scene path and had never run against a
real guest envelope.

Fixed by `CanonicalUtcDateTimeOffsetConverter`, registered in the wire JSON options. **This changes
no signature and no hash**: signing payloads are built from a separately formatted canonical
string, and `payloadHash` covers the payload only. It changes how a timestamp is written into
JSON, nothing else.

### 2. Scene payload hashes disagree across languages — OPEN

With the envelope parsing, the receiver now rejects with:

```
Field channel payload hash is invalid.
```

- C# declares  `29d88e85cef893d4f3ef1a5228005f7e00a698dbc56a4f0de0f8f382ad541051`
- TypeScript computes `db3ab48e72e07a8122e0e5af6ce88f3e316bfbbaaa12c4e5a4233f1d6ceb9665`

**Each language is self-consistent.** `FieldSceneWireContractTests` passes 5/5: C# verifies its own
serialized envelope, including the hash. TypeScript verifies envelopes it creates. They disagree
only with each other.

**Heartbeat payloads agree**, which is why nothing caught this: `field-channel-v1.json` pins a
heartbeat across both languages and passes. Heartbeat payloads are flat dictionaries of primitives
and pre-formatted strings. Scene payloads carry a nested `DesktopObservation` with enums, a
timestamp, and arrays — and that is where the two canonicalisations part company.

## Cause — isolated 2026-08-11

A byte-level diff of the two canonical strings for the identical payload shows **exactly one
difference**, at character 380:

```
C#:  "capturedAt":"2026-08-11T12:00:00\u002B00:00"
TS:  "capturedAt":"2026-08-11T12:00:00+00:00"
```

`System.Text.Json`'s default encoder escapes `+` as the six characters `\u002B`. TypeScript's `JSON.stringify` does
not. The strings are otherwise identical, so the hashes diverge on those five extra characters.

Confirmed rather than inferred:

- `sha256(C# canonical)` reproduces the declared `payloadHash` exactly.
- Replacing `\u002B` with `+` makes the C# string **byte-identical** to the TypeScript string,
  and the hashes then match.
- The escape occurs **once**; there are no other escapes in the payload.

### Correction to an earlier claim

An earlier revision of this document stated that character escaping had been "ruled out by
measurement". **That was wrong.** The probe behind it was flawed, and escaping is the entire
cause. The byte-level diff supersedes it. Recorded rather than quietly edited, because a wrong
exoneration is worse than an open question — it sends the next reader away from the answer.

## Blast radius on existing evidence — measured

All 115 artifact JSON files in the CHN-001 g3 run were scanned: **106 channel payloads, none
containing `+`, `<`, `>`, `&`, or any non-ASCII character.** Nothing C# would escape appears in
any payload of the passed live evidence.

So a fix that changes the encoder would leave every existing CHN-001 payload hash unchanged. The
re-verification concern that motivated leaving this open is, empirically, nil for the artifacts
that exist today.

## Candidate fixes

Two, and they are independent:

1. **Relax the C# encoder** in `CanonicalJson.Options` to `UnsafeRelaxedJsonEscaping`, so C#
   emits `+`, `<`, `>`, `&` and non-ASCII the way TypeScript does. This is the general fix; it
   closes the class, not just this instance.
2. **Make `capturedAt` canonical** (`.fffZ`, like every other wire timestamp). This removes the
   `+` from scene payloads and is correct independently — a scene timestamp should not be written
   in a different format from `sentAt`. On its own it hides the escaping mismatch rather than
   fixing it, leaving it latent for any future payload containing `&`, `<`, `>`, or non-ASCII.

Doing both is the honest repair: 1 fixes the defect, 2 fixes an inconsistency that would
otherwise keep producing candidates for it.

Either changes `payloadHash` for payloads containing such characters, and the signature covers
`payloadHash`. The measurement above says no existing artifact is in that set, but that is a
statement about today's evidence, not a guarantee about any artifact anyone else holds.

## Resolution

Both candidate fixes were applied, because either alone would have been unsatisfying: the encoder
change closes the class, and the timestamp change removes the inconsistency that produced this
instance of it.

1. `CanonicalJson.Options` now uses `JavaScriptEncoder.UnsafeRelaxedJsonEscaping`. "Unsafe" refers
   to HTML and script injection contexts; these bytes are hashed and compared, never interpolated
   into markup, so the relaxed encoder is correct here and the strict default was actively wrong.
2. `FieldSceneProducerBoundary`'s wire options now use `CanonicalUtcDateTimeOffsetConverter`, so
   `capturedAt` is written as canonical milliseconds like every other wire timestamp. Two formats
   in one message was the underlying inconsistency, and the offset form was the only thing in the
   payload carrying a character for the encoder to escape.

Verified: a C#-signed scene envelope, generated from the real producer boundary and signing path,
is now accepted by `FieldSceneChannelReceiver` and yields a usable scene — one active window, two
elements, `capturedAt` canonical, `sceneVersion` tracking the envelope sequence.

The three previously skipped tests are un-skipped and pass. One of them had a wrong expectation of
its own — it asserted `sceneVersion: 1` where the value tracks the envelope sequence, 7 — which
only became visible once the hash defect stopped masking it.

Suites after the fix: agent 250/250, TypeScript 802/802 across 107 files, both validators pass.
Existing CHN-001 evidence is unaffected, as the blast-radius measurement predicted: no payload in
that run contains a character the encoder change would treat differently.

## Consequences for the SCN-001 session

**SCN-001.L2 is no longer blocked by this.** The runbook's "where this is most likely to break
first" list did not include this defect and should have; that omission is the lesson worth keeping,
since the list was written from what was untested rather than from what was untested *and
unproven between components*.

A scene can now cross the authenticated path in source. Whether it does so on a real guest is
still unproven — everything in the runbook's prediction list remains open.

## Reproduction

```
npx vitest run tests/fieldSceneWireContract.test.ts
```

All seven cases pass. They were skipped and marked while the defect was open, rather than deleted
or weakened, because the assertions were correct and the product was wrong.

`tests/fixtures/field-scene-v1.json` was generated from the real C# producer boundary and signing
path, not hand-authored.
