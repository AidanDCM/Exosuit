[CmdletBinding()]
param(
    [Parameter()]
    [string]$LaunchConfigPath = 'C:\Exosuit\Config\guest-launch.json',

    [Parameter()]
    [ValidateRange(1, 3600)]
    [int]$DesktopReadyTimeoutSeconds = 900
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function ConvertFrom-JsonDocument {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][int]$Depth)
    $json = Get-Content -LiteralPath $Path -Raw
    if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('Depth')) {
        return $json | ConvertFrom-Json -Depth $Depth
    }
    return $json | ConvertFrom-Json
}

$allowedRoot = [IO.Path]::GetFullPath('C:\Exosuit').TrimEnd('\') + '\'
function Assert-ExosuitPath {
    param([Parameter(Mandatory)][string]$Path)
    $resolved = [IO.Path]::GetFullPath($Path)
    if (-not $resolved.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Guest launch path escapes C:\Exosuit: $resolved"
    }
    $resolved
}

$launch = ConvertFrom-JsonDocument -Path $LaunchConfigPath -Depth 20
if ($launch.contractVersion -ne 1) { throw 'Unsupported guest launch contract version.' }
$manifestPath = Assert-ExosuitPath -Path ([string]$launch.manifestPath)
$runtimeConfigPath = Assert-ExosuitPath -Path ([string]$launch.runtimeConfigPath)
$runtime = ConvertFrom-JsonDocument -Path $runtimeConfigPath -Depth 20
if ($runtime.contractVersion -ne 1) { throw 'Unsupported guest runtime contract version.' }
$bootstrapReportPath = Assert-ExosuitPath -Path ([string]$runtime.bootstrapReportPath)
$bootstrapScript = Assert-ExosuitPath -Path 'C:\Exosuit\Agent\Initialize-ExosuitFieldGuest.ps1'
$developmentConfigPath = Assert-ExosuitPath -Path 'C:\Exosuit\Config\development-access.json'
$developmentScript = Assert-ExosuitPath -Path 'C:\Exosuit\Agent\Initialize-ExosuitDevelopmentAccess.ps1'
$agentPath = Assert-ExosuitPath -Path 'C:\Exosuit\Agent\Exosuit.Agent.exe'
foreach ($path in @($manifestPath, $runtimeConfigPath, $bootstrapScript, $agentPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required guest file is missing: $path" }
}
if (Test-Path -LiteralPath $developmentConfigPath -PathType Leaf) {
    if (-not (Test-Path -LiteralPath $developmentScript -PathType Leaf)) {
        throw 'Development access was requested but its reviewed initializer is missing.'
    }
    & $developmentScript -ConfigPath $developmentConfigPath
    if (-not $?) { throw 'Development access initialization failed.' }
}
$manifestDigest = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$desktopDeadline = [DateTimeOffset]::UtcNow.AddSeconds($DesktopReadyTimeoutSeconds)
do {
    & $bootstrapScript -ManifestPath $manifestPath -ManifestDigest $manifestDigest -ReportPath $bootstrapReportPath -Confirm:$false
    if (-not $?) { throw 'Guest bootstrap precheck did not complete successfully.' }
    $bootstrapReport = ConvertFrom-JsonDocument -Path $bootstrapReportPath -Depth 50
    $sessionCheck = @($bootstrapReport.checks | Where-Object name -EQ 'session_unlocked')
    if ($sessionCheck.Count -ne 1) { throw 'Guest bootstrap report did not contain exactly one session_unlocked check.' }
    if ([bool]$sessionCheck[0].passed) { break }
    if ([DateTimeOffset]::UtcNow -ge $desktopDeadline) {
        throw "Interactive desktop did not become ready within $DesktopReadyTimeoutSeconds seconds."
    }
    Start-Sleep -Seconds 2
} while ($true)
$runtimeErrorLog = 'C:\Exosuit\Logs\guest-runtime-error.log'
& $agentPath --field-guest-kvp $runtimeConfigPath 2>> $runtimeErrorLog
$agentExitCode = $LASTEXITCODE
if ($agentExitCode -ne 0) { throw "Guest runtime failed with exit code $agentExitCode. See the bounded guest runtime error log." }
exit 0
