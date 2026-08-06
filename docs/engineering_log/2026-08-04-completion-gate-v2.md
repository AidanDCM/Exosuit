# Engineering Log — Adversarial Review and Completion Gate v2

**Date:** 2026-08-04
**Branch:** `codex/completion-gate-v2` (from `codex/unify-glove-field` @ `de52ad7`)

## Objective

Before collecting M1 evidence on real hardware, establish whether the
completion evaluator could be trusted to authenticate it. Evidence is only
worth as much as the system that verifies it, and a redesign discovered halfway
through live testing would invalidate the trials already run.

## What the review found

Twelve of thirteen attacks against contract version 1 succeeded. The decisive
result: all twenty gates could be flipped to `passed` with one fabricated file
reference reused throughout, producing `MVP: 100%`, `promotionAllowed: true`,
`integrity verify: true` — from a machine with no Hyper-V.

The published 59.30% was arithmetically correct but 69% of it came from
self-declared status, and every one of the twelve MVP-required live gates held
synthetic-only evidence.

Full findings: [`../qa/ATOMIC_AUDIT_2026-08-04_COMPLETION_GATE_V2.md`](../qa/ATOMIC_AUDIT_2026-08-04_COMPLETION_GATE_V2.md).

## Work completed

- Added `src/completion/` — contract version 2 across policy, contracts,
  signing, evidence, ledger, benchmark, evaluate, and a CLI.
- Replaced the single completion percentage with three metrics: proven
  completion, implementation readiness, and live completion.
- Moved authoritative status out of the manifest into an append-only,
  hash-chained, Ed25519-signed transition ledger.
- Replaced rank-based evidence substitution with per-gate allowlists.
- Made evidence content-addressed, single-use, and bound to commit, machine,
  OS build, Field generation, test-definition version, and a nonce.
- Made `OWN-001` and `PERF-001` computed from signed trial bundles.
- Enforced transitive prerequisites, test cycles, and backward-phase
  dependencies.
- Consolidated all policy into one module executed by CI.
- Added 46 adversarial tests and 11 contract tests; mutation-tested both.
- Marked the prior audit superseded and documented residual risk honestly.

## Deliberately not done

- Contract version 1 was left untouched. It is the baseline the adversarial
  suite is written against, and rewriting it would erase the record.
- No gate was migrated to `passed`. Version 1 evidence does not meet the
  version 2 bar, so migration caps every gate at `ready_for_live`; reaching
  `passed` requires freshly recorded evidence and a reviewer.
- M1 was not started.

## Result

Implementation readiness for personal MVP reads 51.97% after migration — lower
than the 59.30% previously published, because the three M0 gates now sit at
`ready_for_live` until re-attested under the new evidence rules. Proven
completion and live completion both read 0%.

## Next

Re-attest M0 with real recorded evidence, then exercise the v2 evidence path
end to end on the Windows/Hyper-V host before resuming M1.
