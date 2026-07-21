[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$ManifestPath,

    [Parameter(Mandatory)]
    [ValidatePattern('^[a-f0-9]{64}$')]
    [string]$ManifestDigest,

    [Parameter()]
    [string]$ReportPath = 'C:\Exosuit\Diagnostics\bootstrap-report.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$requiredDirectories = @(
    'C:\Exosuit\Agent',
    'C:\Exosuit\Config',
    'C:\Exosuit\Logs',
    'C:\Exosuit\Maps',
    'C:\Exosuit\Checkpoints',
    'C:\Exosuit\Demonstrations',
    'C:\Exosuit\Diagnostics',
    'C:\Field\Inbox',
    'C:\Field\Workspace',
    'C:\Field\Downloads',
    'C:\Field\Outbox',
    'C:\Field\Quarantine'
)

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json -Depth 50
if ($manifest.contractVersion -ne 1) { throw 'Unsupported Field bootstrap manifest contract version.' }
if ($manifest.identity.subsystem -ne 'field') { throw 'Bootstrap manifest is not a Field identity.' }
if ([string]::IsNullOrWhiteSpace($manifest.identity.fieldId)) { throw 'Bootstrap manifest Field ID is missing.' }
if ([int]$manifest.identity.fieldGeneration -lt 1) { throw 'Bootstrap manifest Field generation is invalid.' }
if ($manifest.display.monitorCount -ne 1 -or $manifest.display.dynamicResolutionAllowed -ne $false) {
    throw 'Bootstrap manifest display contract is outside the supported fixed single-monitor configuration.'
}
if ($manifest.requiredDirectories.Count -ne $requiredDirectories.Count) { throw 'Bootstrap manifest directory count is invalid.' }
$expected = $requiredDirectories | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object
$actual = $manifest.requiredDirectories | ForEach-Object { ([string]$_).ToLowerInvariant() } | Sort-Object
if (Compare-Object $expected $actual) { throw 'Bootstrap manifest directory layout does not match the approved Field layout.' }

$checks = [System.Collections.Generic.List[object]]::new()
function Add-Check {
    param([string]$Name, [bool]$Passed, [string]$Summary, [hashtable]$Evidence = @{})
    $checks.Add([ordered]@{
        name = $Name
        passed = $Passed
        observedAt = [DateTimeOffset]::UtcNow.ToString('O')
        summary = $Summary
        evidence = $Evidence
    })
}

Add-Check -Name 'identity' -Passed $true -Summary 'Field identity was parsed.' -Evidence @{
    fieldId = $manifest.identity.fieldId
    fieldGeneration = [int]$manifest.identity.fieldGeneration
    agentId = $manifest.identity.agentId
    windowsSessionId = $manifest.identity.windowsSessionId
}
Add-Check -Name 'base_image' -Passed ($manifest.identity.baseImageDigest -match '^[a-f0-9]{64}$') -Summary 'Base-image digest shape was checked.'
Add-Check -Name 'personal_state' -Passed ($null -eq $manifest.identity.personalStateDigest -or $manifest.identity.personalStateDigest -match '^[a-f0-9]{64}$') -Summary 'Personal-state identity was checked.'
Add-Check -Name 'task_disk' -Passed (-not [string]::IsNullOrWhiteSpace($manifest.identity.taskDiskId)) -Summary 'Task-disk identity was checked.'

$created = @()
foreach ($directory in $requiredDirectories) {
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
        if ($PSCmdlet.ShouldProcess($directory, 'Create approved Exosuit Field directory')) {
            New-Item -ItemType Directory -Path $directory -Force | Out-Null
            $created += $directory
        }
    }
}
$directoriesReady = -not ($requiredDirectories | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Container) })
Add-Check -Name 'directory_layout' -Passed $directoriesReady -Summary 'Approved directory layout was checked.' -Evidence @{ createdCount = $created.Count }

$currentWidth = $null
$currentHeight = $null
try {
    Add-Type -AssemblyName System.Windows.Forms
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $currentWidth = $bounds.Width
    $currentHeight = $bounds.Height
} catch {}
$displayPassed = $currentWidth -eq [int]$manifest.display.width -and $currentHeight -eq [int]$manifest.display.height
Add-Check -Name 'display_contract' -Passed $displayPassed -Summary 'Interactive display dimensions were checked.' -Evidence @{
    expectedWidth = [int]$manifest.display.width
    expectedHeight = [int]$manifest.display.height
    actualWidth = $currentWidth
    actualHeight = $currentHeight
}

$agentPath = 'C:\Exosuit\Agent\Exosuit.Agent.exe'
$agentPresent = Test-Path -LiteralPath $agentPath -PathType Leaf
Add-Check -Name 'agent_binary' -Passed $agentPresent -Summary 'Guest agent binary presence was checked.' -Evidence @{ path = $agentPath }
Add-Check -Name 'channel_key' -Passed (-not [string]::IsNullOrWhiteSpace($manifest.channelKeyId)) -Summary 'Channel key identity was checked without reading key material.'
Add-Check -Name 'policy_binding' -Passed ($manifest.policyHash -match '^[a-f0-9]{64}$') -Summary 'Policy hash shape was checked.'

$sessionLocked = $false
try {
    $process = Get-Process -Name LogonUI -ErrorAction SilentlyContinue
    $sessionLocked = $null -ne $process
} catch {}
Add-Check -Name 'session_unlocked' -Passed (-not $sessionLocked) -Summary 'Interactive session lock state was checked.'
Add-Check -Name 'secure_desktop_inactive' -Passed $false -Summary 'Secure Desktop must be confirmed by the running guest agent; bootstrap alone cannot declare this check passed.' -Evidence @{ pendingRuntimeConfirmation = $true }
Add-Check -Name 'heartbeat_started' -Passed $false -Summary 'Heartbeat is not declared started until the guest agent authenticates its channel.' -Evidence @{ pendingAgentStart = $true }

$report = [ordered]@{
    contractVersion = 1
    identity = $manifest.identity
    manifestDigest = $ManifestDigest
    reportedAt = [DateTimeOffset]::UtcNow.ToString('O')
    checks = $checks
}

$reportDirectory = Split-Path -Parent $ReportPath
if ($PSCmdlet.ShouldProcess($ReportPath, 'Write Field bootstrap report')) {
    New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
    $temporary = "$ReportPath.$([Guid]::NewGuid().ToString('N')).tmp"
    $json = $report | ConvertTo-Json -Depth 50
    [IO.File]::WriteAllText($temporary, $json, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $ReportPath -Force
}

$report | ConvertTo-Json -Depth 50
if (-not $directoriesReady -or -not $displayPassed -or -not $agentPresent) { exit 2 }
