# Action policy

**PD-001 output 3 of 4.** Application-independent. Frozen ahead of the target
application so that naming the application is substitution, not redesign.

Derived from the hard boundaries in `DEADLINE_EXECUTION_PLAN.md` §2. Where this
document and that section disagree, §2 wins and this file is the bug.

---

## 1. The rule that decides the tier

> **An action is CONSEQUENTIAL if undoing it requires someone other than the
> agent, or if its effect is visible outside the Field.**

Not "is it risky", not "is it a write". Reversibility by the agent alone, and
containment inside the Field. Both halves matter: typing into a form field is
reversible and contained; clicking *Submit* is neither.

Three tiers follow, and every action must be classifiable into exactly one
before the workflow is frozen. An action that cannot be classified is a
specification defect, not an edge case — it goes back to PD-001.

---

## 2. Allowed — the agent proceeds alone

Reversible by the agent, contained inside the Field, no external effect.

| Action | Notes |
| --- | --- |
| Observe the screen | Capture, describe, compare against the expected state |
| Move the pointer, hover, scroll | No activation |
| Click to focus, select, or navigate **within** the task | Focus changes, tab switches, opening a record for reading |
| Type into an input the workflow declares as a task field | Contained until submitted |
| Clear or correct a field the agent itself filled | Self-reversal |
| Open, read, and close a record without editing | Read-only traversal |
| Wait, retry a read, re-observe after a timeout | No state change |
| Internal planning, memory, logging, verification | Never touches the application |

Reading is always allowed. **Reading is also never sufficient evidence that an
action succeeded** — see `OUTCOME_TAXONOMY.md`.

---

## 3. Approval-required — the agent stops and asks

The agent prepares the action, presents what it is about to do, and **halts**.
It does not proceed on a timeout, a default, or its own confidence.

| Action | Why |
| --- | --- |
| Final submission of any form | Leaves the Field, usually irreversible |
| Send, post, publish, share | External effect |
| Save changes to an existing record | Overwrites work the agent did not create |
| Delete or archive anything | Not agent-reversible |
| Any payment, order, or financial action | External and irreversible |
| Accepting terms, consent, or permissions | Binds the owner, not the agent |
| Entering credentials | **See §4 — this is forbidden, not approvable** |
| Any action the workflow declares consequential | Workflow-specific escalation |
| Proceeding after any validation error | The precondition changed |
| Proceeding when observed state ≠ expected state | The agent's model is wrong |

**Approval is per-action and per-instance.** Approving one submission never
authorises the next. Approval does not persist across a boot, a session, or a
retry of the same step.

An approval prompt must state the **observed** state and the **exact** action —
"click Submit on the order form showing 3 items, total £47.20" — not the
intent, "submit the order". The owner approves what is on screen.

---

## 4. Forbidden — refuse and halt, no approval path

These cannot be unlocked by owner approval. If the workflow appears to require
one, the workflow is wrong.

| Forbidden | Source |
| --- | --- |
| Direct database or application mutation | §2 |
| Hidden form submission | §2 |
| DOM or accessibility activation bypassing visible input | §2 |
| Shell or file operations that perform the application's task | §2 |
| Random clicks, exploratory clicking, deliberate corruption | §2 |
| Defeating monitoring, impersonating an employee, evading bot detection | §2 |
| Personality logic overriding verification, approval, stop, or recovery | §2 |
| Entering passwords, card numbers, or government IDs | Credentials are the owner's |
| Solving CAPTCHAs or bot checks | Evasion |
| Creating accounts | Identity |
| Modifying system or security settings inside the Field | Scope |
| Continuing after an emergency stop without owner recovery | Stop means stop |

The distinction from §3 is not severity, it is **whether approval can make it
legitimate**. Nobody approving a CAPTCHA bypass makes it not a CAPTCHA bypass.

---

## 5. The visible-input rule

Every effect in the target application happens through **visible mouse and
keyboard input**. Internal observation, planning, memory, logging, verification,
and safety control are exempt because they produce no application effect.

The test is not "did we use the mouse". It is:

> **Would a person watching the screen see the same action a human operator
> would perform?**

Consequences worth stating plainly, because each is a tempting shortcut:

- Setting a field via the accessibility API is forbidden even though it is more
  reliable than typing.
- `POST`ing the form is forbidden even though it is faster and less brittle.
- Writing the output file directly is forbidden even when the application would
  have written exactly those bytes.
- Pre-filling a field the user cannot see happening is forbidden.

The reliability argument is real and is rejected anyway: the release claims the
system *operates the application*, and evidence of that has to be watchable.

---

## 6. Enforcement

The policy is only real where it is enforced in code:

| Tier | Enforcement point |
| --- | --- |
| Forbidden | Refused by the actuator; never reaches the application |
| Approval-required | Blocks on an approval record; no timeout default |
| Allowed | Executes, then verifies from the screen |

A workflow step whose tier is undeclared **fails closed as
approval-required**. Silence is never permission — the same rule the completion
gate applies to a live record that omits its custody fields.
