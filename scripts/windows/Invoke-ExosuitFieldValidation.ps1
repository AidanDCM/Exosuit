[CmdletBinding()]
param(
    [Parameter()]
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,

    [Parameter()]
    [string]$EvidenceRoot = (Join-Path $RepositoryRoot 'artifacts\field-validation'),

    [Parameter()]
    [switch]$SkipDependencyInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-DotnetSdk {
    foreach ($candidate in @('dotnet', (Join-Path $env:USERPROFILE '.dotnet\dotnet.exe'))) {
        if (-not $candidate) { continue }
        try {
            $sdks = & $candidate --list-sdks 2>$null
            if ($LASTEXITCODE -eq 0 -and @($sdks).Count -gt 0) { return $candidate }
        } catch { }
    }
    throw 'A .NET SDK is required for exact Field validation.'
}
$dotnet = Resolve-DotnetSdk

$timestamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$runRoot = Join-Path $EvidenceRoot $timestamp
New-Item -ItemType Directory -Path $runRoot -Force | Out-Null

$steps = [System.Collections.Generic.List[object]]::new()
function Invoke-ValidationStep {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][scriptblock]$Action,
        [Parameter()][switch]$NonBlocking
    )
    $started = [DateTimeOffset]::UtcNow
    $logPath = Join-Path $runRoot "$Name.log"
    $exitCode = 0
    try {
        # Native tools legitimately write progress and notices to stderr. Under
        # ErrorActionPreference='Stop' the *>&1 merge turns any such line into a
        # terminating NativeCommandError, failing steps whose command actually
        # succeeded. The process exit code is the only authority here.
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            & $Action *>&1 | Tee-Object -FilePath $logPath
        } finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) {
            $exitCode = $LASTEXITCODE
            throw "Validation command exited with code $exitCode."
        }
        $status = 'passed'
        $errorMessage = $null
    } catch {
        if ($exitCode -eq 0) { $exitCode = 1 }
        $status = if ($NonBlocking) { 'reported_failure' } else { 'failed' }
        $errorMessage = $_.Exception.Message
        $_ | Out-String | Add-Content -LiteralPath $logPath -Encoding utf8
    }
    $completed = [DateTimeOffset]::UtcNow
    $steps.Add([ordered]@{
        name = $Name
        status = $status
        exitCode = $exitCode
        blocking = -not [bool]$NonBlocking
        startedAt = $started.ToString('O')
        completedAt = $completed.ToString('O')
        durationMilliseconds = [math]::Round(($completed - $started).TotalMilliseconds)
        logPath = $logPath
        error = $errorMessage
    })
    if ($status -eq 'failed') { throw "Field validation step failed: $Name" }
}

Push-Location $RepositoryRoot
$overallStatus = 'running'
$overallError = $null
try {
    $environment = [ordered]@{
        capturedAt = [DateTimeOffset]::UtcNow.ToString('O')
        repositoryRoot = $RepositoryRoot
        computerNameHash = if ($env:COMPUTERNAME) {
            $bytes = [Text.Encoding]::UTF8.GetBytes($env:COMPUTERNAME)
            $sha256 = [Security.Cryptography.SHA256]::Create()
            try {
                (($sha256.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
            } finally {
                $sha256.Dispose()
            }
        } else { $null }
        powershellVersion = $PSVersionTable.PSVersion.ToString()
        nodeVersion = (& node --version 2>$null)
        npmVersion = (& npm --version 2>$null)
        dotnetVersion = (& $dotnet --version 2>$null)
        gitCommit = (& git rev-parse HEAD 2>$null)
        gitBranch = (& git branch --show-current 2>$null)
        workingTree = (& git status --porcelain 2>$null)
        packageLockPresent = Test-Path -LiteralPath (Join-Path $RepositoryRoot 'package-lock.json') -PathType Leaf
    }
    [IO.File]::WriteAllText((Join-Path $runRoot 'environment.json'), ($environment | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))

    if (-not $SkipDependencyInstall) {
        if (-not (Test-Path -LiteralPath (Join-Path $RepositoryRoot 'package-lock.json') -PathType Leaf)) {
            throw 'package-lock.json is required for reproducible L0 validation.'
        }
        Invoke-ValidationStep -Name 'npm-ci' -Action { npm ci --ignore-scripts --fund=false }
    }
    Invoke-ValidationStep -Name 'repository-contract' -Action { npm run validate:repository }
    Invoke-ValidationStep -Name 'master-plan-contract' -Action { npm run validate:plan }
    Invoke-ValidationStep -Name 'build-completion-plan-contract' -Action { npm run validate:mvp-plan }
    Invoke-ValidationStep -Name 'field-contract' -Action { npm run validate:field-contract }
    Invoke-ValidationStep -Name 'typescript-typecheck' -Action { npm run typecheck }
    Invoke-ValidationStep -Name 'field-tests' -Action { npm run test:field -- --reporter=verbose }
    Invoke-ValidationStep -Name 'field-system-pulse' -Action { npm run test:field-pulse -- --reporter=verbose }
    Invoke-ValidationStep -Name 'full-typescript-tests' -Action {
        $vitest = Join-Path $RepositoryRoot 'node_modules\.bin\vitest.cmd'
        & $vitest run --reporter=verbose --maxWorkers=1 --minWorkers=1
    }
    Invoke-ValidationStep -Name 'typescript-build' -Action { npm run build }
    Invoke-ValidationStep -Name 'glove-system-pulse' -Action { npm run test:pulse -- --reporter=verbose }
    Invoke-ValidationStep -Name 'dotnet-restore' -Action { & $dotnet restore apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj }
    Invoke-ValidationStep -Name 'dotnet-build' -Action { & $dotnet build apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-restore -warnaserror }
    Invoke-ValidationStep -Name 'dotnet-tests' -Action { & $dotnet test apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj --configuration Release --no-build --logger "trx;LogFileName=field-validation.trx" --collect:"XPlat Code Coverage" }
    Invoke-ValidationStep -Name 'host-capability-check' -Action { & "$PSScriptRoot\Test-ExosuitFieldHost.ps1" }
    Invoke-ValidationStep -Name 'personal-mvp-readiness-report' -NonBlocking -Action { npm run assess:mvp }
    Invoke-ValidationStep -Name 'production-readiness-report' -NonBlocking -Action { npm run assess:production }
    $overallStatus = 'passed'
} catch {
    $overallStatus = 'failed'
    $overallError = $_.Exception.Message
} finally {
    Pop-Location
    $summary = [ordered]@{
        contractVersion = 1
        runId = $timestamp
        status = $overallStatus
        completedAt = [DateTimeOffset]::UtcNow.ToString('O')
        repositoryRoot = $RepositoryRoot
        evidenceRoot = $runRoot
        steps = $steps
        error = $overallError
        mvpReadiness = 'The personal-MVP report is informational until every M0-M6 gate has qualifying live evidence and explicit owner acceptance.'
        productionReadiness = 'The production-readiness report is informational during development and is expected to remain denied until every release gate has exact evidence and owner approval.'
        claimBoundary = if ($overallStatus -eq 'passed') {
            'This proves repository, plans, TypeScript, .NET pure logic, PowerShell parse/runtime entrypoints, and host capability checks on this machine. It does not by itself prove interactive Hyper-V lifecycle, Teach hooks, visual capture, owner-model quality, ChatGPT-to-Field operation, Assisted execution, installer acceptance, personal MVP, or production.'
        } else {
            'Validation did not complete. No passing claim may be made.'
        }
    }
    [IO.File]::WriteAllText((Join-Path $runRoot 'summary.json'), ($summary | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
}

Get-Content -LiteralPath (Join-Path $runRoot 'summary.json') -Raw
if ($overallStatus -ne 'passed') { exit 1 }
