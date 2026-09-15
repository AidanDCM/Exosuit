# Fixing the scene payload hash disagreement

- **Goal:** make a C#-signed scene verifiable by the TypeScript host.
- **Outcome:** fixed. All seven cross-language scene cases pass. SCN-001.L2 is unblocked.
- **Files changed:** `CanonicalJson.Options`, `FieldSceneProducerBoundary`'s wire options, the
  regenerated fixture, the un-skipped tests, the resolved defect record, this log.

## The cause, isolated by byte-level diff

Exactly one difference between the two canonical strings, at character 380:

```
C#:  "capturedAt":"2026-08-11T12:00:00\u002B00:00"
TS:  "capturedAt":"2026-08-11T12:00:00+00:00"
```

`System.Text.Json`'s default encoder escapes `+` as six characters; `JSON.stringify` does not.
Five extra bytes, a different SHA-256, and a scene the host could never accept.

An earlier note in this branch claimed escaping had been ruled out by measurement. That was
wrong — the probe behind it was flawed — and the correction is recorded rather than quietly
edited, because a wrong exoneration sends the next reader away from the answer.

## Both fixes, because either alone is unsatisfying

**1. Relaxed the C# encoder.** `JavaScriptEncoder.UnsafeRelaxedJsonEscaping` in
`CanonicalJson.Options`. "Unsafe" refers to HTML and script injection contexts; these bytes are
hashed and compared, never interpolated into markup or script. The relaxed encoder is correct here
and the strict default was actively wrong. This closes the whole class: `&`, `<`, `>` and
non-ASCII would each have produced the same failure.

**2. Canonical scene timestamps.** `capturedAt` was written in offset form while `sentAt` used
canonical milliseconds — two formats in one message, and the only thing in the payload carrying a
character for the encoder to escape. A scene timestamp is a wire timestamp and now uses the same
converter.

Fix 2 alone would have made the symptom vanish and left the defect armed for the next payload
containing an escapable character. Fix 1 alone would have left an inconsistency that keeps
producing candidates. Together they are the honest repair.

## Blast radius, measured before acting

All 115 artifact JSON files in the CHN-001 g3 run, covering 106 channel payloads: none contains
`+`, `<`, `>`, `&`, or non-ASCII. No existing payload hash changes. That measurement is what
turned "this touches passed evidence, so hold" into a decision the owner could actually make.

## A second defect the first was hiding

With the hash fixed, one un-skipped test still failed: it asserted `sceneVersion: 1` where the
value tracks the envelope sequence, 7. My expectation was wrong, not the product. It had been
invisible because the hash failure aborted before the assertion was reached — a reminder that a
blocking defect conceals whatever sits behind it, and that un-skipping is not a formality.

## Verification

- Cross-language scene fixture: **7/7**, including a C#-signed scene accepted by
  `FieldSceneChannelReceiver` yielding one active window, two elements, canonical `capturedAt`.
- Agent suite **250/250**; TypeScript **802/802** across 107 files.
- `validate:repository`, `validate:field-contract`, `validate:completion` all pass.
- Gate unchanged: CHN-001 `passed`, SCN-001 `source_validated`, promotion denied.

## What this does not prove

A scene crosses the path *in source*. Nothing has run on a guest. Every item in the SCN-001
runbook's failure-prediction list is still open, and that list should have included this defect —
it was written from what was untested, rather than from what was untested *and unproven between
components*. The fixture is what closes that kind of gap; more of them would be the way to find
the next one before a live session does.
