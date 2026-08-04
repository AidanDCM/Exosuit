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
