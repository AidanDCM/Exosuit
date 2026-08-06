# Completion gate contract, version 2

Version 1 of the completion evaluator passed ordinary CI and failed adversarial
review on 2026-08-04. Twelve of thirteen attacks succeeded, including declaring
**100% personal-MVP completion with promotion allowed** on a machine with no
Hyper-V, using one fabricated file reference reused across all twenty gates.

This document defines the replacement. Version 1 (`src/buildCompletionPlan.ts`)
is retained unchanged as the vulnerable baseline the adversarial suite is
written against; it must not be used to authorise anything.

## Three metrics, never one

A single percentage conflated work built with work proven. The evaluator now
reports three numbers and a headline that always states all three:

> Exosuit personal MVP: 0% proven complete, 51.97% implementation-ready, 0% live-validated.

| Metric | Counts | Meaning |
| --- | --- | --- |
| **Proven completion** | Gates `passed` on the ledger with valid evidence and proven prerequisites | The only number that may be called completion |
| **Implementation readiness** | Adds partial credit (`source_validated` 0.45, `ready_for_live` 0.6) | How much engineering exists; *not* completion |
| **Live completion** | Only gates whose evidence class requires a real system | How much has been proven against real hardware |

Partial credit is deliberately retained so progress stays visible, but it can
never raise proven completion, and no report may quote readiness alone.

## Structural changes from version 1

### Status is not a field

A test definition can no longer express `status` or `evidence`; the schema
rejects both. Authoritative status is folded from an append-only, hash-chained,
signed transition ledger. Editing the manifest cannot promote a gate.

Permitted transitions:

```
planned → source_validated → ready_for_live → passed
passed  → revoked
any active status → failed → remediated → ready_for_live
```

There is no edge into `passed` except from `ready_for_live`. Promotion to
`passed` additionally requires cited evidence and a reviewer distinct from the
issuer. A failure can only be cleared by an explicit, signed remediation — a
later write cannot erase it, because every event names the hash of its
predecessor.

### Evidence classes are proof domains, not a ranking

Version 1 qualified evidence by numeric rank, so `owner_acceptance` (6)
"proved" `hyperv_host_guest` (4). The rank table is deleted. Each gate carries
an explicit allowlist in `src/completion/policy.ts`, and there is no implicit
substitution:

```
HYP-001 accepts only hyperv_host_guest
OWN-001 accepts only owner_acceptance
SEC-001 accepts only security_review
```

### Evidence is content-addressed and single-use

A record commits to the SHA-256, byte length, and media type of an artifact
that must be present in the store and hash to exactly that value. Each
artifact, evidence id, and nonce may be used **once, by one test**. Records
bind to the exact commit, run id, machine id, OS edition and build, Field id,
Field generation, Field boot id, test-definition version, issuer, reviewer,
observation time, and a nonce.

### Signatures, not a recomputable hash

Version 1 sealed the manifest with a plain SHA-256 that the generator
recomputed over whatever it was given — it detected corruption, not tampering.
Everything is now Ed25519-signed with role separation:

| Role | Signs | Held by |
| --- | --- | --- |
| `manifest` | The manifest | Release owner |
| `ledger` | Status transitions | Release owner |
| `evidence` | Local (source/unit/fake) evidence | CI or developer |
| `host` | **Live** evidence only | The machine itself, bound by `machineId` |

Only public keys are committed. `EXOSUIT_COMPLETION_KEY_DIR` must point outside
the repository, and the CLI refuses to run if it does not. Live evidence must
be signed by a host-bound key whose `machineId` matches the environment the
record names, so a checkout cannot forge live evidence.

Keys carry `notBefore`/`notAfter` and optional `revokedAt`. Rotation is
non-destructive: a record is checked against the key's validity window *at the
record's own timestamp*, so history survives. Revocation is unconditional:
every record signed by a revoked key is rejected.

### Benchmark gates are computed, never asserted

`OWN-001` and `PERF-001` do not pass because someone edits a status. Their
thresholds live in policy and are computed from a signed, hashed trial bundle:

| | OWN-001 (MVP) | PERF-001 (daily driver) |
| --- | --- | --- |
| Trials | ≥ 10 | ≥ 100 |
| Distinct recipes | exactly 5 | exactly 5 |
| Completion rate | ≥ 90% | ≥ 97% |
| Resume rate | ≥ 90% | ≥ 99% |
| Emergency stop | 100% of attempts | 100% of attempts |
| Unapproved consequential actions | 0 | 0 |
| Unnecessary interventions | ≤ 0.3 per trial | ≤ 0.1 per trial |

Editing the trial data after the fact breaks the artifact's content address.

### Prerequisites are enforced

Version 1 checked that prerequisites existed and never consulted their status.
A gate is now proven only when every prerequisite is transitively proven, and a
`failed` or `revoked` prerequisite disqualifies everything downstream. Test
prerequisite cycles are detected (version 1 detected only phase cycles), and a
gate may not depend on work scheduled in a later phase.

### One policy implementation

Weights, status scores, evidence rules, gate requirements, and thresholds exist
only in `src/completion/policy.ts`. The CI validator executes that module
through the CLI rather than reimplementing it, so the evaluator and the
validator cannot drift apart.

## Registry trust root (v2.1)

Code review alone is sufficient for development, not for live evidence. The key
registry is therefore a root-signed envelope:

- **Offline Ed25519 root key.** Held outside the repository and off the signing
  machine. Only the SHA-256 fingerprint of its public half is pinned, in
  `pinnedRootKeyFingerprints`, so a substituted root is a reviewable diff. A
  verifier may pin externally instead via `EXOSUIT_COMPLETION_ROOT_PUBKEY`.
- **`registryId` and `purpose`.** A `development` registry may never attest live
  evidence — enforced in `resolveSigningKey`, not by convention. Live registries
  expire after one year; development fixtures after three.
- **Signed registry versions.** `version` and `previousRegistryHash` chain
  registry changes so a key set cannot be silently rolled back.
- **Signed revocation records.** Revocations carry their own root signature, so
  deleting a `revokedAt` field does not un-revoke a key.
- **CODEOWNERS.** Policy, verifier, registry, recorded state, and the
  adversarial suites all require owner review.

Approval authorities are separated and never interchangeable:
`technical_review`, `owner_acceptance`, and `release_approval`. Policy decides
which one a gate demands; claiming the wrong one fails the transition.

Each authority is a **separate key held by a person**, and a promotion to
`passed` carries an independent reviewer signature:

| Field | Meaning |
| --- | --- |
| `reviewerKeyId` | The approval key. Must differ from `signingKeyId`. |
| `reviewerSignature` | Taken over the event *before* the issuer seals it. |

The reviewer signs first; the issuer's signature then covers the reviewer's, so
an approval cannot be moved onto a different transition or altered afterwards.
Without this the holder of the ledger key could name any reviewer and claim any
authority — the reviewer field alone was only a string. Host automation must
never hold an approval key.

### Superseded boots and generations

A Field generation and a guest boot each have a lifetime, and evidence may not
outlive them. Two replays are rejected:

- **Stale generation** — evidence attributed to generation *N* observed after
  generation *N+1* had already produced evidence. The generation it names no
  longer existed.
- **Superseded boot** — within one generation, two boots whose observation
  windows overlap. Two boots of a generation cannot run at once, so the older
  boot still emitting evidence after a newer one started is a replayed capture.

Boot ids are opaque, so ordering is derived from observation windows rather than
from the ids themselves. Evidence legitimately recorded in an earlier boot or
generation is untouched; only records overlapping a later one are rejected.

For a personal MVP one offline root key is sufficient. Commercial production
should move to a two-of-three threshold model so no single key holder can
rewrite the completion state.

## Field lifecycle ledger (v2.2)

M0.5 reboot verification on 2026-08-05 found a hole: a fully valid, correctly
signed evidence record — fresh artifact, fresh nonce, valid host signature —
naming the boot of a Field generation that had been **destroyed an hour
earlier** was accepted. Nothing bound evidence to a boot's lifetime. The
observation-window overlap rule only fired when two boots of one generation
overlapped; a single record naming a dead boot passed unchallenged.

The host now records a signed, hash-chained lifecycle per generation:

```
created → booted → stopped → booted → ... → destroyed
```

Only a host-bound key under a live registry may write it, because only the host
observes a Field being created, booted, stopped, and destroyed. The chain
enforces that a boot cannot start while another is open, a boot id cannot be
reused within a generation, and nothing may follow a destroy.

Field-bound live evidence must then fall inside an **open boot window** of a
generation that existed at the time. It **fails closed**: with no lifecycle
ledger there is no way to tell a live generation from a destroyed one, so the
evidence is rejected rather than assumed good.

Validated on real hardware, not only fixtures. A second disposable Field was
created, booted, and attested with lifecycle recording; evidence inside the
open boot verified, and evidence recorded after the boot was stopped was
rejected with `evidence was observed after boot … ended`.

The two M0.5 evidence records produced before this rule existed no longer
validate. They were removed rather than back-dated — inventing lifecycle events
for a destroyed Field is exactly the forgery this contract exists to prevent.
Both remain in git history and in the M0.5 report.

## Trust roots and residual risk

Stated plainly, because the version 1 report overclaimed:

1. **The public key registry is a trust root.** Anyone who can commit to
   `docs/qa/completion/keys.json` *and* holds a private key can mint records.
   The registry is protected by code review, not by cryptography.
2. **`designation: live` is asserted by the signer.** What makes it credible is
   that only a host-bound key may sign it, and that key names its machine.
3. **Evidence attests that a command ran and produced an output.** It does not
   prove the command was the right one; the acceptance criteria in the manifest
   remain a human judgement.
4. **A holder of all four private keys can forge a complete state.** The
   adversarial suite deliberately runs with the keys, which is why it is a
   stronger attacker than reality.

The system is designed to make forgery require key compromise or a reviewed
malicious commit, rather than a text edit.

## Operating procedure

```bash
npm run completion:migrate
```

Generate keys once, outside the repository:

```bash
EXOSUIT_COMPLETION_KEY_DIR=~/.exosuit-keys npm run completion:keys
```

Record evidence by actually running the command it attests to:

```bash
EXOSUIT_COMPLETION_KEY_DIR=~/.exosuit-keys npm run completion:record -- --test SRC-001 --class fake_integration --command "npm run typecheck"
```

Promote, with a reviewer who is not the issuer:

```bash
EXOSUIT_COMPLETION_KEY_DIR=~/.exosuit-keys npm run completion:transition -- --test SRC-001 --from ready_for_live --to passed --evidence <id> --issuer ci --reviewer owner --reason "M0 re-attested"
```

Report:

```bash
npm run validate:completion
```

The validator exits non-zero on **integrity failures only**. Incompleteness is
expected and does not fail the build; an unverifiable manifest, ledger, or
evidence store does.

## Test coverage

- `tests/completionGateV2.test.ts` — contract behaviour, positive cases
- `tests/security/buildCompletionPlanV2.adversarial.test.ts` — 46 attacks

Every attack that succeeded against version 1 is a required failing case.
Additional classes cover partial ledger writes, dropped events, corrupt and
truncated artifacts, key rotation, revoked keys, clock rollback, nonce replay,
duplicate ids, cross-machine reuse, cross-generation replay, self-review, and
trial-record manipulation.

The suite was mutation-tested on 2026-08-04: disabling prerequisite enforcement
and the artifact hash check caused three tests to fail, confirming the
assertions bite rather than passing vacuously.

## Freeze — v2.2, 2026-08-06

The contract surface is frozen and the freeze is enforced, not merely declared.
`src/completion/frozen.ts` reduces everything M1 evidence depends on for its
meaning to one canonical fingerprint:

```
8b4f4cc8003141f8b69ca59d555dabb9aa121fc1a50f24f837f63844fdcc92c0
```

`tests/completionContractFrozen.test.ts` recomputes it on every run. A moved
fingerprint means a moved contract, and evidence gathered under the old surface
may no longer mean what it did. Changing the pin is deliberate and reviewable:
bump `FROZEN_CONTRACT_LABEL`, say why, re-attest what depended on it.

Frozen after M0.5 live attestation and reboot verification passed 18/18 on a
genuine restart.

### M0 re-attested under the live registry

M0 now rests on the live trust root rather than development fixtures:

| | |
| --- | --- |
| Registry | `live-2026-08-05-aidans-dell7430`, `purpose: live`, root-sealed |
| Baseline commit | `8efb63aa1452ebdb84f910309bbb284b2d25a980` — the freeze commit |
| Manifest signed by | `live-manifest-1` |
| Evidence signed by | `live-evidence-1` (3 records, commands actually re-run) |
| Approvals co-signed by | `live-technical-review-1`, distinct from the sealing key |
| Integrity failures | none |

The development registry is preserved at `docs/qa/completion/keys-development.json`
as a reproducible fixture. Its keys were never regenerated.

```
Exosuit personal MVP: 18.31% proven complete, 59.30% implementation-ready, 0% live-validated.
```
