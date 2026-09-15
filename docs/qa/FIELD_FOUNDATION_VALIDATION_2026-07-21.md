# Field Foundation Validation Evidence — 2026-07-21

**Branch:** `agent/field-foundation`  
**Draft PR:** #11  
**Inspected head:** `f03c35ebf97e4bb487bf58fdbfc1582d3f813377`

## Repository scope at inspected head

The draft PR reported:

- 61 commits,
- 41 changed files,
- 7,140 additions,
- 115 deletions,
- mergeable draft state,
- base `build/exosuit-mvp`.

## Hosted workflow runs

### Exosuit CI

- Run ID: `29855159647`
- Conclusion: `failure`

Jobs:

| Job | Conclusion | Steps | Log URL |
|---|---|---|---|
| Required manuals and safety files | failure | none / null | none |
| TypeScript contracts, gateway, and pulse | failure | none / null | none |
| Windows agent build and pure tests | failure | none / null | none |

### Security Audit

- Run ID: `29855159869`
- Conclusion: `failure`

Jobs:

| Job | Conclusion | Steps | Log URL |
|---|---|---|---|
| npm dependency vulnerability audit | failure | none / null | none |
| NuGet dependency vulnerability audit | failure | none / null | none |
| CodeQL C# | skipped for private repository | none / null | none |
| CodeQL JavaScript/TypeScript | skipped for private repository | none / null | none |

## Classification

The failure occurred before checkout or any repository command. GitHub returned no job steps and no log URLs for the runnable jobs.

Therefore this evidence means:

- repository source was **not compiled** by these runs,
- tests were **not executed** by these runs,
- repository safety validation was **not executed** by these runs,
- dependency audits were **not executed** by these runs,
- the code is **not proven failing**,
- the code is **not proven passing**,
- hosted validation is **blocked by runner/account infrastructure**.

## Required executable validation

On a functioning Node/Linux or Windows environment:

```bash
npm install --ignore-scripts
npm run validate:repository
npm run typecheck
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
```

On Windows with .NET 8:

```powershell
dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore -warnaserror
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build
```

Then attach:

- exact commit SHA,
- commands,
- exit codes,
- complete diagnostics,
- test counts,
- coverage artifacts where available,
- repository-validator output,
- dependency-audit output.

## Promotion decision

**HOLD.** Keep PR #11 draft. Do not merge into `build/exosuit-mvp` or `main`, and do not enable live Field, recording, Shadow, Pilot, Hyper-V, or artifact transport behavior until executable validation and later subsystem-specific acceptance gates pass.
