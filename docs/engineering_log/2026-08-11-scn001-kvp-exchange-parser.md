# SCN-001 guest exchange parser

- **Goal:** turn raw Hyper-V `GuestExchangeItems` into the flat snapshot the scene reader and
  host monitor already consume. This was the missing link between a real host KVP query and the
  TypeScript scene path.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion.
- **Files changed:** `src/fieldKvpExchangeParser.ts` (new), its tests, this log, a Level 4 audit.

## Why this deliberately avoids a general XML parser

The input is attacker-influenced. The guest writes these values, and a compromised guest controls
the bytes entirely. A general XML parser brings entity expansion and external-entity resolution
with it, and the mitigation is always a configuration flag that someone can later flip — the
safety then depends on a setting rather than on the shape of the code.

The structure actually needed is two fixed properties at fixed paths, so the parser is a strict
targeted extraction that understands nothing else. There is no document model, no entity table,
and no resolver to disable.

A document declaring a `DOCTYPE` or an `ENTITY` is rejected outright rather than parsed
carefully. There is no legitimate reason for either to appear in a KVP exchange item, so its
presence is itself the finding. A test drives a classic XXE payload at it and asserts rejection.

Only the five predefined entities are decoded. Numeric character references are left alone,
because expanding them is not needed here and every expansion rule is another thing a hostile
guest can aim at. The ampersand is decoded last so a decoded value cannot be re-decoded into a
different entity — `&amp;lt;` yields `&lt;` and stops, which a test pins.

## Other decisions

- **A duplicate name is a hard failure, not last-one-wins.** Two values for one key means the
  snapshot is ambiguous, and silently picking one hands the reader a value it cannot attribute.
- **Invalid items are reported with their index, never dropped silently.** The snapshot still
  builds from the valid remainder, so one bad item cannot blank an otherwise usable exchange, but
  the failure is always visible.
- Item size and item count are bounded so a hostile guest cannot make the host chew.
- Names outside the `Exosuit.Field.` prefix are ignored rather than reported: the exchange
  legitimately carries OS-provided values, and treating those as failures would bury real ones.

- **Identity/generation/policy impact:** none. Pure function; no I/O, no authority.
- **Tests:** 15 — extraction, prefix filtering, entity decoding, no re-decoding, DOCTYPE and
  ENTITY rejection, oversize, missing properties, empty data, multi-item snapshot, chunk-key
  preservation, duplicate handling, indexed failure reporting, item-count bound, empty exchange.
- **Commands actually run:** `npm run typecheck`, the focused test file.
- **Results/evidence:** typecheck passed; focused suite 15/15.
- **Unvalidated:** no real `GuestExchangeItems` output has been parsed. The CIM-XML shape is taken
  from the existing `Read-ExosuitFieldGuestKvp.ps1`, which reads the same properties, but the two
  have not been run against the same live data. Nothing calls this parser yet.
  SCN-001 remains `source_validated`.
- **Security/privacy:** handles opaque strings; logs nothing.
- **Rollback:** delete the module and its tests.
- **Next:** a host query that actually produces `GuestExchangeItems` and feeds this parser, which
  would complete the host read path end to end.
