# Field development unattended Windows setup

## Goal

Remove the manual Windows OOBE dependency from disposable Field development generations so a reviewed guest can reach its desktop, startup task, authenticated channel, and PowerShell Direct validation without repeated owner interaction.

## Files changed

- `src/fieldProvisioningPlan.ts`
- `scripts/windows/Invoke-ExosuitFieldProvisioning.ps1`
- `scripts/windows/Initialize-ExosuitDevelopmentAccess.ps1`
- `scripts/windows/SetupComplete-ExosuitFieldGuest.cmd`
- `scripts/validate-production-readiness.mjs`
- `tests/fieldProvisioningPlan.test.ts`
- `tests/windowsFieldScripts.test.ts`
- `tests/productionReadinessValidator.test.ts`
- `docs/qa/production-readiness.json`
- `docs/FIELD_WINDOWS_RUNBOOK.md`
- `artifacts/field-l4-v6-boot/Create-V6Generation1.mjs` (local ignored evidence helper)

## Parts & Pieces and donor patterns considered

The existing signed provisioning-plan, exact seed allowlist, offline differencing-overlay injection, setup-complete hook, and development-access initializer were reused. Windows unattended `specialize` and `oobeSystem` passes were used as the platform donor pattern. No external executable or broad guest-management channel was added.

## Tests added or updated

- The plan requires the exact `unattended_disposable`, `en-US`, and `Eastern Standard Time` development setup contract.
- Invalid setup values fail schema validation.
- Script-contract tests require the credential-free answer-file guard, specialize initializer, OOBE completion settings, no-restart initializer mode, and answer-file cleanup.
- The production validator separately rejects development unattended setup.

## Commands actually run

```text
npm run typecheck
npx vitest run tests/fieldProvisioningPlan.test.ts tests/windowsFieldScripts.test.ts tests/productionReadinessValidator.test.ts
PowerShell parser over Invoke-ExosuitFieldProvisioning.ps1 and Initialize-ExosuitDevelopmentAccess.ps1
npm test
npm run build
C:\Users\Aidan\.codex\cache\dotnet-sdk-8\dotnet.exe test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
npm run test:pulse
npm run test:field-pulse
```

## Results

- TypeScript typecheck passed.
- 17 focused tests passed.
- 240 full TypeScript tests passed.
- TypeScript build passed.
- 44 .NET tests passed.
- Glove system pulse passed.
- Field system pulse passed.
- Both changed PowerShell scripts parsed without errors.
- Live v8 evidence identified the blocker: the VM reached Windows OOBE country selection, PowerShell Direct rejected the not-yet-configured profile, and the guest KVP handshake was absent.

## Assumptions and unvalidated areas

- The Windows 11 image accepts the reviewed `specialize` and `oobeSystem` component settings.
- A fresh v9 base and generation are still required because v8 contains the older initializer without `-NoRestart`.
- Live proof of desktop arrival, answer-file cleanup, standard-user status, PowerShell Direct, KVP, policy, and attestation remains pending.

## Security impact

The answer file contains no credential, password, channel secret, token, or arbitrary plan-supplied command. The only synchronous command is a fixed path to the reviewed initializer. The feature remains restricted to isolated, disposable Fields without personal state and requires both a signed plan field and an explicit host apply switch. Production validation fails if either development auto-login or unattended setup is enabled.

## Rollback or disable path

Omit `developmentAccess` from the plan and omit `-DevelopmentAccess` during apply. Destroy the disposable generation with the reviewed generation-removal command. Revert this slice to remove unattended development setup entirely.

## Next recommended slice

Build reviewed base v9, create one fresh disposable development generation, and capture live proof for OOBE completion, desktop readiness, authenticated PowerShell Direct, KVP heartbeat, identity, display, policy, and attestation.
