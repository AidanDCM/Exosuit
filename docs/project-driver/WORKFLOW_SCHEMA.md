# Workflow I/O schema

**PD-001 output 2 of 4.** Application-independent.

Every frozen workflow declares itself in this shape. Filling it in for a chosen
application completes PD-001; it does not reopen it.

---

## 1. Schema

```yaml
workflow_id: <slug>
version: <integer>                 # bump on any change to steps or conditions
frozen_at: <ISO-8601>

application:
  name: <exact application or site name>
  version: <exact version, or browser and version>
  installed_in_base_image: yes | no | unknown
  base_image: <e.g. exosuit-field-base-v25.vhdx>
  network_required: yes | no       # if yes, PD-NET-001 activates

desktop_profile:
  resolution: <width>x<height>     # must match the Field display contract
  scale_percent: <int>
  keyboard_layout: <e.g. en-US>
  monitors: 1                      # the Field display contract allows exactly one

session:
  starting_visible_state: <what is on screen before step 1>
  requires_login: yes | no
  login_performed_by: owner | pre_seeded | not_applicable
  # NEVER "agent". Entering credentials is forbidden (ACTION_POLICY §4).

input:
  source: staged_file | task_queue_item | typed_instruction | <other>
  location: <path in the Field, or where it appears on screen>
  schema: <the fields the input carries>
  arrival_signal: <how the agent knows input is present and complete>

task:
  summary: <one sentence, no ambiguous verbs>
  steps:
    - id: 1
      action: <exact visible action>
      target: <exact control, by visible label>
      tier: allowed | approval_required   # forbidden actions cannot appear
      expected_after: <observable state once this step lands>

output:
  destination: <where the result lands>
  values_written: <the fields the task sets>

verification:
  visible_success_condition: <exact observable state proving success>
  value_agreement_check: <how entered values are compared to the recorded result>
  visible_failure_conditions:
    validation_error: <screen signature>
    unexpected_navigation: <screen signature>
    stale_state: <screen signature>
    session_expiry: <screen signature>
    missing_confirmation: <screen signature>
    value_disagreement: <screen signature>

approval:
  required_steps: [<step ids>]
  prompt_must_state: [observed_state, exact_action, target_values]

recovery:
  on_refused_precondition: <what the agent does>
  on_faulted: <what the agent does>
  resume_supported: yes | no
  resume_point: <step id the workflow can safely restart from>
```

---

## 2. Rules the schema enforces

**No ambiguous verbs.** `task.summary` and every `steps[].action` must name a
visible operation on a named control. Banned: *process, handle, manage, deal
with, take care of, update as needed, do the needful*. If a step cannot be
written without one, it is more than one step.

**Every step declares a tier.** Undeclared fails closed as
`approval_required` (`ACTION_POLICY.md` §6). `forbidden` cannot appear — a
workflow needing a forbidden action is not a workflow to be approved, it is a
workflow to be rejected.

**`login_performed_by` is never `agent`.** Credential entry is forbidden and has
no approval path.

**`expected_after` is mandatory on every step.** A step with no observable
consequence cannot be verified, and an unverifiable step makes the whole run
`unverified_completion`.

**`value_agreement_check` is mandatory.** A confirmation banner proves something
happened, not that the *right* thing happened. Success over the wrong data is a
failure.

**`network_required: yes` activates PD-NET-001** and blocks the workflow until
`Exosuit-Field-NAT` exists.

---

## 3. Fill-in block

Answer these and the schema above can be completed mechanically:

```text
First frozen workflow

Application/site:
Exact version or browser:
Already installed in Field: yes / no / unknown
Network required: yes / no

Starting visible state:
Task input:
Exact task:
Approval-required step:
Visible success condition:
Visible failure condition:
```

---

## 4. Scope

**One application, one end-to-end task.** Not a set, not a category. If the
project ultimately spans several applications, the first vertical slice freezes
one; the rest follow once it runs reliably.

The temptation is to generalise early — build an actuator for "web forms"
rather than for this form. `DEADLINE_EXECUTION_PLAN.md` line 391 rejects it:
*"No broad actuator work should guess at the first workflow."* The same argument
already applies elsewhere in this repo: the shared live-evidence harness was
deferred until HYP-001 proves which parts are genuinely reusable.
