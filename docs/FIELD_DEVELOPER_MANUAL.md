# Exosuit Field Developer Manual

**Status:** Mandatory manual for Field changes  
**Created:** 2026-07-21T13:32:27-04:00

## Mandatory reading order

Before changing the Field, read:

1. `AGENTS.md`
2. `DEVELOPER_OPERATING_SYSTEM.md`
3. `docs/GLOVE_FIELD_BOUNDARY.md`
4. `docs/FIELD_ARCHITECTURE.md`
5. `docs/FIELD_OWNER_MANUAL.md`
6. `docs/FIELD_TEST_PLAN.md`
7. `docs/SECURITY_MODEL.md`
8. `docs/qa/GLOVE_FIELD_PARTS_TRACEABILITY.md`
9. the latest Field-related file under `docs/qa/`
10. the latest Field-related file under `docs/engineering_log/`

## Core development rule

The Glove and Field live in one repository but must remain separately understandable, testable, disableable, and auditable.

A Field change must answer:

- Is this changing the environment or the agent?
- Which subsystem owns the state?
- Which subsystem owns the permission?
- Which identity and generation bind the operation?
- What evidence proves the boundary was not crossed?

Do not place Field provisioning, task-disk, display, or recording-consent authority into generic Glove action contracts.

## Development slices

Use this sequence unless a recorded architecture decision changes it:

1. contracts and fake state,
2. deterministic validation,
3. pure tests,
4. repository and documentation gates,
5. Windows-side pure contracts,
6. fake Field Manager,
7. local dry-run provisioning,
8. disposable VM provisioning,
9. guest bootstrap,
10. Teach recording in a synthetic fixture,
11. live Teach recording in a dedicated VM,
12. Shadow prediction,
13. learned local motor interfaces,
14. bounded Pilot integration,
15. operational packaging and release evidence.

Do not combine first live recording, first visual capture, first physical input, first autonomous policy, and first real-account task into one slice.

## Component naming

Use explicit names:

- `Glove...` for pilot-side or execution-body concepts,
- `Field...` for VM/environment concepts,
- `Demonstration...` for Teach data,
- `Shadow...` for prediction-only behavior,
- `Personal...` for learned owner profiles,
- `Artifact...` for bounded cross-boundary files/data.

Avoid overloaded names such as `DesktopManager` when the component is specifically a Field provisioner or Glove scene coordinator.

## Identity requirements

Every Field-owned runtime object must carry or be resolvable to:

```text
fieldId
fieldGeneration
agentId
windowsSessionId
contractVersion
```

Generation is not optional. A closed/rebuilt/rolled-back environment may reuse a human-readable name but must not silently reuse runtime authority.

Tests must cover:

- stale generation,
- wrong agent,
- wrong Windows session,
- changed policy hash,
- expired attestation,
- changed display contract,
- duplicate Field registration.

## Policy requirements

A Field policy must:

- be created outside the pilot,
- bind one Field generation,
- name the operating mode,
- bound runtime and action count,
- list allowed processes and capabilities,
- expire,
- deny host desktop access,
- deny host-drive write by default,
- deny privilege escalation,
- deny security-control changes,
- require consent for Teach recording.

The model-facing MCP surface must not create, expand, sign, or activate a Field policy.

## Attestation requirements

The current HMAC attestation is a local contract-binding foundation. Do not describe it as hardware attestation, TPM attestation, secure boot proof, or remote VM attestation.

Attestation code must:

- use canonical serialization,
- bind the complete policy hash,
- bind exact Field generation,
- use a short TTL,
- compare signatures in constant time,
- reject not-yet-valid and expired records,
- keep the secret outside logs, fixtures, and model context.

Future key-storage improvements must preserve backward-incompatible versioning where necessary.

### Protected channel-secret files

`ProtectedFieldChannelSecretStore` is a bounded Windows primitive, not a live
rotation provider. It is used only by the explicit conversion command and the
protected guest reader. Use fake protectors and file-policy providers in ordinary
tests. The real provider uses guest-machine DPAPI LocalMachine and requires an
exact non-inherited SYSTEM/Administrators DACL before publication. Do not call it
from the host against an offline guest overlay: LocalMachine DPAPI must execute
inside the target guest. Do not add plaintext fallback or silently migrate
`channel-secret.txt`; a guest LocalSystem conversion requires its own reviewed,
consumed-seed, deletion, restart, and failure-injection slice.

The seed converter is invoked only by the explicit
`--field-protect-channel-secret C:\Exosuit\Config\guest-runtime.json` command.
Do not invoke it automatically from ordinary KVP startup and do not interpret
malformed JSON as a legacy seed. The command must retain its literal-path,
LocalSystem-before-read, bounded strict JSON, exact Field/generation/key/path
derivation, and metadata-only output rules. The guest KVP emitter must use
`ProtectedFieldKvpSecretReader`; never restore its former `File.ReadAllText`
fallback. Provisioning and startup must remain held until a separate transaction
can run the protection command, verify the envelope, start the emitter, and
record restart/failure evidence. Treat atomic replacement as namespace removal,
not secure erasure; disposable overlay destruction and storage-retention policy
remain part of secret retirement.

Guest-machine DPAPI and host verification secrets are separate protection
domains. Do not copy guest ciphertext to the host or teach the host observer to
decrypt it. The host store requires its own reviewed protection and rotation
implementation.

## Teach Mode requirements

Teach Mode is a privacy-sensitive subsystem.

Before adding a recorder:

- define the exact source stream,
- define why each field is needed,
- define sampling rate and storage budget,
- define redaction,
- define consent and visible indicator,
- define stop behavior,
- define retention and deletion,
- define how source fact differs from model inference,
- add positive, denial, overflow, cancellation, and corruption tests.

The recorder must never infer consent from task text or model output.

## Demonstration data laws

1. Raw events are immutable after episode completion except through a versioned migration.
2. Semantic steps are derived artifacts and retain source-event references.
3. Inferred reasons include confidence and are not rewritten as owner statements.
4. Mistakes and corrections are labeled, not silently removed.
5. Events remain ordered and bounded.
6. Secret-shaped keys are redacted before persistence or transport.
7. Visual bytes are governed separately from metadata.
8. Episodes are scoped to one operator and Field generation.
9. Deleted episodes must be removed from indexes and future retrieval.
10. Training export requires an explicit owner action and manifest.

## Visual sensor requirements

Visual capture is not enabled by the foundation slice.

Before implementation:

- update the critical privacy audit,
- use active-window or region scope before full desktop,
- provide a visible capture indicator,
- cap frame rate and frame count,
- redact known sensitive regions,
- avoid raw bytes in normal audit logs,
- zero or dispose buffers where practical,
- test blank/protected surfaces,
- test DPI and resolution changes,
- test capture stop independently of the pilot.

## Input recording requirements

Low-level input hooks can expose sensitive information and must be limited to the guest Field session.

Required protections:

- never hook the host desktop,
- bind events to Field and session identity,
- record key timing separately from secret text,
- suppress or redact credential-field content,
- stop hooks on consent expiry, lifecycle exit, lock, or emergency stop,
- prove uninstall/unhook on abnormal shutdown,
- cap event queue and fail closed on overflow.

## Personal model boundaries

Personal models may influence:

- task ordering,
- target selection,
- mouse trajectory,
- scrolling,
- shortcut preference,
- typing/editing process,
- language style,
- contextual timing,
- recovery preference.

They may not weaken:

- Field isolation,
- action scope,
- secret denial,
- verification,
- deadlines,
- emergency stop,
- audit identity,
- actor disclosure where required.

## Testing doctrine

Follow Parts & Pieces Atomic Audit and Question Everything discipline.

Every new Field schema requires:

- valid example,
- malformed example,
- boundary values,
- duplicate/stale identity case,
- persistence round-trip where applicable,
- cross-language fixture where shared with the Windows agent.

Every state machine requires:

- all allowed transitions,
- all forbidden direct transitions,
- repeated transition behavior,
- failure state behavior,
- restart or hydration behavior,
- terminal-state behavior.

Every recorder requires:

- consent required,
- ordering,
- redaction,
- limits,
- cancellation,
- completion,
- corruption handling,
- deletion/index cleanup.

## Evidence levels

Use these exact classes:

- `static_inspection`
- `typescript_unit`
- `dotnet_unit`
- `fake_integration`
- `windows_guest_manual`
- `windows_guest_automated`
- `hyperv_host_guest`
- `chatgpt_mcp_connected`
- `owner_accepted`
- `production_candidate`

Do not describe lower evidence using a higher label.

## Required Field change report

Every meaningful Field change gets a new engineering log containing:

```text
Timestamp
North Star goal
Subsystem ownership
Files changed
Parts & Pieces patterns considered
Questions and assumptions
Threat and privacy impact
Tests added
Commands actually run
Exact results
Evidence level
Unvalidated behavior
Rollback/disable path
Next slice
```

## Rollback law

Every Field capability must be independently disableable.

Examples:

- turn off recording without disabling observation,
- turn off visual capture without disabling UI Automation,
- turn off personal motor profiles and return to deterministic motor,
- disable Pilot while retaining Teach and Shadow,
- reject a base image without deleting personal state,
- destroy a task disk without deleting audit evidence.

## Definition of done for a Field GitHub slice

- subsystem ownership is explicit,
- contracts and docs agree,
- positive and negative tests exist,
- TypeScript typecheck/tests/build pass,
- .NET build/tests pass where changed,
- repository validator passes,
- Parts & Pieces traceability is updated,
- Level 4 addendum is updated when security/privacy/execution changes,
- local and live evidence gaps are explicit,
- rollback exists,
- no live capability claim exceeds evidence.

## Definition of done for live Field capability

In addition to GitHub completion:

- dedicated disposable Windows VM used,
- exact image and task-disk hashes recorded,
- Field identity and attestation verified,
- guest agent runs inside the session,
- host cursor is not the control architecture,
- display contract verified,
- emergency stop physically tested,
- stale/wrong generation denied,
- recording consent and indicator tested,
- privacy inspection completed,
- audit chain verified,
- owner reviews evidence.
