# Pinning the heartbeat payload across languages

- **Goal:** prove the heartbeat the **guest runtime builds** is the heartbeat the **host schema
  parses**, and that it drives the host readiness decision unchanged.
- **Files changed:** `FieldKvpRuntime.BuildHeartbeatPayload` extracted, a generated fixture, C# and
  TypeScript contract tests, this log.

## The gap

`field-channel-v1.json` pins a hand-authored heartbeat envelope. That proves the envelope
machinery agrees across languages; it proves nothing about the payload the guest actually
publishes, because the heartbeat dictionary was built inline inside the runtime loop and nothing
could reach it.

The host keys readiness off exactly three of its fields — `bootId`, `sessionLocked`,
`secureDesktopActive` — so a shape mismatch there would not fail loudly. It would produce a host
that reads a locked guest as unlocked, or fails to parse and invalidates for a transport reason
that is not the truth.

This is the same class of gap that hid two real defects in the scene payload, in the one message
the readiness decision depends on.

## The extraction

`BuildHeartbeatPayload` is a pure function taking the configuration, boot, sequence, observation
time, the three desktop booleans, and working-set bytes. `RunGuestAsync` now calls it. The change
is behaviour-preserving — the same dictionary, in the same order, from the same values — and a C#
test asserts the builder still reproduces every fixture payload canonically, so the extraction
cannot silently drift from what was pinned.

## What is now pinned

Three cases, generated from `BuildHeartbeatPayload` itself: a ready desktop, a locked session, and
an active Secure Desktop.

- **C#:** every case verifies as a signed heartbeat; the builder still reproduces each fixture
  payload; timestamps are canonical at both envelope and payload level.
- **TypeScript:** every case verifies, parses under `fieldHeartbeatSchema`, and — the assertion
  that matters — a guest-built locked heartbeat and Secure Desktop heartbeat each drive
  `FieldSceneHostMonitor` to invalidate with the right reason. Unmodified, no hand translation
  between the two sides.

One test asserts no payload character would canonicalise differently across languages — no `+`,
`<`, `>`, `&`, or non-ASCII. Heartbeats are clean today. That test fails the day one stops being,
rather than at a live session, which is precisely how the scene defect should have been caught.

## Results

- Agent suite **253/253**; TypeScript **813/813** across 108 files.
- `validate:repository`, `validate:field-contract`, `validate:completion` all pass.
- Gate unchanged: CHN-001 `passed`, SCN-001 `source_validated`.

## Still unpinned

The **bootstrap status payload**. `ReadBootstrapStatus` and `BindBootstrapToBoot` are already
internal statics so no extraction is needed, but pinning them requires a bootstrap report fixture
on disk and that was not built here. It is the last guest-produced payload the host consumes that
has no cross-language fixture, and it should be treated as an open gap rather than assumed safe —
the two fixtures written before it each found a real defect on the day they were written.
