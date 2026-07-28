# Field sanitized bootstrap diagnostics

## Goal

Identify which pre-runtime guest bootstrap gate failed without reading or exporting guest logs, configuration contents, UI text, secrets, or unrestricted diagnostic evidence.

## Files changed

- `scripts/windows/Inspect-ExosuitFieldGuestOffline.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-28_SANITIZED_BOOTSTRAP_DIAGNOSTICS.md`
- this log

## Parts & Pieces and donor patterns considered

The change extends the existing read-only offline inspector rather than creating a second disk-mount path. It follows the support-bundle pattern of explicit field allowlists: only manifest digest, report timestamp, check name, pass/fail boolean, observation timestamp, and derived failed-check names leave the guest. Check summaries and evidence objects are intentionally excluded because future versions could contain UI or environment context.

Reading the runtime error log, copying the whole bootstrap report, mounting the running guest, PowerShell Direct with elevated guest credentials, and widening the standard guest account were rejected.

## Tests added or updated

The static contract requires the exact diagnostics path and allowlisted failed-check projection, while forbidding summary and evidence projection. Existing tests continue to require an off VM, read-only mount, bounded calls, no VM mutation, no log-content read, and guaranteed dismount.

## Commands actually run

- PowerShell AST parse of `scripts/windows/Inspect-ExosuitFieldGuestOffline.ps1`
- `npm test -- --run tests/windowsFieldScripts.test.ts`
- `npm run typecheck`
- `npm test -- --reporter=verbose`
- `npm run build`
- `%USERPROFILE%\.dotnet\dotnet.exe test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --no-restore`
- `npm run test:pulse -- --reporter=verbose`
- `npm run test:field-pulse -- --reporter=verbose`

## Results

- PowerShell parse: passed;
- focused static tests: 8/8 passed.
- TypeScript typecheck and build: passed;
- full TypeScript suite: 314/314 passed;
- .NET suite: 45/45 passed;
- core and Field system pulses: 1/1 passed each.

## Assumptions and unvalidated areas

The bootstrap report schema is produced by reviewed guest code. A malformed report fails the inspection rather than falling back to unrestricted output. Storage-provider failure injection and large/corrupt report behavior remain to be tested live.

## Security impact

This expands evidence only by a fixed metadata allowlist. It adds no write, start, stop, network, guest credential, input, or permission capability. Secrets, UI text, summaries, evidence objects, and log contents remain excluded.

## Rollback or disable path

Revert this slice or ignore the optional `bootstrapReport` object. The guest and runtime do not depend on diagnostic inspection.

## Next recommended slice

Run focused and broad validation, commit the inspector enhancement, rerun it against the off repaired v13 overlay, and use only the failed-check names to select the next repair.
