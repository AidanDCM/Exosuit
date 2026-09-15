# SCN-001 live host probe

- **Goal:** close the remaining source-to-live seam for the host Hyper-V reader without claiming live SCN-001 evidence.
- **Master-plan phase/gate:** M2 / SCN-001; gate remains `source_validated` until the live ceremony matrix passes.
- **Starting point:** PR #37 head `fbb7e015eca3cd846c110d749f573f36a433917b` with hosted Exosuit CI and Security Audit green.

## Finding corrected

The consolidated SCN-001 status and PR description still said no `GuestExchangeReader` implementation existed. That statement was stale. `src/fieldKvpHyperVReader.ts` already implements the concrete Hyper-V/CIM reader and has focused source coverage; its own engineering log correctly records that only live execution was missing.

The actual remaining source seam was narrower: the concrete reader and the out-of-tree PowerShell runner existed, but there was no small executable command that constructed them together for the first host capability check.

## Change

Added `scripts/scn001-host-probe.ts` and exposed it as:

```powershell
npm run scn001:host-probe -- --vm-name <exact-field-vm-name>
```

The probe:

1. runs only on a Windows host;
2. constructs `createHyperVGuestExchangeReader(runPowerShell)`;
3. executes `readGuestKvpSnapshot` against the exact requested VM;
4. reports KVP names/counts and whether `Exosuit.Field.Scene` is present;
5. never prints KVP values or scene payload bytes;
6. keeps a host-query failure distinct from a valid empty exchange; and
7. returns a distinct nonzero exit when individual exchange items fail parsing.

The orchestration is injectable so hosted CI can test the real parser path without pretending to exercise Hyper-V. `tests/scn001HostProbe.test.ts` covers value non-disclosure, parser wiring, host failures, and the non-Windows refusal.

## Evidence boundary

A green host probe is **not** SCN-001 promotion evidence. It proves only that the concrete host adapter can execute against the live Hyper-V exchange. The required L1-L11 ceremonies, exact Field/session/boot/generation/display bindings, invalidation behavior, lifecycle behavior, clean-head evidence, and independent review remain governed by `docs/project-driver/SCN001_SESSION_RUNBOOK.md` and the completion gate.

## Next live action

On the designated Windows Hyper-V host, with the intended Field VM running:

```powershell
npm run scn001:host-probe -- --vm-name <exact-field-vm-name>
```

If it fails, fix the adapter before starting the full ceremony matrix. If it succeeds, preserve the output as diagnostic context only and proceed to the SCN-001 runbook; do not promote the gate from this probe.
