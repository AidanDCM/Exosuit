# Atomic Audit — Adversarial Review of the Completion Evaluator, and Contract v2

**Date:** 2026-08-04
**Branch:** `codex/completion-gate-v2` (from `codex/unify-glove-field` @ `de52ad72b11ddafe969e5923f16c946e49cf04f4`)
**Decision:** contract version 1 rejected for authorisation use; version 2 implemented; M1 paused; personal MVP and production remain denied

## Why this review happened

PR #26 reported 59.30% weighted personal-MVP completion and stated that
tampered manifests and unsupported promotions fail closed. Rather than begin M1
against that evaluator, the owner directed an adversarial pass first: evidence
collected on real hardware is only worth as much as the system that
authenticates it.

## Part 1 — findings against contract version 1

### Weighting

The three published figures were reproduced exactly by hand: 59.30% / 53.29% /
49.57%. The arithmetic was correct; the meaning was not.

Decomposition of the 59.30% personal-MVP figure (71 total weight, 42.10 earned):

| Source of credit | Weight | Share of headline |
| --- | ---: | ---: |
| Gates actually `passed` | 13.00 | 31% |
| `ready_for_live` (self-declared, 0.6) | 12.00 | 28% |
| `source_validated` (self-declared, 0.45) | 17.10 | 41% |

**All twelve MVP-required live gates held synthetic-only evidence** — `source`
or `unit` artifacts standing in for `hyperv_host_guest`, `windows_guest`,
`owner_acceptance`, `chatgpt_mcp`, `security_review`, and `release_operations`.
Those twelve gates carried 58 of 71 weight and were credited 50.2% complete on
no real evidence at all.

### Attack results

Thirteen attacks were executed against the real code path. Only the single case
already covered by the existing tests was blocked.

| # | Attack | v1 | v2 |
| --- | --- | --- | --- |
| A1 | Live gate passed on synthetic-only evidence | rejected | rejected |
| A2 | Unrelated higher-ranked class substitutes (`owner_acceptance` proves Hyper-V) | **accepted** | rejected |
| A3 | Evidence from a different commit than the baseline | **accepted** | rejected |
| A4 | One artifact reused across three unrelated gates | **accepted** | rejected |
| A5 | Evidence dated 1999 and 2099 | **accepted** | rejected |
| A6 | Gate `passed` while its prerequisite stays `planned` | **accepted** | rejected |
| A7 | Test-prerequisite cycle (A↔B) | **accepted** | rejected |
| A8 | An M1 test depends on an M6 test | **accepted** | rejected |
| A9 | Direct `planned` → `passed`, no review | **accepted** | rejected |
| A10 | A later manifest erases an earlier `failed` | **accepted** | rejected |
| A11 | Mass flip to `ready_for_live` on synthetic evidence | **accepted** (59.30 → 67.32%) | readiness only, proven stays 0% |
| A12 | Tamper, then re-run the generator to re-seal the hash | **accepted** | rejected |
| A13 | Evidence citing a nonexistent artifact | **accepted** | rejected |

**Worst case under v1:** flipping all twenty gates to `passed` with one
fabricated reference reused throughout produced `integrity verify: true`,
`MVP: 100%`, `promotionAllowed: true`, zero blockers — on a machine with no
Hyper-V.

### Root causes

1. Test `prerequisites` were validated for existence and never consulted during
   evaluation. Phase dependencies were enforced; test prerequisites were
   decorative. Cycle detection covered phases only.
2. Evidence was inspected only when `status === "passed"`. `source_validated`
   and `ready_for_live` required merely a non-empty array of any class,
   including synthetic — the basis of 41% of the headline.
3. `evidenceRank` conflated trust level with proof domain, so any
   higher-ranked class satisfied any lower-ranked requirement.
4. No state history existed. A single mutable snapshot meant no transition
   rules, no revocation, no reviewer, and no protection for recorded failures.
5. `manifestHash` was a plain SHA-256 recomputed by the generator — an
   accident detector, not a tamper detector.
6. `scripts/validate-build-completion-plan.mjs` reimplemented every rule,
   creating silent divergence risk with the TypeScript evaluator.

### Finish-line review

This part held up. MVP genuinely requires installer (`INS-001`), recovery
(`ACT-001`), emergency stop (`CHN-001`), resume (`CPK-001`), and Teach privacy
and deletion (`TCH-001`) — none postponed to production. "Works once" and
"works reliably" are properly separated (M6 at 10 trials, P1 at 100).

Two gaps: the quantitative MVP bar existed only as prose inside
`acceptanceCriteria`, unreachable by any code; and key security, prompt
injection, and private-data scanning remain production-scoped in `SEC-001`.

## Part 2 — contract version 2

See [`../COMPLETION_GATE_V2.md`](../COMPLETION_GATE_V2.md) for the full
contract. Summary of changes:

- Three reported metrics: proven completion, implementation readiness, live
  completion. Readiness may never be quoted alone as completion.
- `status` and `evidence` are no longer expressible on a test definition.
  Status folds from an append-only, hash-chained, Ed25519-signed ledger.
- Constrained transitions; no edge into `passed` except from `ready_for_live`;
  promotion requires cited evidence and a reviewer distinct from the issuer.
- Per-gate evidence allowlists replace the rank hierarchy. No substitution.
- Content-addressed, single-use evidence bound to commit, run, machine, OS
  build, Field id/generation/boot id, test-definition version, and a nonce.
- Ed25519 signatures with role separation and host-bound keys for live
  evidence; private keys required to live outside the repository.
- `OWN-001` and `PERF-001` computed from signed trial bundles against policy
  thresholds, never asserted.
- Transitive prerequisite enforcement; test-cycle and backward-phase detection.
- A single policy module executed by CI rather than reimplemented.

### Verification

- `tests/completionGateV2.test.ts` — 11 contract tests
- `tests/security/buildCompletionPlanV2.adversarial.test.ts` — 46 attacks
- Mutation-tested: disabling prerequisite enforcement and the artifact hash
  check caused three tests to fail, confirming the assertions are not vacuous.
- Contract v1 and its 9 tests are retained unchanged as the vulnerable baseline.

### Residual risk, stated plainly

The public key registry is a trust root protected by code review, not
cryptography. `designation: live` is asserted by the signer, made credible only
by host-bound keys. Evidence proves a command ran and produced output, not that
it was the right command. A holder of all four private keys can forge a
complete state — the adversarial suite runs with the keys precisely because
that is a stronger attacker than reality.

## Decision

Contract version 1 must not authorise anything. M1 remains paused until v2
evidence collection is exercised on the real Windows/Hyper-V host. PR #26 stays
draft, with its body corrected to state proven, readiness, and live figures
separately.
