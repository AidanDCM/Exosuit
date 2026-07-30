# Exosuit Field Implementation Status

**Status authority for current Field code:** this file  
**Branch:** `codex/unify-glove-field`  
**Updated:** 2026-07-28  
**Planning authority:** `docs/MASTER_SYSTEM_ROADMAP.md` and `docs/FIELD_ARCHITECTURE.md`

## Evidence warning

The former Glove build branch and Field development branch are consolidated on `codex/unify-glove-field`. Hardened consolidated commit `7a7c435` passed its exact-head L0 validator on 2026-07-28: 284 TypeScript tests, 44 .NET tests, both system pulses, build, contract validators, dependency audit, PowerShell checks, and the read-only host-capability check. Later source slices must continue to pass the same gates before promotion.

Live development evidence exists for a disposable v13 Hyper-V generation: provisioning, guest bootstrap, authenticated KVP channel, heartbeat, and readiness. That evidence used development auto-login and unattended setup, was not repeated as a production matrix, and does not promote Teach, Shadow, Pilot, or production. GitHub-hosted jobs remain blocked before checkout by account billing.

A 2026-07-28 v13 reboot attempt exposed a lifecycle defect: the guest bootstrap manifest had expired and no durable enrollment record existed, so the launcher correctly failed closed before publishing a new heartbeat. After an exact manifest repair, v13 still produced no fresh bootstrap report. A separate v14 generation likewise contained an enabled LocalSystem boot/logon task but no bootstrap report. The source now distinguishes short-lived first enrollment from exact digest-bound durable enrollment and replaces the unreliable runtime task with a fixed LocalSystem Windows service host. The first replacement-base attempt, v15, reached component verification but rejected the correctly registered runtime service because Windows normalized its no-space executable path by removing redundant quotes. Read-only offline evidence proved the command, LocalSystem identity, automatic start, own-process type, and recovery settings; the verifier now accepts only the quoted and unquoted forms of that same exact command. A replacement disposable generation has not yet repeated the live proof, so the earlier v13 evidence remains valid only for its recorded boot.

Therefore:

- source, pure/fake execution, local build/test, and selected development Hyper-V evidence exist;
- hosted CI is unavailable and must not be claimed;
- v13 live evidence proves only the exact development generation and checks recorded in its artifacts;
- repeatability, negative cases, failure injection, production authentication, and higher Field modes remain unproven;
- production remains denied.

On 2026-07-30, the first v19 disposable generation exposed a later bootstrap
ordering defect. The sealed base carried the guest service as Automatic, so it
started during Windows `specialize`; development initialization requested a
restart and Setup failed with Win32 `0x13` while shutdown was in progress.
Generation 1 was stopped and preserved as negative evidence. Source now stages
the service as Manual in the base and reserves Automatic activation plus start
for `SetupComplete.cmd`. A replacement base/generation has not yet proved this
path live, so v19 remains unpromoted.

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
| guest bootstrap | `fieldBootstrap.ts`, readiness evaluator, guest install/start/bootstrap scripts | unit/static tests, digest-bound enrollment tests, plus one v13 development boot | durable-enrollment live reboot proof and production-authenticated repeatability pending |
| typed guest commands | `fieldCommand.ts` | mode/policy/scene/route/budget tests | not wired into agent |
| Teach recorder state machine | `teachRecorder.ts`, `demonstration.ts` | consent/no-input/fault tests | no input/UIA hooks |
| encrypted demonstrations | `encryptedDemonstrationStore.ts` | encryption/tamper/deletion tests | pure file component |
| demonstration processing and retrieval | `demonstrationProcessing.ts`, `encryptedProcessedDemonstrationStore.ts` | terminal/ambiguity/privacy/relevance/encryption/restart/deletion/held-out tests | deterministic pipeline and encrypted file store; no live adapter |
| visual capture policy | `visualRetention.ts` | consent/region/budget/TTL tests | no capture/blob store |
| scene graph and observation adapter | `fieldScene.ts`, `fieldSceneObservation.ts`, existing Windows UIA observer | version/focus/modal/readiness/freshness/text-redaction tests | transport/runtime wiring not live |
| Shadow baseline and metrics | `retrievalShadowPredictor.ts`, `shadowLearning.ts` | retrieval/abstention/no-execution/comparison tests | source-only heuristic; no live observation feed |
| Correction dataset foundation | `correctionMode.ts` | replacement/cancellation/effect-uncertainty/label-conflict/lineage tests | in-memory source component; no live takeover control or encrypted persistence |
| Windows path scope | `fieldPathScope.ts` | traversal/ADS/device/reparse tests | no live broker traversal |
| artifact broker | `fieldArtifactBroker.ts` | hash/size/direction/state tests | no cross-VM copy |
| deterministic recovery | `fieldRecovery.ts` | no-blind-retry and generation tests | not wired to host/guest |
| privacy-safe diagnostics | `fieldSupportBundle.ts` | leakage/integrity tests | no automatic collector |
| fake full-system pulse | `fieldSystemPulse.test.ts` | executed locally on Field and merged trees | fake integration only |
| Windows host tooling | `scripts/windows/*.ps1` | static tests, selected v13 development execution, and bounded v14 offline inspection | selected paths only; elevation remains local |
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
- `Install-ExosuitFieldGuest.ps1` / `.NET FieldGuestServiceHost.cs` / `Start-ExosuitFieldGuest.ps1` — fixed LocalSystem service registration, fail-closed bootstrap, and signed KVP guest runtime;
- `Read-ExosuitFieldGuestKvp.ps1` — host-side KVP retrieval and authenticated replay-guard verification;
- `Remove-ExosuitFieldGeneration.ps1` — exact-generation destruction;
- `Invoke-ExosuitFieldValidation.ps1` — one-command evidence capture.

See `docs/FIELD_WINDOWS_RUNBOOK.md`.

## Validation status

### 2026-07-30 v20 development-access canary

Immutable base `exosuit-field-base-v20` was built from reviewed v10 parent
`624a27cf...a7b30` on source commit `2735a85`. Its promoted read-only digest is
`452790e549cc31f3d4bb2613113f5a386716447d9b4795ded2a9193ad415547d`.
The SYSTEM maintenance receipt binds the guest service to
`ManualUntilSetupComplete`; the Audit receipt binds canonical
`/generalize /oobe /shutdown /quiet` Sysprep.

Development-only Field `7fad0376-68aa-4300-899d-a2ded6e1fb15`, generation 1,
booted from a disposable differencing overlay and reached authenticated KVP
`ready`. Identity, base digest, task disk, directory layout, 1920x1080 display,
agent digest, channel key ID, policy binding, unlocked session, inactive Secure
Desktop, and heartbeat checks passed. A delayed sample advanced guest heartbeat
sequence to 213 with lifecycle `ready`, desktop ready, zero queued input, and
zero pending commands. This is development-access canary evidence, not
production authentication, execution, recording, isolation-matrix, or release
evidence.

The canary generation was then destroyed with the exact typed-confirmation
path. Its VM registration and disposable generation root were removed. A
post-destruction SHA-256 check matched the promoted v20 digest exactly and the
base remained read-only. This proves immutability for this one canary lifecycle,
not the required repeated/failure-injected matrix.

Repeated KVP observation exposed and corrected a host-reader defect: retained
handshake/bootstrap envelopes are now accepted only as exact idempotent
observations after fresh cryptographic/expiry verification. Any changed record
must advance sequence and use a new message ID. Two live samples passed with
retained handshake/bootstrap records and an advancing heartbeat.

The observation transition has subsequently moved into the compiled Windows
agent so the full snapshot is verified and the ledger is committed atomically.
Executable .NET tests now cover exact retention, advancing heartbeat,
same-sequence mutation, prior message-ID reuse, wrong-key state, malformed state,
and no state update after rejection. This compiled boundary is source/unit
evidence only until a newly published agent and fresh base/generation repeat the
live canary.

The exact Field head `e10e921` passed the complete local L0 evidence runner on 2026-07-28. Hardened consolidated commit `7a7c435` then passed all 15 L0 runner steps, including 284 TypeScript tests, 44 .NET tests, builds, both pulses, locked dependency install, and the read-only host capability check. Clean-checkout parity passed 12/12 on each published security slice.

GitHub-hosted CI and Security Audit jobs report no allocated steps because of the account billing state. This is neither a repository pass nor a repository failure.

## Not implemented or not proven

- supported, reviewed Hyper-V provider integrated behind `FieldProvisioner`;
- production-repeatable VM lifecycle and failure-injection evidence;
- automatic transactional checkpoint/reconciliation around live provider effects;
- base-image immutability proof across the required repeated matrix;
- protected channel-key persistence and rotation evidence;
- production-authenticated guest bootstrap/heartbeat evidence without development access;
- live authenticated transport from the existing Windows UIA observer into the Field scene adapter;
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
