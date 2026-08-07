# Exosuit Project Driver

Deadline-mode program for an operational, restricted desktop project operator by approximately 2026-09-01, followed by September-November maturation into the broader personal daily driver.

## Start here

1. [`DEVELOPER_HANDOFF.md`](./DEVELOPER_HANDOFF.md) — current baseline, merged work, retired branches, exact next actions, commands, and developer ownership.
2. [`DEADLINE_EXECUTION_PLAN.md`](./DEADLINE_EXECUTION_PLAN.md) — scope, calendar, critical path, agent lanes, daily rhythm, and stop conditions.
3. [`AGENT_WORK_QUEUE.yaml`](./AGENT_WORK_QUEUE.yaml) — machine-readable owner/dependency/acceptance queue for Codex and Claude sessions.
4. [`INTERACTION_PERSONALITY_CONTRACT.md`](./INTERACTION_PERSONALITY_CONTRACT.md) — visible-input and bounded personality rules.
5. [`RELEASE_GATES.md`](./RELEASE_GATES.md) — PD0-PD5 acceptance gates and operational telemetry.

## Current baseline

```text
integration branch              codex/unify-glove-field @ 1ac8488
contract                         frozen v2.3
M0                               re-attested and proven
published evidence artifacts     6, clean-clone/Linux verified
completion                       18.31 proven / 59.30 ready / 0 live
current hard blocker             host Secure Boot disabled
next formal gate                 HYP-001
```

Merged into the baseline:

- #28 — M1 preparation, TPM enforcement, recovery, HYP-001 harness
- #29 — v2.3 custody, TPM participation proof, versioned records, M0 re-attestation
- #30 — portable evidence artifacts, reconciliation invariant, evidence secret scan

Retired development and monitoring targets:

- `codex/m1-handoff`
- `codex/contract-v23-key-custody`
- `codex/publish-evidence-artifacts`
- monitor IDs `bc89n6uoq` and `b42foy02q`

Use `codex/unify-glove-field`, PR #32, issue #31, and exact-head workflow status instead.

## Immediate order

- PD-001: freeze the exact project workflow and action policy
- PD-002: complete — portable evidence and authoritative status reconciliation
- PD-003: operator enables Secure Boot and captures signed preflight
- PD-004: prove HYP-001
- PD-005: prove CHN-001
- PD-006 through PD-010: build the screen-bound project vertical slice
- PD-011: add personality only after correctness and recovery exist
- PD-012: burn-in
- PD-013: cut the restricted September release
- PD-014: convert September-November operation into daily-driver evidence

## Exact-head rule

Do not copy a prior green claim onto a later commit. Fetch the workflow status for the exact current PR head after every documentation or code update.

## Program rule

The September target is a project-specific, supervised operator. It must not be described as a universal or formally complete personal daily driver. The three-month project becomes the real validation program for PD4/PD5 and the formal M2-M6/P1 gates.
