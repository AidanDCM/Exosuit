[CmdletBinding()]
param(
    [Parameter()]
    [string]$LaunchConfigPath = 'C:\Exosuit\Config\guest-launch.json'
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
$bootstrapScript = Assert-ExosuitPath -Path 'C:\Exosuit\Agent\Initialize-ExosuitFieldGuest.ps1'
$agentPath = Assert-ExosuitPath -Path 'C:\Exosuit\Agent\Exosuit.Agent.exe'
foreach ($path in @($manifestPath, $runtimeConfigPath, $bootstrapScript, $agentPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required guest file is missing: $path" }
}
$manifestDigest = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
& $bootstrapScript -ManifestPath $manifestPath -ManifestDigest $manifestDigest -Confirm:$false
$bootstrapSucceeded = $?
if (-not $bootstrapSucceeded) { throw 'Guest bootstrap precheck did not complete successfully.' }
$runtimeErrorLog = 'C:\Exosuit\Logs\guest-runtime-error.log'
& $agentPath --field-guest-kvp $runtimeConfigPath 2>> $runtimeErrorLog
$agentExitCode = $LASTEXITCODE
if ($agentExitCode -ne 0) { throw "Guest runtime failed with exit code $agentExitCode. See the bounded guest runtime error log." }
exit 0
