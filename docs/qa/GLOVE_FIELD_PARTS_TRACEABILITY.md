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
| `docs/dev_manual/ATOMIC_AUDIT.md` | Level 4 execution/safety audits | Level 4 privacy, VM, recording, and autonomy audits | project audit files and required structure |
| `QUESTION_EVERYTHING_PROTOCOL.md` | interrogate action, policy, provider, verification, audit units | interrogate identity, VM, consent, recorder, storage, model, and lifecycle units | assumption/question ledgers in Field audit |
| `NORTH_STAR_INTERROGATION.md` | private model-independent body | stable instrumented Windows teaching/execution environment | Glove/Field North Stars documented separately |
| `STRICT_PRECISION_FLUID_EXECUTION.md` | strict policy/evidence with adaptable provider sequence | fixed boundaries with staged VM/recording implementation | slice plan and promotion gates |
| `DEV_LOOP_SENTINEL.md` | stop repeated action/development loops | stop repeated provisioning, recording, or recovery loops | runtime loop guards on Glove; Field sentinel planned |
| `QUALITY_GATES.md` | contracts, tests, security scan, manuals | Field docs/code/tests required by repository validator | validator update in this slice |
| owner/developer/manual templates | existing root manuals | dedicated Field owner/developer/test manuals | created in this slice |

## Reusable parts and decisions

| Part | Glove decision | Field decision | Proof or planned proof |
|---|---|---|---|
| `desktop_control_harness` | adapted into provider/action/verification pipeline | Field supplies the bounded desktop and fake/live environments | existing Glove tests; Field lifecycle/contract tests |
| `command-broker` | principles adapted; no arbitrary shell | future Field Manager operations use typed provisioning plans, not model commands | Field Manager tests required before Hyper-V |
| `event_ledger` | tamper-evident Glove and coordinator ledgers | Field lifecycle, consent, provisioning, episode, and destruction events need separate actor identity | Field audit requirement; runtime pending |
| `reconciliation` | expected result vs provider evidence | expected Field identity/state/output vs guest/host evidence | attestation verification now; live reconciliation pending |
| `loop_detector` | repeated action/step budget | provisioning retry, recorder overflow, stale heartbeat, and recovery budgets | recorder event cap now; Field sentinel pending |
| `system_pulse` | full fake action chain | future fake Field create -> ready -> Teach/Shadow/Pilot -> stop/destroy pulse | required in Field Manager slice |
| `check_runner` | PASS/REVIEW/FAIL release posture | Field promotion report by evidence class | manual/audit now; reusable runner deferred |
| `path_scope` | prerequisite before file tools | mandatory for Inbox/Outbox artifact broker | deferred prerequisite, explicitly required |
| `redaction_scan` | log/support-bundle redaction | demonstration payload, visual metadata, and credential broker redaction | TS/.NET payload redaction tests now |
| `jsonl_validator` | contract and ledger validation | future episode/event-log integrity and migrations | Zod contracts now; persistence validator pending |
| `evidence_source_guard` | prevents CI evidence inflation | separates pure tests, VM tests, Teach, Shadow, Pilot, and owner acceptance | Field Test Plan evidence vocabulary |
| `approval_gate` | local action approval | recording consent and host-created Field policy | consent schema now; live owner UI pending |
| `audit_timeline` | action/workflow history | Field provisioning/session/recording/destruction history | contract planned; runtime pending |
| `background_job_manager` | bounded workflow runtime exists | no hidden Field recording or provisioning background autonomy | hidden background recording rejected |
| `mcp_gateway` | narrow pilot tools | pilot cannot create policy, consent, or VM authority | boundary manual and future MCP deny tests |

## Project-specific donor translation

### Command broker becomes a typed Field Manager

The Field Manager must not accept arbitrary PowerShell, Hyper-V commands, executable paths, or model-authored shell strings. It should accept typed operations such as:

```text
plan_field
create_field
start_field
stop_field
destroy_field
get_field_status
```

The host implementation may internally call supported APIs or reviewed commands, but the model boundary remains typed and policy-bound.

### Event ledger becomes dual subsystem evidence

The Glove ledger answers: who proposed, allowed, executed, verified, or stopped an action?

The Field ledger answers: who created, attested, entered mode, recorded, faulted, stopped, exported, reset, or destroyed the environment?

These timelines may be correlated but must not be collapsed into one ambiguous actor stream.

### Reconciliation applies to uncertain external effects

For Glove actions, reconciliation checks whether a desktop change occurred.

For the Field, reconciliation also checks:

- guest boot and agent identity,
- display contract,
- task-disk identity,
- output artifact hash,
- whether a download completed,
- whether an episode closed cleanly,
- whether a task disk was actually destroyed.

### Path scope is mandatory before artifact export

The Field design introduces model-relevant files, so the earlier deferred `path_scope` prerequisite is now active. Before Inbox/Outbox code is added, the implementation must prove:

- canonical path remains below configured root,
- no traversal,
- no symlink/reparse escape,
- bounded size and file count,
- extension/content classification,
- explicit transfer direction,
- audit and hash.

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
- Field policy
- Field attestation
- Field registry and lifecycle
- base image
- personal-state disk
- task disk
- Field Manager
- guest bootstrap
- host/guest channel
- scene graph
- Teach consent
- input recorder
- visual recorder
- UIA/system recorder
- demonstration episode/store
- Shadow predictor
- personal behavior profiles
- artifact broker
- Field audit
- Field emergency stop integration

## Rejected shortcuts

- treating the VM viewer as the guest control surface,
- one unrestricted `control_field` tool,
- model-created policy or consent,
- host-wide input recording,
- recording without visible state,
- persistent full-screen recording by default,
- storing passwords/cookies/tokens in demonstrations,
- coordinate-only macros as learned skills,
- claiming inferred reasons are owner statements,
- allowing personal imitation models to weaken policy,
- broad writable host drive mapping,
- arbitrary shell provisioning through MCP,
- calling contract tests Hyper-V validation,
- calling Teach recordings Pilot validation,
- optimizing behavioral imitation for covert impersonation or security-evasion claims.

## Current implemented proof

- `src/fieldContracts.ts` — identity, display, policy, HMAC attestation.
- `src/fieldRegistry.ts` — separate Field lifecycle and Glove binding.
- `src/demonstration.ts` — consent-bound episode, event bounds, ordering, redaction.
- `apps/windows-agent/FieldFoundation.cs` — Windows-side identity/display/lifecycle/redaction primitives.
- TypeScript and .NET pure tests for the above.
- dedicated Field architecture, owner, developer, and test manuals.

## Missing proof

- branch commands have not yet been executed in this connector session,
- GitHub Actions results pending,
- no local TypeScript or .NET run captured here,
- no Hyper-V implementation,
- no guest acceptance,
- no input hooks,
- no visual capture,
- no persistent demonstration store,
- no Shadow or personal-model implementation,
- no Pilot field autonomy integration,
- no artifact broker/path-scope implementation.

## Required follow-through

1. Run repository, TypeScript, and .NET validation on the exact branch head.
2. Fix failures using the narrow Parts & Pieces failure loop.
3. Add a cross-language Field fixture.
4. Implement fake Field Manager before Hyper-V.
5. Activate `path_scope` before artifact transfer.
6. Perform a dedicated privacy audit before visual/input recording.
7. Add exact local Windows/Hyper-V evidence before any live claim.
8. Feed broadly reusable Field identity, consent, and episode parts back into Parts & Pieces only after Exosuit tests prove them.
