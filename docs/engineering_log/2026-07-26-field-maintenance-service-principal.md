# Field maintenance SYSTEM service principal

## Goal

Make the one-use Field base maintenance dispatch preserve an explicit local SYSTEM service-account principal and retain enough bounded, non-sensitive stage evidence to diagnose any future guest timeout.

## Files changed

- `scripts/windows/Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1`
- `scripts/windows/Invoke-ExosuitFieldBaseMaintenance.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-26-field-maintenance-service-principal.md`

The exact v12 builder and collectors remain ignored local evidence artifacts under `artifacts/field-l4-base-build/v12/`.

## Parts & Pieces and donor patterns considered

The existing one-use task, SYSTEM SID, fixed action path, expiring authorization, digest binding, zero-network requirement, receipt, authorization consumption, and Sysprep shutdown contracts were retained. The prior task object construction was replaced with explicit Task Scheduler XML because live evidence serialized the requested SYSTEM principal as `InteractiveToken`. Microsoft documents both SYSTEM service-account task principals and `/RU SYSTEM`; explicit XML keeps the reviewed action and identity directly inspectable without a password, service, remote channel, or broader authority.

## Tests added or updated

The Windows script contract now requires explicit `S-1-5-18`, `ServiceAccount`, immediate registered-principal/action validation, error-preserving bootstrap status, and bounded maintenance stage markers through Sysprep dispatch.

## Commands actually run

```text
PowerShell parser over Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1 and Invoke-ExosuitFieldBaseMaintenance.ps1
npx vitest run tests/windowsFieldScripts.test.ts --reporter=verbose
npm run typecheck
npm test
npm run build
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
npm run test:pulse -- --reporter=verbose
npm run test:field-pulse -- --reporter=verbose
```

## Results

Live v12 evidence before this change proved `auditUser` executed, the one-use task existed, its exported principal used `InteractiveToken`, the bootstrap timed out after five minutes, the host timed out after twenty-five minutes, the authorization remained, no receipt existed, and no immutable v12 target was promoted. Task Scheduler operational logging was disabled, so the prior timeout overwrote the last task state; this change closes both gaps. Both PowerShell scripts parse, all 6 focused Field script tests pass, all 240 TypeScript tests pass, typecheck and build pass, all 44 .NET tests pass, and both system pulses pass.

## Assumptions and unvalidated areas

The explicit Task Scheduler XML is locally parsed and registered by Windows during Audit Mode. Live preservation of `ServiceAccount`, execution as `S-1-5-18`, maintenance completion, receipt verification, Sysprep shutdown, and v12 promotion remain unvalidated until the next isolated build.

## Security impact

Authority is not broadened. The task remains local, one-use, fixed to the reviewed maintenance script, passwordless only because it runs as built-in SYSTEM, and usable only inside a host-authorized, network-detached staging image. Status files contain timestamps, enum states, numeric results, and fixed stage names only; they exclude secrets, UI text, and personal data.

## Rollback or disable path

Do not inject the maintenance authorization or answer file. Remove only the exact v12 maintenance VM and staging disk after verifying its disk binding. Revert this slice to restore the previous task-object registration. Immutable v10 remains the recovery source.

## Next recommended slice

Run focused parser/tests, the mandatory validators and exact-head L0, rebuild v12 once under the recovery mutex, validate the offline receipt, and promote only a digest-matching read-only target.
