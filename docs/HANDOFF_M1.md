# Developer Handoff — M1 Live Field

**Written:** 2026-08-06
**State:** contract v2.2 frozen, M0 proven under the live registry, M1 unblocked
**Read this before touching the completion gate.** It assumes no prior context.

---

## 1. Where the code actually is

This has cost real time more than once.

| | |
| --- | --- |
| **Canonical branch** | `origin/codex/unify-glove-field` — head `7e1d6b9` |
| Completion gate source | `src/completion/` |
| Recorded state | `docs/qa/completion/` |
| M0.5 smoke-test state | `docs/qa/completion-m05/` |

Traps:

- The local checkout at `C:\Users\Aidan\OneDrive\Desktop\AI Exosuit` is on
  `codex/unify-glove-field` but **diverged** — 36 ahead, 115 behind origin. Do
  not assume it is current. Check
  `git rev-list --left-right --count HEAD...origin/codex/unify-glove-field`.
- Old `claude/*` worktree branches are near-empty. If a file "doesn't exist",
  look on origin before concluding anything:
  `git log --all --oneline -- <path>` then `git branch -a --contains <sha>`.
- Windows path length breaks `git worktree add` under deep scratchpad paths. Use
  a short path such as `C:\Users\Aidan\AppData\Local\Temp\exorev`.
- That worktree has `node_modules` junctioned from the main repo. If you make a
  fresh one, junction it too or `npm ci`.

---

## 2. Current status — and what the numbers mean

```
Exosuit personal MVP: 18.31% proven complete, 59.30% implementation-ready, 0% live-validated.
```

Never quote the middle number alone. Three metrics exist precisely because v1
reported one number that conflated work built with work proven.

| Metric | Counts | Use |
| --- | --- | --- |
| **Proven completion** | Gates `passed` on the ledger with valid evidence and proven prerequisites | The only number that may be called completion |
| **Implementation readiness** | Adds partial credit for prepared-but-unproven work | How much engineering exists |
| **Live completion** | Only gates needing real-system evidence | **Currently 0%** — nothing live is proven |

Reproduce:

```bash
cd <repo> && npm run validate:completion
```

Exit code 0 means no integrity failures. Incompleteness is expected and does not
fail the build; an unverifiable manifest, ledger, evidence store, or registry
does.

---

## 3. What the contract is, in one page

Read `docs/COMPLETION_GATE_V2.md` for the full version. The essentials:

- **Status is not a field.** A test definition cannot express `status` or
  `evidence`; the schema rejects both. Status folds from an append-only,
  hash-chained, Ed25519-signed transition ledger. Editing the manifest cannot
  promote anything.
- **Transitions are constrained.** `planned → source_validated →
  ready_for_live → passed`; `passed → revoked`; `any → failed → remediated →
  ready_for_live`. There is no edge into `passed` except from
  `ready_for_live`.
- **Promotion needs an independent approval.** `reviewerKeyId` +
  `reviewerSignature`, from a key that is **not** the one sealing the event.
  Authorities are `technical_review`, `owner_acceptance`, `release_approval`
  and are never interchangeable.
- **Evidence classes are proof domains, not a ranking.** Per-gate allowlists.
  `owner_acceptance` does not substitute for `hyperv_host_guest`.
- **Evidence is content-addressed and single-use**, bound to commit, run id,
  machine, OS build, Field id/generation/boot id, definition version, nonce.
- **Live evidence needs a host-bound key** under a `purpose: live` registry.
- **Field-bound evidence needs the lifecycle ledger** and must fall inside an
  open boot window. It fails closed.
- **Benchmarks are computed**, never asserted (`OWN-001`, `PERF-001`).

### The freeze is enforced

`src/completion/frozen.ts` pins a fingerprint of the whole contract surface:

```
8b4f4cc8003141f8b69ca59d555dabb9aa121fc1a50f24f837f63844fdcc92c0
```

`tests/completionContractFrozen.test.ts` recomputes it every run. **If that test
fails, you changed the contract.** That is not automatically wrong, but evidence
gathered under the old surface may no longer mean what it did. Bump
`FROZEN_CONTRACT_LABEL`, say why in the commit, and re-attest what depended on
it. Do not just update the pin.

---

## 4. Environment facts

| | |
| --- | --- |
| Host | `AIDANS-DELL7430`, Dell Latitude 7430, Windows 11 Pro build 26200 |
| Machine id | `machine-9c62d678dd970f15` = `sha256(hostname)[0:16]` |
| Hyper-V | installed and running; account is in **Hyper-V Administrators** |
| Live private keys | `C:\Users\Aidan\.exosuit-live-keys` — 8 DPAPI vault files, **no plaintext** |
| Dev fixture keys | `C:\Users\Aidan\AppData\Local\Temp\exo-keys` (regenerable; do not rotate) |
| Field storage | `C:\ProgramData\Exosuit\Fields` — 23 prior generations |
| Base images | `C:\ProgramData\Exosuit\Images` — 11 read-only VHDX, v10…v25 |
| Current base | `exosuit-field-base-v25.vhdx`, sha256 `5ec795fe…c744` |
| Isolated switch | `Exosuit-Field-Isolated` (Private) — use this |
| Host RAM | 15.44 GB total; ~3.7 GB free in practice |

Environment variables the CLI reads:

```bash
EXOSUIT_COMPLETION_KEY_DIR      # private keys, MUST be outside the repo
EXOSUIT_COMPLETION_KEY_PREFIX   # "live-" or "completion-" (default)
EXOSUIT_COMPLETION_DIR          # state dir; default docs/qa/completion
EXOSUIT_COMPLETION_ROOT_PUBKEY  # optional external root pin
```

---

## 5. Command reference

Everything below assumes:

```bash
export EXOSUIT_COMPLETION_KEY_DIR="C:/Users/Aidan/.exosuit-live-keys"
export EXOSUIT_COMPLETION_KEY_PREFIX="live-"
```

| Task | Command |
| --- | --- |
| Report status | `npm run validate:completion` |
| Record evidence from a command | `tsx src/completion/cli.ts record --test <ID> --class <class> --command "<cmd>"` |
| Record evidence from a file | `tsx src/completion/cli.ts record-artifact --test <ID> --class <class> --file <path> --field-id <id> --field-generation <n> --field-boot-id <id>` |
| Field lifecycle event | `tsx src/completion/cli.ts field-lifecycle --field-id <id> --generation <n> --kind created\|booted\|stopped\|destroyed [--boot-id <id>] [--base-image-sha256 <hash>]` |
| Promote a gate | `tsx src/completion/cli.ts transition --test <ID> --from ready_for_live --to passed --evidence <ids> --issuer <who> --reviewer <who> --reason "<why>"` |
| Negatives vs real artifacts | `EXOSUIT_COMPLETION_DIR=docs/qa/completion-m05 tsx src/completion/m05Negatives.ts` |
| Reboot check | `tsx src/completion/rebootVerification.ts capture` → restart → `verify` |
| Full suite | `npx vitest run` (516 tests, 84 files) |

`record` only records when the command exits 0. Recording is a *claim*;
`evaluate` is the *judgment*. A record can be written and still be rejected.

---

## 6. M1 — what has to be proven

Phase M1 "Live Field": *prove host, Hyper-V, channel, readiness, and stop.*
Exit criteria: lifecycle and failure injection pass.

### HYP-001 — Host preflight and Field lifecycle (critical)
- Prerequisite: `SRC-003` (proven)
- Evidence class: **`hyperv_host_guest`** only
- Acceptance: *preflight passes and the disposable Field completes **three**
  lifecycle cycles*
- Rollback: do not provision or destroy outside the exact generation

### CHN-001 — Channel readiness and emergency stop (critical)
- Prerequisite: `HYP-001`
- Evidence class: **`hyperv_host_guest`** only
- Acceptance: *replay, identity, lock, Secure Desktop, heartbeat, and stop
  injections fail safely*
- Rollback: fault the Field and require owner recovery

Both need, for every evidence record: a host-bound signature under the live
registry, a lifecycle ledger with an open boot window covering `observedAt`, the
exact baseline commit, a fresh nonce, and a unique artifact.

`docs/qa/BUILD_COMPLETION_TEST_MATRIX.md` has the detailed injection list.

---

## 7. Do these before collecting M1 evidence

Both weaken every live attestation M1 produces. Both are fixable **now** without
invalidating anything recorded — that stops being true once trials are underway.

1. **Host Secure Boot is OFF.** Confirmed `secureBoot: false` — disabled, not
   unreadable. The VM's Secure Boot is guest firmware and proves nothing about
   the host. The boot chain under the root key is unverified.
2. **TPM 2.0 is present, ready, and owned** (STM, spec `2.0, 0, 1.38`,
   `managedAuthLevel: Full`) **but unused.** The host key rests on DPAPI alone.
   Sealing is available today.

Also worth settling:

3. **Memory.** A Field will not start at the 4 GB fixed allocation the existing
   G4 VM uses. Use dynamic memory (1 GB min / 2 GB startup / 4 GB max) or free
   headroom. Three lifecycle cycles for HYP-001 will feel this.
4. **`Exosuit-Field-NAT` is absent** but declared in
   `vm/field-host-config.local.json`. No M0.5 impact; blocking for any
   NAT-profile work. Not created — that is a host networking change.

---

## 8. Declared weaknesses — do not quietly drop these

Recorded honestly rather than glossed. They are real and they are accepted, not
solved:

1. **The provisional root lives on the machine it vouches for.**
   `trustPosture: provisional_personal_mvp`,
   `rootGeneratedOnAttestedHost: true`, `productionEligible: false`. Fine for a
   personal MVP; rotate to an externally generated offline root before
   production or any external distribution.
2. **The boot id is host-observed, not guest-attested.** Hyper-V exposes no
   guest boot GUID over KVP without credentials, so it is
   `sha256(vmGuid|powerOnTimeUtc)`. It identifies a power-on as the host saw it.
3. **The approval key sits on the same machine as the automation.** It is a real
   second key with a real second signature, but genuine separation needs it held
   elsewhere.
4. **The key registry is a trust root protected by code review**, not
   cryptography. Anyone who can commit to `keys.json` *and* holds a private key
   can mint records.
5. **M0's approval identity is `completion-review-2026-08-06`** — engineering
   review, not owner acceptance. If you want owner-level attestation, that is a
   **new signed transition** under `live-owner-1`, never a rewrite of the
   existing one.

---

## 9. Process lessons — these caused real errors

Stated plainly because each produced a wrong answer before it was caught.

- **Tooling must change in the same commit as the contract.** Three times a
  check was tightened and a verification tool left behind, each time producing a
  misleading result: the reboot verifier not passing the lifecycle ledger, a
  stale pre-reboot capture, and a probe that scored a pass for the wrong reason.
- **A rejection is not a pass unless the *reason* is right.** The boot-id probe
  reused an artifact and nonce, so it was rejected for artifact reuse and
  scored green while proving nothing. Assert on the reason.
- **Verify environment claims; do not infer them.** "No disposable VM exists"
  was inherited from a stale note and was false — 11 base images and 23 field
  generations were sitting on disk. `LastBootUpTime` proved a "reboot" never
  happened.
- **Fast Startup (`HiberbootEnabled = 1`) means shutdown + power-on is not a
  reboot.** Use **Restart** explicitly or `LastBootUpTime` will not advance.
- **The assistant runs remotely.** It cannot be driven while the machine is
  offline, and cannot survive a restart. Anything requiring either must be a
  standalone script the operator runs alone — see
  `scripts/completion/offline-live-trust-setup.mjs`, which refuses to run while
  online.
- **Distinguish a harness bug from a contract gap** before reporting either. Two
  "gaps" in the M0.5 run were harness artefacts; one was real.

---

## 10. Reference

| Document | Contents |
| --- | --- |
| `docs/COMPLETION_GATE_V2.md` | Full contract, trust roots, residual risk |
| `docs/qa/M0_5_LIVE_ATTESTATION_2026-08-05.md` | M0.5 results, reboot verification, findings |
| `docs/qa/ATOMIC_AUDIT_2026-08-04_COMPLETION_GATE_V2.md` | The v1 adversarial review, all 13 attacks |
| `docs/BUILD_COMPLETION_PLAN.md` | Phase plan M0–M6, P1–P3 |
| `docs/qa/BUILD_COMPLETION_TEST_MATRIX.md` | Per-gate injection matrix |
| `tests/security/buildCompletionPlanV2.adversarial.test.ts` | 46 attacks |
| `tests/security/liveAttestation.adversarial.test.ts` | M0.5 + lifecycle cases |

`src/buildCompletionPlan.ts` is **contract v1**, retained unchanged as the
vulnerable baseline the adversarial suite targets. It must not authorise
anything.

---

## 11. Suggested first moves

1. Read `docs/COMPLETION_GATE_V2.md` §"Field lifecycle ledger" and §"Freeze".
2. Run `npm run validate:completion` and confirm `18.31 / 59.30 / 0` with exit 0.
3. Run `npx vitest run` and confirm 534 pass — especially
   `completionContractFrozen`.
4. Decide Secure Boot and TPM sealing (§7) **before** any M1 evidence.
5. Run the HYP-001 harness (§12).
6. Only then record and promote. Promotion needs a reviewer who is not the
   issuer, holding `technical_review`.

---

## 12. The HYP-001 harness

`src/completion/hyp001Harness.ts` drives the three lifecycle cycles. The rules a
run must satisfy live separately in `src/completion/hyp001.ts`, which is pure and
covered by `tests/hyp001Harness.test.ts`, so the harness and its tests cannot
drift onto different definitions of "three cycles passed".

Three commands, deliberately not one:

```bash
npm run hyp001:preflight
```

HYP-001.1–.6, read-only. Writes `artifacts/hyp001/preflight.json`.

```bash
npm run hyp001:cycles
```

Dry run — prints the plan, provisions nothing. Add
`-- --apply --confirm "RUN HYP-001 LIVE CYCLES"` to execute. Must be elevated,
from an account in Hyper-V Administrators. Preflight runs first and blocks
`--apply` on failure.

```bash
npm run hyp001:record
```

Records one `hyperv_host_guest` artifact per cycle. Separate from `cycles` so a
failed or partial run leaves no claim behind, and so the artifacts get read
before anything is signed.

What the harness handles that is easy to get wrong:

- **Memory.** The plan builder defaults to 8 GiB startup / 12 GiB max, which will
  not start a Field on this host. The harness pins 1 / 2 / 4 GiB dynamic (§7.3).
- **Boot window containment.** Evidence `observedAt` must fall inside
  `[booted, stopped)`, and that window is defined by the `recordedAt` the CLI
  wrote — it clamps forward for monotonicity — not by the harness's own clock.
  The harness reads the value back rather than assuming it.
- **Boot id.** `sha256(vmGuid|powerOnTimeUtc)`, derived from Hyper-V uptime read
  immediately after start. Host-observed, not guest-attested (§8.2).
- **Reasons, not booleans.** `validateHyp001Run` returns failure strings and the
  tests assert on them, because a rejection for the wrong reason already scored
  a false green once (§9).

It requires `vm/field-host-config.local.json`, which is gitignored and lives only
on the host. It does **not** promote — promotion stays a separate signed
transition with an independent reviewer.
