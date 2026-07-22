# Exosuit Field Windows and Hyper-V Runbook

**Status:** operational procedure written; commands not executed in this GitHub connector session  
**Applies to:** `agent/field-foundation` and later branches that preserve the Glove/Field boundary

## Purpose

This runbook is the exact safe order for validating and later creating a local Exosuit Field. A Field is a controlled Windows VM. The Glove is the agent and supervisor that operates inside it. Do not merge the two identities.

## Hard holds

Do not provision a live Field unless all of the following are true:

1. The exact branch head has passed `scripts/windows/Invoke-ExosuitFieldValidation.ps1`.
2. The host capability report returns `ready: true`.
3. The base VHDX and any personal-state VHDX are already present locally and their SHA-256 values match the host registry and provisioning plan.
4. The configured isolated switch is a Hyper-V **Private** switch.
5. The owner understands that the apply script creates and starts a VM but does not declare the Field ready.
6. Guest bootstrap, authenticated channel, heartbeat, display, policy, and attestation checks still have to pass after boot.
7. Real accounts, consequential targets, and normal personal-desktop use remain prohibited during acceptance.

## Required host software

- Windows 11 Pro, Enterprise, or Education, or a supported Windows Server edition
- Hyper-V enabled
- Hyper-V PowerShell module
- Firmware virtualization and SLAT
- Node.js 22+
- .NET 8 SDK
- Git
- PowerShell 7 is preferred; scripts avoid arbitrary evaluation and downloads

## Repository validation

From an elevated PowerShell session in the repository:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
./scripts/windows/Invoke-ExosuitFieldValidation.ps1
```

The script captures:

- environment metadata,
- exact Git branch and commit,
- dependency installation result,
- repository contract result,
- Field invariant validator result,
- TypeScript typecheck,
- focused Field tests,
- full Field fake-system pulse,
- full TypeScript tests and build,
- existing Glove system pulse,
- .NET restore/build/tests,
- read-only host capability check,
- per-step logs and a final JSON summary.

A successful run proves only source contracts, pure/fake behavior, compilation, tests, and host prerequisites on that machine. It does not prove interactive VM behavior.

## Host registry

Copy the example and edit only the approved paths and digests:

```powershell
Copy-Item ./vm/field-host-config.example.json ./vm/field-host-config.local.json
```

The local registry must identify:

- the immutable base image,
- optional encrypted personal-state disk,
- Field storage root,
- isolated private switch,
- later filtered-NAT switch if separately reviewed.

Do not commit the local registry if it contains private paths or machine-specific information.

## Provisioning plan review

Generate the plan through the TypeScript contract, then resolve it without mutation:

```powershell
./scripts/windows/Show-ExosuitFieldProvisioningPlan.ps1 `
  -PlanPath ./artifacts/field-plan.json `
  -HostConfigPath ./vm/field-host-config.local.json
```

Review the JSON output. It must show:

- Hyper-V Generation 2,
- immutable parent base image,
- disposable differencing OS overlay,
- separate disposable task disk,
- optional persistent personal-state disk,
- fixed memory and CPU constraints,
- Secure Boot,
- nested virtualization disabled,
- isolated or disabled network,
- clipboard, broad drive mapping, and host input injection disabled,
- artifact broker as the only planned file-transfer route.

## Dry-run apply

The apply script performs no mutation without `-Apply`:

```powershell
./scripts/windows/Invoke-ExosuitFieldProvisioning.ps1 `
  -PlanPath ./artifacts/field-plan.json `
  -HostConfigPath ./vm/field-host-config.local.json
```

Review the output and expected typed confirmation.

## Apply

Only after all prior checks:

```powershell
./scripts/windows/Invoke-ExosuitFieldProvisioning.ps1 `
  -PlanPath ./artifacts/field-plan.json `
  -HostConfigPath ./vm/field-host-config.local.json `
  -Apply `
  -TypedConfirmation 'CREATE FIELD <field-id> GENERATION <generation>'
```

The script:

1. reruns the host check;
2. verifies base and personal-state SHA-256 values;
3. confines every generated path below the configured Field storage root;
4. refuses filtered NAT until a reviewed enforcement provider exists;
5. requires a Hyper-V Private switch for isolated mode;
6. creates the per-generation directory;
7. creates a disposable differencing OS overlay;
8. creates a disposable task disk;
9. creates a Generation 2 VM;
10. applies CPU, memory, Secure Boot, checkpoint, TPM, and network settings;
11. attaches only the approved disks;
12. starts the VM;
13. records evidence;
14. attempts bounded rollback if provisioning fails.

The resulting state is `started_pending_guest_validation`, not `ready`.

## Guest bootstrap

Inside the guest, with the manifest and its externally calculated digest:

```powershell
./Initialize-ExosuitFieldGuest.ps1 `
  -ManifestPath C:\Exosuit\Config\bootstrap-manifest.json `
  -ManifestDigest '<64-character-sha256>'
```

Bootstrap checks identity, exact directory layout, display dimensions, agent binary presence, policy-hash shape, session lock state, and channel-key identity. It deliberately leaves Secure Desktop and heartbeat checks failed until the running guest agent confirms them.

## Readiness sequence

A Field becomes ready only after the host validates:

1. bootstrap report identity and manifest digest;
2. authenticated channel handshake;
3. replay-resistant sequence state;
4. fresh heartbeat from the expected agent and boot ID;
5. unlocked session;
6. Secure Desktop inactive;
7. fixed display contract;
8. policy hash and attestation;
9. guest agent health;
10. Field Manager transition to `ready`.

## Teach acceptance

Teach Mode requires:

- local owner administration authority,
- explicit consent,
- visible recording indicator,
- `inputInjectionAllowed: false`,
- source allowlist,
- encrypted terminal episode storage,
- event/timestamp integrity,
- stop, pause, abort, and fault behavior,
- deletion test,
- no credential or inline visual-byte leakage.

## Shadow acceptance

Shadow Mode requires:

- no guest input commands,
- every prediction marked `executionAllowed: false`,
- exact observation and Field-generation binding,
- comparison against the actual owner action,
- owner-readable accuracy and timing metrics,
- no promotion to Pilot based solely on aggregate accuracy.

## Pilot acceptance

Pilot Mode remains held until:

- guest command authorizer is integrated into the running Windows agent,
- exact policy ID/hash and scene-version recheck occurs immediately before action,
- emergency stop is physically tested,
- wrong-window and stale-scene cases stop,
- failure reconciliation prevents blind retry,
- action and runtime budgets stop execution,
- artifact transfer uses live reparse-point inspection,
- owner accepts the exact workflow evidence.

## Destroying one Field generation

Use only the bounded destruction script:

```powershell
./scripts/windows/Remove-ExosuitFieldGeneration.ps1 `
  -FieldId '<field-id>' `
  -FieldGeneration <generation> `
  -HostConfigPath ./vm/field-host-config.local.json `
  -TypedConfirmation 'DESTROY FIELD <field-id> GENERATION <generation>'
```

It may remove only:

- the named VM registration,
- that generation's disposable OS overlay,
- that generation's disposable task disk,
- files beneath that exact generation directory.

It must not remove the base image or personal-state registry objects. It refuses deletion through a reparse point.

## Emergency handling

If authentication, replay, boot identity, attestation, display contract, or task-disk integrity fails:

1. freeze input;
2. stop the Field;
3. preserve diagnostics that do not contain private content;
4. destroy disposable generation state;
5. increment `fieldGeneration`;
6. reprovision;
7. require owner review where specified by `FieldRecoveryPlanner`.

If emergency stop itself fails, do not automate recovery. Treat it as release-blocking and require owner intervention.

## Evidence closeout

For every local acceptance run, preserve:

- branch and commit SHA,
- validation summary and logs,
- host capability report,
- provisioning plan and hash,
- apply/destroy evidence,
- sanitized support bundle,
- Field and Glove audit-chain verification,
- exact failed checks,
- screenshots only when separately consented and stored under visual policy,
- owner verdict.
