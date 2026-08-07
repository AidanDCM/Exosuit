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
| Live private keys | `C:\Users\Aidan\.exosuit-live-keys` — 8 keys, each with a TPM vault **and** a DPAPI vault, **no plaintext** (§13) |
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
| Full suite | `npx vitest run` (547 tests, 86 files) |

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

1. **Host Secure Boot is OFF — still open, and only you can close it.**
   Confirmed `secureBoot: false` — disabled, not unreadable. The VM's Secure
   Boot is guest firmware and proves nothing about the host. The boot chain
   under the root key is unverified.

   This is a UEFI firmware setting. It cannot be changed from Windows, from a
   script, or by the assistant; it needs physical presence at boot:

   1. Save work. `shutdown /r /fw /t 0` — or restart and press **F2** during the
      Dell splash.
   2. In firmware setup: **Boot Configuration → Secure Boot → Enabled**, with
      Secure Boot Mode left at **Deployed**. Boot list must be **UEFI**, not
      Legacy/CSM.
   3. Save and exit. Then confirm from an **elevated** PowerShell:
      `Confirm-SecureBootUEFI` must return `True`.
   4. Re-run `npm run hyp001:preflight` elevated; the §7.1 failure should clear.

   Preflight now blocks `--apply` while this is disabled, and treats
   *unreadable* as a separate failure — `Confirm-SecureBootUEFI` needs
   elevation, and an unelevated read is not evidence of either state.

2. **TPM 2.0 sealing — DONE (2026-08-06).** All 8 live keys are now sealed
   under a non-exportable TPM platform key, verified end to end. See §13.

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
3. Run `npx vitest run` and confirm 547 pass — especially
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

---

## 13. TPM sealing — what was done

Closes §7.2. The live keys previously rested on DPAPI alone.

DPAPI binds ciphertext to a Windows *user account* on a machine, and its master
key derives from that user's credentials — so whatever recovers the credentials
recovers the vault. The keys are now additionally wrapped under a key created
inside the TPM, which is non-exportable and cannot be moved to another machine
even with the account password.

The signing keys did not move *into* the TPM. TPM 2.0 platform keys are RSA and
ECDSA; the completion gate signs Ed25519. So each Ed25519 private key is
encrypted at rest under a TPM-held key:

```
random 256-bit data key  ->  AES-256-GCM over the private key PEM
data key                 ->  RSA-OAEP-SHA256 under the TPM platform key
```

| | |
| --- | --- |
| Module | `src/completion/tpmSeal.ts` |
| Operator script | `scripts/completion/seal-live-keys-to-tpm.mjs` |
| Tests | `tests/tpmSeal.test.ts` (12, against the real TPM) |
| Provider | `Microsoft Platform Crypto Provider` |
| Wrapping key | `exosuit-completion-host-wrap-v1`, RSA-2048, `ExportPolicy: None` |
| Sealed | 8/8 live keys, `<key>.pem.tpm` beside `<key>.pem.dpapi` |

**Nothing was rotated.** Public keys, the registry, the ledger and every
existing signature are untouched, so no recorded evidence changed meaning —
sealing changes how a key is stored, not what it is. `validate:completion` is
unchanged at `18.31 / 59.30 / 0`, exit 0.

Verified after sealing: all 7 registry keys unseal from the TPM, produce valid
Ed25519 signatures, and match the public keys in `keys.json`.

**The DPAPI vaults were kept.** Sealing is additive and never deletes them. If
the TPM is cleared or the machine is reimaged, the sealed vaults become
unreadable and DPAPI is the fallback — deleting the `.pem.tpm` files restores
the previous behaviour exactly. `privateKey()` in `cli.ts` prefers TPM, then
DPAPI, then plaintext.

The script is safe to re-run: it verifies an existing sealed vault still opens
and matches before it would replace it, and it seals, unseals and compares every
key *before* writing anything. A key that does not round-trip is skipped and
reported rather than written.

### What this does not fix

It does not touch §8.1 — the provisional root still lives on the machine it
vouches for. Sealing binds the key to this TPM; it does not make an
on-host-generated root into an offline one. `trustPosture` remains
`provisional_personal_mvp` and `productionEligible` remains `false`.

---

## 14. Contract v2.3 — implemented, frozen pin deliberately NOT bumped

Key custody binding. TPM enforcement at load (§13) stops a weaker backend from
*producing* a live signature; it does not let a verifier, later and elsewhere,
tell how the key was protected. v2.3 closes that.

Every signed record may carry:

```
keyProtectionBackend   tpm | dpapi | plaintext
keyCustodyEventId      the custody event attesting that backend for that key
registryPurpose        development | live
recoveryGrantId?       set only when signed under an explicit recovery grant
```

For a **live** record the verifier requires all of: `keyProtectionBackend` is
`tpm`; no recovery grant open for the signing key; the custody event exists,
names the same key, and reports the same backend; the custody chain verifies;
and the registry purpose is `live`. It rejects a false TPM claim, missing
backend information, a record signed under an open grant, a custody event that
describes a different key, and any live signature from DPAPI or plaintext.

| | |
| --- | --- |
| Custody ledger | `src/completion/keyCustody.ts`, state in `docs/qa/completion/key-custody.json` |
| Binding check | `verifyCustodyBinding`, shared by the evidence and ledger verifiers |
| Tests | `tests/security/keyCustody.adversarial.test.ts` (23) |

### Why the fields are optional in the schema

They are optional structurally and **mandatory for live records in the
verifier**. Making them structurally required would invalidate every record
signed under v2.2 — including the recorded M0 attestation — turning a
protection improvement into a forced re-attestation of unrelated evidence. A
live record that omits them is rejected, so omission buys nothing.

### The freeze pin is intentionally stale

`tests/completionContractFrozen.test.ts` **fails right now, by design**. The
contract surface moved and the pin was deliberately left alone:

```
pinned    8b4f4cc8003141f8b69ca59d555dabb9aa121fc1a50f24f837f63844fdcc92c0
computed  700b41653a12d51004b23398ed5b46022a87977da908e3ed7e4e9badcce00291
```

Do **not** update the pin as a cleanup. Bumping `FROZEN_CONTRACT_LABEL` to 2.3
and re-attesting M0 is a separate deliberate act, held until there is a green
hosted CI run on the exact integrated head. Re-attesting against a contract no
CI has independently validated would manufacture exactly the kind of unverified
authoritative baseline the gate exists to prevent.

Consequently `git push` is blocked by the pre-push parity hook while this
stands. That is the freeze mechanism working, not a defect.

### State

```
v2.3 schema and verifier      implemented, 581/582 tests pass
frozen fingerprint            NOT bumped (held)
M0 re-attestation             NOT done (held)
HYP-001 live evidence         NOT recorded (held)
exact-head hosted green run   required before the bump
```


### TPM participation proof (added after review)

The custody event is signed by the *same Ed25519 key whose custody it
describes*, so a holder of that key could mint record and custody event
together and have them agree. The backend claim was still a self-report.

`src/completion/tpmAttestation.ts` closes that. A separate RSA key is created
inside the TPM (`exosuit-completion-attestation-v1`, non-exportable) and signs a
challenge per live signing event naming the record digest, completion key,
registry hash, machine, custody event, recovery state, a nonce and a timestamp.
Verification is pure — no TPM needed — so another machine can check it.

Rejected: a missing proof, a reused proof, a proof for another record or
completion key, an unapproved or self-inconsistent attestation key, a mismatched
registry, machine, custody event or recovery state, and a forged signature.
16 adversarial tests in `tests/security/tpmAttestation.adversarial.test.ts`.

**What it still does not prove.** The completion key and the attestation key are
distinct objects, so this shows the TPM *participated in this signing event*,
not that *this Ed25519 key was unwrapped by that TPM*. Binding those together
needs the completion key itself to be a TPM key, which TPM 2.0 cannot do for
Ed25519. The residual gap is narrow and stated rather than papered over.

### Versioned record schemas (added after review)

Records are a **union of two shapes**, not one shape with optional fields.
Optionality meant a v2.3 record could omit a custody field and still parse,
leaving the verifier as the only thing between a partial record and acceptance.

```
2.2   no custody fields at all; `.strict()` rejects them
2.3   recordVersion "2.3", custody fields structurally required,
      recoveryGrantId and tpmProofId explicitly nullable
```

The discriminator is **optional on the legacy shape**. Every record signed
before v2.3 has no `recordVersion`, and a signature is taken over the canonical
record — defaulting the field in would change the bytes and invalidate the very
signatures the union is meant to preserve. Absent therefore means 2.2.

`recoveryGrantId: null` and `tpmProofId: null` are explicit rather than omitted:
"no grant was open" is a fact the signature should cover, and an absent field is
indistinguishable from one someone stripped.

`LEGACY_LIVE_RECORD_CUTOFF` (2026-08-07) stops the legacy shape being used to
*create* new live evidence, while leaving existing attestations verifiable.
Without it, omitting `recordVersion` would be a permanent opt-out of custody and
TPM proof.

`custodyBindingOf()` is the single place that answers "what does this record
report?", so no consumer hand-rolls field tests.

20 tests in `tests/security/recordVersioning.adversarial.test.ts`, including the
cutoff cases — which re-sign the relegated record rather than merely stripping
fields, so they fail on the shape rule and not on a broken signature.

### v2.3 is now complete

---

## 15. Evidence artifact publication policy

Evidence is content-addressed: a record commits to the SHA-256 of an artifact,
and the verifier rejects the record if that artifact is absent. Until now the
artifacts were never in the repository — `.gitignore` carried an unanchored
`artifacts/` rule that also matched `docs/qa/completion/artifacts/`. The records
verified, because signatures are over public material, but the content they were
bound to lived on one machine. **A content-addressed record without its content
is only a signed pointer.**

The rule is now anchored to `/artifacts/` (the root build directory it was meant
for) with an explicit negation for the evidence store, kept as a defence against
a future broader pattern.

### What gets committed

Exactly the artifacts referenced by records in `evidence.json` — no more, no
less. Both halves are enforced by
`tests/completionArtifactReconciliation.test.ts`:

```
every referenced artifact exists
filename equals the SHA-256 of the contents
byte length equals the record's artifactBytes
no unreferenced artifact is committed
no private key material is present
```

Superseded records stay referenced by the ledger's revoked transitions, so their
artifacts stay committed too — a reviewer checking why an attestation was
withdrawn needs the evidence it rested on. What the invariant forbids is
*orphans*: artifacts with no record, which a reviewer could mistake for current
proof.

This test needs no private keys. Signature verification uses the public
registry and artifact verification uses committed files, so hosted CI can
enforce it — which matters, because CI can never run `validate:completion`: that
needs both the TPM-sealed signing keys and this artifact store.

### Never redact in place

`npm run scan:evidence-artifacts` scans published artifacts for private keys,
cloud and platform tokens, bearer tokens, credential-bearing URLs, private IPs,
MAC addresses and email addresses. RFC 2606 reserved domains
(`.example`/`.test`/`.invalid`/`.localhost`) are allowed, because the
support-bundle suite uses them as fixtures asserting such text is *rejected*.

**A finding is not a cleanup task.** The filename is the artifact's SHA-256 and
a signed record commits to it, so editing the file breaks the record. Instead:

1. treat that evidence record as unpublishable
2. re-run the command with deterministic redaction
3. record a new artifact and a new signed evidence record
4. replace the authoritative record through the normal transition path

### Review performed for the first publication

The six artifacts committed here were scanned and manually reviewed. Three
matches were traced to source and cleared:

| Match | Verdict |
| --- | --- |
| `aidan.miller@acme.example` | Fixture in `supportBundle.test.ts`, in a test name asserting rejection. RFC 2606 domain. |
| `password` ×2 | Test titles — "hard-denies password fields…", "Ignore previous instructions…". Prose. |
| `C:/Users/Aidan/...` | Real home-directory path in the vitest banner. Already committed in §1 and §4 of this document, so publication discloses nothing new. |

No private keys, tokens, credentials, IP/MAC addresses or environment dumps.
