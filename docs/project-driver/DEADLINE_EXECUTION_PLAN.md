# Project Driver Deadline Execution Plan

**Program start:** 2026-08-07  
**Operational release target:** 2026-09-01  
**Project operating window:** September through November 2026  
**Primary target:** a reliable, screen-bound desktop operator for the project, followed by maturation into the broader personal daily driver.

## 0. Current validated baseline

```text
integration branch              codex/unify-glove-field @ 1ac8488
merged PRs                      #28, #29, #30
contract                         frozen v2.3
M0                               re-attested and proven
published evidence artifacts     6
hosted artifact reconciliation   passed on Linux
hosted evidence secret scan      passed
full test suite                  624 tests / 91 files
completion                       18.31 proven / 59.30 ready / 0 live
current hard blocker             Secure Boot disabled
next formal gate                 HYP-001
```

The previous monitoring targets `codex/m1-handoff`, `codex/contract-v23-key-custody`, and `codex/publish-evidence-artifacts` are retired. Monitor `codex/unify-glove-field`, PR #32, issue #31, and exact-head workflow runs.

The authoritative developer entry point is `docs/project-driver/DEVELOPER_HANDOFF.md`.

## 1. Mission

Deliver a restricted Exosuit release that can perform the project's desktop work through visible keyboard and mouse interaction, verify each meaningful effect from the screen, recover from interruptions, and expose a consistent personality without allowing personality behavior to weaken correctness or safety.

The September release is **not** a claim of universal desktop autonomy. It is a project-specific operating release whose real usage becomes the validation program for the broader personal daily driver.

## 2. Hard boundaries

All effects in target applications must occur through visible mouse and keyboard input. Internal observation, planning, memory, logging, verification, and safety controls are allowed; hidden application actions are not.

Forbidden for project execution:

- direct database or application mutation
- hidden form submission
- DOM or accessibility activation that bypasses visible input
- shell or file operations that perform the target application's task
- random clicks or deliberate work corruption
- behavior tuned to defeat monitoring, impersonate an employee, or evade bot detection
- personality logic overriding verification, approval, stop, or recovery rules

## 3. Two release tracks

### Track A — Project Driver

Deadline-focused, narrow, and operational by approximately 2026-09-01.

Critical path:

`M0 -> HYP-001 -> CHN-001 -> project scene loop -> project action loop -> verification/recovery -> cockpit -> supervised burn-in`

### Track B — General Personal Daily Driver

Continues behind Track A. Uses September-November project activity as real trial data for M2-M6 and P1 reliability work. Generalization is allowed only when it does not destabilize Track A.

## 4. September release scope

Required:

- dedicated predictable Windows Field environment
- fresh screenshot before every action decision
- visible mouse and keyboard actuator
- one-step-at-a-time observe/act/verify loop
- no blind retry after uncertain effects
- independent emergency stop
- restart and resume from verified checkpoints
- approval queue for consequential actions
- simple cockpit showing current task, last verified state, pending approval, and stop control
- one complete project workflow from input to verified output
- personality pacing and narration constrained by the motor/personality contract
- evidence bundle for every acceptance run

Deferred unless the project directly requires them:

- broad arbitrary-application support
- generalized Teach and Shadow learning
- five unrelated recipes
- production distribution and external trust roots
- broad compatibility matrix
- unsupervised consequential submissions

## 5. Calendar and deliverables

### August 7-9 — Mission freeze and environment

Owners: Integrator + Claude architecture/review + Codex validation

Deliver:

- one-page project workflow definition
- target application list and fixed desktop profile
- allowed, approval-required, and forbidden action table
- success and failure taxonomy
- authoritative status/handoff reconciliation
- completion evidence artifacts made portable and hash-verifiable
- Secure Boot enabled and signed preflight captured

Current state:

- evidence portability and clean-clone verification are complete through PR #30
- stale v2.2/v2.3 handoff state is corrected on the deadline branch
- the exact project workflow remains to be frozen
- Secure Boot remains the operator-only blocker

Exit:

- no unresolved ambiguity about what the September release must do
- no critical evidence needed for the next gate exists only on one workstation

### August 10-13 — M1 live foundation

Owners: Codex implementation + Codex validation; Claude adversarial review

Deliver:

- HYP-001 three-cycle disposable Field run
- immutable-base and exact-generation cleanup proof
- CHN-001 replay, identity, generation, boot, lock, Secure Desktop, heartbeat, and emergency-stop injections
- signed evidence reviewed by a non-issuer identity

Exit:

- Field lifecycle and channel gates pass
- emergency stop succeeds in every test
- no M2 project execution starts before this exit

### August 14-18 — Screen-bound observe/act/verify spine

Owners: Codex implementation; separate Codex validation

Deliver:

- current-screen capture and freshness check
- scene description with active app/window, actionable regions, text, cursor, modal state, and confidence
- bounded pointer and keyboard action primitives
- post-action screenshot and expected-state verification
- failure categories: stale scene, focus loss, wrong control, no effect, ambiguous effect, unexpected modal, timeout
- checkpoint after every verified chunk

Exit:

- controlled test desktop completes 30 consecutive reversible interactions with no wrong-target click
- uncertain effects stop rather than retry

### August 19-23 — First project vertical slice

Owners: Integrator + Codex implementation + Claude architecture/review

Deliver one end-to-end workflow:

`observe -> understand -> plan one chunk -> request approval if required -> execute visibly -> re-observe -> verify -> checkpoint -> continue/stop`

Exit:

- 20 deterministic replay scenarios pass
- 10 supervised real project tasks complete
- every claimed completion has visible verification

### August 24-27 — Personality and operating surface

Owners: Claude personality design + Codex implementation + independent validation

Deliver:

- personality state machine
- bounded pacing and hesitation
- safe cursor expressiveness
- draft-only typo/correction behavior
- frustration narration and harmless reconsideration
- cockpit, pause, resume, approval queue, and one-command launch

Exit:

- personality can be disabled without changing task outcomes
- enabled and disabled runs produce equivalent verified results
- personality never selects targets, bypasses approval, or changes safety policy

### August 28-September 1 — Burn-in and restricted release

Owners: all lanes, with Integrator controlling scope

Run:

- 30-50 deterministic scenarios
- 15-25 supervised real project tasks
- process restart
- Field restart
- network interruption
- focus loss
- stale screen
- unexpected modal
- duplicate instruction
- partial completion
- emergency stop during action
- resume after interruption

Release criteria:

- zero unauthorized consequential actions
- 100% emergency-stop success
- zero blind retries after uncertain effects
- every completion visibly verified
- restart/resume works or produces a clear bounded failure
- no severe failure in the final 30 controlled scenarios
- at least 15 successful supervised project tasks
- consequential final submission remains approval-required

Release label:

`Exosuit Project Driver 0.1 — restricted supervised project operator`

## 6. September-November maturation

### September — supervised operation

- Assisted mode by default
- record every intervention and failure
- fix repeated defects before adding scope
- target at least 50 real interactions

### October — candidate stabilization

- freeze a stable candidate
- graduate only repeatedly proven low-risk actions
- exercise restart, resume, degradation, and overload
- target at least 100 cumulative real interactions

### November — daily-driver qualification

- run the formal 100-trial reliability benchmark on one frozen candidate
- complete soak and compatibility tests
- validate install, update, rollback, and uninstall
- require 97% completion, 95% recovery, 99% resume, 100% stop, and zero unapproved consequential actions

## 7. Agent organization

### Integrator

One agent owns the integration branch and critical path. It assigns modules, freezes interfaces, rejects unrelated scope, integrates twice daily, and is the only lane allowed to resolve cross-cutting design conflicts.

### Codex implementation lane

Production code, Windows integration, actuator, deterministic adapters, checkpoints, cockpit, and build repair.

### Codex validation lane

Tests, replay fixtures, failure injection, CI, performance measurement, and acceptance evidence. It must not approve code it authored.

### Claude architecture/review lane

Requirements, interface review, simplification, threat modeling, and ensuring the implementation serves the actual project workflow.

### Claude adversarial/evidence lane

Attempts to falsify claims, checks rejection reasons, validates artifacts and evidence chains, and detects stale or contradictory documentation.

No implementing lane approves its own gate.

## 8. Daily operating rhythm

1. Recompute the critical path and choose at most three outcomes for the day.
2. Freeze interfaces before parallel work starts.
3. Keep at most two implementation branches and one validation branch active.
4. Integrate at least twice.
5. Run affected tests continuously and the full exact-head suite once.
6. Execute one real or replayed project workflow.
7. Record failure type, intervention count, recovery, resume, and time saved.
8. Update one authoritative status source.
9. Delete or defer code not on the critical path.

## 9. Scope admission rule

A proposed change enters the deadline track only if at least one is true:

- it directly enables the September project workflow
- it closes a known safety or reliability blocker
- it materially lowers the cost of repeated validation

Otherwise it is deferred to the general daily-driver track.

## 10. Stop conditions

Stop release work and return to remediation if any occurs:

- emergency stop fails
- action executes in the wrong application/account
- consequential action occurs without required approval
- uncertain effect is blindly retried
- evidence is missing, stale, unreviewable, or machine-local only
- personality behavior changes the verified outcome
- cleanup crosses the exact Field generation
- the system cannot explain its last verified checkpoint
