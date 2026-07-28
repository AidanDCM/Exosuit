# Field enrollment repair tool

## Goal

Provide a bounded development-only recovery path for an off disposable Field generation whose first-use manifest expired before the durable-enrollment fix was installed, without editing an immutable base, reading channel secrets, or allowing a model to self-authorize the mutation.

## Files changed

- `scripts/windows/Repair-ExosuitFieldGuestEnrollment.ps1`
- `tests/windowsFieldScripts.test.ts`
- `docs/FIELD_TEST_PLAN.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-28_ENROLLMENT_REPAIR_TOOL.md`
- this log

## Parts & Pieces and donor patterns considered

The tool adapts the exact generation-path derivation, bounded Hyper-V/Storage calls, reparse refusal, and guaranteed dismount pattern from `Inspect-ExosuitFieldGuestOffline.ps1`. It adapts the exact typed-confirmation and rollback confinement rules from provisioning and generation destruction. It adds transactional file swaps with per-file rollback and reviewed source digests because a writable diagnostic mount has a materially different risk from the canonical read-only inspector.

Using PowerShell Direct, adding the standard guest account to Administrators, granting Remote Desktop rights, bypassing manifest expiry, editing the immutable base in place, and copying a 151-KB framework-dependent apphost were rejected. The repair input is the clean-parity-validated self-contained `win-x64` executable.

## Tests added or updated

The Windows contract test requires exact local typed confirmation, an off VM, reviewed previous-manifest/agent/initializer hashes, refusal of existing enrollment, expired-first-use scope, read-write mount plus dismount, reparse refusal, rollback bookkeeping, no VM start/stop/removal, no channel-secret read, and no dynamic expression execution.

## Commands actually run

- PowerShell AST parse of `scripts/windows/Repair-ExosuitFieldGuestEnrollment.ps1`
- `npm test -- --run tests/windowsFieldScripts.test.ts`
- `npm run typecheck`
- `npm test -- --reporter=verbose`
- `npm run build`
- `npm run test:pulse -- --reporter=verbose`
- `npm run test:field-pulse -- --reporter=verbose`
- `%USERPROFILE%\.dotnet\dotnet.exe test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore`

## Results

- PowerShell parse: passed;
- focused static tests: 8/8 passed;
- TypeScript strict typecheck and build: passed;
- complete TypeScript suite: 314/314 passed;
- Glove and Field system pulses: passed;
- .NET: 45/45 passed.

Live execution and broad gates remain pending at the time this log is created.

## Assumptions and unvalidated areas

The operation is confined to a disposable development overlay and its matching machine-local seed. A host crash during a file swap can still require offline inspection and manual rollback from the transaction-specific `.rollback` file. Base-image replacement, production authentication, negative mount/dismount failure injection, and arbitrary host storage stacks remain unproven.

## Security impact

The script cannot start, stop, or delete a VM. It requires the exact VM already be off and requires an exact confirmation phrase that model text cannot satisfy on the owner's behalf. It reads no channel secret or password. The renewed manifest retains exact Field identity and policy binding while updating only its bounded first-use window and reviewed agent digest. A guest with an existing enrollment is refused rather than overwritten.

## Rollback or disable path

Do not pass `-Apply` to retain plan-only behavior. If a staged swap fails, the tool restores each completed target from its transaction-specific rollback file before dismount. The disposable generation can be destroyed without touching the immutable base or any personal-state disk. Revert this script and its tests to remove the recovery route.

## Next recommended slice

Run broad gates, commit the tool, gracefully stop the exact v13 guest, launch the repair through a visible elevated owner-confirmation window, inspect the evidence and hashes, start the guest, and collect fresh authenticated enrollment/readiness evidence.
