# Exosuit Field Implementation Status

**Status authority for current Field code:** this file  
**Branch:** `agent/field-foundation`  
**Updated:** 2026-07-21  
**Planning authority:** `docs/MASTER_SYSTEM_ROADMAP.md` and `docs/FIELD_ARCHITECTURE.md`

## Evidence warning

This branch contains substantial Field contracts, pure/fake runtimes, Windows-side foundations, guarded PowerShell tooling, tests, manuals, audits, and failure-injection plans. GitHub-hosted jobs have repeatedly failed before checkout with zero executed steps and no job logs. Therefore:

- source and tests exist;
- static review and independent fixture recomputation have been performed;
- hosted test execution is not proven;
- local TypeScript/.NET execution is not captured;
- PowerShell scripts have not been executed;
- Hyper-V and interactive Windows behavior are not proven;
- the Field must not be described as operational or production-ready.

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
| lifecycle and Glove binding | `fieldRegistry.ts`, `fieldManager.ts` | fake lifecycle and audit tests | in-memory/fake provider |
| Hyper-V desired state | `fieldProvisioningPlan.ts` | integrity and negative tests | plan only |
| immutable base and disposable OS overlay | provisioning plan and Windows scripts | schema/static tests | unexecuted |
| local admin authority | `fieldAdminAuthority.ts` | model/service/owner deny tests | no local UI/transport |
| authenticated channel | `fieldChannel.ts`, `.NET FieldChannelFoundation.cs`, `.NET FieldKvpRuntime.cs` | TS/.NET tests and shared signed fixture | Hyper-V KVP emitter/verifier written; live guest proof pending |
| guest heartbeat | `fieldHeartbeat.ts`, `.NET FieldKvpRuntime.cs` | identity/liveness and signed-emitter tests | live guest observation pending |
| guest bootstrap | `fieldBootstrap.ts`, readiness evaluator, guest install/start/bootstrap scripts | evaluator, digest, strict-mode, and static script tests | sealed-base and live guest proof pending |
| typed guest commands | `fieldCommand.ts` | mode/policy/scene/route/budget tests | not wired into agent |
| Teach recorder state machine | `teachRecorder.ts`, `demonstration.ts` | consent/no-input/fault tests | no input/UIA hooks |
| encrypted demonstrations | `encryptedDemonstrationStore.ts` | encryption/tamper/deletion tests | pure file component |
| visual capture policy | `visualRetention.ts` | consent/region/budget/TTL tests | no capture/blob store |
| scene graph | `fieldScene.ts` | version/focus/modal/readiness tests | no Windows producer |
| Shadow metrics | `shadowLearning.ts` | no-execution/comparison tests | no predictor |
| Windows path scope | `fieldPathScope.ts` | traversal/ADS/device/reparse tests | no live broker traversal |
| artifact broker | `fieldArtifactBroker.ts` | hash/size/direction/state tests | no cross-VM copy |
| deterministic recovery | `fieldRecovery.ts` | no-blind-retry and generation tests | not wired to host/guest |
| privacy-safe diagnostics | `fieldSupportBundle.ts` | leakage/integrity tests | no automatic collector |
| fake full-system pulse | `fieldSystemPulse.test.ts` | full source chain written | execution pending |
| Windows host tooling | `scripts/windows/*.ps1` | static safety tests | unexecuted |
| local evidence runner | `Invoke-ExosuitFieldValidation.ps1` | source/static review | unexecuted |

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

## Hosted validation status

The latest inspected Exosuit CI and Security Audit jobs again reported no steps and no logs. This is classified as an external runner/account allocation block, not a passing or failing repository test result.

Executable validation remains mandatory on the exact branch head.

## Not implemented or not proven

- executed TypeScript/.NET suite on the current head;
- executed PowerShell parser/static/runtime checks;
- supported, reviewed Hyper-V provider integrated behind `FieldProvisioner`;
- actual VM creation evidence;
- base-image immutability evidence after guest use;
- live Hyper-V KVP transport, protected key persistence, and rotation evidence;
- running guest bootstrap/heartbeat evidence;
- live Windows scene producer;
- live Teach input and UI Automation hooks;
- visible recorder UI and independent physical stop;
- visual capture and encrypted blob store;
- demonstration segmentation/retrieval or actual Shadow predictor;
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
| merge to Glove build branch | HOLD pending executable validation |
| merge to main | DENIED |
| real Windows account use | DENIED |
| real website tasks | DENIED |
| Teach recording | DENIED until live hooks/privacy acceptance |
| Shadow runtime | DENIED until no-input live proof |
| Pilot autonomy | DENIED |
| production | DENIED |

## Next unavoidable live sequence

1. Run `Invoke-ExosuitFieldValidation.ps1` on an authenticated checkout and attach exact evidence.
2. Fix confirmed compile/test/script failures only, then rerun from the start.
3. Create a disposable golden-image fixture and private Hyper-V switch.
4. Dry-run then apply one Field generation using synthetic data only.
5. Integrate authenticated local transport and guest heartbeat.
6. Prove bootstrap/display/session/attestation readiness.
7. Test destruction confinement and base-image immutability.
8. Add live Teach hooks only after privacy review; prove no injection and independent stop.
9. Add live scene production and Shadow only; prove no execution path.
10. Integrate Pilot one synthetic app/workflow at a time, with physical emergency-stop and reconciliation evidence.
