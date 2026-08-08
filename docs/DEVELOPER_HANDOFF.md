# Developer handoff

**Written:** 2026-08-07, immediately after Secure Boot was enabled and HYP-001
preflight passed.
**Read this first.** It assumes no prior context and supersedes any earlier
handoff you may have been pointed at.

---

## 1. Where the project actually is, in one paragraph

The Exosuit has a working, adversarially-hardened **completion gate** — a signed,
append-only system that decides what may be called "done". That machinery is
finished and proven. What it is measuring is barely started: **18.31% proven,
0% live-validated**, and every remaining gate needs evidence from a real
running system. As of today the last blocker to producing that evidence has
cleared. **The next action is a live Hyper-V session that has never been run.**

---

## 2. The single most important number

```
Exosuit personal MVP: 18.31% proven complete, 59.30% implementation-ready, 0% live-validated
```

**Never quote the middle number alone.** Three metrics exist because an earlier
version reported one number that conflated work built with work proven.

| Metric | Counts | Use |
| --- | --- | --- |
| **Proven completion** | Gates `passed` with valid evidence and proven prerequisites | The only number that may be called completion |
| Implementation readiness | Adds partial credit for prepared-but-unproven work | How much engineering exists |
| **Live completion** | Only gates needing real-system evidence | **0%** — nothing live is proven |

All 18.31% is M0: three source gates (`SRC-001/2/3`) that need no hardware.
**17 of 20 gates need live evidence.** The first one to move the number is
HYP-001, which takes the MVP profile to **25.35%**.

Reproduce: `npm run validate:completion` (exit 0 = no integrity failures;
incompleteness is expected and does not fail).

---

## 3. Do this next

Secure Boot is enabled and preflight passes. The HYP-001 live session is the
next action and **has not been run**.

**Work from `C:\Users\Aidan\AppData\Local\Temp\exorev`**, not the Desktop repo
— see §7 for why.

```powershell
$env:EXOSUIT_COMPLETION_KEY_DIR = "C:\Users\Aidan\.exosuit-live-keys"
$env:EXOSUIT_COMPLETION_KEY_PREFIX = "live-"

npm run hyp001:preflight          # must exit 0; ~25s (hashes an 11 GiB image)
npm run hyp001:cycles             # DRY RUN — provisions nothing, review the plan
npm run hyp001:cycles -- --apply --confirm "RUN HYP-001 LIVE CYCLES"
npm run hyp001:record             # only after reading the artifacts
npm run validate:completion
```

Full procedure, stop conditions and abort steps:
`docs/project-driver/HYP001_SESSION_RUNBOOK.md` (currently on PR #33).

**Preconditions already met** as of 2026-08-07: Secure Boot enabled, 8/8 keys
TPM-sealed, base digest matches, Private switch present, dotnet 8.0.423,
4.34 GiB free, legacy G4 VM `Off`.

**The preflight artifact is the authorisation boundary**, not
`Confirm-SecureBootUEFI` returning `True`. If the artifact does not record all
of those facts, stop.

---

## 4. How the completion gate works

You cannot promote anything by editing a file. Understanding this is most of
understanding the repo.

- **Status is not a field.** A test definition cannot express `status` or
  `evidence`; the schema rejects both. Status folds from an append-only,
  hash-chained, Ed25519-signed transition ledger.
- **Transitions are constrained.** `planned → source_validated →
  ready_for_live → passed`. There is no edge into `passed` except from
  `ready_for_live`.
- **Promotion needs an independent approval.** A reviewer key distinct from the
  key sealing the event, holding the right authority. `technical_review`,
  `owner_acceptance` and `release_approval` are never interchangeable.
- **Evidence classes are proof domains, not a ranking.** Per-gate allowlists.
  `owner_acceptance` does not substitute for `hyperv_host_guest`.
- **Evidence is content-addressed and single-use**, bound to commit, run id,
  machine, OS build, Field id/generation/boot id, definition version, nonce.
- **Field-bound evidence must fall inside an open boot window**, proven by a
  host-signed lifecycle ledger. It fails closed.
- **Benchmarks are computed**, never asserted.

### The contract is frozen at v2.3

`src/completion/frozen.ts` pins a fingerprint of the whole contract surface.
`tests/completionContractFrozen.test.ts` recomputes it every run. **If that test
fails, you changed the contract.** Not automatically wrong — but evidence
gathered under the old surface may no longer mean what it did. Bump
`FROZEN_CONTRACT_LABEL`, say why, and re-attest what depended on it. **Do not
just update the pin.**

### The key protection chain (v2.3)

Three layers, each closing a hole in the one before:

1. **TPM sealing.** All 8 live keys are wrapped under a non-exportable TPM key.
   AES-256-GCM over the private key; the data key RSA-OAEP wrapped by the chip.
2. **TPM-only enforcement.** A live registry *requires* the TPM vault and stops
   if it is absent or will not unseal. No automatic DPAPI fallback, no
   plaintext. DPAPI is reachable only through an explicit, signed, audited
   recovery grant that blocks live attestation until the key is sealed again.
3. **TPM participation proof.** A custody event is signed by the same Ed25519
   key it describes, so a holder of that key could mint both and have them
   agree. A **separate** non-exportable TPM key therefore signs a challenge per
   live signing event, naming the record, key, registry, machine, custody
   event, recovery state, nonce and timestamp. Verification is pure — no TPM
   needed — so another machine can check it.

**What this still does not prove:** the completion key and the attestation key
are distinct objects. This shows *the TPM participated in this signing event*,
not *this Ed25519 key was unwrapped by that TPM*. TPM 2.0 cannot hold an
Ed25519 key, so closing that fully means changing the signing algorithm. Stated,
not papered over.

### Evidence artifacts are committed

Until 2026-08-07 they were not: `.gitignore` had an unanchored `artifacts/`
rule that also matched `docs/qa/completion/artifacts/`. Records verified, but
the content they were bound to lived on one laptop. **A content-addressed record
without its content is only a signed pointer.**

Six artifacts are now committed, and
`tests/completionArtifactReconciliation.test.ts` enforces: referenced artifact
exists, filename equals SHA-256 of contents, byte length matches, no orphans,
no private keys. **It needs no private keys**, so hosted CI can enforce it —
`validate:completion` cannot run in CI at all, since it needs both the sealed
keys and the artifact store.

`.gitattributes` pins those directories to `-text`. Without it, `core.autocrlf`
would rewrite line endings on checkout and every artifact would stop hashing to
its own filename.

---

## 5. Repository map

| | |
| --- | --- |
| **Integration branch** | `codex/unify-glove-field` — the only branch that matters |
| Completion gate source | `src/completion/` |
| Recorded state | `docs/qa/completion/` |
| HYP-001 harness | `src/completion/hyp001.ts` (pure) + `hyp001Harness.ts` (host) |
| Program docs | `docs/project-driver/` |
| Windows/Hyper-V scripts | `scripts/windows/` |

Key commands:

```bash
npm run validate:completion        # the three metrics
npm test                           # 639 tests, 91 files
npm run scan:evidence-artifacts    # secret scan over published evidence
npm run hyp001:preflight           # host readiness, writes a signed artifact
```

---

## 6. Environment facts

| | |
| --- | --- |
| Host | `AIDANS-DELL7430`, Dell Latitude 7430, Windows 11 Pro build 26200 |
| Machine id | `machine-9c62d678dd970f15` = `sha256(hostname)[0:16]` |
| Secure Boot | **ENABLED** (2026-08-07), Deployed mode |
| TPM | 2.0, wrapping key `exosuit-completion-host-wrap-v1`, ExportPolicy None |
| Live private keys | `C:\Users\Aidan\.exosuit-live-keys` — 8 keys, TPM + DPAPI vaults, no plaintext |
| Base image | `exosuit-field-base-v25.vhdx`, 11.07 GiB, `5ec795fe…25a2c744` |
| Isolated switch | `Exosuit-Field-Isolated` (Private) — **no internet** |
| NAT switch | `Exosuit-Field-NAT` declared in host config but **does not exist** |
| Host RAM | 15.44 GB total; preflight requires ≥ 4 GiB free |
| Legacy VM | `Exosuit-Field-c7dead44-…-G4`, `Off` — leave it alone |

Environment variables:

```bash
EXOSUIT_COMPLETION_KEY_DIR      # private keys, MUST be outside the repo
EXOSUIT_COMPLETION_KEY_PREFIX   # "live-" or "completion-" (default)
EXOSUIT_COMPLETION_DIR          # state dir; default docs/qa/completion
EXOSUIT_FIELD_HOST_CONFIG       # default vm/field-host-config.local.json (gitignored)
```

---

## 7. Traps that have cost real time

**The Desktop repo is diverged and stale.**
`C:\Users\Aidan\OneDrive\Desktop\AI Exosuit` is on `codex/unify-glove-field` but
sits **36 ahead / 134 behind** origin. `git pull --ff-only` will fail. Those 36
commits are real Field work (guest acceptance, protection receipts, owner
lifecycle) that exist **on no remote branch** — do not force a pull, and do not
run sessions from there. **Unresolved risk: that work is one disk failure from
gone.**

**Work from `C:\Users\Aidan\AppData\Local\Temp\exorev`.** It has `node_modules`
and the gitignored `vm/field-host-config.local.json`. Use a short path — deep
scratchpad paths exceed the Windows filename limit and `git worktree add` fails.

**`readFileSync` cannot hash the base image.** It refuses over 2 GiB; the image
is 11.07 GiB. Fixed in `sha256File` with an 8 MiB chunked read. This was
invisible for weeks because every test run used the *example* host config, whose
image path does not exist.

**`dotnet --version` fails on this host.** The PATH install is hostfxr-only; the
real SDK is in `%USERPROFILE%\.dotnet`. Probe `--list-sdks` with a fallback —
`scripts/ci-parity.mjs` already did this, and reimplementing it wrongly nearly
blocked a run.

**Hosted CI capacity is intermittent.** Jobs have been starved of runners and
killed at a uniform ~15 minutes with `runner_name=""` and zero steps — which
reads as a code failure but is not. Workflows are now serialised with `needs`
so they degrade into slow-but-correct. **Check `steps=0` before diagnosing.**

**Fast Startup means shutdown + power-on is not a reboot.** Use Restart, or
`LastBootUpTime` will not advance.

**The assistant runs remotely.** It cannot be driven while the machine is
offline and cannot survive a restart. Anything needing either must be a
standalone script the operator runs alone.

---

## 8. Process lessons — each produced a wrong answer before it was caught

- **A rejection is not a pass unless the *reason* is right.** A probe once
  scored green because it was rejected for artifact reuse while proving nothing
  about what it claimed to test. Assert on the reason.
- **Tooling must change in the same commit as the contract.** Three times a
  check was tightened and a verification tool left behind, each time producing a
  misleading green.
- **Verify environment claims; do not infer them.** "No disposable VM exists"
  was inherited from a stale note and was false — 11 base images and 23 field
  generations were on disk.
- **Distinguish a harness bug from a contract gap** before reporting either.
- **Silence is never permission.** A live record omitting its custody fields is
  rejected, not defaulted. The same rule applies to undeclared action tiers in
  the project-driver policy.
- **Completing actions is not verifying effects.** `unverified_completion` is a
  distinct outcome from success and may never be reported as done.

---

## 9. Declared weaknesses — accepted, not solved

1. **The provisional root lives on the machine it vouches for.**
   `trustPosture: provisional_personal_mvp`, `productionEligible: false`.
   Rotate to an externally generated offline root before production.
2. **The boot id is host-observed, not guest-attested.** Hyper-V exposes no
   guest boot GUID over KVP without credentials, so it is
   `sha256(vmGuid|powerOnTimeUtc)`.
3. **The approval key sits on the same machine as the automation.** A real
   second key and signature, but genuine separation needs it held elsewhere.
4. **The key registry is a trust root protected by code review**, not
   cryptography.
5. **TPM proof binds the signing *event*, not the signing *key*** — see §4.
6. **Hosted CI cannot verify completion.** It enforces the artifact
   reconciliation invariant, but `validate:completion` needs the sealed keys.

---

## 10. Open work

| Item | State |
| --- | --- |
| **HYP-001** | preflight passed; **three live cycles not yet run** |
| CHN-001 | blocked on HYP-001 |
| PD-001 workflow freeze | **blocked on a product decision** — see below |
| PD-NET-001 | conditional; activates only if the workflow needs internet |
| Desktop repo 36 commits | unpushed, unbacked-up |
| Runner capacity | worked around, not diagnosed |

**PD-001 needs four answers** nobody but the owner can give:

```text
Application/site:
What task appears:
What the agent must do:
What proves on screen that it succeeded:
Network required: yes/no
```

The third line is the one that matters. Not "the task is processed" — something
a person could confirm by looking, e.g. "the row reads Shipped, the banner says
Saved, and the Completed record shows the values that were typed." Everything
from PD-006 (scene observation) through PD-009 (first vertical slice) is built
against that sentence.

If the answer requires a browser, **PD-NET-001 activates**: the Field has no
internet, and creating `Exosuit-Field-NAT` is a host networking change.

---

## 11. Open pull requests

| PR | State | Contents |
| --- | --- | --- |
| #32 | draft, green | Project Driver deadline program docs |
| #33 | draft, green | PD-001 policy artifacts + HYP-001 runbook (stacked on #32) |

Merged today: #28 (M1 prep), #29 (contract v2.3 + M0 re-attestation), #30
(evidence artifacts verifiable), #34 (pre-apply guards), #35 (chunked base hash).

---

## 12. If you read nothing else

1. `npm run validate:completion` — the only honest status.
2. The gate cannot be promoted by editing files. Evidence is signed,
   content-addressed and single-use.
3. Secure Boot is done. **HYP-001's three live cycles are the next action**, and
   they will produce the project's first live-validated evidence.
4. Read the runbook before starting them. Evidence is single-use; a wasted run
   is a wasted artifact.
5. Promotion needs a reviewer who is not the issuer.
