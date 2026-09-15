# HYP-001 live session runbook

**Phase:** M1 / HYP-001
**Status:** three live cycles recorded on 2026-08-08; independent technical promotion pending
**Subsystem:** Field environment lifecycle evidence; no Glove authority changes

This is the operator procedure for producing HYP-001 evidence. The current
`preflight.json` is a machine-generated authorization check, not signed
completion evidence. Signed, content-addressed evidence is created only by
`npm run hyp001:record`, after a complete run has been reviewed.

## 1. Preconditions

The harness re-measures every condition below whenever `hyp001:cycles` runs.
With `--apply`, any failed or unreadable condition stops before provisioning.

| # | Required condition | Last observed on 2026-08-08 |
| --- | --- | --- |
| 1 | Host Secure Boot enabled | enabled |
| 2 | Elevated process token | true |
| 3 | Approved base exists and matches its configured SHA-256 | `5ec795fe…25a2c744` |
| 4 | `Exosuit-Field-Isolated` is a Hyper-V Private switch | Private |
| 5 | .NET SDK resolvable | 8.0.423 |
| 6 | TPM platform provider available | available |
| 7 | Every DPAPI live key also has a TPM-sealed vault | 8/8 |
| 8 | At least 4.00 GiB physical memory free | 4.34 GiB |
| 9 | No `Exosuit-Field-*` VM is in a resource-holding state | legacy G4 is Off |

An Off legacy Field VM is recorded but is not blocking. Do not delete it as
part of this run. Running, Paused, Saved, Starting, Stopping, Saving, Pausing,
Resuming, FastSaved, or FastSaving Field VMs block apply. An unreadable memory
or VM-state probe also blocks apply.

## 2. Commands, in order

Run from `C:\Users\Aidan\AppData\Local\Temp\exorev` in an elevated PowerShell
process:

```powershell
$env:EXOSUIT_COMPLETION_KEY_DIR = "C:\Users\Aidan\.exosuit-live-keys"
$env:EXOSUIT_COMPLETION_KEY_PREFIX = "live-"

npm run hyp001:preflight
npm run hyp001:cycles
npm run hyp001:cycles -- --apply --confirm "RUN HYP-001 LIVE CYCLES"
npm run hyp001:record
npm run validate:completion
npm run scan:evidence-artifacts
```

The first two commands are read-only with respect to Hyper-V lifecycle. The
dry run still performs the full read-only preflight and prints one fresh Field
ID, three increasing generations, three VM names, the pinned memory policy,
and the readiness timeout.

Do not run `hyp001:record` until all generated artifacts have been read. The
record command consumes the per-cycle artifacts as single-use evidence.

## 3. What preflight does and does not prove

`artifacts/hyp001/preflight.json` records the host observations used to permit
or refuse provisioning. It is ordinary JSON written by the harness. It has no
evidence signature, custody attestation, TPM participation proof, reviewer, or
completion-ledger transition.

Therefore:

- a passing preflight authorizes attempting the cycles on that observed host;
- it does not prove HYP-001 passed;
- it must not be described as signed evidence;
- the apply command re-runs preflight, so an older passing file cannot bypass a
  changed host condition.

## 4. What each live cycle does

Each cycle uses the same Field ID and a fresh increasing generation:

```text
provision disposable generation
  -> record lifecycle created
start VM
  -> record lifecycle booted and derived boot ID
wait for Hyper-V heartbeat OK
  -> capture readyAt inside the open boot window
stop VM
  -> record lifecycle stopped
destroy that exact generation
  -> record lifecycle destroyed
re-hash the immutable base
  -> require the original digest
```

The provisioning script creates a disposable OS overlay and task disk, uses
the Private switch, and applies the smallest schema-valid dynamic profile:
2048 MiB minimum / 4096 MiB startup / 4096 MiB maximum. It must not touch the
immutable base, personal state,
the legacy G4 generation, or another Field.

The harness requires three complete, consecutive cycles; unique and increasing
generations; unique boot IDs; non-overlapping lifecycles; `readyAt` inside
`[booted, stopped)`; and an unchanged base digest before and after every cycle.

## 5. Artifact and evidence boundary

Before recording:

| Path | Meaning |
| --- | --- |
| `artifacts/hyp001/preflight.json` | unsigned host authorization observations |
| `artifacts/hyp001/plan-g{N}.json` | exact provisioning plan for a generation |
| `artifacts/hyp001/cycle-{1,2,3}.json` | reviewed per-cycle source artifacts |
| `artifacts/hyp001/run.json` | summary written only after three cycles complete |

After `hyp001:record`, the completion system writes signed records and related
proofs under `docs/qa/completion/`:

```text
evidence.json
artifacts/
field-lifecycle.json
key-custody.json
tpm-proofs.json
```

Recording is still a claim, not a pass. `validate:completion` verifies the
records. Promotion to `passed` is a separate signed ledger transition requiring
a reviewer distinct from the evidence issuer and the correct
`technical_review` authority.

## 6. Abort and rollback

If a cycle fails, stop. `run.json` is not written and no evidence should be
recorded.

1. Inspect the last console error and any completed `cycle-*.json` artifacts.
2. Enumerate `Get-VM -Name 'Exosuit-Field-*'`; do not delete by wildcard.
3. Remove only the exact Field ID and generation created by the failed run with
   `Remove-ExosuitFieldGeneration.ps1` and its exact typed confirmation.
4. Verify the immutable base digest remains
   `5ec795fe378d256131e4e1c89c597a79a30e8923cafa3df6b793e7c125a2c744`.
5. Retry from cycle 1 with a fresh Field ID; do not resume a partial run.

If the base digest changed, quarantine the base and stop all HYP work. If exact
generation cleanup cannot be established, preserve the state and stop. An
emergency stop during a cycle is not a completed cycle.

## 7. Review checklist

```text
[ ] elevated process and Secure Boot enabled
[ ] preflight exits 0 with zero failures
[ ] preflight records >= 4.00 GiB free memory
[ ] all existing Exosuit Field VMs are non-blocking; legacy G4 remains Off
[ ] dry-run Field ID, generations, VM names, memory, and timeout reviewed
[ ] three live cycles complete and run.json exists
[ ] every lifecycle is created -> booted -> stopped -> destroyed
[ ] every readyAt is inside its boot window
[ ] immutable base digest is unchanged for every cycle
[ ] per-cycle artifacts read before recording
[ ] record, completion validation, and evidence scan pass
[ ] independent technical reviewer promotes HYP-001
```

This procedure proves only the HYP-001 lifecycle scope. It does not prove the
authenticated channel, guest readiness contract, Teach, Shadow, Pilot, MCP, or
production readiness.
