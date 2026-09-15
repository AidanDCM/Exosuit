# SCN-001 host guest-KVP query

- **Goal:** complete the host read path — take a VM name, obtain its guest exchange, and produce
  the parsed snapshot the scene monitor consumes.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion.
- **Files changed:** `src/fieldKvpHostQuery.ts` (new), its tests, this log, a Level 4 audit.

## The Hyper-V call is injected, and not only for testing

Which VM is being read is the part that can go wrong in a way **no downstream check would
catch**. Reading the wrong VM produces a perfectly authentic snapshot: correct signatures,
correct chunk digests, a valid envelope — from the wrong Field. Keeping that decision in injected
code means it can be exercised without a hypervisor, which is the only way it gets tested at all.

## VM names are constrained, not escaped

The name reaches PowerShell and CIM filters. Escaping is a property of every call site and has to
be got right repeatedly; a whitelist is a property of the value and is got right once. The
pattern admits what a Field VM name can actually contain and nothing else, and the check runs
**before** the hypervisor is called — a test asserts the reader is never invoked for a hostile
name.

## A failed read is not an empty exchange

Returning an empty snapshot on a hypervisor error would let a host-side fault read as "the guest
published nothing", which the monitor downstream treats as a scene that has gone away — an
invalidation attributed to the guest for something that happened on the host. The two are
separate results, with a test that pins the distinction.

Parse failures behave the other way: they do not fail the read. One malformed item must not blank
an otherwise usable snapshot, and the scene reader already invalidates on a missing or corrupt
scene value with its own specific reason. Failures travel alongside the snapshot so a caller can
surface them without losing what parsed.

- **Identity/generation/policy impact:** none. No authority; no signature or binding decisions.
- **Tests:** 8 — valid name, ten hostile name shapes rejected, parsed snapshot, refusal before
  calling the hypervisor, hypervisor error as failure, partial-parse survival, empty-versus-failed
  distinctness, and exact VM-name pass-through.
- **Commands actually run:** `npm run typecheck`, `npm run build`, the focused test file,
  `npm run validate:repository`, `npm run validate:field-contract`.
- **Results/evidence:** typecheck and build passed. Focused suite 8/8. Repository validation 88
  artifacts. Field-contract validation 88 artifacts / 28 modules.
- **Unvalidated:** no `GuestExchangeReader` implementation exists. Nothing has queried real
  Hyper-V, and the CIM path that would supply the items is still only the existing PowerShell
  script. The host read path is now complete in shape — query, parse, reassemble, authenticate,
  fold into readiness — and entirely unexercised against a live guest. SCN-001 remains
  `source_validated`.
- **Security/privacy:** handles opaque strings and a VM name; logs nothing.
- **Rollback:** delete the module and its tests.
- **Next:** a real `GuestExchangeReader` over Hyper-V CIM. That is the first piece of this path
  that cannot be written without a live guest to point it at.
