# Field base deferred guest service start

## Goal

Prevent the Field guest runtime from starting during Windows `specialize`, before
`SetupComplete.cmd` has finished configuring disposable development access.

## Master-plan phase and promotion gate

Phase L3, guest bootstrap, readiness, and replacement. Promotion remains denied
until a new immutable base and a fresh generation complete Windows Setup,
authenticated KVP, heartbeat, identity, display, policy, and attestation checks.

## Subsystem ownership

Field-owned environment provisioning and guest bootstrap. This does not alter
Glove policy or execution authority.

## Files changed

- `scripts/windows/Install-ExosuitFieldGuest.ps1`
- `scripts/windows/Invoke-ExosuitFieldBaseMaintenance.ps1`
- `scripts/windows/Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1`
- `scripts/windows/Invoke-ExosuitFieldBaseAuditSeal.ps1`
- `tests/windowsFieldScripts.test.ts`
- `tests/documentedToolSurface.test.ts`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/FIELD_THREAT_MODEL.md`
- `docs/qa/FIELD_FAILURE_INJECTION_MATRIX.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-30_FIELD_BASE_DEFERRED_GUEST_SERVICE_START.md`
- this engineering log

## Identity, generation, and policy impact

No identity, generation, policy, attestation, transport, consent, recording, or
Glove authority changes. The exact failed generation is
`b9b7787f-7e49-40bc-995c-a6f4df1bd6eb`, generation 1. It is stopped and remains
negative evidence. A rebuilt or replacement Field must use a new identity or
generation and fresh credentials.

## Parts & Pieces and donor patterns considered

The existing two-stage Windows pattern remains the donor: the immutable image
contains a fixed LocalSystem service definition, while `SetupComplete.cmd`
finishes generation-specific configuration. The service is now staged as Manual
in the base. The existing installer is called again by SetupComplete with its
default Automatic mode and `-Start`. A delayed automatic service was rejected
because delay does not prove Windows Setup has left `specialize`.

## Questions and assumptions

- The causal finding is based on exact offline evidence: development access was
  configured and its marker written, Windows Setup then failed with Win32
  `0x13`, and Microsoft defines that result during registry shutdown as
  shutdown-in-progress.
- SetupComplete remains the only reviewed activation boundary for the runtime
  service in a deployed generation.
- The failed v19 image is not repaired or promoted by this source change.

## Tests added or updated

The Windows script contract test now requires the explicit Automatic/Manual
installer contract, denies starting a Manual service, requires maintenance to
stage Manual, and binds both SYSTEM and Audit receipts to
`ManualUntilSetupComplete`.

## Commands actually run

- `npm test -- --run tests/windowsFieldScripts.test.ts` — first run: 7/8 passed;
  one obsolete literal assertion failed after the reviewed parameterization.
- `npm test -- --run tests/windowsFieldScripts.test.ts` — passed, 8/8.
- `git diff --check` — passed.
- `npm run validate:repository` — passed, 71 required artifacts.
- `npm run validate:plan` — passed, 22 phased program sections.
- `npm run validate:field-contract` — passed, 84 artifacts and 26 modules.
- `npm run typecheck` — passed.
- `npm run test:field -- --reporter=verbose` — passed, 142/142.
- `npm run test:field-pulse -- --reporter=verbose` — passed, 1/1.
- `npm test -- --reporter=verbose` — initial run hit one 10-second
  `documentedToolSurface` setup-hook timeout; 311 passed and 3 were skipped.
- `npm test -- --run tests/documentedToolSurface.test.ts --reporter=verbose` —
  passed, 9/9.
- `npm test -- --reporter=verbose` — rerun passed, 314/314.
- `npm run build` — passed.
- `npm run test:pulse -- --reporter=verbose` — passed, 1/1.
- `dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj` — passed.
- `dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
  --configuration Release --no-restore -warnaserror` — passed with zero warnings
  and zero errors.
- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
  --configuration Release --no-build` — passed, 48/48.
- `./scripts/windows/Invoke-ExosuitFieldValidation.ps1` on commit `1ab25e4` —
  reached the full TypeScript suite, then reproduced the unrelated
  `documentedToolSurface` 10-second setup-hook timeout under post-`npm ci` load.
  The suite had passed 9/9 in isolation and the complete suite had passed
  314/314 outside the runner. Its setup deadline is now explicitly bounded at
  60 seconds; exact-head validation must be rerun after commit.

## Results and evidence class

Live negative evidence is `hyperv_host_guest`: the VM ran for about 4.25 hours
with Hyper-V heartbeat `No Contact`, KVP `Lost Communication`, and no Exosuit
handshake. Read-only offline inspection showed `IMAGE_STATE_UNDEPLOYABLE`,
`SystemSetupInProgress=1`, the runtime service present and Automatic, a
development-access marker, and Sysprep/Setup error `0x13`.

The source correction is `static_inspection`, `typescript_unit`,
`fake_integration`, and `dotnet_unit`. No passing live replacement is claimed.

## Assumptions and unvalidated areas

A new base build and clean generation are required to prove that Windows Setup
reaches SetupComplete, switches the service to Automatic, starts it, and emits
authenticated readiness. The current v19 target remains untrusted.

## Security and privacy impact

This narrows execution timing. No service runs during specialize, no permission
is expanded, no network is added, no input or recording is enabled, and no
secret is added to evidence. The pilot still cannot administer Fields or policy.

On session lock, Secure Desktop, heartbeat loss, replay, overflow, uncertain
effect, or emergency stop, existing fail-closed behavior is unchanged. This
slice touches the immutable-base build contract and disposable overlay only; it
does not touch personal state or task-disk contents.

## Rollback or disable path

Revert this slice and keep v19 unpromoted. Do not reuse the failed Generation 1.
The source change has no production runtime dependency.

## Next recommended slice

Run the focused and full validators, commit and publish the exact agent, build a
new immutable base from the reviewed donor, and boot one fresh isolated
generation. Do not promote the base until the canary generation completes
authenticated readiness.
