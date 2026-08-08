# HYP-001 live evidence review packet

**Date:** 2026-08-08
**Gate:** HYP-001, M1
**Status:** three evidence records valid; independent technical promotion pending
**Field ID:** `75e54955-9e75-4d3e-aa03-3054139a6e36`
**Machine ID:** `machine-9c62d678dd970f15`
**Evidence baseline:** `8efb63aa1452ebdb84f910309bbb284b2d25a980`

## Verdict

Three consecutive disposable Hyper-V generations were created, booted to
Hyper-V heartbeat readiness, stopped, destroyed, and checked against the
immutable base. All three source artifacts were recorded as signed
`hyperv_host_guest` evidence. Completion evaluation, artifact reconciliation,
and the evidence secret scan pass with zero integrity findings.

This packet does not promote HYP-001. Promotion requires an independent
`technical_review` signature from a reviewer distinct from `hyp001-harness`.

## Entry conditions

- elevated: true
- host Secure Boot: enabled
- TPM-sealed live keys: 8/8
- isolated switch: Private
- base digest: `5ec795fe378d256131e4e1c89c597a79a30e8923cafa3df6b793e7c125a2c744`
- free memory at final apply preflight: 4.20 GiB (minimum 4.00 GiB)
- competing Field VMs: legacy G4 Off, non-blocking and untouched
- preflight failures: none

## Cycle results

| Cycle | Generation | Boot ID prefix | Ready | Lifecycle result | Base unchanged |
| ---: | ---: | --- | ---: | --- | --- |
| 1 | 1 | `6f4d91c494bc` | 11 s | created → booted → stopped → destroyed | yes |
| 2 | 2 | `38ed7a7e1998` | 13 s | created → booted → stopped → destroyed | yes |
| 3 | 3 | `9c6794c66a2e` | 12 s | created → booted → stopped → destroyed | yes |

Every `readyAt` is within its half-open `[booted, stopped)` window. The three
generations and boot IDs are unique and increasing/non-overlapping. After the
run, the only matching VM was the pre-existing G4 VM in state Off.

## Signed evidence

| Evidence ID | Artifact SHA-256 | TPM proof |
| --- | --- | --- |
| `hyp001-cycle-1-6f4d91c494bc` | `566619fafe75ab6dc1a12b44db51fcedcd1d3443c4ecf2800a382e4787e88735` | `proof-1786225464823-d5bb41` |
| `hyp001-cycle-2-38ed7a7e1998` | `3ec4d216a2d09927ded16a43f6b667528fcab26a22f57b9683e3c5670ca0a975` | `proof-1786225468938-a97ea6` |
| `hyp001-cycle-3-9c6794c66a2e` | `04f7dda428a5eb071b59daa3f81673506c2342ad2b4db201d99a9af7f3bffae9` | `proof-1786225473147-ede5bd` |

All three are designation `live`, signed by `live-host-1`, TPM-backed, bound to
run `hyp001-1786225460962`, and use distinct nonces and custody events.

## Fail-closed discoveries before the successful run

Three attempts stopped before VM mutation and produced no cycle evidence:

1. the harness memory profile was below the authoritative plan schema;
2. non-interactive PowerShell reached High-impact `ShouldProcess` without a
   typed boolean confirmation suppression;
3. Windows PowerShell 5.1 could not convert native `-File` text
   `-Confirm:$false` to `SwitchParameter`.

The final implementation uses the schema-valid 2048/4096/4096 MiB profile and
a bounded encoded invocation restricted to the two exact lifecycle scripts and
their fixed parameter allowlist. Exact typed confirmations remain mandatory.

The checkout was on `f1bb9b67290c61212c5c375c85ecd63a93eabb98` with the
harness fixes uncommitted during execution. The completion manifest deliberately
binds evidence to system baseline `8efb63aa1452ebdb84f910309bbb284b2d25a980`;
the reviewer must decide whether the harness-only execution fixes and dirty
checkout are acceptable for this promotion or require a clean-head rerun.

## Validation actually run

- HYP focused suite: 39/39 passed
- Windows Field script suite: 8/8 passed
- full TypeScript suite: 91 files, 644/644 passed on clean rerun
- Field suite: 48 files, 239/239 passed
- .NET: build 0 warnings/errors; 48/48 tests passed
- system pulse: 1/1 passed
- Field pulse: 1/1 passed
- evidence reconciliation: 6/6 passed
- evidence scan: 9 artifacts, zero warnings or blockers
- completion evaluation: zero integrity failures; HYP-001 remains
  `ready_for_live` pending review

## Reviewer decision

The independent reviewer should inspect this packet, the three content-addressed
artifacts, the lifecycle ledger, and the source diff. If accepted, promote with
the three evidence IDs above, reviewer role `technical_review`, and a reviewer
principal other than `hyp001-harness`. If the dirty checkout is rejected, do
not promote; commit the harness fixes and collect a fresh run under the approved
baseline policy.
