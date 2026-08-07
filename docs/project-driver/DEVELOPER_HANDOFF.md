# Developer Handoff — Project Driver Deadline Mode

**Updated:** 2026-08-07  
**Operational target:** 2026-09-01  
**Project operating window:** September-November 2026  
**Authoritative integration branch:** `codex/unify-glove-field`  
**Deadline-program branch:** `codex/project-driver-deadline-mode`  
**Control issue:** #31  
**Program PR:** #32 — keep draft until the program documents are reviewed

## 1. Mission

Deliver a restricted, supervised, project-specific desktop operator by approximately 2026-09-01. It must perform target-application effects through visible mouse and keyboard input, verify meaningful effects from fresh screen observations, recover from interruptions, and expose a bounded easygoing personality that cannot weaken correctness, approval, verification, or emergency-stop behavior.

The September release is not the universal personal daily driver. September-November project use becomes the structured trial program for the broader M2-M6/P1 path.

## 2. Current repository baseline

The current integration baseline is `codex/unify-glove-field` at merge commit `1ac8488`.

Merged work:

- PR #28 — M1 handoff, TPM sealing, TPM-only live-key enforcement, recovery ledger, HYP-001 harness, CI concurrency, velocity plan
- PR #29 — contract v2.3, versioned records, custody binding, TPM participation proof, frozen fingerprint update, M0 re-attestation
- PR #30 — six content-addressed evidence artifacts published, `.gitignore`/`.gitattributes` corrected, clean-clone reconciliation invariant, evidence secret scan

Validated baseline:

```text
Tests                         624 / 624 across 91 files
Proven MVP completion         18.31%
Implementation readiness      59.30%
Live gate completion           0.00%
Contract                       frozen v2.3
M0                             re-attested and proven
HYP-001                        not yet passed
CHN-001                        not yet passed
Secure Boot                    outstanding
```

PR #30's Linux hosted run proved that committed artifacts retain exact bytes across checkout, match their SHA-256 filenames and recorded lengths, have no committed orphans, and pass the evidence secret scan. This is now independently checkable without access to TPM-sealed private keys.

PR #32's current head also passed hosted Exosuit CI. Do not infer a later head is green; verify the exact SHA after every update.

## 3. Retired branches and monitors

The following branches were deleted and must not be used as monitoring or development targets:

- `codex/m1-handoff`
- `codex/contract-v23-key-custody`
- `codex/publish-evidence-artifacts`

The old monitor IDs `bc89n6uoq` and `b42foy02q` are retired references. They watched deleted branches or a one-shot run and are not an authoritative status source.

Monitor these instead:

- integration activity: `codex/unify-glove-field`
- deadline program: PR #32 / `codex/project-driver-deadline-mode`
- execution checklist: issue #31
- exact-head workflow status, not branch-name assumptions

## 4. Read order for every Codex or Claude session

1. `docs/project-driver/DEVELOPER_HANDOFF.md`
2. `docs/project-driver/DEADLINE_EXECUTION_PLAN.md`
3. `docs/project-driver/AGENT_WORK_QUEUE.yaml`
4. `docs/project-driver/INTERACTION_PERSONALITY_CONTRACT.md`
5. `docs/project-driver/RELEASE_GATES.md`
6. `docs/COMPLETION_GATE_V2.md`
7. `docs/qa/BUILD_COMPLETION_TEST_MATRIX.md`

Do not use an older chat summary or deleted branch as source of truth when it conflicts with these files and the evaluator.

## 5. Immediate critical path

### PD-001 — freeze the exact project workflow

Owner: Claude architecture  
Reviewer: integrator

Produce one unambiguous workflow containing:

- target application and fixed desktop profile
- exact starting screen and prerequisites
- task input and expected output
- each visible action in order
- allowed, approval-required, and forbidden action table
- visual success condition
- failure/stop conditions

No broad actuator work should guess at the first workflow.

### PD-002 — status and evidence portability

Repository work is substantially complete:

- six referenced artifacts are committed
- Linux reconciliation is green
- secret scan is green
- contract v2.3 and M0 re-attestation are current

Remaining requirement: keep all handoff/status documents consistent with code and evaluator output. Any stale count, fingerprint, branch, or contract label is a defect.

### PD-003 — operator enables Secure Boot

This is the current hard blocker and requires physical presence.

1. Save the BitLocker recovery key somewhere accessible.
2. Restart into Dell firmware: `shutdown /r /fw /t 0` or F2 during boot.
3. Enable Secure Boot; keep UEFI mode and Secure Boot Mode `Deployed`.
4. Boot Windows and run elevated PowerShell:

```powershell
Confirm-SecureBootUEFI
npm run hyp001:preflight
```

`Confirm-SecureBootUEFI` must return `True`, and the signed preflight artifact—not a human statement—must show the requirement passing.

### PD-004 — prove HYP-001

After PD-003:

```powershell
npm run hyp001:preflight
npm run hyp001:cycles -- --apply --confirm "RUN HYP-001 LIVE CYCLES"
npm run hyp001:record
```

Required:

- three unique disposable Field cycles
- dynamic memory appropriate for the 16 GB host
- unique boot IDs and valid boot windows
- immutable base unchanged
- cleanup confined to the exact generation
- three reviewed `hyperv_host_guest` artifacts
- promotion by a non-issuer technical reviewer

### PD-005 — prove CHN-001

Immediately after HYP-001:

- replay rejection
- wrong identity, generation, and boot rejection
- lock and Secure Desktop behavior
- heartbeat degradation and recovery
- independent emergency stop
- each negative must fail for the intended reason
- promotion by a non-issuer reviewer

No project execution work is promoted before HYP-001 and CHN-001 pass.

## 6. Screen-bound project implementation order

Once M1 passes:

1. **PD-006 fresh scene observation** — screenshot, active app/window, visible text/regions, modal, cursor, confidence, freshness
2. **PD-007 visible actuator** — pointer, click, drag, scroll, typing, key combinations, focus confirmation, target safety margin
3. **PD-008 verification and recovery** — expected-state checks, no-effect/ambiguous/wrong-effect classes, verified checkpoints, bounded retries
4. **PD-009 first complete project workflow** — one vertical slice from input to verified output
5. **PD-010 cockpit and control** — launch, task state, approvals, pause, independent stop, reset, resume
6. **PD-011 personality** — only after the interaction spine is reliable
7. **PD-012 burn-in** — deterministic scenarios and supervised real tasks
8. **PD-013 restricted release**
9. **PD-014 September-November trial program and daily-driver qualification**

## 7. Developer lane ownership

### Integrator

- owns critical path and integration branch
- freezes interfaces before parallel work
- integrates at least twice daily
- rejects off-path scope
- never self-approves a gate

### Codex implementation

- production code
- Windows/Hyper-V integration
- visual observer, actuator, deterministic adapters
- checkpoints, cockpit, installer/start path

### Codex validation

- replay fixtures
- failure injection
- exact-head CI
- performance and intervention metrics
- acceptance artifact capture
- does not approve code it authored

### Claude architecture

- exact workflow definition
- interface and scope review
- simplification and threat modeling
- ensures implementation solves the actual project task

### Claude adversarial/evidence

- attempts to falsify completion claims
- checks rejection reasons, not merely booleans
- verifies evidence, hashes, event ordering, and portability
- detects stale handoffs and contradictory state

WIP limits:

```text
implementation PRs       2
validation PRs           1
integration candidates   1
```

## 8. Personality boundary

Personality is disclosed presentation behavior, not identity impersonation or monitoring avoidance.

Allowed after PD-007/PD-008:

- bounded pauses and narration
- slower behavior on unfamiliar screens
- safe-region hesitation
- variable typing cadence
- correction of draft text before submission
- mild frustration narration followed by re-observation

Never allowed:

- random clicks
- intentional wrong submitted content
- target selection by personality
- changing approval requirements
- suppressing verification or failures
- blind retries
- actions designed to evade oversight or detection

Every workflow must produce equivalent verified outcomes with personality enabled and disabled.

## 9. Daily operating loop

Every development day:

1. choose at most three critical-path outcomes
2. freeze shared interfaces
3. assign separate implementation and validation ownership
4. integrate at least twice
5. run affected tests continuously
6. run the full exact-head suite once
7. execute one replayed or real workflow
8. record failure class, interventions, recovery, resume, and time saved
9. update issue #31 and this handoff when state changes
10. defer code that does not enable September, close a blocker, or reduce repeated validation cost

## 10. Required commands

```bash
npm ci
npm run typecheck
npm test
npm run validate:completion
npm run validate:evidence-artifacts
npm run scan:evidence-artifacts
npm run validate:full
```

Before citing a test count, completion percentage, contract label, fingerprint, branch head, or CI state, recompute or fetch it from the exact current head.

## 11. Release-denial conditions

Do not release or promote when any applies:

- emergency stop fails
- wrong application/account receives input
- consequential action lacks required approval
- uncertain effect is blindly retried
- evidence is missing, stale, machine-local only, or unreviewable
- personality changes verified outcomes
- cleanup crosses a Field generation
- the system cannot identify its last verified checkpoint
- the final 30 controlled scenarios contain a severe defect

## 12. Definition of the September deliverable

```text
Exosuit Project Driver 0.1
restricted
supervised
project-specific
visible mouse/keyboard effects
fresh observation before action
verification after consequential effects
approval-required final submissions
independent emergency stop
restart/resume from verified checkpoints
```

Do not describe it as the universal personal daily driver. The broader daily-driver claim requires the frozen 100-trial benchmark, soak and compatibility work, and the formal M2-M6/P1 gate path.