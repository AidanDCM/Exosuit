# Project Driver Release Gates

These operational gates are additive to the formal M0-M6/P1 completion contract. They do not replace or promote formal gates.

## Current baseline

```text
integration branch              codex/unify-glove-field @ 1ac8488
contract                         frozen v2.3
M0                               passed
published evidence artifacts     6, Linux/clean-clone verified
completion                       18.31 proven / 59.30 ready / 0 live
current formal blocker           Secure Boot -> HYP-001
```

## PD0 — Observe-only project assistant

Required:

- fixed target desktop profile
- fresh screenshot capture
- active application/window identification
- task status and narration
- no input authority
- independent emergency stop available

Denied when:

- scene is stale
- wrong application/account is active
- observation confidence is below the project threshold

Pass:

- 50 scene captures with correct active-app identification
- stale screenshots rejected
- unexpected modal and lock state detected
- no input authority available to the observer process

## PD1 — Reversible visible interaction

Required:

- PD0 passes
- visible mouse and keyboard actuator
- target safety margins
- focus confirmation
- before/after scene references
- post-action verification
- bounded no-effect recovery

Acceptance:

- 30 consecutive reversible controlled actions
- zero wrong-target clicks
- zero blind retries
- stop succeeds in every attempt

## PD2 — Approved project execution

Required:

- HYP-001 and CHN-001 formally passed
- one complete project vertical slice
- explicit approval table
- verified checkpoints
- final consequential submission approval-required

Acceptance:

- 20 deterministic replay scenarios
- 10 supervised real tasks
- every completion visibly verified
- zero unauthorized consequential actions
- process and Field restart recover from the last verified checkpoint or fail clearly

## PD3 — Restricted September release

Release label:

`Exosuit Project Driver 0.1 — restricted supervised project operator`

Required:

- PD2 passes
- cockpit and one-command launch
- pause, independent stop, reset, and resume
- personality enabled/disabled equivalence
- 30-50 deterministic burn-in scenarios
- 15-25 supervised real project tasks

Release denied unless:

- final 30 controlled scenarios contain no severe failure
- emergency stop success is 100%
- blind retry count is zero
- every claimed completion is visibly verified
- restart/resume succeeds or yields a clear bounded failure
- consequential final submission remains approval-required
- known limitations and rollback procedure are published

## PD4 — Project-proven operator

September-November operational qualification.

Required telemetry per task:

- task type
- exact candidate SHA/version
- expected result
- verified outcome
- intervention count
- failure class
- recovery result
- resume result
- emergency-stop result when exercised
- duration and estimated time saved

Scope expands only after repeated clean performance on the frozen candidate.

Pass:

- at least 50 real project interactions
- recurring failures classified and remediated
- low-risk actions graduate only after repeated clean trials
- intervention rate and time saved are measured
- no unresolved severe defect

## PD5 — Personal daily-driver candidate

This is not achieved merely by three months passing.

Required on one frozen candidate:

- at least 100 trials
- completion rate >= 97%
- recovery rate >= 95%
- resume rate >= 99%
- emergency-stop rate = 100%
- unapproved consequential actions = 0
- soak and resource-pressure testing
- compatibility testing for declared configurations
- installer, update, rollback, repair, and uninstall validation
- relevant formal M2-M6/P1 gates passed

Only PD5 may be described as the personal daily-driver candidate. Production remains a separate P2/P3 program.

## Severity definitions

- `severe`: unauthorized consequential action, wrong account/application action, failed emergency stop, unrecoverable corrupted state, or false completion claim
- `major`: task failure requiring owner repair, repeated ambiguous state, failed resume with preserved data, or broken approval flow
- `minor`: recoverable visual targeting error caught before action, harmless delay, narration mismatch, or cosmetic cockpit defect

## Release decision rule

A release is denied if:

- any severe defect is open
- any required evidence artifact is missing or not independently reviewable
- the exact candidate lacks green source validation
- the owner cannot stop the system independently
- personality behavior changes an approval or verified outcome
