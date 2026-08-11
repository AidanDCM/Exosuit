# KVP chunk contract — PowerShell reader

- **Goal:** bring the third implementation of the KVP wire format under the same fixture, so no
  implementation of the format is untested against the others.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion.
- **Files changed:** `tests/kvpChunkContractPowerShell.test.ts`, this log, a Level 4 audit. **No
  source or script change.**

## The live-path script was deliberately not refactored

`Read-ExosuitFieldGuestKvp.ps1` participates in live evidence ceremonies. Extracting
`Resolve-KvpEnvelope` into a dot-sourced module would have made it trivially testable, and would
also have changed the code that runs during a ceremony for no operational reason. That is not a
trade worth making unilaterally.

Instead the test reads the shipped script, extracts the `Resolve-KvpEnvelope` text verbatim, and
evaluates it against a stubbed `Get-FieldKvpItems`. What is under test is exactly the text that
ships. If the function is renamed or stops being top-level, the extraction assertion fails loudly
rather than silently testing nothing.

## Two harness defects worth recording

Both produced failures that looked like defects in the PowerShell reader and were not.

**JSON quoting into PowerShell.** The fixture values are JSON, so `JSON.stringify` emits `\"`
escapes. In a PowerShell double-quoted string a backslash is literal and the quote terminates the
string, so every case failed with empty output. Values are now emitted as single-quoted
PowerShell literals with `''` escaping, which also stops `$` from interpolating.

**Console codepage.** `powershell.exe` writes stdout in the console codepage, which replaced the
non-ASCII case's characters with U+FFFD. The reassembly was correct; the terminal was not. The
resolved value now crosses as base64 over UTF-8, so the assertion is about the reassembly logic
rather than about the encoding of the pipe it came back through.

A test that fails for a reason other than the one it names is worse than no test, in either
direction: here it would have accused a correct implementation.

## What is now bound

The C# writer, the TypeScript reader, and the PowerShell reader are all asserted against
`tests/fixtures/kvp-chunk-contract.json`: whole values, chunked values, the exact boundary,
a realistic multi-chunk envelope, and non-ASCII content. The PowerShell reader is additionally
shown to reject a tampered chunk on the digest and a missing chunk, matching the other two.

- **Identity/generation/policy impact:** none. Tests only.
- **Tests:** 7 — five fixture cases plus digest tampering and a missing chunk.
- **Commands actually run:** `npm run typecheck`, the focused test file, the full TypeScript
  suite, `npm run validate:repository`, `npm run validate:field-contract`.
- **Results/evidence:** typecheck passed; focused suite 7/7.
- **Unvalidated:** the fixture proves the three implementations agree with each other, not that
  any of them matches what Hyper-V actually stores and returns. No real KVP value has been
  round-tripped through a hypervisor. The rest of `Read-ExosuitFieldGuestKvp.ps1` — the CIM query,
  the retry loop's timing, evidence writing — remains uncovered. SCN-001 remains
  `source_validated`.
- **Rollback:** delete the test file. Nothing else changes.
