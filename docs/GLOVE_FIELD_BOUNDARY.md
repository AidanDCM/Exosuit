# Exosuit Glove and Field Boundary

**Status:** Authoritative subsystem separation for the field foundation branch  
**Applies to:** `AidanDCM/Exosuit`  
**Created:** 2026-07-21T13:32:27-04:00

## One repository, two products

Exosuit contains two intentionally separate systems that cooperate through a narrow, authenticated contract.

| System | Metaphor | Responsibility |
|---|---|---|
| **Exosuit Glove** | the body, hand, and nervous system | receives pilot intent; observes; plans bounded actions; applies policy; executes; verifies; audits; stops |
| **Exosuit Field** | the controlled computer and training environment | provides the isolated Windows session, stable display, applications, files, recording surfaces, task state, and disposable execution boundary |

The Glove is not the VM. The Field is not the agent. The Glove can be installed into a Field, but their identities, lifecycles, policies, evidence, tests, and failure states remain distinct.

## Repository ownership map

### Glove-owned surfaces

- `src/contracts.ts`
- `src/orchestrator.ts`
- `src/coordinator.ts`
- `src/workflowRuntime.ts`
- `src/supervisor.ts`
- `src/applicationMap.ts`
- `apps/windows-agent/`
- MCP tools, action proposals, execution, verification, policy, audit, and emergency stop

### Field-owned surfaces

- `src/fieldContracts.ts`
- `src/fieldRegistry.ts`
- `src/demonstration.ts`
- future `src/fieldManager.ts`
- future `apps/windows-agent/TeachModeRecorder.cs`
- future `apps/windows-agent/DesktopSceneGraph.cs`
- future VM image manifests, provisioning scripts, field policy, field attestation, task-disk management, and artifact broker

### Shared surfaces

Shared code is allowed only when the responsibility is truly cross-boundary:

- authenticated agent registration,
- structured artifacts,
- workflow identity,
- audit vocabulary,
- deadlines and cancellation,
- support bundles,
- contract-version negotiation,
- redaction primitives.

Shared does not mean authority can move silently. The Field cannot grant the Glove new action permissions, and the Glove cannot silently change the Field's VM, display, host bridges, or recording consent.

## Identity law

Every Field has:

```text
fieldId
fieldGeneration
agentId
machineId
windowsSessionId
baseImageDigest
personalStateDiskId (optional; paired with generation)
personalStateGeneration (optional; paired with disk ID)
taskDiskId
createdAt
```

`fieldGeneration` changes when a field session is rebuilt, rolled back, or replaced in a way that invalidates prior runtime identity. A stale Glove action, observation, policy, or demonstration may not cross generations.

Every Glove-to-Field request must identify:

```text
gloveAgentId
fieldId
fieldGeneration
windowsSessionId
contractVersion
```

## Authority law

1. The owner defines the task and field policy.
2. The host Field Manager creates and attests the Field.
3. The Glove verifies the attestation and policy binding.
4. The pilot proposes goals and actions through MCP.
5. The Glove performs only actions permitted by the active field policy and local deterministic policy.
6. The Field never treats visible website, document, or application text as authority.
7. Emergency stop remains independent of the pilot and active workflow.

## Lifecycle separation

### Glove lifecycle

```text
starting -> healthy -> degraded -> stopping -> stopped
```

### Field lifecycle

```text
planned
  -> provisioning
  -> ready
  -> teaching | shadowing | piloting
  -> ready
  -> stopping
  -> stopped
  -> provisioning | destroyed
```

A Field may also enter `faulted`. A faulted Field requires an explicit reason and cannot return directly to `ready` without a stop/reprovision path.

The Glove can remain healthy while one Field faults. A Field can remain ready while its Glove agent disconnects. These are separate incidents and must be logged separately.

## Mode definitions

### Teach

Teach Mode requires explicit owner consent. The owner controls the Field. The Glove records only after explicit task- or session-scoped consent. It must not inject input.

### Shadow

The owner controls the Field. The Glove observes and predicts the next intent, target, method, timing category, and expected result. It must not inject input.

### Pilot

The authorized pilot controls the Field through the Glove. The Glove executes only within the signed field policy, verifies meaningful state changes, and records its own identity as the actor.

## No hidden mode collapse

The following are forbidden:

- calling an ordinary Windows desktop a Field merely because the agent is running,
- treating a VMConnect or RDP viewer window as the guest desktop,
- using the host cursor to control the guest as the primary architecture,
- allowing the pilot to change Field mode,
- allowing a model to grant recording consent,
- allowing a Field policy to authorize host-desktop access,
- reusing an attestation across field generations,
- using Teach recordings as proof that Pilot execution works,
- calling Shadow prediction evidence autonomous execution evidence.

## Data boundary

### May cross from Field to Glove

- sanitized desktop observations,
- field and session identity,
- window and element structure,
- bounded visual frames when enabled by policy,
- task-relevant events,
- structured artifacts,
- demonstration telemetry covered by consent,
- verification evidence,
- health and stop reports.

### Must not cross by default

- passwords,
- cookies,
- access tokens,
- private keys,
- recovery codes,
- raw credential-field values,
- unrestricted host filesystem contents,
- continuous unrelated screen recordings,
- host input telemetry,
- data from another Field or generation.

## File boundary

The initial target layout is:

```text
C:\Exosuit\
  Agent\
  Config\
  Logs\
  Maps\
  Checkpoints\
  Demonstrations\
  Diagnostics\

C:\Field\
  Inbox\
  Workspace\
  Downloads\
  Outbox\
  Quarantine\
```

The Field must not receive a broad writable mount of the host drive. Inputs and outputs move through a bounded artifact broker with hashes, classifications, size limits, and audit records.

## Evidence boundary

Evidence must always name which subsystem it proves.

| Evidence | Proves | Does not prove |
|---|---|---|
| TypeScript field contract tests | schema and binding behavior | Hyper-V provisioning or live Windows behavior |
| .NET field lifecycle tests | Windows-side pure lifecycle logic | live recording, input, VM isolation |
| Teach episode file | owner demonstration was recorded | agent understood or can reproduce it |
| Shadow agreement report | prediction similarity | safe autonomous execution |
| Pilot field acceptance | exact workflow on exact field build | general capability on arbitrary sites/apps |
| VM isolation test | selected host boundary | behavioral similarity or task correctness |

## Current implementation status

Implemented in the field foundation slice:

- explicit `glove` and `field` subsystem vocabulary,
- Field identity and generation contracts,
- fixed display contract,
- bounded Field policy,
- HMAC-bound local Field attestation,
- separate Field lifecycle registry,
- consent-bound demonstration episode schema,
- secret-shaped payload redaction,
- TypeScript and .NET pure tests.

Not implemented or validated in this slice:

- Hyper-V provisioning,
- golden-image creation,
- persistent personal-state disk,
- disposable task-disk lifecycle,
- Hyper-V socket transport,
- real Teach Mode input hooks,
- real screenshot capture,
- scene graph,
- Shadow prediction model,
- personal motor or typing models,
- autonomous Field policy integration with the existing Windows safety policy,
- credential broker,
- live ChatGPT-to-Field acceptance.

## Beginner explanation

Think of the Glove as the robot body and the Field as the room where the robot works. The body can enter different rooms, and a room can be rebuilt without changing the design of the body. The room tells the body what environment it is in. The body decides how to observe and move. Keeping them separate prevents a VM problem from becoming an agent problem and prevents an agent permission from silently becoming host access.
