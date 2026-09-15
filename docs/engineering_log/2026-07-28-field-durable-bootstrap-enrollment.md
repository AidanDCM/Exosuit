# Field durable bootstrap enrollment

## Goal

Prevent an already-authorized disposable Field generation from being bricked by its short-lived first-use bootstrap manifest after a normal reboot, without allowing an expired manifest to authorize first enrollment.

## Files changed

- `src/fieldBootstrap.ts`
- `tests/fieldBootstrap.test.ts`
- `scripts/windows/Initialize-ExosuitFieldGuest.ps1`
- `tests/windowsFieldScripts.test.ts`
- `apps/windows-agent/FieldKvpRuntime.cs`
- `apps/windows-agent.Tests/FieldKvpRuntimeTests.cs`
- `docs/FIELD_TEST_PLAN.md`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`
- `docs/engineering_log/HANDOFF.md`
- `docs/qa/ATOMIC_AUDIT_2026-07-28_DURABLE_BOOTSTRAP_ENROLLMENT.md`
- this log

## Parts & Pieces and donor patterns considered

The implementation adapts two existing repository patterns. `FieldChannelReplayGuard` supplies the precedent for durable state bound to exact Field/channel identity, while the one-use base-maintenance receipt supplies the precedent for converting a short-lived authorization into a durable, narrowly scoped record. The guest enrollment is bound to the complete manifest through its SHA-256 digest and carries the exact Field identity. It is written atomically only after the immutable identity, directory, display, and agent-digest checks pass inside the original authorization window.

Removing manifest expiry or simply extending every manifest for the life of a VM was rejected. Either approach would make an unused copied seed valid long after its intended first-use window. Treating the host's previous v13 evidence as if it had already created a marker was also rejected; the existing guest has no such durable record, so its reboot remains failed closed.

## Tests added or updated

- TypeScript accepts a reboot report after manifest expiry only with exact durable enrollment.
- TypeScript rejects wrong enrollment digest, wrong identity, and enrollment at or after expiry.
- Windows script contracts require a confined enrollment path, exact digest/identity checks, in-window enrollment, atomic replacement, and expired-first-use denial.
- .NET proves the authenticated KVP bootstrap payload preserves the enrollment record for host evaluation.

## Commands actually run

- `npm test -- --run tests/fieldBootstrap.test.ts tests/windowsFieldScripts.test.ts`
- `npm run typecheck`
- PowerShell AST parse of `scripts/windows/Initialize-ExosuitFieldGuest.ps1`
- `%USERPROFILE%\.dotnet\dotnet.exe test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release`
- `npm test -- --reporter=verbose`
- `npm run build`
- `npm run test:pulse -- --reporter=verbose`
- `npm run test:field-pulse -- --reporter=verbose`
- `npm run validate:repository`
- `npm run validate:plan`
- `npm run validate:field-contract`

## Results

- focused TypeScript: 12/12 passed;
- TypeScript strict typecheck: passed;
- PowerShell parse: passed;
- .NET: 45/45 passed;
- complete TypeScript suite: 313/313 passed;
- TypeScript build: passed;
- Glove system pulse: 1/1 passed;
- Field system pulse: 1/1 passed.
- repository safety validator: 71 required artifacts passed;
- master plan validator: 22 program sections passed;
- Field validator: 84 required artifacts and 26 source modules passed.

The live v13 monitor timed out without a fresh heartbeat after a controlled reboot and successful owner login. The host seed showed `expiresAt: 2026-07-27T16:54:27.688Z`; the guest restart occurred on 2026-07-28. This is negative live evidence for the old image, not live proof of the repair. Complete repository validation and replacement-generation evidence remain to be recorded below before promotion.

## Assumptions and unvalidated areas

The enrollment file relies on the existing guest ACL boundary that confines per-generation configuration to SYSTEM and Administrators. A local guest administrator can replace guest state and is outside the model authority boundary, but negative ACL and offline-tamper tests still belong in the production matrix. Crash behavior during the enrollment write, replacement-generation reboot, production authentication, key rotation, and snapshot rollback remain unproven live.

## Security impact

First use still fails closed at manifest expiry. An enrollment is accepted only when its manifest digest and identity match exactly and its recorded time falls inside the original manifest window. All runtime readiness checks, HMAC authentication, message expiry, persistent replay protection, display binding, session lock, Secure Desktop, policy, and attestation remain mandatory. No network listener, model permission, guest administrator, Remote Desktop right, input authority, or full-control path was added.

## Rollback or disable path

Revert this slice to restore the former behavior, which rejects every post-expiry reboot. Operationally, stop the `ExosuitFieldGuest` task or stop/destroy the disposable generation. Deleting a valid enrollment intentionally returns that generation to fail-closed behavior after manifest expiry; it does not authorize regeneration.

## Next recommended slice

Run the complete local gates, publish the self-contained Windows guest binary, build or update a disposable reviewed generation with the new script and binary, prove first enrollment before expiry, reboot after expiry or against an intentionally short test window, and verify fresh authenticated handshake, bootstrap enrollment, heartbeat, identity, display, policy, and attestation.
