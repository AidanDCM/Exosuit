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

# START FIELD PROCESS ADAPTERS
# These narrow adapters keep process effects separate from receipt validation so
# the complete startup transaction can be exercised with inert subprocess fakes.
function Invoke-FieldSecretProtectionProcess {
    param(
        [Parameter(Mandatory)][string]$AgentPath,
        [Parameter(Mandatory)][string]$RuntimeConfigPath,
        [Parameter(Mandatory)][string]$RuntimeErrorLog
    )
    $output = @(& $AgentPath --field-protect-channel-secret $RuntimeConfigPath 2>> $RuntimeErrorLog)
    [pscustomobject]@{ output = $output; exitCode = $LASTEXITCODE }
}

function Invoke-FieldGuestProcess {
    param(
        [Parameter(Mandatory)][string]$AgentPath,
        [Parameter(Mandatory)][string]$RuntimeConfigPath,
        [Parameter(Mandatory)][string]$RuntimeErrorLog
    )
    & $AgentPath --field-guest-kvp $RuntimeConfigPath 2>> $RuntimeErrorLog | Out-Host
    $LASTEXITCODE
}
# END FIELD PROCESS ADAPTERS

$allowedRoot = [IO.Path]::GetFullPath('C:\Exosuit').TrimEnd('\') + '\'
function Assert-ExosuitPath {
    param([Parameter(Mandatory)][string]$Path)
    $resolved = [IO.Path]::GetFullPath($Path)
    if (-not $resolved.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Guest launch path escapes C:\Exosuit: $resolved"
    }
    $resolved
}

$maintenanceAuthorizationPath = Assert-ExosuitPath -Path 'C:\Exosuit\Base\maintenance-authorization.json'
if (Test-Path -LiteralPath $maintenanceAuthorizationPath -PathType Leaf) {
    $maintenanceScript = Assert-ExosuitPath -Path 'C:\Exosuit\Agent\Invoke-ExosuitFieldBaseMaintenance.ps1'
    if (-not (Test-Path -LiteralPath $maintenanceScript -PathType Leaf)) {
        throw 'Field base maintenance was authorized but the reviewed maintenance script is missing.'
    }
    & $maintenanceScript -AuthorizationPath $maintenanceAuthorizationPath
    if (-not $?) { throw 'Field base maintenance failed.' }
    return
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
$protectionProcess = Invoke-FieldSecretProtectionProcess -AgentPath $agentPath -RuntimeConfigPath $runtimeConfigPath -RuntimeErrorLog $runtimeErrorLog
$protectionOutput = @($protectionProcess.output)
$protectionExitCode = [int]$protectionProcess.exitCode
if ($protectionExitCode -ne 0) {
    throw "Field channel-secret protection failed with exit code $protectionExitCode. See the bounded guest runtime error log."
}
if ($protectionOutput.Count -ne 1) { throw 'Field channel-secret protection did not return exactly one metadata receipt.' }
try {
    $protectionReceipt = $protectionOutput[0] | ConvertFrom-Json
} catch {
    throw 'Field channel-secret protection returned a malformed metadata receipt.'
}
$expectedReceiptProperties = @('completedAt', 'contractVersion', 'ciphertextEnvelopeSha256', 'field', 'keyId', 'status') | Sort-Object
$actualReceiptProperties = @($protectionReceipt.PSObject.Properties.Name) | Sort-Object
if (($actualReceiptProperties -join "`n") -cne ($expectedReceiptProperties -join "`n")) {
    throw 'Field channel-secret protection returned an unexpected metadata receipt schema.'
}
$expectedReceiptFieldProperties = @('fieldGeneration', 'fieldId') | Sort-Object
$actualReceiptFieldProperties = @($protectionReceipt.field.PSObject.Properties.Name) | Sort-Object
if (($actualReceiptFieldProperties -join "`n") -cne ($expectedReceiptFieldProperties -join "`n")) {
    throw 'Field channel-secret protection returned an unexpected Field receipt schema.'
}
$runtimeFieldId = [guid]::Empty
$receiptFieldId = [guid]::Empty
if (-not [guid]::TryParse([string]$runtime.field.fieldId, [ref]$runtimeFieldId) -or
    -not [guid]::TryParse([string]$protectionReceipt.field.fieldId, [ref]$receiptFieldId) -or
    $receiptFieldId -ne $runtimeFieldId -or
    [long]$protectionReceipt.field.fieldGeneration -ne [long]$runtime.field.fieldGeneration -or
    [string]$protectionReceipt.keyId -cne [string]$runtime.keyId) {
    throw 'Field channel-secret protection receipt does not match the runtime Field generation and key.'
}
if ([int]$protectionReceipt.contractVersion -ne 1 -or
    @('converted', 'already_protected') -cnotcontains [string]$protectionReceipt.status -or
    [string]$protectionReceipt.ciphertextEnvelopeSha256 -cnotmatch '^[0-9a-f]{64}$') {
    throw 'Field channel-secret protection receipt status or digest is invalid.'
}
$receiptCompletedAt = [DateTimeOffset]::MinValue
if (-not [DateTimeOffset]::TryParse(
        [string]$protectionReceipt.completedAt,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind,
        [ref]$receiptCompletedAt)) {
    throw 'Field channel-secret protection receipt completion time is invalid.'
}
$receiptNow = [DateTimeOffset]::UtcNow
if ($receiptCompletedAt -lt $receiptNow.AddMinutes(-5) -or $receiptCompletedAt -gt $receiptNow.AddSeconds(30)) {
    throw 'Field channel-secret protection receipt is stale or from the future.'
}
$agentExitCode = Invoke-FieldGuestProcess -AgentPath $agentPath -RuntimeConfigPath $runtimeConfigPath -RuntimeErrorLog $runtimeErrorLog
if ($agentExitCode -ne 0) { throw "Guest runtime failed with exit code $agentExitCode. See the bounded guest runtime error log." }
exit 0
