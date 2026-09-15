# Level 4 Addendum: KVP Contract — PowerShell Reader

**Date:** 2026-08-11

**Verdict:** pass; the third implementation of the wire format is now bound to the same fixture,
with no change to the live-path script

## Safety question

Three implementations of one wire format existed. Two were bound to a fixture. What kept the
third — the one that actually runs during live evidence ceremonies — in agreement?

## Implemented controls

- The shipped `Resolve-KvpEnvelope` text is extracted from `Read-ExosuitFieldGuestKvp.ps1` and
  evaluated verbatim against a stubbed data source. What is tested is exactly what ships.
- **The script was not refactored to make it testable.** It participates in live evidence
  ceremonies, and extracting the function into a dot-sourced module would have changed the code
  that runs during a ceremony for no operational reason.
- The extraction is guarded: if the function is renamed or stops being top-level, the test fails
  loudly rather than silently testing nothing.
- The PowerShell reader is shown to reject a tampered chunk on the digest and a missing chunk,
  matching the other two readers rather than merely parsing successfully.

## Evidence and residual risk

Seven tests; typecheck passes. All three implementations — C# writer, TypeScript reader,
PowerShell reader — are now asserted against `tests/fixtures/kvp-chunk-contract.json`.

Two harness defects were found and fixed, both of which produced failures that looked like defects
in the PowerShell reader and were not: JSON quoting emitted `\"` into PowerShell double-quoted
strings, and the console codepage replaced non-ASCII characters with U+FFFD on the way out. Values
now cross as single-quoted PowerShell literals and results return as base64 over UTF-8. A test
that fails for a reason other than the one it names is worse than no test — here it would have
accused a correct implementation.

Residual: the fixture proves the three implementations agree with each other, not that any matches
what Hyper-V actually stores and returns. No real KVP value has been round-tripped through a
hypervisor. The rest of the script — the CIM query, the retry loop's timing behaviour, evidence
writing — remains uncovered. SCN-001 remains `source_validated`.

## Rollback

Delete the test file. No source or script changes to revert.
