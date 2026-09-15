# Field secret startup process harness

## Goal, phase, and gate

Add executable Windows PowerShell evidence for the protected-secret startup
transaction without introducing a production injection capability. This is a
Field Phase 4 authenticated-channel hardening slice and does not promote the
live guest or production gate.

## Ownership and files

Subsystem ownership: Field, at the guest runtime boundary.

Changed:

- `scripts/windows/Start-ExosuitFieldGuest.ps1`
- `tests/windowsFieldScripts.test.ts`
- Field roadmap, architecture, implementation status, developer manual, test
  plan, Windows runbook, threat model, failure matrix, and this slice's atomic
  audit.

## Identity, policy, and storage impact

Field ID, generation, key ID, exact runtime path, and receipt validation are
unchanged. Two internal non-configurable functions isolate the converter and
emitter process effects. The source-derived test launcher replaces only those
marked functions in a temporary directory. No production environment variable,
CLI argument, alternate binary path, policy expansion, or pilot authority was
added.

This does not touch the immutable base, disposable overlay, personal state, or
task disk. Generation invalidation after rebuild/rollback is unchanged. It does
not permit recording, cross-Field transfer, policy creation, or heartbeat after
a denied transaction.

## Parts & Pieces, assumptions, and questions

The existing fixed launcher, exact metadata receipt, protected-only reader,
bounded error log, and fail-before-heartbeat patterns were reused. The selected
pattern is dependency separation through internal adapters plus an out-of-
process source-derived harness. A runtime test switch was rejected because it
would add an unnecessary production bypass surface.

Assumption: Windows PowerShell subprocess execution is the correct evidence
class for launcher branching before a live disposable-guest run. It is not
treated as LocalSystem, DPAPI, DACL, process-crash, or heartbeat evidence.

## Tests and commands

Actually run before the final commit:

- Windows PowerShell 5.1 parser for `Start-ExosuitFieldGuest.ps1` — PASS.
- `npm test -- --run tests/windowsFieldScripts.test.ts --reporter=verbose` —
  PASS, 10/10; the five-path startup harness passed.
- repository, master-plan, and Field-contract validators — PASS;
- TypeScript typecheck and build — PASS;
- `npm run test:field -- --reporter=verbose` — PASS, 159/159;
- `npm run test:field-pulse -- --reporter=verbose` — PASS, 1/1;
- `npm test -- --reporter=verbose` — PASS, 331/331;
- `npm run test:pulse -- --reporter=verbose` — PASS, 1/1;
- pinned SDK `C:\Users\Aidan\.dotnet\dotnet.exe` restore/build/test — PASS,
  build zero warnings/errors and 74/74 tests.

The first unpinned `.NET restore` attempt resolved `C:\Program Files\dotnet`,
whose runtime host has no SDK, and stopped before build or tests. The documented
user-local SDK 8.0.423 was then selected explicitly and all three .NET gates
passed. The first exact-head execution reached the full TypeScript suite but the
five-subprocess harness exceeded its original 30-second test budget under suite
contention; the preceding full run had completed it in 29.064 seconds. The
harness budget was raised to 60 seconds without changing launcher behavior or
assertions. A corrected exact-head evidence run is required and reported
separately; no pass is preclaimed here.

## Security, privacy, failure behavior, and validation gaps

Protection failure, malformed receipt, or no receipt after simulated publication
returns nonzero and the call ledger proves the emitter was not invoked. A valid
first conversion or already-protected restart reaches it. Test fixtures contain
no secret or private content.

Session lock remains a bootstrap denial. Secure Desktop, heartbeat loss, replay,
overflow, uncertain effects, and emergency stop are unchanged. The combined
guest LocalSystem command, guest-machine DPAPI/DACL, configuration/secret TOCTOU,
actual process termination, power interruption, observed heartbeat absence, and
live restart remain unvalidated. Production remains denied.

## Rollback and next slice

Revert the internal adapters, harness test, and documentation. The next slice is
a disposable-guest LocalSystem acceptance run covering first conversion,
already-protected restart, command/process failure, interruption reconciliation,
and independently observed heartbeat absence on every denial.
