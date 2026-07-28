# Field Manager State Persistence

## Goal

Prevent process restart from silently discarding Field lifecycle, policy-binding, and audit authority while preserving fail-closed behavior.

## Files changed

- `src/fieldRegistry.ts`
- `src/fieldManager.ts`
- `src/fieldManagerStore.ts`
- `tests/fieldManagerStore.test.ts`
- `scripts/validate-field.mjs`
- `package.json`
- Field status, test plan, traceability, handoff, and Level 4 audit documents

## Parts & Pieces and donor patterns considered

The existing `FileAgentRegistryStore` and checkpoint-store patterns supplied strict schemas, bounded files, create-new private temporary files, atomic rename, and corruption detection. The Field adaptation additionally preserves policy bindings and verifies the complete Field audit chain during hydration. The SHA-256 envelope is not represented as protection against a writer who can recompute it.

## Tests added or updated

- restart with lifecycle, policy binding, and audit preservation;
- tamper rejection before hydration;
- duplicate policy-binding rejection;
- broken audit-chain rejection;
- missing snapshot and file-size bounds;
- repository Field validator coverage and focused Field test command.

## Commands actually run and results

- `npm exec vitest run tests/fieldRegistry.test.ts tests/fieldManager.test.ts tests/fieldManagerStore.test.ts -- --reporter=verbose` — 11/11 passed.
- `npm run typecheck` — passed.
- `npm run validate:field-contract` — passed, 73 artifacts and 21 source modules.
- `npm run validate:typescript` — passed: 57 files, 288/288 tests, build, Glove pulse, and Field pulse.
- `$env:PATH = \"$env:USERPROFILE\\.dotnet;$env:PATH\"; dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release` — passed: 44/44.

## Assumptions and unvalidated areas

The local filesystem supplies same-directory rename semantics. No claim is made that a future live Hyper-V effect and snapshot update are atomic. Crash injection, Windows ACL inspection, keyed state authentication, and live reconciliation remain unvalidated.

## Security impact

Positive: restart no longer has to reconstruct authority from incomplete process memory, and corrupt state fails closed. No permissions, live providers, recording, input, or mode defaults were enabled.

## Rollback or disable path

Stop using the store and construct an empty fake-provider manager, or revert this slice. Existing Field runtime defaults remain denied.

## Next recommended slice

Add explicit uncertain-effect reconciliation and transactional checkpoint orchestration before connecting a supported Hyper-V provider.
