[CmdletBinding()]
param(
    [Parameter()][string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [Parameter()][string]$HostConfigPath = (Join-Path $RepositoryRoot 'vm\field-host-config.local.json'),
    [Parameter()][ValidateRange(1, 180)][int]$ValidityDays = 180,
    [Parameter()][ValidateRange(1, 4)][int]$MaxActiveFields = 2,
    [Parameter()][switch]$AllowDevelopmentAccess
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Resolve-Dotnet {
    $candidate = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($candidate) {
        $sdks = & $candidate.Source --list-sdks 2>$null
        if ($LASTEXITCODE -eq 0 -and @($sdks).Count -gt 0) { return $candidate.Source }
    }
    $userLocal = Join-Path $env:USERPROFILE '.dotnet\dotnet.exe'
    if (Test-Path -LiteralPath $userLocal -PathType Leaf) {
        $sdks = & $userLocal --list-sdks 2>$null
        if ($LASTEXITCODE -eq 0 -and @($sdks).Count -gt 0) { return $userLocal }
    }
    throw 'A .NET SDK is required; no UAC prompt was opened.'
}
$dotnet = Resolve-Dotnet
$repository = [IO.Path]::GetFullPath($RepositoryRoot)
$publish = Join-Path $repository 'artifacts\field-owner-service\publish'
$observerPublish = Join-Path $repository 'artifacts\field-owner-service\observer'
$planRoot = Join-Path $repository 'artifacts\field-owner-service\install'
New-Item -ItemType Directory -Path $publish, $observerPublish, $planRoot -Force | Out-Null
Get-ChildItem -LiteralPath $publish -Force | Remove-Item -Recurse -Force
Get-ChildItem -LiteralPath $observerPublish -Force | Remove-Item -Recurse -Force

& $dotnet publish (Join-Path $repository 'apps\field-owner-service\Exosuit.FieldOwner.Service.csproj') --configuration Release --runtime win-x64 --output $publish --no-self-contained -p:PublishSingleFile=true
if ($LASTEXITCODE -ne 0) { throw 'Field owner service publish failed; no UAC prompt was opened.' }
& $dotnet publish (Join-Path $repository 'apps\windows-agent\Exosuit.Agent.csproj') --configuration Release --runtime win-x64 --output $observerPublish --no-self-contained -p:PublishSingleFile=true
if ($LASTEXITCODE -ne 0) { throw 'Field observer publish failed; no UAC prompt was opened.' }

$showArguments = @{
    PublishDirectory = $publish
    ObserverPublishDirectory = $observerPublish
    HostConfigPath = $HostConfigPath
    RepositoryRoot = $repository
    ValidityDays = $ValidityDays
    MaxActiveFields = $MaxActiveFields
    AllowDevelopmentAccess = $AllowDevelopmentAccess
}
$planJson = & (Join-Path $repository 'scripts\windows\Show-ExosuitFieldOwnerInstallPlan.ps1') @showArguments
if (-not $?) { throw 'Field owner installation plan generation failed; no UAC prompt was opened.' }
$plan = $planJson | ConvertFrom-Json
$planPath = Join-Path $planRoot "install-$($plan.policyId).json"
[IO.File]::WriteAllText($planPath, ($planJson -join [Environment]::NewLine), [Text.UTF8Encoding]::new($false))
$planDigest = (Get-FileHash -LiteralPath $planPath -Algorithm SHA256).Hash.ToLowerInvariant()

Write-Host 'Reviewed Field owner installation plan:'
$planJson | Write-Host
Write-Host 'Opening one Windows UAC prompt for the exact installation above.'

function Quote-PowerShellLiteral([string]$Value) { "'" + $Value.Replace("'", "''") + "'" }
$installer = Join-Path $repository 'scripts\windows\Install-ExosuitFieldOwnerService.ps1'
$installerDigest = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$bootstrap = @"
`$ErrorActionPreference = 'Stop'
`$installer = $(Quote-PowerShellLiteral $installer)
if ((Get-FileHash -LiteralPath `$installer -Algorithm SHA256).Hash.ToLowerInvariant() -cne '$installerDigest') { throw 'Elevated installer changed after owner review.' }
try {
    & `$installer -InstallPlanPath $(Quote-PowerShellLiteral $planPath) -ExpectedInstallPlanSha256 '$planDigest' -PublishDirectory $(Quote-PowerShellLiteral $publish) -ObserverPublishDirectory $(Quote-PowerShellLiteral $observerPublish) -HostConfigPath $(Quote-PowerShellLiteral ([IO.Path]::GetFullPath($HostConfigPath))) -RepositoryRoot $(Quote-PowerShellLiteral $repository) -Confirm:`$false
} catch {
    `$stage = `$global:ExosuitFieldOwnerInstallStage
    if (`$stage -is [int] -and `$stage -ge 10 -and `$stage -le 60) { exit `$stage }
    exit 1
}
"@
$encodedBootstrap = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($bootstrap))
$process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encodedBootstrap) -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "Elevated Field owner installation failed with exit code $($process.ExitCode)." }
Get-Content -LiteralPath 'C:\ProgramData\Exosuit\FieldOwner\policy.json' -Raw
