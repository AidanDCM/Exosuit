# Exosuit Field Architecture

**Status:** Foundation and development VM/runtime implemented; higher modes and production planned  
**Created:** 2026-07-21T13:32:27-04:00  
**Authority:** `docs/GLOVE_FIELD_BOUNDARY.md` defines subsystem separation. `docs/MASTER_SYSTEM_ROADMAP.md` controls promotion order.

## Purpose

The Exosuit Field is a controlled Windows environment built specifically for the Exosuit Glove to observe, learn from, and operate. It is not an AI browser and it is not a remote-control viewer. An Exosuit Windows agent runs inside the guest Windows session and uses the same desktop surfaces a person uses: windows, accessibility information, visual state, mouse, keyboard, files, and application results.

The Field has two equally important jobs:

1. provide a stable, isolated desktop for autonomous work;
2. provide an instrumented teaching environment where the owner can demonstrate complete tasks and personal operating habits.

## North Star

> Build a reproducible Windows field in which the owner can demonstrate tasks with high-fidelity synchronized telemetry and an authorized pilot can later operate through the Glove using fresh perception, bounded policy, learned behavior, verification, recovery, audit, and immediate interruption.

## Non-goals

- no hidden automation or anti-detection requirement,
- no claim that behavioral imitation proves a human performed an action,
- no browser DOM, Playwright, or extension requirement for ordinary operation,
- no model-controlled VM configuration,
- no broad writable host-drive mount,
- no arbitrary shell exposed through MCP,
- no credential collection into model context,
- no recording without owner consent,
- no claim of perfect inference of unspoken mental reasons.

## Target topology

```text
Authorized pilot: ChatGPT / Claude / other MCP host
                         |
                         | goals and bounded intentions
                         v
                 Exosuit Glove Supervisor
  - MCP contracts
  - workflow and task memory
  - demonstration retrieval
  - personal policy selection
  - action planning
  - verification and recovery
  - supervisor audit and stop-all
                         |
                 authenticated field channel
                         v
                Exosuit Glove Agent in guest
  - fresh Windows UI Automation
  - optional visual sensor
  - scene graph and event stream
  - local deterministic policy
  - local reflex and motor controller
  - verification and local audit
  - emergency stop
                         |
                         v
                   Exosuit Field VM
  - stable Windows desktop
  - approved applications
  - persistent personal state
  - disposable task workspace
  - Teach / Shadow / Pilot lifecycle
```

## VM storage model

### Immutable base image

Contains Windows, guest integration, Exosuit agent, approved applications, stable desktop settings, and versioned configuration. The base image is not modified during ordinary tasks.

### Encrypted personal-state disk

Contains approved persistent state such as application settings, browser profile, personal dictionary, sanitized application maps, demonstration indexes, learned behavior profiles, and approved persistent sessions. This disk must be separable from disposable task data and protected at rest.

The writable disk is identified by a stable local `diskId` plus a positive `diskGeneration`; its mutable whole-file bytes are not a permanent identity. SHA-256 digests apply only to sealed immutable snapshots. Restoring, replacing, or migrating writable personal state must increment the disk generation before attachment to a new Field generation.

### Disposable task disk

Contains Inbox, Workspace, Downloads, Outbox, Quarantine, temporary browser state where practical, and workflow checkpoints. It is destroyed or reset after output export and evidence collection.

```text
base image + personal state + task disk = one Field generation
```

A rollback or rebuild that can invalidate runtime assumptions increments `fieldGeneration`.

## Stable display contract

The initial production target is deliberately narrow:

```yaml
monitorCount: 1
width: 1920
height: 1080
scalePercent: 100
browserZoomPercent: 100
keyboardLayout: en-US
dynamicResolutionAllowed: false
```

The guest agent validates this contract before Teach, Shadow, or Pilot operation. A changed display contract invalidates coordinate-derived motor plans and requires fresh application mapping and validation.

## Field identity and attestation

The host Field Manager creates a local attestation binding:

- exact Field ID and generation,
- guest agent and Windows session,
- base image digest,
- optional personal-state stable disk ID and monotonic generation,
- task disk identity,
- fixed display contract,
- exact field policy hash,
- short validity period,
- local issuer key identity.

The foundation implementation uses HMAC-SHA256 to prove local binding. This is not yet a complete hardware-rooted or remote attestation system. Future promotion may replace or wrap it with stronger key storage and VM identity evidence without changing the contract purpose.

## Field policy

A policy is created outside the pilot and bound to one Field generation. It defines:

- Teach, Shadow, or Pilot mode,
- allowed processes,
- allowed capabilities,
- allowed origins where origin restrictions are available,
- runtime and action budgets,
- recording consent state,
- expiration,
- explicit false values for host desktop access, host drive write, privilege escalation, and security-control changes.

The pilot may operate within policy but cannot expand it.

## Operating modes

### Teach Mode

The owner operates the guest desktop. The Glove records synchronized telemetry but injects no input. Recording requires explicit task- or session-scoped consent.

Required telemetry classes:

- high-resolution input events,
- visual change frames,
- UI Automation state,
- active window and focus,
- system and file effects,
- task goal and success criteria,
- optional reasoning annotations,
- mistake, correction, and completion markers.

### Shadow Mode

The owner operates. The Glove predicts but does not execute:

- next intent,
- target,
- mouse versus keyboard method,
- timing class,
- expected result,
- likely reason with confidence.

Predictions and actual actions are compared to produce a similarity report. Shadow evidence is not Pilot evidence.

### Pilot Mode

The pilot supplies task goals. The Glove executes inside the Field using fresh observation, personal behavior models where validated, deterministic policy, verification, and recovery.

The actor remains the agent. Personal behavior learning does not convert an agent action into a human action.

## Teach Mode data pipeline

```text
Task goal and consent
        |
        v
Input recorder + visual sensor + UIA recorder + system event recorder
        |
        v
Timestamp alignment and event ordering
        |
        v
Raw consent-bound demonstration episode
        |
        +--> secret-shaped payload redaction
        +--> frame retention and deletion policy
        +--> semantic step segmentation
        +--> owner annotations and correction labels
        |
        v
Processed episode and retrieval index
```

The raw and processed episode are separate artifacts. Processed interpretations must preserve links back to source events so later audits can distinguish observation from inference.

## Personal behavior model decomposition

The Field produces training evidence for separate models rather than one opaque personality model.

### Task policy

Predicts the next intention and task step from current state, goal, history, and prior demonstrations.

### Attention model

Models reading order, cursor resting regions, inspection duration, scrolling stops, and information that triggers decisions.

### Motor model

Models contextual cursor trajectory, acceleration, curvature, overshoot, correction, click settling, dragging, and scroll bursts.

### Typing and editing model

Models key timing, bursts, pauses, shortcuts, misspellings, backspaces, delayed correction, selection, and rewriting process.

### Language model profile

Models vocabulary, structure, repetition, directness, narration, and revision style. Communication that matters to identity must remain appropriately disclosed or reviewed.

### Timing and state model

Models contextual delay based on familiarity, reading demand, uncertainty, system readiness, urgency, and correction state.

## Perception architecture

Normal desktop operation uses:

1. Windows UI Automation for structured controls and state;
2. optional visual capture for layout, canvas, images, and inaccessible controls;
3. sanitized application memory as advisory context;
4. physical exploration only when ambiguity remains and policy permits.

The browser is an ordinary Windows application. Browser-specific semantic bridges may remain optional research surfaces but are not required for the Field North Star.

## Scene graph

The guest maintains a versioned desktop scene graph containing:

- Field and session identity,
- display contract,
- windows and generations,
- active and focused objects,
- accessible controls,
- modal dialogs,
- cursor position,
- application health,
- task-relevant file effects,
- visual-region references where enabled.

Events update the graph incrementally. Every mutating action still re-resolves its target from fresh state.

## Local reflex engine

The LLM should not generate each cursor sample. It supplies bounded intention and target semantics. The guest-side controller handles:

- focus acquisition,
- target re-resolution,
- learned trajectory generation,
- click, drag, type, or scroll execution,
- mid-action interruption,
- post-action observation,
- expected-result verification.

This creates three loops:

| Loop | Responsibility |
|---|---|
| pilot reasoning | task strategy, unfamiliar decisions, recovery choices |
| desktop coordination | scene graph, identity, focus, dialogs, workflow state |
| local reflex/motor | continuous pointer, key state, scrolling, cancellation |

## Event-driven waiting

Waiting is based on state rather than arbitrary delay:

- expected window appeared,
- element became enabled,
- visual region stabilized,
- download completed,
- foreground changed,
- modal appeared,
- process exited,
- timeout reached.

A learned timing profile may add the owner's normal contextual reaction after the system becomes ready. It may not override deadlines or verification.

## Artifact boundary

The Field filesystem target is:

```text
C:\Field\Inbox
C:\Field\Workspace
C:\Field\Downloads
C:\Field\Outbox
C:\Field\Quarantine
```

The host artifact broker copies bounded inputs into Inbox and retrieves approved outputs from Outbox. Each transfer records hashes, size, classification, source, destination, and Field generation. Clipboard is a fallback, not the primary data-transfer method.

## Credentials

A future credential broker may authenticate an approved account into an approved application or origin without returning the credential, cookie, recovery code, or secret to the pilot. Credential-bearing controls remain excluded from ordinary observation and demonstration storage.

MFA and account-recovery controls remain credential-sensitive and require an authorized supported flow.

## Failure and recovery

A workflow must distinguish:

- no external effect,
- verified external effect,
- possible but unverified external effect,
- local-only reversible effect,
- Field or agent fault.

After uncertainty, the Glove observes and reconciles before retrying. It does not assume a timed-out click, submission, download, or file operation failed.

Field faults include:

- attestation mismatch,
- changed display contract,
- stale generation,
- guest heartbeat loss,
- secure desktop or locked session,
- unexpected host bridge,
- recording without valid consent,
- storage corruption,
- unrecoverable task disk,
- emergency stop failure.

## Provisioning roadmap

### Slice F0 — Boundary and contracts

Implemented in this branch:

- field identity,
- field generation,
- display contract,
- policy and local attestation,
- lifecycle registry,
- consent-bound demonstration episode,
- payload redaction,
- TypeScript and .NET pure tests,
- manuals and audit foundation.

### Slice F1 — Local Field Manager

- Hyper-V capability detection,
- base-image registry,
- field create/start/stop/destroy contracts,
- task-disk creation,
- health and heartbeat,
- safe dry-run mode,
- fake provider tests.

### Slice F2 — Guest field bootstrap

- display validation,
- guest identity generation,
- agent startup,
- directory creation,
- startup-window cleanup,
- ready-state report,
- Windows acceptance fixture.

### Slice F3 — Teach Mode recorder

- Windows input hooks,
- UI Automation event capture,
- task markers,
- timestamp synchronization,
- retention budgets,
- encrypted episode persistence,
- consent indicator and stop control.

### Slice F4 — Scene graph and visual sensor

- active-window capture,
- region-scoped frames,
- visual diffing,
- privacy redaction,
- event stream,
- DPI and resolution matrix.

### Slice F5 — Shadow prediction

- demonstration retrieval,
- next-action prediction contract,
- comparison metrics,
- correction capture,
- no-input guarantee tests.

### Slice F6 — Learned local motor

- contextual trajectory model interface,
- typing/editing model interface,
- scroll and drag primitives,
- bounded output validation,
- interruption and cancellation tests.

### Slice F7 — Pilot field policy

- signed autonomous field policy integration,
- action budgets,
- application and origin scope,
- artifact broker,
- deterministic verification and recovery,
- live disposable-VM acceptance.

### Slice F8 — Operational release gates

- installer and signing,
- image build reproducibility,
- upgrades and rollback,
- threat model and penetration testing,
- support bundles,
- benchmark targets,
- owner acceptance.

## Current evidence classification

- Contract and pure behavior: implemented, pending branch validation.
- Live Windows Field: unimplemented.
- Hyper-V isolation: untested.
- Teach recording: unimplemented.
- Shadow prediction: unimplemented.
- personal behavior imitation: unimplemented.
- Pilot autonomy: not enabled.
- production use: denied.
