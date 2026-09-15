# Level 4 Addendum: KVP Chunk Wire-Format Contract

**Date:** 2026-08-11

**Verdict:** pass; converts a standing cross-language assumption into a tested one

## Safety question

The guest writes the KVP wire format and the host reads it in a different language. What catches
a drift between them?

## Implemented controls

- A committed fixture is now the single description of the format. The guest writer must produce
  exactly its entries; the host reader must consume exactly those entries and return the original
  value. A change to either implementation fails a test.
- The fixture pins both branches — whole value and chunked — because a fixture exercising only
  one would leave the other free to drift on both sides at once.
- The exact chunk boundary is pinned from both directions: at the bound stays whole, one
  character past it chunks.
- A non-ASCII case is pinned. A byte-based split would corrupt multi-byte characters at chunk
  edges and surface as a digest failure on the host, far from the writer that caused it.
- The host test tampers a chunk and asserts the digest is what rejects it, so the reader is shown
  to verify rather than to trust the chunks.
- `WriteEnvelope` now calls the same `BuildKvpEntries` the fixture tests, so the tested function
  and the shipped path cannot diverge. Chunks are written before the manifest, so a reader
  catching the value mid-write finds a manifest only once its chunks exist.

## Evidence and residual risk

Four C# contract tests and nine TypeScript contract tests. Agent suite 230/230; TypeScript suite
760 tests across 103 files.

**The contract was checked for vacuity.** The chunk size was temporarily drifted from 1000 to 999
characters and two of the four C# tests failed immediately; the value was then restored and both
suites re-run clean. A contract test that passes for the wrong reason is worse than none.

Residual: the fixture proves the two implementations agree *with each other*, not that either
matches what Hyper-V actually stores and returns. `Read-ExosuitFieldGuestKvp.ps1` is a third
implementation of the same format and is not covered by the fixture. No real KVP value has been
round-tripped through a hypervisor. SCN-001 remains `source_validated`.

## Rollback

Delete the fixture and both contract tests. Restoring the inline chunking in `WriteEnvelope` is
optional and independent.
