# Exosuit product parity roadmap

## Product objective

Exosuit should become a seamless, owner-governed personal Windows agent rather than an enterprise RPA clone.

The target daily experience is:

1. Exosuit starts with Windows and verifies the host and Field.
2. ChatGPT connects through the high-level MCP surface, with the OpenAI API available only as a controlled fallback.
3. The owner states a goal rather than individual mouse actions.
4. Exosuit selects a reviewed recipe or creates a bounded task plan.
5. The local runtime performs deterministic low-risk chunks, verifies results, and checkpoints progress.
6. The owner receives one meaningful grouped approval where possible and an immediate approval before any consequential external effect.
7. Ordinary failures are re-observed, retried once, recovered, or escalated without requiring developer repair.
8. The task can be paused, resumed, cancelled, replayed, or rolled back from the local cockpit.

## Permanent architecture rule

> ChatGPT or an API model handles intent, judgment, and conversation. Exosuit handles state, execution, safety, memory, recovery, and evidence.

MCP is a tool protocol, not the intelligence layer. The ChatGPT MCP path and API fallback must use the same local task engine, policy, approvals, audit records, persona version, recovery state, and execution adapters.

## Competitive direction

Exosuit will not initially attempt to match UiPath or Microsoft in fleet administration, connector count, BPMN design, or enterprise support. It will match the product qualities that matter to one owner:

- normal installation and one-click startup;
- dependable Windows operation;
- task-level rather than click-level model interaction;
- transparent progress and session replay;
- reliable pause, stop, recovery, and rollback;
- consented Teach, no-input Shadow, Correction, and bounded Assisted modes;
- persistent owner-governed personalization;
- local isolation and reversible personal state;
- predictable cost and an optional API fallback.

## Product modes

### Observe

Read and summarize current state. No physical input authority.

### Teach

Record an explicitly consented demonstration with visible recording state, immediate stop, privacy boundaries, and exact provenance.

### Shadow

Predict likely next actions without network, credential, command, or input authority. Compare predictions with owner behavior.

### Assisted

Execute only approved low-risk chunks through ordinary local policy, fresh observation, verification, checkpointing, and recovery. Consequential actions remain immediately owner-approved.

### Pilot

Remain denied until synthetic trials, repeated low-risk acceptance, process isolation, emergency-stop evidence, and owner promotion are complete.

## Brain routing

### Preferred route: ChatGPT MCP

Use for interactive owner-initiated work, Teach review, Shadow comparison, task planning, artifact review, and meaningful approvals.

### Fallback route: OpenAI API

Use only when explicitly configured and allowed for:

- unattended or scheduled continuation;
- work that must survive the ChatGPT session closing;
- bounded recovery loops;
- local-cockpit initiated work;
- temporary MCP unavailability;
- future controlled Pilot execution.

The fallback must enforce task and daily spend ceilings and must never receive local credentials or approval secrets.

## High-level MCP surface

The preferred product surface should expose task concepts rather than raw pointer operations:

- `exosuit_route_brain`
- `exosuit_create_task`
- `exosuit_list_tasks`
- `exosuit_get_task`
- `exosuit_plan_next_chunk`
- `exosuit_pause_task`
- `exosuit_resume_task`
- `exosuit_cancel_task`
- `field_status`
- `field_start`
- `field_reset`
- `teach_start`
- `teach_stop`
- `shadow_predict`
- `approval_status`
- `artifact_list`

Low-level mouse and keyboard tools remain an internal execution detail and must not be the normal model interface.

## Approval policy

### Automatic

- observing and reading;
- opening approved local applications;
- navigating approved interfaces without external effect;
- collecting information;
- drafting locally;
- creating temporary local artifacts.

### Grouped owner approval

- filling multiple non-sensitive fields without submission;
- reversible file organization;
- editing a local draft;
- running a known reversible recipe chunk.

### Immediate owner approval

- sending, posting, submitting, purchasing, uploading, or sharing;
- deleting or changing account settings;
- financial, legal, destructive, identity-sensitive, or external commitments;
- credential release;
- human-verification challenges, which Exosuit must not solve for the owner.

## Recovery contract

Every executed chunk must end in one of:

- `verified`;
- `retryable`;
- `needs_owner`;
- `safely_aborted`;
- `rolled_back`.

The ordinary low-risk recovery sequence is:

1. Re-observe.
2. Compare actual and expected state.
3. Retry once when idempotent or proven not applied.
4. Try one reviewed alternate method.
5. Restore the latest safe checkpoint when possible.
6. Ask the owner with clear evidence.

## Initial recipe set

The first usable MVP should support at least five reviewed low-risk recipes:

1. Open approved applications and gather information.
2. Research, normalize, deduplicate, and organize results.
3. Fill a form and stop before submission.
4. Prepare a message or document and stop before sending.
5. Download, rename, classify, and organize approved files.

Recipes define preconditions, variables, stable steps, flexible decision points, approvals, verification checks, recovery options, and completion evidence.

## Cockpit requirements

The local tray application should show:

- Field and brain connection status;
- current task, recipe, step, and expected outcome;
- current screenshot or privacy-safe scene summary;
- last verified action and checkpoint;
- pending approval and risk;
- pause, resume, cancel, emergency stop, and reset;
- task history and session replay;
- active persona and policy versions;
- Teach recording state;
- API fallback status and spend estimate;
- errors and recommended recovery choices.

## MVP acceptance

A personal-use MVP is achieved when the real Windows system can repeatedly:

- cold-start and authenticate the Field;
- produce reliable live scenes;
- record consented Teach demonstrations;
- run no-input Shadow prediction;
- complete at least five bounded low-risk recipes in Assisted Mode;
- stop before consequential effects unless immediately approved;
- survive interruption and resume from checkpoints;
- execute emergency stop and Field reset reliably;
- provide complete task evidence through ChatGPT and the local cockpit.

Initial quantitative targets:

- at least 90% completion on the five supported recipes;
- zero unapproved consequential actions;
- 100% emergency-stop activation in acceptance trials;
- at least 90% session-resume success;
- under 30% owner-intervention rate excluding required approvals;
- under ten setup actions after installation.

## Strong daily-driver acceptance

- at least 97% completion on supported recipes;
- at least 95% successful recovery from injected ordinary failures;
- under 10% non-required intervention rate;
- at least 99% session-resume success;
- at least 90% accepted Shadow next-action predictions on supported workflows;
- normal startup under 30 seconds after host login;
- no developer tools needed for ordinary operation.

## Production acceptance

Production additionally requires:

- signed installer, binaries, updates, rollback, repair, and uninstall;
- DPAPI/TPM-backed key handling, rotation, backup, and recovery;
- process-level Shadow isolation and no-input proof;
- trusted credential-vault integration and protected-field insertion;
- full npm and .NET SBOM and build provenance;
- private code scanning or equivalent, penetration testing, and prompt-injection testing;
- crash monitoring, privacy review, incident response, and support procedures;
- compatibility testing across supported Windows editions and hardware;
- repeated owner acceptance and an independent security review.

## Current source-build priorities

Work that can proceed without real desktop testing:

1. High-level brain routing and API-budget contracts.
2. Persistent product task sessions above the existing workflow runtime.
3. Recipe definitions and compilation boundaries.
4. Approval grouping and immediate-effect classification.
5. Recovery outcomes, retry budgets, and checkpoint summaries.
6. Product-level MCP tools, opt-in and non-executing by default.
7. Cockpit state contracts and event stream.
8. Installer manifests, health-check contracts, release evidence, and telemetry redaction.
9. Fake-driver acceptance suites for full task lifecycle and failure injection.

Work that must remain blocked without real desktop evidence:

- live physical input promotion;
- production-authenticated Hyper-V acceptance;
- real Teach recording and owner model calibration;
- live credential insertion;
- live Assisted execution;
- Pilot and production promotion.
