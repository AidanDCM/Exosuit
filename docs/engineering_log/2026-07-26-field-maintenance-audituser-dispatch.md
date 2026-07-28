# Field maintenance Audit Mode dispatch

## Goal

Remove the Windows Setup deadlock in which the synchronous `auditUser` bootstrap waited for a SYSTEM task that Task Scheduler kept queued until the setup pass could finish.

## Files changed

- `scripts/windows/Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1`
- `tests/windowsFieldScripts.test.ts`
- `apps/windows-agent.Tests/FieldChannelFoundationTests.cs`
- `docs/qa/ATOMIC_AUDIT_2026-07-26_FIELD_MAINTENANCE_PRINCIPAL.md`
- `docs/engineering_log/2026-07-26-field-maintenance-audituser-dispatch.md`

## Parts & Pieces and donor patterns considered

The supported `/RU SYSTEM` task, fixed action, exact registered SID/action check, independent maintenance-side SYSTEM check, expiring authorization, digest binding, detached network, bounded host wait, receipt, and offline promotion checks remain. The bootstrap now returns immediately after validated on-demand dispatch so Windows Setup can complete its synchronous pass. Task settings explicitly allow VM power conditions and start-when-available. A detached helper, permanent service, password, remote channel, and broader guest authority were rejected.

## Tests added or updated

The script contract requires SYSTEM creation and start, battery-safe VM settings, start-when-available, immediate bounded status capture, and absence of the prior receipt wait. Full validation exposed a pre-existing nondeterministic signature-tamper test that changed unused trailing Base64URL bits; it now mutates the first encoded character so authenticated bytes always differ.

## Commands actually run

```text
PowerShell parser over Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1
npx vitest run tests/windowsFieldScripts.test.ts --reporter=verbose
npm run typecheck
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --filter FullyQualifiedName~FieldChannelFoundationTests.Authenticated_channel_rejects_tampering_expiry_direction_and_replay --no-restore
npm test
npm run build
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
npm run test:pulse -- --reporter=verbose
npm run test:field-pulse -- --reporter=verbose
```

## Results

The preceding live attempt proved `principalUserId=SYSTEM`, `principalLogonType=ServiceAccount`, `state=Queued`, `lastResult=0`, no maintenance-stage file, retained authorization, no receipt, host timeout, and no immutable target. The replacement script parses, all 6 focused Field script tests pass, the deterministic .NET tamper test passes, all 240 TypeScript tests pass, typecheck and build pass, all 44 .NET tests pass, and both system pulses pass.

## Assumptions and unvalidated areas

After the synchronous `auditUser` command returns, Task Scheduler processes the already accepted on-demand request and launches the fixed action as SYSTEM. Live execution, maintenance stages, Sysprep shutdown, receipt validation, and promotion remain unvalidated.

## Security impact

Authority is unchanged and remains local, fixed, one-use, digest-bound, time-bound, and network detached. Returning from bootstrap removes a scheduling deadlock; it does not bypass policy or host verification. The host still refuses promotion without a matching offline receipt.

## Rollback or disable path

Do not inject the authorization or answer file. Stop and remove only the exact v12 maintenance VM and staging disk after verifying binding. Revert this slice to restore the bounded bootstrap wait. Immutable v10 remains untouched.

## Next recommended slice

Run focused and mandatory validators, commit, execute exact-head L0, and make one isolated live v12 attempt under the recovery mutex.
