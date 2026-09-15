# Field supported OOBE contract

## Goal

Replace unsupported Windows OOBE skip flags after a fresh v16 disposable Field failed during `oobeSystem`, while preserving isolated, credential-free development provisioning.

## Files changed

- `scripts/windows/Invoke-ExosuitFieldProvisioning.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/engineering_log/2026-07-29-field-supported-oobe-contract.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-29_FIELD_SUPPORTED_OOBE_CONTRACT.md`

## Parts & Pieces and donor patterns considered

The existing signed plan, four-file seed allowlist, offline overlay injection, fixed specialize initializer, standard local development account, isolated switch requirement, no-personal-state requirement, and production rejection of development access remain unchanged. Microsoft Windows unattended OOBE page configuration is the platform donor pattern. The unsupported `SkipMachineOOBE` and `SkipUserOOBE` shortcuts are removed; the supported `HideOEMRegistrationScreen` page setting is added alongside the existing locale, EULA, online-account, wireless, and privacy settings.

## Evidence that led to the change

A clean v16 base was built from exact commit `23bec953a9283bcf044a81ead16118f5da081969`, then a fresh isolated disposable generation was provisioned. The VM displayed Windows' setup-restart failure dialog and never produced authenticated KVP. Bounded read-only offline inspection proved:

- the development initializer completed and consumed its password seed;
- `ExosuitDev` is the configured auto-logon identity;
- no plaintext Winlogon password value exists;
- the LocalSystem automatic runtime service has its canonical command;
- Windows remained in OOBE/setup phase 4 with child `setup.exe` status 1;
- UnattendGC recorded `0x80004005`; and
- the offline image state is `IMAGE_STATE_UNDEPLOYABLE`.

The overlay was dismounted and remained detached. No setup-state registry value was modified.

Microsoft's official Automate OOBE guidance explicitly warns not to use `SkipMachineOOBE` and instead lists supported page configuration, including `HideOEMRegistrationScreen`.

## Tests added or updated

The Windows Field script-contract test now requires `HideOEMRegistrationScreen`, requires the fail-closed skip-flag guard, extracts the generated answer-file template, and rejects either OOBE skip flag in that template.

## Commands actually run and results

- `npm test -- tests/windowsFieldScripts.test.ts` — passed, 8/8.
- PowerShell parser over `Invoke-ExosuitFieldProvisioning.ps1` — passed.
- `npm run validate` — repository validator passed 71 artifacts; plan validator passed; Field validator passed 84 artifacts and 26 source modules; typecheck passed; 314/314 TypeScript tests passed; production build passed; system pulse passed; Field full-chain fake pulse passed. The combined command then failed only because the shell resolved a hostfxr-only `dotnet` installation and reported no SDK.
- `C:\Users\Aidan\.dotnet\dotnet.exe test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --warnaserror` with the verified per-user SDK path prepended — passed, 48/48, SDK 8.0.423, zero warnings-as-errors.

The source gate is green. Exact-commit elevated L0 and fresh Windows live acceptance remain pending until after commit.

## Assumptions and unvalidated areas

Static validation cannot prove this Windows edition will complete OOBE using only supported page settings and the pre-created standard auto-logon account. A fresh immutable base generation and fresh disposable Field are required. The failed v16 child is not repairable and will not be reused as acceptance evidence.

## Security impact

The change removes unsupported setup bypass flags. It adds no credential to Unattend, no new account authority, network access, input authority, model permission, full-control route, or setup-state bypass. Development access remains non-production, isolated, disposable, standard-user, and rejected by production validation.

## Rollback or disable path

Omit `developmentAccess` from the plan and omit `-DevelopmentAccess` during apply. Reverting this slice restores the prior template but also restores the live-proven OOBE failure risk; it must not be used to approve a fresh Field.

## Next recommended slice

Run all repository gates, commit the repair, execute the exact-head L0 validator, build a fresh immutable v17 base from the reviewed source, provision a fresh disposable generation, and prove OOBE completion plus authenticated KVP readiness before any motor acceptance.
