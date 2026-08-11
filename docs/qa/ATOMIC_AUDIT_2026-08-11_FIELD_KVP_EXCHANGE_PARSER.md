# Level 4 Addendum: Guest Exchange Parser

**Date:** 2026-08-11

**Verdict:** pass as a hardened pure function; unwired and never run against real Hyper-V output

## Safety question

The guest writes these bytes, and a compromised guest controls them entirely. Can parsing them
be turned against the host?

## Implemented controls

- No general XML parser. Entity expansion and external-entity resolution are not disabled by
  configuration — they are absent, because there is no document model, no entity table, and no
  resolver in the code at all. The parser understands two fixed properties at fixed paths and
  nothing else.
- A `DOCTYPE` or `ENTITY` declaration is rejected outright rather than parsed carefully. Neither
  has a legitimate reason to appear in a KVP exchange item, so presence is the finding. Tested
  with a classic XXE payload aimed at a local file.
- Only the five predefined entities are decoded. Numeric character references are left alone,
  because expanding them is unnecessary here and every expansion rule is another target. The
  ampersand is decoded last so a decoded value cannot be re-decoded into a different entity;
  `&amp;lt;` yields `&lt;` and stops.
- Item size and item count are bounded, so a hostile guest cannot make the host chew on an
  oversized or unbounded exchange.
- A duplicate name is a hard failure rather than last-one-wins: two values for one key make the
  snapshot ambiguous, and silently picking one hands the reader a value it cannot attribute.
- Invalid items are reported with their index and never dropped silently, while the valid
  remainder still builds — one bad item cannot blank a usable exchange, and cannot hide either.
- Names outside the `Exosuit.Field.` prefix are ignored rather than reported, because the
  exchange legitimately carries OS values and treating those as failures would bury real ones.

## Evidence and residual risk

Fifteen tests; typecheck passes.

Unproven: no real `GuestExchangeItems` output has been parsed. The CIM-XML shape is taken from
the existing `Read-ExosuitFieldGuestKvp.ps1`, which reads the same two properties, but the two
implementations have never been run against the same live data — agreement is argued from source,
not demonstrated. Nothing calls this parser yet. SCN-001 remains `source_validated`.

## Rollback

Delete the module and its tests. Nothing depends on it.
