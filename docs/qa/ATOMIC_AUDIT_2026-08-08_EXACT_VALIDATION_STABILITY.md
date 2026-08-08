# Level 4 atomic audit: exact validation stability

## Verdict

Test-infrastructure correction only. No live promotion.

The change does not relax product deadlines or startup behavior. It removes a brittle
assumption that exactly one repeat bootstrap poll must occur before a deliberately
short harness deadline. The remaining assertions prove fail-before-wait and terminal
guest stop for any scheduler-valid poll count.

The exact validation lane is serialized by directly invoking the repository-local
Vitest executable. This addresses observed worker RPC timeouts without changing test
content, excluding suites, or reclassifying a failure as a pass. Fast development
feedback remains parallel; promotional validation favors deterministic completeness.

CHN-001 remains source-validated and blocked on its complete live matrix and
independent authorization.
