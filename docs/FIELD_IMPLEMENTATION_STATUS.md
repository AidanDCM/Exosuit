# Exosuit Field Implementation Status

**Status authority for current Field code:** this file  
**Branch:** `agent/field-foundation`  
**Updated:** 2026-07-21  
**Planning authority:** `docs/MASTER_SYSTEM_ROADMAP.md` and `docs/FIELD_ARCHITECTURE.md`

## Evidence warning

This branch contains substantial Field source, tests, manuals, and pure/fake foundations. GitHub-hosted jobs for the current branch have repeatedly failed before checkout with zero executed steps and no job logs. Therefore:

- source exists,
- tests exist,
- static review has been performed,
- hosted test execution is **not** proven,
- local TypeScript/.NET execution is **not** captured,
- Hyper-V and interactive Windows behavior are **not** implemented or proven.

Do not describe the Field as operational.

## Glove and Field split

| Subsystem | Current role |
|---|---|
| Glove | existing MCP, planning, Windows-agent, policy, semantic/motor execution, verification, workflow, audit, stop |
| Field | new environment identity, policy, provisioning plan, lifecycle, teaching data, storage, scene, Shadow metrics, and artifact-boundary foundations |

The Glove is not the VM. The Field is not the agent.

## Implemented Field source

| Surface | Files | Current evidence | Live capability? |
|---|---|---|---|
| Field identity and generation | `src/fieldContracts.ts`, `.NET FieldFoundation.cs` | source + TS/.NET tests written | no |
| fixed display contract | same | source + tests written | no Windows enforcement |
| bounded Field policy | `src/fieldContracts.ts` | source + negative tests written | not integrated into live agent |
| local policy attestation | `src/fieldContracts.ts` | HMAC/canonicalization source + tests written | no secure host/guest key channel |
| Field lifecycle/Glove binding | `src/fieldRegistry.ts`, `.NET FieldFoundation.cs` | source + tests written | in-memory only |
| fake Field Manager | `src/fieldManager.ts` | full fake lifecycle pulse tests written | no Hyper-V |
| deterministic provisioning plan | `src/fieldProvisioningPlan.ts` | typed plan + tests written | no provider executes it |
| demonstration episode | `src/demonstration.ts` | source + consent/order/limit tests written | no live hooks |
| encrypted demonstration store | `src/encryptedDemonstrationStore.ts` | AES-256-GCM store + tests written | file-backed pure component only |
| Field scene graph | `src/fieldScene.ts` | version/focus/modal/readiness tests written | no Windows event source |
| Shadow contracts and metrics | `src/shadowLearning.ts` | prediction-only schemas/evaluator + tests written | no predictive model |
| Windows Field path scope | `src/fieldPathScope.ts` | adapted Parts pattern + tests written | no live broker filesystem traversal |
| bounded artifact broker | `src/fieldArtifactBroker.ts` | in-memory manifest/hash/state tests written | no host/guest byte transport |
| cross-language fixture | `tests/fixtures/field-contract-v1.json` | TS/.NET fixture tests written | execution pending |

## Foundation details

### Field policy

The schema binds one Field generation and contains:

- Teach, Shadow, or Pilot mode,
- allowed processes,
- allowed capabilities,
- allowed origins,
- finite runtime/action budgets,
- recording consent state,
- expiration,
- literal false values for host desktop access, broad host-drive write, privilege escalation, and security-control changes.

The pilot does not create or sign this policy.

### Attestation

The local foundation binds:

- Field identity and generation,
- display contract,
- exact policy hash,
- issuer key ID,
- short validity window,
- HMAC-SHA256 signature checked in constant time.

This is not TPM, secure-boot, hardware, or remote attestation.

### Fake Field Manager

The implemented fake-first manager supports:

```text
plan
-> verify policy and attestation
-> provision through typed provider
-> ready
-> Teach | Shadow | Pilot lifecycle
-> ready
-> stop
-> destroy
```

It records a hash-linked Field audit and binds mode entry to the exact policy used at provisioning. It cannot create a VM.

### VM provisioning plan

The typed plan includes:

- Hyper-V Generation 2,
- CPU and dynamic/fixed memory bounds,
- secure boot,
- optional TPM requirement,
- production checkpoints,
- immutable base image identity,
- encrypted personal-state identity,
- disposable task disk,
- disabled/isolated/filtered-NAT network mode,
- host LAN and inbound connections false,
- clipboard, broad drive mapping, and host input injection false,
- viewer allowed only as a viewer,
- ordered provisioning steps through guest identity/display/attestation/ready.

There is no command or arbitrary shell field.

### Demonstration persistence

Only completed or aborted episodes may be persisted. The store:

- redacts secret-shaped payload keys again before persistence,
- rejects raw screenshot/frame/pixel byte fields in metadata,
- encrypts and authenticates with AES-256-GCM,
- binds episode and Field-generation hashes as authenticated data,
- uses atomic temporary-file replacement,
- applies byte limits,
- hides invalid/wrong-key files from listing,
- supports deletion by episode or Field generation.

It does not yet provide visual-byte storage, retention jobs, training export, or deletion certificates.

### Field scene graph

The pure graph validates:

- one exact Field generation,
- increasing scene versions and timestamps,
- unique windows and elements,
- active-window consistency,
- element-to-window ownership,
- modal-window identity,
- cursor inside fixed display,
- locked/secure session cannot be ready,
- input blocked while not ready, locked, secure, or busy.

It emits incremental scene events but has no live Windows producer.

### Shadow foundation

Shadow records are hard-coded with `executionAllowed: false`. Comparisons require the same Field generation and source observation and measure:

- intent agreement,
- target agreement,
- mouse/keyboard/semantic method agreement,
- expected-result agreement,
- absolute timing error,
- normalized trajectory-shape distance.

No model generates predictions yet.

### Path scope and artifact broker

The Windows Field path guard rejects:

- absolute, drive, or UNC caller paths,
- traversal and ambiguous segments,
- alternate data streams,
- Windows invalid characters,
- trailing dots/spaces,
- reserved device names,
- wrong folder/direction combinations,
- uninspected reparse-point ancestry.

The broker then requires exact bytes and SHA-256, restricts host imports to Inbox/Quarantine, restricts exports to Outbox, and blocks sensitive or untrusted exports from the ordinary path. It does not perform live filesystem or cross-VM transfer.

## Tests written

### TypeScript

- Field policy/attestation
- Field lifecycle/Glove binding
- demonstration events and redaction
- encrypted demonstration persistence/tamper/deletion
- fake Field Manager lifecycle and policy substitution
- Field scene events and readiness
- Shadow no-execution and metrics
- provisioning-plan integrity and host isolation
- Windows path scope and reparse requirement
- artifact transfer hash/state/direction/classification
- shared Field fixture

### .NET

- Field identity/display validation
- lifecycle/Glove binding
- fault transition requirements
- demonstration payload redaction
- shared Field fixture vocabulary

## Hosted validation status

For head `a34deaccb458c8b6b364f3b250ba174a21faecb1`:

- Exosuit CI run `29854178787`: failure before checkout; all three jobs contained zero steps.
- Security Audit run `29854178777`: failure before checkout; no repository step evidence.
- job log blob was unavailable because no steps were allocated.

Later commits add more foundations. Their hosted runs must be checked separately, but the known runner/account condition may persist.

This is infrastructure evidence, not a code-test failure and not a code-test pass.

## Not implemented

- supported Hyper-V provider,
- base-image builder or image registry,
- VHDX/differencing-disk creation,
- VM create/start/stop/destroy,
- Hyper-V socket transport,
- guest bootstrap service,
- display enforcement,
- heartbeat from a guest,
- live input recorder,
- UI Automation event recorder for Teach,
- visual capture or redaction,
- visible recording indicator,
- independent recorder stop,
- scene-graph Windows producer,
- demonstration segmenter/retrieval model,
- actual Shadow predictor,
- personal motor/typing/language/timing models,
- local reflex execution of learned profiles,
- live filesystem artifact broker,
- credential broker,
- Pilot policy integration into Windows safety policy,
- MCP Field tools,
- ChatGPT connection acceptance,
- installation, signing, upgrades, rollback, penetration test, or release operations.

## Promotion posture

| Capability | Posture |
|---|---|
| merge to Glove build branch | HOLD pending executable validation and review |
| merge to main | DENIED |
| real Windows account use | DENIED |
| real website tasks | DENIED |
| Teach recording | DENIED; no live recorder |
| Shadow operation | DENIED; no predictor/runtime |
| Pilot autonomy | DENIED |
| production | DENIED |

## Next engineering sequence

1. Run repository, TypeScript, and .NET commands on a usable runner or local checkout.
2. Repair only confirmed failures and attach exact outputs.
3. Add durable Field registry/audit persistence and fake hydration tests.
4. Implement a supported Hyper-V provider behind `FieldProvisioner`, beginning with plan/dry-run output.
5. Implement guest bootstrap and heartbeat in a disposable VM.
6. Complete a dedicated privacy-critical audit before adding input or visual hooks.
7. Implement Teach recorder with consent indicator, independent stop, encrypted store, and deletion.
8. Wire live scene graph.
9. Implement retrieval and Shadow prediction only; prove no input path.
10. Add personal-model interfaces and local bounded motor only after Shadow thresholds and owner review.
