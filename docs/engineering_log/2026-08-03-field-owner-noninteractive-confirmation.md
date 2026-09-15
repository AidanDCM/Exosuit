# Engineering Log — Field Owner Noninteractive Confirmation

**Date:** 2026-08-03

## Goal and gate

Repair the Windows PowerShell 5.1 native switch-binding failure blocking the L1
installed owner-service lifecycle gate. This does not promote L1 by itself.

## Ownership and authority impact

Field-owned invocation only. The LocalSystem service retains the same fixed
provision/observe/destroy vocabulary, installed hashes, exact policy/job/Field
generation binding, queue boundary, and active-Field limit. Glove and pilot authority,
recording consent, keys, artifact export, and MCP remain unchanged.

## Parts, assumptions, tests, and evidence

The repair follows the existing fixed-command and exact typed-confirmation patterns.
It assumes Windows PowerShell 5.1 `-File` cannot reliably bind an explicit false value
to a common switch when launched through `ProcessStartInfo.ArgumentList`; installed
evidence captured that exact pre-effect failure. Static regressions require the new
flag, LocalSystem SID check, confirmation-before-suppression ordering, and removal of
the broken native argument.

Observed installed-service evidence before the repair:

- destroy job `c9fd9b01-6ba0-40da-8030-f9d025ac5ecb` returned
  `failed/lifecycle_command_failed`;
- bounded stderr identified the `System.String` to `SwitchParameter` conversion;
- the exact generation root remained intact and later batch targets were not submitted.

Commands run against the repair working tree:

- `git diff --check` — passed;
- repository, master-plan, and Field-contract validators — passed;
- `vitest run tests/windowsFieldScripts.test.ts --reporter=verbose` — 12/12 passed;
- user-local .NET 8.0.423 restore and Release warnings-as-errors build — passed;
- focused `FieldOwnerServiceTests` — 7/7 passed;
- `npm run validate:typescript` — passed, including 333/333 tests, build,
  Glove pulse, and Field pulse;
- complete Release .NET suite — 81/81 passed.

Exact-head validation, service replacement, and live lifecycle retest remain required;
until they pass the changed installed hashes are not trusted.

## Security, privacy, and rollback

Only LocalSystem can suppress prompts, and exact typed identity remains mandatory.
No log or contract gains secrets, UI text, screenshots, or demonstration bytes. Revert
this slice and reinstall to disable it; stop `ExosuitFieldOwner` to deny new jobs.

## Next slice

Run focused tests and exact-head validation, reinstall once, then retry the preserved
exact-generation retirement followed by a fresh disposable provision/observe/destroy.
