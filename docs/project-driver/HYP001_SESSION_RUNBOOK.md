# HYP-001 live session runbook

**PD-004 preparation.** Prepared before Secure Boot is enabled. **Nothing here
is executed until PD-003 completes** — `--apply` is blocked by preflight while
Secure Boot is disabled, by design.

Host state captured 2026-08-07, before the session.

---

## 1. Preconditions — all must hold

| # | Condition | Checked by | Status now |
| --- | --- | --- | --- |
| 1 | Secure Boot enabled | preflight | **BLOCKED — PD-003** |
| 2 | Elevated token | preflight | needs elevated shell |
| 3 | Base image present, digest matches host config | preflight | v25 present, `5ec795fe…25a2c744` |
| 4 | `Exosuit-Field-Isolated` is a **Private** switch | preflight | present |
| 5 | .NET SDK resolvable | preflight | in `%USERPROFILE%\.dotnet` |
| 6 | TPM platform provider available | preflight | available |
| 7 | All 8 live keys TPM-sealed | preflight | 8/8 sealed |
| 8 | Free RAM sufficient | **manual — see §3** | **2.93 GB — tight** |
| 9 | No competing Field VM running | **manual — see §3** | G4 VM exists, **Off** |

Preflight enforces 1–7 and will refuse `--apply` on any failure. **8 and 9 are
not checked by the harness** and are the operator's responsibility.

---

## 2. Commands, in order

```powershell
$env:EXOSUIT_COMPLETION_KEY_DIR = "C:\Users\Aidan\.exosuit-live-keys"
$env:EXOSUIT_COMPLETION_KEY_PREFIX = "live-"
```

**Step 1 — preflight (read-only, safe to repeat):**

```powershell
npm run hyp001:preflight
```

Must exit 0. Writes `artifacts/hyp001/preflight.json`. **Preserve this file** —
it is the signed record that Secure Boot was enabled, and PD-003's acceptance
depends on the artifact, not on a human reading `Confirm-SecureBootUEFI`.

**Step 2 — dry run (provisions nothing):**

```powershell
npm run hyp001:cycles
```

Prints the plan: field id, three generations, VM names, memory. Confirm the
generations do not collide with anything on disk before proceeding.

**Step 3 — live cycles (destructive):**

```powershell
npm run hyp001:cycles -- --apply --confirm "RUN HYP-001 LIVE CYCLES"
```

The confirmation string is exact and case-sensitive.

**Step 4 — record (separate on purpose):**

```powershell
npm run hyp001:record
```

Recording is deliberately a second command. A failed or partial run must leave
no claim behind, and the artifacts get read before anything is signed.

**Step 5 — evaluate:**

```powershell
npm run validate:completion
```

---

## 3. Memory and VM hygiene — the two things preflight will not catch

**Free RAM is 2.93 GB of 15.44 GB.** The harness pins dynamic memory at
**1024 MiB min / 2048 MiB startup / 4096 MiB max** because the plan builder's
defaults (8 GiB startup) will not start a Field on this host.

2 GB startup against 2.93 GB free leaves under a gigabyte of headroom. Before
starting:

- close OneDrive sync, browsers, and any IDE
- confirm free RAM ≥ 4 GB if possible; re-check with
  `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB`

**One legacy VM exists and must stay off:**

```
Exosuit-Field-c7dead44-f5e4-48c8-aa2d-a12a8902ea75-G4
  state    Off
  startup  4096 MB (dynamic)
```

It is currently `Off` and holding 0 MB. If it starts, three lifecycle cycles
will contend with it for memory. Do not start it; consider removing it before
the session. **23 field generations** are on disk under
`C:\ProgramData\Exosuit\Fields` — none are touched by this run.

---

## 4. What the three cycles do

Each cycle, on a **fresh incremented generation**:

```
provision  →  lifecycle: created  (+ base image sha256, vm guid)
Start-VM   →  lifecycle: booted   (+ boot id)
wait for heartbeat OK             → readiness observed
Stop-VM    →  lifecycle: stopped
destroy    →  lifecycle: destroyed
re-hash base image                → must equal the pre-cycle digest
```

Generation increments rather than being reused, so the previous generation is
invalid **by identity**, not by cleanup.

---

## 5. Verification the harness performs

`validateHyp001Run` refuses to record unless all of these hold. Each returns a
specific reason, not a boolean:

| Check | Failure reason |
| --- | --- |
| Exactly 3 cycles | `requires 3 complete cycles; the run has N` |
| Generations unique and increasing | `generation N reused` / `does not increase` |
| Boot ids unique | `boot id reused` |
| Base image unchanged per cycle | `base image mutated during the cycle` |
| Base matches the run baseline | `base image digest differs from the run baseline` |
| `readyAt` inside `[booted, stopped)` | `readyAt … is outside the boot window` |
| Cycles do not overlap | `overlaps the previous cycle, which was not destroyed first` |

**Boot windows.** The window is defined by the `recordedAt` the CLI wrote — it
clamps forward for monotonicity — not by the harness's clock. The harness reads
the value back after recording `booted`, then observes, then records `stopped`.

**Uniqueness.** Evidence is single-use and content-addressed: each cycle
produces a distinct artifact, a fresh nonce, and a unique boot id. A reused
artifact or nonce is rejected by the evidence verifier independently of the
harness.

**Immutable base.** Hashed before and after **every** cycle, not once at the
end, so a mutation is attributed to the cycle that caused it. Any change aborts
with `Critical stop`.

---

## 6. Evidence destinations

| Path | Contents |
| --- | --- |
| `artifacts/hyp001/preflight.json` | preflight result and trust posture |
| `artifacts/hyp001/plan-g{N}.json` | provisioning plan per generation |
| `artifacts/hyp001/cycle-{1,2,3}.json` | per-cycle record — the evidence artifacts |
| `artifacts/hyp001/run.json` | run summary; written only after 3 complete cycles |

After `record`, state lands in:

```
docs/qa/completion/evidence.json          3 new hyperv_host_guest records
docs/qa/completion/artifacts/             3 new content-addressed artifacts
docs/qa/completion/field-lifecycle.json   12 lifecycle events (4 per cycle)
docs/qa/completion/key-custody.json       custody attestation per signing
docs/qa/completion/tpm-proofs.json        TPM participation proof per live record
```

**These artifacts must then be committed.** Per PR #30, the reconciliation
invariant requires every referenced artifact to exist in the repository, and
`npm run scan:evidence-artifacts` must pass over them before they are pushed.
Live Hyper-V output is more likely than test logs to contain host detail — scan
it, and if a finding blocks, **do not edit the artifact**: re-run and replace the
record through attestation.

---

## 7. Issuer and reviewer must differ

Promotion requires an independent approval:

```powershell
tsx src/completion/cli.ts transition --test HYP-001 `
  --from ready_for_live --to passed `
  --evidence <three evidence ids> `
  --issuer  <who ran the cycles> `
  --reviewer <who reviewed the evidence> `
  --reason  "<why>"
```

- `reviewerKeyId` is `live-technical-review-1`, distinct from the ledger key
  sealing the event
- the authority is `technical_review` — **not** `owner_acceptance`, which is a
  different proof domain and not interchangeable
- the reviewer signs the approval **before** the issuer seals the event, and the
  issuer signature covers it

Per the program roles, **codex_implementation must not approve its own
evidence** (`self_approval: false`). Whoever runs the cycles is not the reviewer.

---

## 8. Abort procedure

**If a cycle fails partway**, the harness throws and stops. `run.json` is never
written, so `record` refuses with `No run to record` — no claim exists.

Then:

1. **Do not re-run `record`.** There is nothing to record.
2. Inspect `artifacts/hyp001/cycle-*.json` for cycles that did complete.
3. Check for a leftover VM: `Get-VM -Name 'Exosuit-Field-*'`.
4. Remove only the exact generation the run created:
   ```powershell
   .\scripts\windows\Remove-ExosuitFieldGeneration.ps1 `
     -FieldId <id> -FieldGeneration <n> `
     -HostConfigPath vm\field-host-config.local.json `
     -TypedConfirmation "DESTROY FIELD <id> GENERATION <n>"
   ```
   The rollback contract is *do not provision or destroy outside the exact
   generation*. Never delete by wildcard.
5. Verify the base image digest is unchanged before retrying.
6. Restart from cycle 1 with a **fresh field id**. Do not resume mid-run —
   three cycles must be consecutive and complete.

**If the base image digest changed**, stop entirely. That is a critical finding,
not a retry: quarantine the image and investigate before any further work.

**Emergency stop** during a cycle: `Stop-VM -Force`, then destroy the exact
generation as above. A forcibly stopped cycle is not a completed cycle.

---

## 9. Session checklist

```
[ ] BitLocker recovery key accessible from another device
[ ] Secure Boot enabled, Deployed mode, UEFI boot list
[ ] Confirm-SecureBootUEFI returns True (elevated)
[ ] npm run hyp001:preflight exits 0
[ ] preflight.json shows secureBoot: enabled
[ ] preflight.json shows 8/8 keys TPM-sealed
[ ] free RAM >= 4 GB; OneDrive/browsers/IDE closed
[ ] legacy G4 VM confirmed Off
[ ] dry run reviewed; generations do not collide
[ ] npm run hyp001:cycles -- --apply --confirm "RUN HYP-001 LIVE CYCLES"
[ ] 3/3 cycles complete; run.json written
[ ] base image digest unchanged
[ ] cycle artifacts reviewed by a human before recording
[ ] npm run hyp001:record
[ ] npm run validate:completion exits 0
[ ] scan:evidence-artifacts passes over the new artifacts
[ ] new artifacts committed; reconciliation invariant green
[ ] independent reviewer promotes HYP-001 (issuer != reviewer)
```

Nothing below the preflight line runs until PD-003 is done.
