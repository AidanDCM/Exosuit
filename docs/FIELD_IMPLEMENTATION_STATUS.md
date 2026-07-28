# Exosuit Field Implementation Status

**Status authority for current Field code:** this file  
**Branch:** `codex/unify-glove-field`  
**Updated:** 2026-07-28  
**Planning authority:** `docs/MASTER_SYSTEM_ROADMAP.md` and `docs/FIELD_ARCHITECTURE.md`

## Evidence warning

The former Glove build branch and Field development branch are consolidated on `codex/unify-glove-field`. Hardened consolidated commit `7a7c435` passed its exact-head L0 validator on 2026-07-28: 284 TypeScript tests, 44 .NET tests, both system pulses, build, contract validators, dependency audit, PowerShell checks, and the read-only host-capability check. Later source slices must continue to pass the same gates before promotion.

Live development evidence exists for a disposable v13 Hyper-V generation: provisioning, guest bootstrap, authenticated KVP channel, heartbeat, and readiness. That evidence used development auto-login and unattended setup, was not repeated as a production matrix, and does not promote Teach, Shadow, Pilot, or production. GitHub-hosted jobs remain blocked before checkout by account billing.

Therefore:

- source, pure/fake execution, local build/test, and selected development Hyper-V evidence exist;
- hosted CI is unavailable and must not be claimed;
- v13 live evidence proves only the exact development generation and checks recorded in its artifacts;
- repeatability, negative cases, failure injection, production authentication, and higher Field modes remain unproven;
- production remains denied.

## Glove and Field split

| Subsystem | Current role |
|---|---|
| Glove | existing MCP, planning, Windows agent, policy, semantic/motor execution, verification, workflow, audit, and stop |
| Field | environment identity, policy, lifecycle, VM desired state, host/guest channel, bootstrap, heartbeat, teaching data, visual policy, scene, Shadow metrics, artifact boundary, recovery, diagnostics, and administration foundations |

**The Glove is not the VM. The Field is not the agent.**

## Implemented source surfaces

| Surface | Main files | Current evidence | Live capability? |
|---|---|---|---|
| identity, generation, display, policy, attestation | `fieldContracts.ts`, `.NET FieldFoundation.cs` | TS/.NET tests written | no live attestation channel |
| lifecycle and Glove binding | `fieldRegistry.ts`, `fieldManager.ts`, `fieldManagerStore.ts` | fake lifecycle, restart, integrity, and audit-chain tests | durable snapshot primitive; fake provider |
| Hyper-V desired state | `fieldProvisioningPlan.ts` | integrity and negative tests | plan only |
| immutable base and disposable OS overlay | provisioning plan and Windows scripts | schema/static tests | unexecuted |
| local admin authority | `fieldAdminAuthority.ts` | model/service/owner deny tests | no local UI/transport |
| authenticated channel | `fieldChannel.ts`, `.NET FieldChannelFoundation.cs`, `.NET FieldKvpRuntime.cs` | TS/.NET tests, shared fixture, v13 development KVP evidence | production key/rotation/repeatability pending |
| guest heartbeat | `fieldHeartbeat.ts`, `.NET FieldKvpRuntime.cs` | unit tests plus v13 development observation | production and negative live matrix pending |
| guest bootstrap | `fieldBootstrap.ts`, readiness evaluator, guest install/start/bootstrap scripts | unit/static tests plus v13 development readiness | production-authenticated repeatability pending |
| typed guest commands | `fieldCommand.ts` | mode/policy/scene/route/budget tests | not wired into agent |
| Teach recorder state machine | `teachRecorder.ts`, `demonstration.ts` | consent/no-input/fault tests | no input/UIA hooks |
| encrypted demonstrations | `encryptedDemonstrationStore.ts` | encryption/tamper/deletion tests | pure file component |
| demonstration processing and retrieval | `demonstrationProcessing.ts`, `encryptedProcessedDemonstrationStore.ts` | terminal/ambiguity/privacy/relevance/encryption/restart/deletion/held-out tests | deterministic pipeline and encrypted file store; no live adapter |
| visual capture policy | `visualRetention.ts` | consent/region/budget/TTL tests | no capture/blob store |
| scene graph | `fieldScene.ts` | version/focus/modal/readiness tests | no Windows producer |
| Shadow baseline and metrics | `retrievalShadowPredictor.ts`, `shadowLearning.ts` | retrieval/abstention/no-execution/comparison tests | source-only heuristic; no live observation feed |
| Windows path scope | `fieldPathScope.ts` | traversal/ADS/device/reparse tests | no live broker traversal |
| artifact broker | `fieldArtifactBroker.ts` | hash/size/direction/state tests | no cross-VM copy |
| deterministic recovery | `fieldRecovery.ts` | no-blind-retry and generation tests | not wired to host/guest |
| privacy-safe diagnostics | `fieldSupportBundle.ts` | leakage/integrity tests | no automatic collector |
| fake full-system pulse | `fieldSystemPulse.test.ts` | executed locally on Field and merged trees | fake integration only |
| Windows host tooling | `scripts/windows/*.ps1` | static tests plus selected v13 development execution | selected paths only |
| local evidence runner | `Invoke-ExosuitFieldValidation.ps1` | exact-head Field run passed at `e10e921` | L0 only |

## Critical architecture decisions now encoded

### Immutable base image

The golden Windows VHDX is never the writable boot disk. Each Field generation uses:

```text
immutable base VHDX
        |
        v
disposable differencing OS overlay  <-- VM boots and writes here

optional persistent personal-state VHDX
separate disposable task VHDX
```

The destruction path is confined to the exact generation directory and VM registration. Base and personal-state paths are not deletion targets.

### Administration boundary

- `pilot_model` is blocked from planning/provisioning, mode changes, stop/destroy, key rotation, demonstration deletion, and sensitive export.
- Field service is limited to reviewed lifecycle execution.
- consent, key rotation, deletion, and sensitive export require interactive local owner presence.
- model text can never satisfy review.

### Channel boundary

Every message binds:

- exact Field ID and generation,
- direction,
- sequence,
- message ID,
- nonce,
- key ID,
- payload hash,
- sent/expiration time,
- HMAC-SHA256 signature.

Replay, mutation, wrong direction/key/generation, expiration, and sequence rollback are denied. Replay guards support bounded atomic local persistence bound to the exact Field generation, direction, and key ID. A narrow Hyper-V KVP guest emitter and host verifier now provide a no-network transport implementation; live guest wiring, protected-state operational validation, and key rotation remain pending.

### Guest action boundary

The guest accepts only typed status, observation, bounded desktop action, emergency-stop, and shutdown commands. Action execution requires:

- Pilot mode,
- authenticated Glove host actor,
- exact policy ID and hash,
- exact current scene version,
- contiguous action ordinal,
- remaining action budget,
- approved desktop route,
- semantic or physical capability.

Shell routes are denied. Teach and Shadow cannot execute. Shutdown is local-admin-only. Emergency stop remains available independently of normal action authorization.

### Teaching and privacy boundary

- Teach requires explicit consent and a visible-recording-state contract.
- Teach recorder has no input-injection authority.
- terminal episodes are encrypted with AES-256-GCM.
- raw screenshots/frame/image/pixel bytes are banned from episode metadata.
- visual capture requires a separate consent policy, external blob references, sensitive-region redaction, region/change-only mode, and byte/count/TTL limits.
- support bundles contain hashed identity and aggregate state only.

### Recovery boundary

- only an idempotent, zero-effect operation may receive a bounded retry;
- a possible unverified external effect freezes and reconciles instead of retrying;
- channel/replay/boot/display/attestation/task-disk trust failures require stop, disposable-state destruction, generation increment, and reprovisioning;
- emergency-stop failure is release-blocking and receives no automated recovery.

## Validation surfaces

### TypeScript

- focused Field suite: `npm run test:field`
- fake full-system pulse: `npm run test:field-pulse`
- Field repository validator: `npm run validate:field-contract`
- complete Field validation: `npm run validate:field`
- whole repository: `npm run validate:typescript`

### .NET

- Field identity/lifecycle/redaction tests;
- authenticated channel/replay/heartbeat tests;
- shared Field contract fixture;
- shared signed channel fixture.

### Windows

- `Test-ExosuitFieldHost.ps1` — read-only prerequisites;
- `Show-ExosuitFieldProvisioningPlan.ps1` — non-mutating plan resolver;
- `Invoke-ExosuitFieldProvisioning.ps1` — dry-run by default, exact confirmation for apply, bounded rollback;
- `Initialize-ExosuitFieldGuest.ps1` — fixed-root bootstrap precheck;
- `Install-ExosuitFieldGuest.ps1` / `Start-ExosuitFieldGuest.ps1` — SYSTEM startup registration and signed KVP guest runtime;
- `Read-ExosuitFieldGuestKvp.ps1` — host-side KVP retrieval and authenticated replay-guard verification;
- `Remove-ExosuitFieldGeneration.ps1` — exact-generation destruction;
- `Invoke-ExosuitFieldValidation.ps1` — one-command evidence capture.

See `docs/FIELD_WINDOWS_RUNBOOK.md`.

## Validation status

The exact Field head `e10e921` passed the complete local L0 evidence runner on 2026-07-28. Hardened consolidated commit `7a7c435` then passed all 15 L0 runner steps, including 284 TypeScript tests, 44 .NET tests, builds, both pulses, locked dependency install, and the read-only host capability check. Clean-checkout parity passed 12/12 on each published security slice.

GitHub-hosted CI and Security Audit jobs report no allocated steps because of the account billing state. This is neither a repository pass nor a repository failure.

## Not implemented or not proven

- supported, reviewed Hyper-V provider integrated behind `FieldProvisioner`;
- production-repeatable VM lifecycle and failure-injection evidence;
- automatic transactional checkpoint/reconciliation around live provider effects;
- base-image immutability proof across the required repeated matrix;
- protected channel-key persistence and rotation evidence;
- production-authenticated guest bootstrap/heartbeat evidence without development access;
- live Windows scene producer;
- live Teach input and UI Automation hooks;
- visible recorder UI and independent physical stop;
- visual capture and encrypted blob store;
- automatic/learned segmentation, real-data quality/calibration evaluation, or learned personal predictor;
- personal task/motor/typing/language/timing models;
- live artifact copy with reparse and TOCTOU protection;
- credential broker;
- Pilot integration into the existing Windows policy/execution loop;
- connected ChatGPT Field acceptance;
- installer, signing, updater, rollback release operations, penetration test, or production support.

## Promotion posture

| Capability | Posture |
|---|---|
| draft PR review | OPEN |
| consolidation on review branch | DRAFT PR #26; exact-head local validation passed, review/hosted CI still held |
| merge to main | DENIED |
| real Windows account use | DENIED |
| real website tasks | DENIED |
| Teach recording | DENIED until live hooks/privacy acceptance |
| Shadow runtime | DENIED until no-input live proof |
| Pilot autonomy | DENIED |
| production | DENIED |

## Next unavoidable live sequence

1. Commit the Glove/Field integration and rerun `Invoke-ExosuitFieldValidation.ps1` on that exact head.
2. Repeat the v13-equivalent disposable lifecycle with production authentication settings and negative/failure cases.
3. Prove destruction confinement, base-image immutability, protected key persistence, and rotation.
4. Implement a live scene producer before any live action integration.
5. Add live Teach hooks only after the required privacy review; prove consent, visible indication, no injection, and independent stop.
6. Extend the deterministic processing/retrieval foundation with encrypted derived storage and quality evidence, then implement Shadow and prove process-level no-input authority.
7. Implement correction and personal models behind independent disable paths and held-out evaluation.
8. Integrate Assisted and Pilot one synthetic workflow at a time, with physical emergency stop and uncertain-effect reconciliation.
