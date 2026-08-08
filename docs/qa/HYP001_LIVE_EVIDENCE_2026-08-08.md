# HYP-001 live evidence review packet

**Date:** 2026-08-08
**Gate:** HYP-001, M1
**Status:** three evidence records valid; independent technical promotion pending
**Field ID:** `59e1bf4e-7ea5-4132-8178-756465b1c86f`
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
- free memory at final apply preflight: 5.15 GiB (minimum 4.00 GiB)
- competing Field VMs: legacy G4 Off, non-blocking and untouched
- preflight failures: none

## Cycle results

| Cycle | Generation | Boot ID prefix | Ready | Lifecycle result | Base unchanged |
| ---: | ---: | --- | ---: | --- | --- |
| 1 | 1 | `74721d7d8f7f` | 11 s | created → booted → stopped → destroyed | yes |
| 2 | 2 | `db07e411894b` | 11 s | created → booted → stopped → destroyed | yes |
| 3 | 3 | `ba133795922d` | 12 s | created → booted → stopped → destroyed | yes |

Every `readyAt` is within its half-open `[booted, stopped)` window. The three
generations and boot IDs are unique and increasing/non-overlapping. After the
run, the only matching VM was the pre-existing G4 VM in state Off.

## Signed evidence

| Evidence ID | Artifact SHA-256 | TPM proof |
| --- | --- | --- |
| `hyp001-cycle-1-74721d7d8f7f` | `3eca75a6634e216a53fc1686c6ab80ef9402a5cd90cb0a66aefe7db5e9b37eb7` | `proof-1786226785211-2d840c` |
| `hyp001-cycle-2-db07e411894b` | `f64519fb70f51563b2c91f2951993662c4094a070ac927f072b32b40c39a7ce6` | `proof-1786226789692-89bae3` |
| `hyp001-cycle-3-ba133795922d` | `d1e8481e8ebef6101e26dfcce1c15b274563d40184cfcd25926c85baf1b92fc1` | `proof-1786226793673-edede9` |

All three are designation `live`, signed by `live-host-1`, TPM-backed, bound to
run `hyp001-1786226780943`, and use distinct nonces and custody events.

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

The accepted candidate run started with a clean worktree at committed harness
head `a05bfd3fa092c5b2c0a61bcf386038f951bafcc9`. No source, test, or script file
changed during execution; only expected completion lifecycle/evidence state was
appended. The manifest binds the system under test to baseline
`8efb63aa1452ebdb84f910309bbb284b2d25a980`.

An earlier run from Field `75e54955-9e75-4d3e-aa03-3054139a6e36` remains in the
append-only evidence store for audit history. It was rejected by the owner for
promotion because the harness fixes were uncommitted during execution. Do not
cite its evidence IDs for the HYP-001 transition.

## Validation actually run

- HYP focused suite: 39/39 passed
- Windows Field script suite: 8/8 passed
- full TypeScript suite: 91 files, 644/644 passed on clean rerun
- Field suite: 48 files, 239/239 passed
- .NET: build 0 warnings/errors; 48/48 tests passed
- system pulse: 1/1 passed
- Field pulse: 1/1 passed
- evidence reconciliation: 6/6 passed
- evidence scan: 12 artifacts, zero warnings or blockers
- completion evaluation: zero integrity failures; HYP-001 remains
  `ready_for_live` pending review

## Reviewer decision

The independent reviewer should inspect this packet, the three content-addressed
artifacts, the lifecycle ledger, and commit `a05bfd3`. If accepted, promote with
only the three clean-head evidence IDs above, reviewer role `technical_review`,
and a reviewer principal other than `hyp001-harness`.
