# Field guest-readiness foundation

## Goal

Implement the narrow source path required to package a guest runtime, bootstrap it inside a Field, exchange authenticated handshake/bootstrap/heartbeat records without a network listener, and deny readiness until bootstrap, desktop, policy, attestation, identity, generation, and heartbeat agree.

## Files changed

- `apps/windows-agent/Program.cs`
- `apps/windows-agent/FieldKvpRuntime.cs`
- `apps/windows-agent.Tests/FieldKvpRuntimeTests.cs`
- `src/fieldLiveReadiness.ts`
- `tests/fieldLiveReadiness.test.ts`
- `scripts/verify-field-live-readiness.mjs`
- `scripts/windows/Initialize-ExosuitFieldGuest.ps1`
- `scripts/windows/Install-ExosuitFieldGuest.ps1`
- `scripts/windows/Start-ExosuitFieldGuest.ps1`
- `scripts/windows/Read-ExosuitFieldGuestKvp.ps1`
- `scripts/windows/SetupComplete-ExosuitFieldGuest.cmd`
- `tests/windowsFieldScripts.test.ts`
- `scripts/validate-field.mjs`
- `docs/FIELD_IMPLEMENTATION_STATUS.md`
- `docs/engineering_log/2026-07-23-field-guest-readiness-foundation.md`

## Parts & Pieces and donor patterns considered

- Existing TypeScript and .NET canonical Field channel, replay, heartbeat, bootstrap, policy, and attestation contracts.
- Existing guarded Windows provisioning/bootstrap scripts.
- Microsoft Hyper-V Data Exchange/KVP documentation for guest registry and host WMI access.
- Hyper-V sockets were considered but rejected for this slice because they require a larger custom socket-service registration and endpoint implementation. KVP is sufficient for bounded small readiness records and uses VMbus without network connectivity.
- PowerShell Direct and VMConnect/RDP control were rejected as the runtime transport because they would conflate host administration/viewing with the guest-local Glove agent.

## Tests added or updated

- .NET signed guest envelope round trip with persistent replay rejection.
- .NET weak-secret and invalid-runtime-configuration denial.
- TypeScript full readiness promotion only when bootstrap, heartbeat, identity, policy, and attestation agree.
- TypeScript denial for locked desktop, stale generation, and policy substitution.
- Windows script contract tests for SYSTEM startup, KVP WMI retrieval, signed-envelope verification, no network downloader/listener, and no arbitrary PowerShell evaluation.
- Field repository validator now requires the new source/tests/scripts.

## Commands actually run

- Read all mandatory repository/security/test documents and the latest QA record.
- Queried Microsoft’s current official Hyper-V KVP documentation.
- `dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release -warnaserror`
- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release -warnaserror --filter FullyQualifiedName~FieldKvpRuntimeTests`
- `npm test -- --run tests/fieldLiveReadiness.test.ts`
- `npm run typecheck`
- `npm test -- --run tests/fieldLiveReadiness.test.ts tests/windowsFieldScripts.test.ts`
- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release -warnaserror --filter "FullyQualifiedName~FieldKvpRuntimeTests|FullyQualifiedName~FieldChannelFoundationTests"`
- `npm run validate:repository`
- `npm run validate:field-contract`
- `npm run build`
- `git diff --check`

## Results

- .NET warnings-as-errors build passed.
- Focused .NET runtime tests passed 2/2, then combined KVP/channel tests passed 8/8.
- Focused TypeScript live-readiness tests passed 2/2.
- Combined TypeScript readiness/Windows-script tests passed 8/8.
- TypeScript strict checking and build passed.
- Repository and Field contract validators passed before the validator inventory was expanded; the expanded validator will be rerun before commit.
- The guest runtime emits signed handshake, bootstrap-status, and heartbeat envelopes through Hyper-V KVP and the host verifies them through the existing durable replay guard.
- No guest network listener, host desktop access, input authority, recording, credential flow, or secret logging was added.

## Assumptions and unvalidated areas

- Microsoft documents KVP as small string data over VMbus; live envelope size and propagation behavior remain to be measured.
- The runtime uses a SYSTEM startup task and reads a per-generation secret file. The operational slice must set restrictive ACLs and prove the secret is absent from evidence.
- Secure Desktop detection currently treats an active-session `consent.exe` process as the supported signal. Broader secure-desktop failure injection remains required.
- The base-image packaging, Windows OOBE completion, SetupComplete execution, live KVP records, guest display, and ready transition remain unvalidated until the next live slice.
- Key rotation, host-to-guest commands, emergency channel, shutdown, guest crash/restart, and heartbeat-pause failure injection remain L2 work even if the initial readiness pulse passes.

## Security impact

The implementation preserves exact Field generation/direction/key/sequence/message/nonce/payload/expiry/signature checks and durable replay state. KVP travels over VMbus and does not create inbound guest networking. Readiness joins only authenticated data and fails closed for missing, locked, secure, stale, substituted, expired, or cross-generation inputs. Secrets are read from local files and never emitted.

## Rollback or disable path

Remove the `ExosuitFieldGuest` scheduled task from the disposable guest, stop the guest runtime, revoke/delete the per-generation channel and attestation secret files, remove host replay state, and destroy the disposable Field generation. Revert this commit to remove the runtime and readiness join. Do not promote the previous base image to guest-ready.

## Next recommended slice

Run full L0 on the clean commit. Publish a self-contained Windows guest binary, create and seal base generation v2 with the reviewed scripts and SetupComplete hook, inject per-generation manifests/configuration/secrets into only the writable overlay, complete synthetic Windows setup, then capture and verify live handshake, bootstrap, heartbeat, policy, attestation, display, and readiness evidence before destroying the generation.
