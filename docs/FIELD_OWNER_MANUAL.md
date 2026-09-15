# Exosuit Field Owner Manual

**Status:** Development Field runtime exists; higher modes and production remain held  
**Created:** 2026-07-21T13:32:27-04:00

## What the Field is

The Field is the Windows computer environment that the Exosuit Glove watches, learns from, and later operates. It is designed to appear as a mini desktop inside the owner's desktop while remaining a separate Windows session with its own agent, identity, storage, input stream, and emergency controls.

The Field is not the Glove:

- the **Glove** senses, decides, moves, verifies, and stops;
- the **Field** provides the isolated computer, applications, files, display, and teaching surface.

## Current owner-visible status

The repository contains Field contracts, lifecycle rules, policy/attestation binding, demonstration episode structures, redaction logic, tests, manuals, guarded Hyper-V tooling, and a guest KVP runtime. One disposable v13 development generation recorded live provisioning, bootstrap, authenticated channel, heartbeat, and readiness evidence.

It does **not** yet record real Teach input, capture the Windows screen, process demonstrations, learn the owner's behavior, run a Shadow predictor, or allow ChatGPT to operate a production Field. The v13 proof used development access and is not owner or production acceptance.

### One-UAC development lifecycle service

The development build can install a local Windows service after displaying its exact
policy and one UAC prompt. The installed service runs as LocalSystem but is limited to
creating, authentically observing, and destroying exact disposable Field generations through fixed, hash-checked
scripts. It is not exposed to ChatGPT or MCP and cannot approve recording, modes, keys,
exports, policies, personal-state deletion, or full control.

The standing policy expires, can bound concurrent Fields, and can be disabled by
stopping the `ExosuitFieldOwner` service. Uninstall requires the exact phrase
`UNINSTALL EXOSUIT FIELD OWNER SERVICE`; uninstall preserves sanitized evidence while
removing the service, executable, policy, host-config copy, and queue.

## Planned Field modes

### Teach Mode

You operate the Field. Exosuit watches and records only after you explicitly grant recording consent for the task or session.

Use Teach Mode to demonstrate:

- what task you are completing,
- which information you inspect,
- how you decide what to do,
- how you move the mouse,
- how you type and correct text,
- when you wait,
- how you respond to errors and interruptions,
- what result counts as complete.

Teach Mode must not inject input.

### Shadow Mode

You still operate the Field. Exosuit predicts your next action and compares its prediction with what you actually do. It does not click, type, scroll, or change the desktop.

Use Shadow Mode to decide whether the system understands a task before allowing Pilot Mode.

### Pilot Mode

ChatGPT or another authorized pilot sends task goals through MCP. The Glove operates the Field within a signed local policy, verifies meaningful results, and stops when identity, policy, verification, or recovery conditions fail.

Pilot Mode actions are agent actions even when they closely follow your demonstrated habits.

## Planned owner workflow

```text
1. Start a clean Field.
2. Confirm Field ID, generation, display, and mode.
3. Choose Teach, Shadow, or Pilot.
4. Confirm the task goal and policy.
5. Use the Field or let the pilot operate.
6. Review outputs and evidence.
7. Export approved files from Outbox.
8. Stop and destroy or reset the disposable task disk.
```

## Teach Mode checklist

Before teaching:

- confirm the correct Field window and identity,
- confirm the desktop is 1920x1080 at 100% scaling,
- confirm the task goal is specific,
- confirm recording consent scope,
- close unrelated personal applications,
- do not enter secrets into ordinary recorded fields,
- confirm the visible recording indicator.

During teaching:

- work naturally,
- use markers for important steps, mistakes, and completion,
- explain important decisions when the reason is not obvious,
- stop recording before entering credentials or unrelated private information,
- mark accidental actions as mistakes rather than deleting them silently.

After teaching:

- review the episode summary,
- confirm whether the result succeeded,
- inspect redaction warnings,
- approve or delete the episode,
- do not promote a skill based on one clean demonstration.

## Recording privacy

The Field is intended to capture detailed behavior, so privacy controls are critical.

The recorder must:

- require explicit consent,
- identify the Field and task,
- stop immediately when requested,
- redact secret-shaped payload keys,
- avoid returning credential-field values,
- apply frame retention limits,
- distinguish source telemetry from inferred reasons,
- keep demonstrations separated by operator and Field generation.

Do not teach tasks while unrelated private messages, financial records, medical information, passwords, or recovery codes are visible unless a dedicated reviewed policy explicitly permits and protects that exact use.

## Personal behavior learning

The planned system can learn observable patterns such as:

- mouse speed, curve, overshoot, correction, and click timing,
- scrolling rhythm,
- keyboard shortcuts,
- typing cadence and pauses,
- typo and correction patterns,
- application and window preferences,
- task order,
- reading and rejection priorities,
- recovery habits,
- language and revision style.

It cannot guarantee perfect knowledge of an unspoken reason. Narration and correction feedback improve the evidence.

## Files and outputs

The planned task folders are:

```text
C:\Field\Inbox       task inputs
C:\Field\Workspace   active work
C:\Field\Downloads   browser and application downloads
C:\Field\Outbox      approved outputs
C:\Field\Quarantine  untrusted or unverified files
```

Only files in Outbox should be eligible for export. The host should not expose a broad writable drive to the Field.

## Accounts and credentials

The pilot should not receive passwords, session cookies, recovery codes, or MFA secrets. A future credential broker may authenticate an approved account without exposing those values to the model.

MFA and account recovery remain credential-sensitive operations and require a supported owner-authorized flow.

## Emergency stop

The final Field must provide at least three stop paths:

1. a local emergency stop inside the guest,
2. a host-level per-Field stop,
3. a host-level stop-all across Glove agents and Fields.

Stopping must not depend on ChatGPT, MCP, the current task, or the active application responding.

After emergency stop:

- input injection stops,
- pending actions are invalidated,
- recording stops or enters a clearly marked protected state,
- the Field leaves Teach/Shadow/Pilot lifecycle,
- the event is written to audit,
- restart or explicit local recovery is required.

Acceptance is phase-correct: channel validation first proves host stop with a healthy
and a broken guest channel. A later execution test proves interruption of real input,
and Teach acceptance separately proves interruption of an explicitly consented,
visibly active recording. A stopped VM alone is not proof that recording hooks stopped.

## When to trust a taught task

A task should progress through:

```text
recorded
-> reviewed
-> shadow validated
-> assisted validated
-> field validated
-> owner accepted
```

Do not trust it merely because:

- the demonstration was recorded,
- the model can describe the workflow,
- the cursor looks similar,
- one successful run occurred,
- unit tests pass,
- the VM started.

An authenticated `provisioning` heartbeat while Windows is locked is also not a
readiness pass. It is diagnostic evidence only. The owner must still require an
unlocked session, inactive Secure Desktop, fresh heartbeat, exact policy and
attestation, and every remaining readiness gate before any action mode.

## Failure reporting

When something fails, record:

- Field ID and generation,
- base image and policy hashes,
- Glove agent ID,
- active mode,
- task goal,
- last verified step,
- expected and actual result,
- whether an external effect may have occurred,
- stop result,
- relevant audit IDs,
- reproduction steps.

## Fast disable and rollback

Until live Field implementation exists, the safest rollback is to remove or disable Field runtime wiring while retaining contracts and documentation.

Future operational rollback must support:

- stop current Field,
- disconnect the guest agent,
- detach personal-state disk,
- preserve selected evidence,
- discard task disk,
- return to the last approved base image,
- rotate attestation keys if binding is suspect.

## Owner acceptance rule

No Field capability is released merely because an AI coding agent says it is complete. The owner reviews the exact evidence level, remaining gaps, privacy behavior, emergency stop, and rollback before promotion.
