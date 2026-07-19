# Windows acceptance fixture

## Goal

Provide a disposable, non-consequential Windows UI Automation target after local validation showed that the current Windows 11 Notepad editor exposes no writable `ValuePattern`.

## Files changed

- `apps/windows-agent.AcceptanceFixture/Exosuit.AcceptanceFixture.csproj`
- `apps/windows-agent.AcceptanceFixture/Program.cs`
- `docs/CODEX_HANDOFF.md`
- this engineering log

## Reuse and donor patterns

The fixture uses standard Windows Forms controls only. No donor implementation was copied. It preserves the fake-first/provider-interface architecture and exists solely as an interactive evidence target.

## Tests

The fixture must build with warnings as errors. Local acceptance must prove that its text box is discoverable through UI Automation, requires local review in scoped mode, executes only after approval, and verifies the exact value.

## Commands actually run

- `pnpm run typecheck`
- `pnpm test`
- `pnpm run build`
- `pnpm run test:pulse`
- `dotnet build apps/windows-agent.AcceptanceFixture/Exosuit.AcceptanceFixture.csproj --configuration Release -warnaserror`
- `dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj`

## Results

- TypeScript typecheck and build passed.
- All 34 TypeScript tests passed.
- The system pulse passed.
- The acceptance fixture built with zero warnings and zero errors.
- Independent Windows UI Automation inspection found one focused editable control named `Exosuit acceptance text` with automation ID `AcceptanceText`.
- All 26 .NET tests passed. NuGet vulnerability metadata retrieval emitted `NU1900` because the sandbox could not reach `api.nuget.org`; no clean vulnerability-audit result is claimed.
- Exosuit Windows-provider discovery, local approval, execution, exact-value verification, wrong-window denial, and missing-target denial passed against the fixture. Other Phase 1 categories remain unvalidated.

## Assumptions and unvalidated areas

Passing against this fixture does not validate modern Windows 11 Notepad. Notepad compatibility remains a separate open issue because its editor exposes a `Document` without writable `ValuePattern` on the tested account.

## Security impact

The fixture contains one empty disposable text field and no file, network, credential, screenshot, or persistence behavior. It does not expand Exosuit permissions.

## Rollback

Delete `apps/windows-agent.AcceptanceFixture`, revert the Phase 5 target in `docs/CODEX_HANDOFF.md`, and delete this log. No runtime code depends on the fixture.

## Next recommended slice

Complete scoped semantic-action evidence against the fixture, then design and review a modern-Notepad adapter or explicitly narrow the supported application matrix.
