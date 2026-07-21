# Exosuit Field Validation Commands

Run from the repository root on the exact branch head.

## Cross-platform source validation

```bash
npm install --ignore-scripts --fund=false
npm run validate:repository
npm run validate:field-contract
npm run typecheck
npm run test:field -- --reporter=verbose
npm run test:field-pulse -- --reporter=verbose
npm test -- --reporter=verbose
npm run build
npm run test:pulse -- --reporter=verbose
```

## Windows/.NET validation

```powershell
dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj
dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore -warnaserror
dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build --logger "trx;LogFileName=windows-agent.trx" --collect:"XPlat Code Coverage"
```

## PowerShell parsing

```powershell
$errors = @()
Get-ChildItem scripts/windows/*.ps1 | ForEach-Object {
  $tokens = $null
  $parseErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$parseErrors) | Out-Null
  if ($parseErrors) { $errors += $parseErrors }
}
if ($errors.Count) { $errors; throw 'PowerShell parse errors found.' }
```

## Evidence-preserving full local validation

```powershell
./scripts/windows/Invoke-ExosuitFieldValidation.ps1
```

## Host prerequisites only

```powershell
./scripts/windows/Test-ExosuitFieldHost.ps1
```

## Claim rules

| Passing evidence | What may be claimed | What may not be claimed |
|---|---|---|
| Field validator | required files/invariant strings exist | compilation or runtime behavior |
| TypeScript tests | pure/fake TS behavior passed | Windows/.NET/Hyper-V behavior |
| .NET tests | pure Windows-targeted logic passed | interactive desktop or VM behavior |
| PowerShell parse | scripts parse | cmdlets succeed or rollback works |
| host prerequisites | machine appears capable | Field isolation or correct VM config |
| fake Field pulse | source-only chain works with fake components | live Field works |
| Hyper-V fixture | exact synthetic environment passed | arbitrary apps/workflows are safe |
| Teach acceptance | recording worked for tested fixture | Pilot works |
| Shadow acceptance | prediction-only workflow worked | execution works |
| Pilot fixture | exact workflow passed | general production readiness |
