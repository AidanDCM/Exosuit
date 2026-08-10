# Glove and Field Parts & Pieces Traceability

**Date:** 2026-07-21  
**Purpose:** Apply Parts & Pieces doctrine, reusable patterns, tests, and evidence discipline separately to the Exosuit Glove and Exosuit Field.

## Status vocabulary

- **Adopted doctrine** — process/manual rule applied directly.
- **Adapted implementation** — donor behavior independently implemented for Exosuit with project-specific constraints.
- **Blueprint only** — donor structure informs design; no donor runtime evidence is claimed.
- **Deferred prerequisite** — required before a later capability but not implemented now.
- **Rejected shortcut** — intentionally excluded.

## Doctrine and manuals

| Parts & Pieces source | Glove application | Field application | Current evidence |
|---|---|---|---|
| `docs/dev_manual/ATOMIC_AUDIT.md` | Level 4 execution/safety audits | Level 4 privacy, VM, recording, autonomy, storage, and artifact audits | foundation audit plus expansion addendum |
| `QUESTION_EVERYTHING_PROTOCOL.md` | interrogate action, policy, provider, verification, audit units | interrogate identity, VM, consent, recorder, storage, model, scene, transfer, and lifecycle units | assumption/question ledgers in Field audits |
| `NORTH_STAR_INTERROGATION.md` | private model-independent body | stable instrumented Windows teaching/execution environment | Glove/Field North Stars documented separately |
| `STRICT_PRECISION_FLUID_EXECUTION.md` | strict policy/evidence with adaptable provider sequence | fixed boundaries with fake-first staged VM/recording implementation | typed manager, provisioning plan, promotion gates |
| `DEV_LOOP_SENTINEL.md` | stop repeated action/development loops | bounded events, action/runtime budgets, provisioning/recovery sentinels | recorder cap implemented; full runtime sentinel pending |
| `QUALITY_GATES.md` | contracts, tests, security scan, manuals | Field docs/code/tests required by repository validator and CI contract | validator and workflow updated |
| owner/developer/manual templates | existing root manuals | dedicated Field owner/developer/test/status manuals | implemented |

## Reusable parts and decisions

| Part | Glove decision | Field decision | Proof or planned proof |
|---|---|---|---|
| `desktop_control_harness` | adapted into provider/action/verification pipeline | Field supplies bounded fake/live environments and read-only scene composition | existing Glove tests; Field scene/lifecycle/fresh-heartbeat adapter tests written |
| `command-broker` | principles adapted; no arbitrary shell | typed `FieldProvisioner`, strict provisioning plan, no command field | fake manager and plan tests written |
| `event_ledger` | tamper-evident Glove and coordinator ledgers | hash-linked Field Manager audit with separate actor/subsystem identity | bounded atomic snapshot, integrity and restart tests implemented; live transaction evidence pending |
| `reconciliation` | expected result vs provider evidence | policy/attestation, scene, artifact bytes, retrieval abstention, and future provider results reconciled | attestation, artifact hash, and retrieval-only Shadow checks implemented |
| `loop_detector` | repeated action/step budget | demonstration event cap, policy action/runtime budget, future provisioning retry budget | partial implementation |
| `system_pulse` | full fake action chain | fake Field planned -> provisioned -> Teach -> ready -> stop -> destroy | test written |
| `check_runner` | PASS/REVIEW/FAIL release posture | Field implementation status and audit verdict by evidence class | manuals/audits implemented; reusable runner deferred |
| `path_scope` | prerequisite before file tools | Windows-specific Inbox/Outbox scope with transfer direction and reparse requirement | adapted implementation and tests written |
| `redaction_scan` | log/support-bundle redaction | demonstration payload redaction plus encrypted storage metadata restrictions | TS/.NET/store tests written |
| `jsonl_validator` | contract and ledger validation | episode/envelope schema integrity and future event migrations | Zod/encrypted envelope plus deterministic derived-step validation; migration validator pending |
| `evidence_source_guard` | prevents CI evidence inflation | separates pure tests, VM tests, Teach, Shadow, Pilot, owner acceptance | Field Test Plan and status doc |
| `approval_gate` | local action approval | recording consent and host-created Field policy | consent/policy schemas now; live owner UI pending |
| `audit_timeline` | action/workflow history | Field planning/provision/mode/fault/stop/destroy history | hash-linked audit survives validated snapshot restore |
| `background_job_manager` | bounded workflow runtime exists | no hidden Field recording/provisioning autonomy | hidden background recording rejected |
| `mcp_gateway` | narrow pilot tools | pilot cannot create policy, consent, VM authority, arbitrary path, or command | boundary/plan schemas; MCP deny tests future |

## Project-specific donor translation

### Command broker becomes a typed Field Manager

The Field Manager does not accept arbitrary PowerShell, Hyper-V commands, executable paths, or model-authored shell strings. The current fake-first surface performs typed lifecycle operations:

```text
plan
provision
enter Teach | Shadow | Pilot
return ready
stop
destroy
get status
read/verify audit
```

The future host provider may internally call supported APIs or reviewed commands, but it must consume the strict provisioning plan and return structured evidence.

### Event ledger becomes dual subsystem evidence

The Glove ledger answers: who proposed, allowed, executed, verified, or stopped an action?

The Field ledger answers: who planned, attested, provisioned, entered mode, faulted, stopped, exported, reset, or destroyed the environment?

These timelines may be correlated but must not be collapsed into one ambiguous actor stream.

### Reconciliation applies to uncertain external effects

For Glove actions, reconciliation checks whether a desktop change occurred.

For the Field, current and planned reconciliation covers:

- exact policy and attestation,
- guest boot and agent identity,
- display and scene contract,
- task-disk identity,
- output artifact size and hash,
- download completion,
- episode terminal state,
- task disk destruction.

### Path scope is mandatory before artifact export

The donor `parts/python/path_scope/path_scope.py` was inspected directly. The Exosuit adaptation adds Windows and Field-specific rules:

- fixed top-level Field directories,
- caller path must remain relative,
- no traversal, drive, or UNC path,
- no alternate data stream,
- no reserved device name,
- no invalid character or trailing-dot/space alias,
- transfer direction restrictions,
- required live reparse-point ancestry inspection,
- exact bytes/hash and classification in the broker.

The pure scope and in-memory broker are implemented. Live Windows race/reparse proof is still required.

### Encrypted persistence follows checkpoint-store principles

The demonstration store adapts existing Exosuit/Parts durability principles:

- strict schema,
- terminal-state requirement,
- atomic temporary file,
- size bounds,
- authenticated identity,
- tamper failure,
- explicit deletion,
- no silent invalid-file acceptance.

It adds AES-256-GCM because demonstration metadata can contain personal behavior evidence.

### Demonstration retrieval preserves evidence lineage

The deterministic processing foundation accepts only terminal episodes and explicit bounded semantic-step annotations. Each derived step records its exact source range and event IDs. Retrieval is restricted to the same hashed operator identity and exact layout fingerprint, omits failed and mistake behavior by default, propagates source deletion, and has no execution interface. Derived records use bounded AES-256-GCM storage and restart hydration; Windows key protection and real-data quality evidence remain deferred prerequisites.

The retrieval-backed Shadow baseline is a separate predict-or-abstain component. Both prediction and abstention contracts hard-code no execution, unsafe scene states abstain before lookup, low-confidence or irrelevant examples do not guess, and every prediction retains source episode provenance. Its confidence is heuristic and has no live promotion claim.

## Glove-specific atomic units

- MCP gateway
- orchestrator
- action contracts
- local Windows agent
- safety policy
- provider composition
- motor driver
- application maps
- workflow runtime
- supervisor and agent channel
- verification
- emergency stop
- Glove audit

## Field-specific atomic units

- Field identity and generation
- display contract
- Field policy and attestation
- Field registry and lifecycle
- fake/real Field Manager
- strict VM provisioning plan
- base image, personal-state disk, task disk
- guest bootstrap and host/guest channel
- scene graph
- Teach consent and event recorder
- encrypted demonstration store
- Shadow predictor/evaluator
- personal behavior profiles
- Windows path scope
- artifact broker
- Field audit
- Field emergency stop integration
- phase-correct stop evidence: channel healthy/degraded at L2, active execution after the live adapter, and active recording at L5
- local Field owner lifecycle service with fixed job vocabulary

## Rejected shortcuts

- treating the VM viewer as the guest control surface,
- one unrestricted `control_field` tool,
- model-created policy or consent,
- arbitrary command strings in provisioning plans,
- host-wide input recording,
- recording without visible state,
- persistent full-screen recording by default,
- storing passwords/cookies/tokens in demonstrations,
- raw visual bytes in demonstration metadata,
- coordinate-only macros as learned skills,
- calling a Shadow prediction executable authority,
- claiming inferred reasons are owner statements,
- allowing personal imitation models to weaken policy,
- broad writable host drive mapping,
- ordinary export of sensitive or untrusted artifacts,
- arbitrary shell provisioning through MCP,
- generic privileged broker or user-supplied service command/script path,
- calling contract tests Hyper-V validation,
- calling Teach recordings Pilot validation,
- optimizing behavioral imitation for covert impersonation or security-evasion claims.

## Current implemented proof

- `src/fieldContracts.ts` — identity, display, policy, HMAC attestation.
- `src/fieldRegistry.ts` — separate Field lifecycle and Glove binding.
- `src/fieldManager.ts` — fake-first lifecycle, policy binding, Field audit.
- `src/fieldProvisioningPlan.ts` — strict no-shell Hyper-V desired state.
- `src/demonstration.ts` — consent-bound episode, event bounds, ordering, redaction.
- `src/encryptedDemonstrationStore.ts` — authenticated encrypted terminal storage and deletion.
- `src/fieldScene.ts` — versioned scene/readiness foundation.
- `src/fieldSceneObservation.ts` and `src/fieldSceneChannel.ts` — structural-only scene adaptation plus authenticated exact-Field/boot/agent/session receipt; runtime emission remains disabled.
- `apps/windows-agent/FieldSceneProducerBoundary.cs` — session-bound, non-SYSTEM, observe-only structural payload sanitizer and KVP-safe byte-budget guard; launcher/relay remains disabled.
- `src/shadowLearning.ts` — non-executing prediction comparison and metrics.
- `src/fieldPathScope.ts` — adapted Windows path-scope guard.
- `src/fieldArtifactBroker.ts` — bounded in-memory transfer contract.
- `apps/windows-agent/FieldFoundation.cs` — Windows identity/display/lifecycle/redaction primitives.
- TypeScript and .NET tests written for the above applicable surfaces.
- dedicated Field manuals, status, audits, and engineering logs.

## Missing proof

- hosted jobs currently fail before checkout with zero executed steps,
- no successful local TypeScript or .NET run captured,
- no Hyper-V provider or VM lifecycle,
- no guest acceptance or transport,
- no input hooks or visual capture,
- no live scene producer,
- no actual Shadow predictor or personal model,
- no live artifact filesystem/cross-VM transport,
- no credential broker,
- no Pilot Field integration.

## Required follow-through

1. Run repository, TypeScript, and .NET validation on a functioning runner/local checkout.
2. Fix only confirmed failures using the narrow Parts & Pieces loop.
3. Persist and hydrate Field registry/audit safely.
4. Implement dry-run and supported Hyper-V provider against the strict plan.
5. Perform a dedicated privacy audit before visual/input recording.
6. Add exact local Windows/Hyper-V evidence before any live claim.
7. Validate path/reparse behavior on Windows before live artifact transfer.
8. Feed reusable Field identity, consent, encrypted episode, and path-scope parts back into Parts & Pieces only after Exosuit tests execute and prove them.
