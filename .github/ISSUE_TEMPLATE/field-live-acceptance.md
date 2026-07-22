---
name: Field live acceptance
about: Execute and document one bounded Windows/Hyper-V Field acceptance slice
labels: field-foundation
---

## Level and goal

State the exact L0-L8 level from `docs/qa/FIELD_LIVE_ACCEPTANCE_BACKLOG.md` and the single capability being proven.

## Exact branch and commit

- Branch:
- Commit SHA:
- Environment:

## Prerequisites

- [ ] All required earlier levels passed
- [ ] `docs/FIELD_WINDOWS_RUNBOOK.md` read
- [ ] `docs/qa/FIELD_THREAT_MODEL.md` read
- [ ] relevant failure matrix rows selected
- [ ] synthetic/disposable environment confirmed

## Commands and procedure

List exact reproducible commands. Do not use “tested manually” without steps.

## Evidence

- logs:
- JSON reports:
- audit-chain result:
- screenshots or visual evidence, if separately consented:
- commit/run IDs:

## Failure injection results

| Injection | Expected | Actual | Evidence | Verdict |
|---|---|---|---|---|

## Findings and fixes

Record exact failure, root cause, changed file, retest, and remaining risk.

## Security/privacy impact

Explain authority, identity/generation, host isolation, consent, credentials, artifacts, logs, and emergency stop.

## Rollback

State the exact stop/destroy/revert procedure.

## Definition of done

- [ ] requested capability passed
- [ ] negative/failure rows passed
- [ ] no evidence-class inflation
- [ ] manuals/audit/status updated
- [ ] owner verdict recorded
