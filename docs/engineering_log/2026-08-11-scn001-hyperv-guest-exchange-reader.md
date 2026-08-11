# SCN-001 Hyper-V guest exchange reader

- **Goal:** implement the `GuestExchangeReader` the host read path has been missing, so the path
  is executable the moment a guest exists.
- **Master-plan phase/gate:** M2 / SCN-001; no live promotion.
- **Files changed:** `src/fieldKvpHyperVReader.ts` (new), its tests, this log, a Level 4 audit.

## Correcting an earlier claim

The previous status said this "cannot be written without a live guest to point it at". That was
wrong, and worth correcting rather than quietly working around: only its *execution* needs a
guest. The command construction, the identity constraint, and the response decoding are all
ordinary logic, and all three are where the mistakes live.

## Three deliberate decisions, each learned earlier on this branch

**The VM name never enters the script text.** It crosses as an environment variable, so there is
no quoting or escaping to get right at all. The whitelist in `fieldKvpHostQuery` still applies as
defence in depth, but this path does not depend on it. A test asserts the name is absent from the
script and present in the environment.

**Output crosses as base64 over UTF-8.** `powershell.exe` writes stdout in the console codepage,
which silently replaces non-ASCII with U+FFFD. This branch already hit that once, in the
PowerShell contract test, where it looked like a defect in a correct implementation. Here the
consequence would have been worse: a mangled scene payload fails its digest on the host and looks
like guest corruption.

**Exactly one VM must match.** Zero is a missing Field; more than one is ambiguous. Picking either
would produce a perfectly authentic snapshot — correct signatures, correct digests — from a VM
nobody chose, which no downstream check can catch.

## A repository rule I violated, and the better design it forced

My first version put `execFile` in `src/fieldKvpHyperVReader.ts`. `npm run validate:repository`
failed immediately:

```
- src/fieldKvpHyperVReader.ts: arbitrary process execution is excluded
```

Every module under `src/` is treated as security-relevant, and the validator forbids importing
`node:child_process` or calling exec/spawn there at all. I compounded it by piping the validator
through `tail -1`, seeing the message, and committing anyway without checking the exit code. The
commit was amended rather than followed by a fix, so the branch never contains a state that fails
the validator.

The rule produced a better design than the one I had. The runner is now always injected, the only
implementation that spawns a process lives in `scripts/field-kvp-powershell-runner.mjs`, and the
script text is exported from the source module so the out-of-tree runner cannot drift from what
the reader expects. Everything decided in `src/` stays a pure function of its inputs. Two tests
assert the boundary directly, so a reviewer sees the intent rather than only a validator rule.

## A PowerShell shape that would have bitten

`ConvertTo-Json` collapses a one-element array to a scalar, so a guest that has published exactly
one Field value returns a bare string rather than an array. Treating that as malformed would have
broken a common case. The decoder accepts it and normalises to a single-element array.

- **Identity/generation/policy impact:** none. The reader parses nothing and makes no trust
  decision; `parseGuestExchangeItems` and the scene path own all of that.
- **Tests:** 16 — decoding an array, a bare string, null, non-ASCII, surrounding whitespace, empty
  output, unreadable JSON and non-string payloads; plus out-of-band name passing, the
  exactly-one-VM constraint, name refusal without running, failure propagation, and two end-to-end
  cases through `readGuestKvpSnapshot`.
- **Commands actually run:** `npm run typecheck`, the focused test file.
- **Results/evidence:** typecheck passed; focused suite 16/16; `validate:repository` passed with
  88 required artifacts.
- **Unvalidated:** `scripts/field-kvp-powershell-runner.mjs` has never run. No Hyper-V query has been executed, so
  the CIM class names, the association traversal, and the shape of `GuestExchangeItems` on a real
  host are all still taken from the existing `Read-ExosuitFieldGuestKvp.ps1` rather than observed.
  The first live run is the test of that. SCN-001 remains `source_validated`.
- **Security/privacy:** reads opaque exchange strings; logs nothing.
- **Rollback:** delete the module and its tests. Nothing constructs the reader yet.
