# Unify Glove and Field development lines

**Timestamp:** 2026-07-28  
**Branch:** `codex/unify-glove-field`  
**Evidence level:** working-tree TypeScript/.NET/fake integration; exact-head validation pending

## Goal

Consolidate the separately developed Glove and Field lines into one review branch without broadening execution, recording, policy, or administration authority. Restore dependency reproducibility and make the repository safety scan cover every implementation module.

## Subsystem ownership

- Glove retains MCP composition, desktop policy/execution, workflow, verification, audit, and stop authority.
- Field retains VM/storage lifecycle, environment identity, guest channel/readiness, consent-bound teaching foundations, and Field evidence.
- Shared changes are limited to build, validation, documentation, and authenticated boundary contracts.

## Files changed

- merged the Field source, tests, Windows guest runtime, Hyper-V scripts, manuals, audits, fixtures, and validators;
- resolved `.github/workflows/ci.yml`, `README.md`, `docs/MASTER_SYSTEM_ROADMAP.md`, `package.json`, `src/safety.ts`, `tests/coordinatorMcp.test.ts`, and `scripts/validate-repository.mjs` conflicts;
- added and refreshed `package-lock.json`;
- changed `.github/workflows/ci-selfhosted.yml` and `scripts/ci-parity.mjs` to `npm ci`;
- made `scripts/validate-repository.mjs` discover every `src/*.ts` module;
- reconciled Field status/manuals and the engineering handoff with executed evidence.

## Parts & Pieces and donor patterns considered

- evidence source guard: pre-commit execution is recorded as working-tree evidence, not exact-head evidence;
- check runner/system pulse: retained both Glove and Field pulses;
- command broker: no arbitrary shell was added to MCP or Field contracts;
- approval gate: no model or coding agent approval was converted into owner consent;
- rollback and path-scope doctrines: source lines and runtime enablement remain separately recoverable.

## Questions and assumptions

- The complete Field branch is treated as intentional development history because it passed its own exact-head L0 gate at `e10e921`.
- The Glove `core` MCP surface remains the safest default; coordinator tools remain explicit opt-in.
- `HyperVisorPresent: true` plus running Hyper-V services is stronger host evidence than the misleading processor firmware flag once the hypervisor owns virtualization extensions.
- GitHub account billing remains an external hosted-CI block and is not addressed in code.

## Threat and privacy impact

- No live authority was enabled.
- Dependency installation is deterministic and the locked graph has zero known npm audit findings at the run time.
- The MCP SDK floor is `^1.30.0`; the lock resolves `@hono/node-server` 2.0.12 instead of the vulnerable 1.19.14 graph.
- The repository scan can no longer omit new top-level TypeScript modules because of a stale hand-written list.
- Teach, visual capture, Assisted, Pilot, owner acceptance, and production remain denied.

## Tests and commands actually run

```powershell
npm ci --ignore-scripts --fund=false
npm run validate:typescript
npx vitest run tests/documentedToolSurface.test.ts --reporter=dot
npm run validate:typescript
& "$env:USERPROFILE\.dotnet\dotnet.exe" restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
& "$env:USERPROFILE\.dotnet\dotnet.exe" build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore -warnaserror
& "$env:USERPROFILE\.dotnet\dotnet.exe" test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

## Results

- locked install: 146 packages, 0 vulnerabilities;
- first merged TypeScript run: one documentation contract failure because the merge displaced the `Current MCP surface` heading; 279 other tests passed;
- focused regression after repair: 9/9 passed;
- complete TypeScript rerun: 56 files, 280/280 tests passed; repository, plan, and Field validators passed; typecheck/build and both pulses passed;
- .NET: restore passed, Release `-warnaserror` build passed with 0 warnings/0 errors, 44/44 tests passed.

## Unvalidated behavior

- the merge commit does not yet exist, so exact-head and clean-checkout evidence is pending;
- hosted Linux/Windows Actions are blocked by account billing;
- no new live Hyper-V, guest, recording, visual, Shadow, Pilot, real-account, or production behavior was run;
- earlier v13 live development evidence is not repeated production evidence.

## Rollback or disable path

- return Glove development to `build/exosuit-mvp` at `4411568`;
- return Field development to `codex/issue-20-personal-disk-identity` at `e10e921`;
- keep runtime defaults at fake provider, `core` MCP surface, Windows observe mode, physical input disabled, recording disabled, and Pilot denied.

## Next recommended slice

Commit this integration, execute the exact-head Field validator and clean CI-parity matrix, then publish a sanitized evidence update before changing security-sensitive runtime code.

