# Level 4 Addendum: Hyper-V Guest Exchange Reader

**Date:** 2026-08-11

**Verdict:** pass for identity constraint, injection resistance, and decoding; never executed

## Safety question

Can the host be pointed at the wrong VM, or can a guest-controlled response corrupt what the host
believes it read?

## Implemented controls

- **The VM name never enters the script text.** It crosses as an environment variable, so no
  quoting or escaping exists to get wrong. The name whitelist still applies as defence in depth,
  but correctness here does not rest on it. Asserted by test.
- **Exactly one VM must match.** Zero is a missing Field; more than one is ambiguous. Either
  alternative yields an authentic snapshot from a VM nobody chose, which no signature check
  downstream can detect.
- **Output crosses as base64 over UTF-8**, because `powershell.exe` writes stdout in the console
  codepage and silently replaces non-ASCII with U+FFFD. A mangled scene payload would fail its
  digest on the host and present as guest corruption.
- **Empty output is a failed query, not an empty exchange.** The two are different answers and are
  kept distinct all the way to `readGuestKvpSnapshot`.
- The reader parses nothing and decides nothing about trust; it returns raw items.
- **No process execution in `src/`.** The first version placed `execFile` there and the repository
  validator rejected it outright. The runner is now injected and the only implementation that
  spawns a process lives in `scripts/`, with the script text exported from the source module so
  the two cannot drift. Two tests assert the boundary rather than relying on the validator alone.

## Evidence and residual risk

Sixteen tests; typecheck and `validate:repository` pass.

`scripts/field-kvp-powershell-runner.mjs` has **never run**. No Hyper-V query has been executed, so the CIM class
names, the association traversal to `Msvm_KvpExchangeComponent`, and the real shape of
`GuestExchangeItems` are taken from the existing PowerShell script rather than observed. The first
live run is the test of that, and it is the most likely place for this slice to be wrong.

SCN-001 remains `source_validated`.

## Rollback

Delete the module and its tests. Nothing constructs the reader yet.
