# KVP chunk wire-format contract

- **Goal:** replace "the guest writer and host reader agree by construction" with a shared
  fixture both must satisfy.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion.
- **Files changed:** `FieldKvpRuntime.BuildKvpEntries` extracted and `WriteEnvelope` refactored to
  use it, `tests/fixtures/kvp-chunk-contract.json`, a C# contract test, a TypeScript contract
  test, this log, a Level 4 audit.

## The gap this closes

Four audits in a row recorded the same caveat: the guest writes the KVP wire format, the host
reads it in another language, and the two agreed only because each was written from the same
description. Nothing would have caught a drift except an unreadable scene on a live guest — the
most expensive place to discover it, and one this project has not yet reached.

The fixture is now the single description. `FieldKvpChunkContractTests` asserts the guest writer
produces exactly its entries; `fieldKvpChunkContract.test.ts` asserts the host reader consumes
exactly the same entries and returns the original value. A change to either implementation fails
a test on one side or the other.

Cases pinned: a short whole value, exactly at the chunk bound, one character past it, a realistic
multi-chunk envelope, and non-ASCII content — the last because a byte-based split would corrupt
multi-byte characters at chunk edges and surface as a digest failure on the *host*, far from the
writer that caused it.

## The contract was checked for vacuity

A test that passes for the wrong reason is worse than none, so the chunk size was temporarily
drifted from 1000 to 999 characters. Two of the four C# contract tests failed immediately. The
value was then restored and both suites re-run clean.

That check exposed a second thing worth recording: restoring the file from a backup preserved the
backup's older timestamp, so MSBuild considered the project up to date and the *stale* binary kept
failing. The fix was to touch the file. Worth knowing, because the failure looks exactly like a
real regression and would otherwise send someone hunting a bug that no longer exists.

## Refactor note

`WriteEnvelope` now calls `BuildKvpEntries` rather than carrying its own copy of the chunking
logic, so the tested function and the shipped path cannot diverge either. Chunks are written
before the manifest, so a reader catching the value mid-write finds a manifest only once its
chunks exist.

- **Identity/generation/policy impact:** none. Same wire format, one implementation instead of two.
- **Tests:** 4 C# contract tests, 9 TypeScript contract tests.
- **Commands actually run:** .NET SDK 8.0.423 Release build with `-warnaserror`, focused and full
  agent test runs, `npm run typecheck`, the focused TypeScript file, the full TypeScript suite,
  `npm run validate:repository`, `npm run validate:field-contract`.
- **Results/evidence:** build 0 warnings / 0 errors. Agent suite **230/230**, up from 226.
  TypeScript suite **760 tests across 103 files**, up from 728/100. Repository validation 88
  artifacts. Field-contract validation 88 artifacts / 28 modules.
- **Unvalidated:** the fixture proves the two implementations agree with each other, not that
  either matches what Hyper-V actually stores and returns. `Read-ExosuitFieldGuestKvp.ps1` is a
  third implementation of the same format and is still not covered by this fixture. No real KVP
  value has been round-tripped. SCN-001 remains `source_validated`.
- **Rollback:** delete the fixture and both contract tests; restore the inline chunking in
  `WriteEnvelope` if the extraction is unwanted.
- **Next:** bring the PowerShell reader under the same fixture, which would leave no
  implementation of this format untested against the others.
