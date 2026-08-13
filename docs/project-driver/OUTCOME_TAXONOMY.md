# Outcome and failure taxonomy

**PD-001 output 4 of 4.** Application-independent.

Every workflow run ends in exactly one of these six outcomes. There is no
seventh, and there is deliberately no "probably fine".

---

## 1. The distinction the whole taxonomy exists for

> **Completing the actions is not the same as verifying the effect.**

An agent that clicked everything correctly and never looked at the result has
produced `unverified_completion`, not `verified_success`. These are separate
outcomes with separate handling, because conflating them is the single failure
this project has already made under a different name: a rejection that was
counted as a pass because nobody checked *why* it was rejected
(`HANDOFF_M1.md` §9).

The same discipline applies here. **Assert on the observed screen state, not on
the absence of an error.**

---

## 2. The six outcomes

### `verified_success`

The task completed **and** the declared visible success condition was observed
after completion.

- Screen signature: exactly what the workflow's `visible_success_condition`
  declares — nothing weaker
- Next: record the outcome, release the task
- Evidence: the post-action observation, not the pre-action plan

### `unverified_completion`

Every action was performed, no error was seen, but the success condition was
**not** observed — the confirmation never rendered, the record never updated,
the page changed unexpectedly, or the check was never run.

- Screen signature: absence of the success condition, absence of an error
- Next: **halt**. Do not retry, do not report success. Escalate to the owner.
- Why not retry: the effect may have landed. Retrying risks doing it twice —
  the classic double-submit.

This outcome exists so that "it didn't error" can never be recorded as success.

### `refused_precondition`

The agent declined to start or continue because the observed state did not match
what the workflow requires — wrong screen, missing task, stale data, expired
session, unexpected modal.

- Screen signature: observed state ≠ expected starting state
- Next: halt with the specific mismatch. Never adapt, never improvise a path.
- This is a **healthy** outcome. A refusal here is the system working.

### `halted_for_approval`

The agent reached an approval-required action and stopped, as designed.

- Screen signature: the prepared action, not yet performed
- Next: wait indefinitely. **No timeout, no default, no proceed-on-silence.**
- Approval resumes exactly one action, then the rule applies again.

### `faulted`

Something broke that the agent cannot reason about — the application crashed,
the Field became unresponsive, an internal invariant failed, the channel
degraded past its threshold.

- Screen signature: unavailable, unresponsive, or incoherent
- Next: stop input, preserve diagnostics, require owner recovery
- Distinct from `refused_precondition`: there, the agent understood the state
  and declined. Here, it cannot establish the state at all.

### `emergency_stopped`

The owner triggered a stop, or a safety control fired.

- Screen signature: irrelevant — the stop does not depend on reading the screen
- Next: input ceases immediately; the Field is faulted; owner recovery required
- Must work when the channel, the model, and the plan are all broken

---

## 3. Precedence

When more than one applies, the **more restrictive** outcome wins:

```
emergency_stopped  >  faulted  >  refused_precondition
                   >  halted_for_approval
                   >  unverified_completion
                   >  verified_success
```

`verified_success` is the hardest to reach and the easiest to claim falsely,
which is why it sits last. A run may only be reported as success when no other
outcome applies.

---

## 4. What each outcome may claim

| Outcome | May report task done | May continue | Needs owner |
| --- | --- | --- | --- |
| `verified_success` | yes | yes | no |
| `unverified_completion` | **no** | no | yes |
| `refused_precondition` | no | no | yes |
| `halted_for_approval` | no | on approval | yes |
| `faulted` | no | no | yes |
| `emergency_stopped` | no | no | yes |

Only one row may say "task done". Five of six outcomes require a human.

---

## 5. Failure signatures a workflow must declare

The workflow's `visible_failure_condition` must enumerate what it can actually
see. At minimum, every workflow declares its screen signature for:

- **Validation error** — the application rejected the input
- **Unexpected navigation** — the screen is not where the step expects
- **Stale state** — the task changed underneath the agent
- **Session expiry** — logged out mid-task
- **Missing confirmation** — the action completed with no acknowledgement
- **Disagreement** — the submitted values differ from the recorded result

The last one is the most important and the most often omitted. Checking that a
confirmation appeared is weaker than checking that **the confirmed values match
what was entered**. A success banner over the wrong data is a failure.

---

## 6. Recording rule

The recorded outcome is the one **observed**, never the one intended. A run that
was meant to succeed and produced `unverified_completion` is recorded as
`unverified_completion`.

This mirrors how the completion gate treats evidence: recording is a claim,
evaluation is the judgment, and a claim that cannot be verified is rejected
rather than rounded up.
