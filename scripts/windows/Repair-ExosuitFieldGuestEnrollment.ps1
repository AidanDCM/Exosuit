[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [Guid]$FieldId,

    [Parameter()]
    [ValidateRange(1, 1000000)]
    [int]$FieldGeneration = 1,

    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$AgentPath,

    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$InitializeScriptPath,

    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path $_ -PathType Container })]
    [string]$HostSeedDirectory,

    [Parameter(Mandatory)]
    [ValidatePattern('^[a-f0-9]{64}$')]
    [string]$ExpectedPreviousManifestSha256,

    [Parameter(Mandatory)]
    [ValidatePattern('^[a-f0-9]{64}$')]
    [string]$ExpectedAgentSha256,

    [Parameter(Mandatory)]
    [ValidatePattern('^[a-f0-9]{64}$')]
    [string]$ExpectedInitializeScriptSha256,

    [Parameter()]
    [ValidateRange(5, 240)]
    [int]$RenewalMinutes = 120,

    [Parameter(Mandatory)]
    [string]$EvidencePath,

    [Parameter()]
    [switch]$Apply,

    [Parameter()]
    [string]$TypedConfirmation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Bounded {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][scriptblock]$Action,
        [Parameter()][object[]]$Arguments = @(),
        [Parameter()][ValidateRange(1, 300)][int]$TimeoutSeconds = 120
    )
    $job = Start-Job -ScriptBlock $Action -ArgumentList $Arguments
    try {
        if (-not (Wait-Job -Job $job -Timeout $TimeoutSeconds)) {
            Stop-Job -Job $job -ErrorAction SilentlyContinue
            throw "$Name exceeded $TimeoutSeconds seconds."
        }
        Receive-Job -Job $job -ErrorAction Stop
    } finally {
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    }
}

function Get-Sha256 {
    param([Parameter(Mandatory)][string]$Path)
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-FieldWireTimestamp {
    param([Parameter(Mandatory)][DateTimeOffset]$Value)
    $Value.ToUniversalTime().ToString(
        "yyyy-MM-dd'T'HH:mm:ss.fff'Z'",
        [Globalization.CultureInfo]::InvariantCulture)
}

function Assert-NotReparsePoint {
    param([Parameter(Mandatory)][string]$Path)
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "Repair refuses a reparse point: $Path"
    }
}

$fieldIdText = $FieldId.ToString('D').ToLowerInvariant()
$vmName = "Exosuit-Field-$fieldIdText-G$FieldGeneration"
$generationRoot = [IO.Path]::GetFullPath("C:\ProgramData\Exosuit\Fields\$fieldIdText\generation-$FieldGeneration")
$overlayPath = Join-Path $generationRoot "$fieldIdText-g$FieldGeneration-os-overlay.vhdx"
$resolvedAgentPath = [IO.Path]::GetFullPath($AgentPath)
$resolvedInitializeScriptPath = [IO.Path]::GetFullPath($InitializeScriptPath)
$resolvedSeedDirectory = [IO.Path]::GetFullPath($HostSeedDirectory)
$hostManifestPath = Join-Path $resolvedSeedDirectory 'bootstrap-manifest.json'
$resolvedEvidencePath = [IO.Path]::GetFullPath($EvidencePath)
$evidenceParent = Split-Path -Parent $resolvedEvidencePath
$confirmation = "REPAIR FIELD $fieldIdText GENERATION $FieldGeneration BOOTSTRAP ENROLLMENT"

foreach ($path in @($generationRoot, $resolvedSeedDirectory, $evidenceParent)) {
    if (-not (Test-Path -LiteralPath $path -PathType Container)) { throw "Required directory is missing: $path" }
    Assert-NotReparsePoint -Path $path
}
if (-not (Test-Path -LiteralPath $overlayPath -PathType Leaf)) { throw "Field overlay is missing: $overlayPath" }
if (-not (Test-Path -LiteralPath $hostManifestPath -PathType Leaf)) { throw "Host bootstrap manifest is missing: $hostManifestPath" }

$actualAgentSha256 = Get-Sha256 -Path $resolvedAgentPath
$actualInitializeScriptSha256 = Get-Sha256 -Path $resolvedInitializeScriptPath
$actualPreviousManifestSha256 = Get-Sha256 -Path $hostManifestPath
if ($actualAgentSha256 -cne $ExpectedAgentSha256) { throw 'Repair agent digest does not match the reviewed input.' }
if ($actualInitializeScriptSha256 -cne $ExpectedInitializeScriptSha256) { throw 'Repair initializer digest does not match the reviewed input.' }
if ($actualPreviousManifestSha256 -cne $ExpectedPreviousManifestSha256) { throw 'Repair host manifest digest does not match the reviewed input.' }

$vmState = Invoke-Bounded -Name 'Get-VM' -TimeoutSeconds 30 -Arguments @($vmName) -Action {
    param($Name)
    Import-Module Hyper-V -ErrorAction Stop
    (Get-VM -Name $Name -ErrorAction Stop).State.ToString()
}
$vmState = [string]$vmState
if ($vmState -ne 'Off') { throw "Guest enrollment repair refuses a running VM; observed state: $vmState" }

$plan = [ordered]@{
    contractVersion = 1
    field = [ordered]@{ fieldId = $fieldIdText; fieldGeneration = $FieldGeneration }
    vmName = $vmName
    vmState = $vmState
    overlayPath = $overlayPath
    previousManifestSha256 = $actualPreviousManifestSha256
    reviewedAgentSha256 = $actualAgentSha256
    reviewedInitializeScriptSha256 = $actualInitializeScriptSha256
    renewalMinutes = $RenewalMinutes
    apply = [bool]$Apply
    exactConfirmation = $confirmation
}
if (-not $Apply) {
    $plan | ConvertTo-Json -Depth 20
    return
}
if ($TypedConfirmation -cne $confirmation) { throw 'Exact local typed confirmation is required for guest enrollment repair.' }
if (-not $PSCmdlet.ShouldProcess($vmName, 'Repair exact disposable guest bootstrap enrollment package')) { return }

$result = [ordered]@{
    contractVersion = 1
    startedAtUtc = [DateTimeOffset]::UtcNow.ToString('O')
    field = $plan.field
    vmName = $vmName
    previousManifestSha256 = $actualPreviousManifestSha256
    agentSha256 = $actualAgentSha256
    initializeScriptSha256 = $actualInitializeScriptSha256
    success = $false
    dismountError = $null
}
$mounted = $false
$failure = $null
try {
    $mount = Invoke-Bounded -Name 'Mount-DiskImage' -TimeoutSeconds 120 -Arguments @($overlayPath) -Action {
        param($Path)
        Import-Module Storage -ErrorAction Stop
        Mount-DiskImage -ImagePath $Path -Access ReadWrite -StorageType VHDX -ErrorAction Stop | Out-Null
        $image = Get-DiskImage -ImagePath $Path -ErrorAction Stop
        $disk = Get-Disk -Number $image.Number -ErrorAction Stop
        [pscustomobject]@{
            Volumes = @(Get-Partition -DiskNumber $disk.Number | Where-Object DriveLetter | ForEach-Object { "$($_.DriveLetter):\" })
        }
    }
    $mounted = $true
    $windowsRoots = @($mount.Volumes | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Windows\System32') })
    if ($windowsRoots.Count -ne 1) { throw "Expected exactly one Windows volume; found $($windowsRoots.Count)." }
    $windowsRoot = $windowsRoots[0]
    $guestAgentDirectory = Join-Path $windowsRoot 'Exosuit\Agent'
    $guestConfigDirectory = Join-Path $windowsRoot 'Exosuit\Config'
    foreach ($path in @($guestAgentDirectory, $guestConfigDirectory)) { Assert-NotReparsePoint -Path $path }

    $guestAgentPath = Join-Path $guestAgentDirectory 'Exosuit.Agent.exe'
    $guestInitializePath = Join-Path $guestAgentDirectory 'Initialize-ExosuitFieldGuest.ps1'
    $guestManifestPath = Join-Path $guestConfigDirectory 'bootstrap-manifest.json'
    $guestEnrollmentPath = Join-Path $guestConfigDirectory 'bootstrap-enrollment.json'
    foreach ($path in @($guestAgentPath, $guestInitializePath, $guestManifestPath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required guest repair target is missing: $path" }
    }
    if (Test-Path -LiteralPath $guestEnrollmentPath) {
        throw 'Repair refuses a guest that already has a bootstrap enrollment record.'
    }
    if ((Get-Sha256 -Path $guestManifestPath) -cne $ExpectedPreviousManifestSha256) {
        throw 'Guest and reviewed host bootstrap manifests do not match.'
    }

    $manifest = Get-Content -LiteralPath $hostManifestPath -Raw | ConvertFrom-Json
    if (
        [string]$manifest.identity.fieldId -cne $fieldIdText -or
        [int]$manifest.identity.fieldGeneration -ne $FieldGeneration
    ) { throw 'Repair manifest identity does not match the requested Field generation.' }
    $now = [DateTimeOffset]::UtcNow
    if ($now -lt [DateTimeOffset]::Parse([string]$manifest.expiresAt)) {
        throw 'Repair is limited to an expired first-use manifest.'
    }
    $manifest.createdAt = Get-FieldWireTimestamp -Value $now
    $manifest.expiresAt = Get-FieldWireTimestamp -Value $now.AddMinutes($RenewalMinutes)
    $manifest.agentBinaryDigest = $ExpectedAgentSha256

    $transactionId = [Guid]::NewGuid().ToString('N')
    $hostManifestTemporary = "$hostManifestPath.$transactionId.tmp"
    $hostManifestBackup = "$hostManifestPath.$transactionId.rollback"
    $guestManifestTemporary = "$guestManifestPath.$transactionId.tmp"
    $guestManifestBackup = "$guestManifestPath.$transactionId.rollback"
    $guestAgentTemporary = "$guestAgentPath.$transactionId.tmp"
    $guestAgentBackup = "$guestAgentPath.$transactionId.rollback"
    $guestInitializeTemporary = "$guestInitializePath.$transactionId.tmp"
    $guestInitializeBackup = "$guestInitializePath.$transactionId.rollback"

    $renewedManifestJson = $manifest | ConvertTo-Json -Depth 50
    [IO.File]::WriteAllText($hostManifestTemporary, $renewedManifestJson, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($guestManifestTemporary, $renewedManifestJson, [Text.UTF8Encoding]::new($false))
    Copy-Item -LiteralPath $resolvedAgentPath -Destination $guestAgentTemporary
    Copy-Item -LiteralPath $resolvedInitializeScriptPath -Destination $guestInitializeTemporary
    if ((Get-Sha256 -Path $guestAgentTemporary) -cne $ExpectedAgentSha256) { throw 'Staged guest agent digest changed during copy.' }
    if ((Get-Sha256 -Path $guestInitializeTemporary) -cne $ExpectedInitializeScriptSha256) { throw 'Staged initializer digest changed during copy.' }
    $renewedManifestSha256 = Get-Sha256 -Path $hostManifestTemporary
    if ((Get-Sha256 -Path $guestManifestTemporary) -cne $renewedManifestSha256) { throw 'Staged guest manifest digest does not match the host manifest.' }

    $swaps = @(
        @($guestAgentPath, $guestAgentTemporary, $guestAgentBackup),
        @($guestInitializePath, $guestInitializeTemporary, $guestInitializeBackup),
        @($guestManifestPath, $guestManifestTemporary, $guestManifestBackup),
        @($hostManifestPath, $hostManifestTemporary, $hostManifestBackup)
    )
    $completedSwaps = [Collections.Generic.List[object]]::new()
    try {
        foreach ($swap in $swaps) {
            Move-Item -LiteralPath $swap[0] -Destination $swap[2]
            try {
                Move-Item -LiteralPath $swap[1] -Destination $swap[0]
                $completedSwaps.Add($swap)
            } catch {
                Move-Item -LiteralPath $swap[2] -Destination $swap[0]
                throw
            }
        }
    } catch {
        for ($index = $completedSwaps.Count - 1; $index -ge 0; $index--) {
            $swap = $completedSwaps[$index]
            if (Test-Path -LiteralPath $swap[0]) { Remove-Item -LiteralPath $swap[0] -Force }
            if (Test-Path -LiteralPath $swap[2]) { Move-Item -LiteralPath $swap[2] -Destination $swap[0] }
        }
        throw
    }
    foreach ($swap in $swaps) {
        if (Test-Path -LiteralPath $swap[2]) { Remove-Item -LiteralPath $swap[2] -Force }
    }

    $result['renewedCreatedAt'] = [string]$manifest.createdAt
    $result['renewedExpiresAt'] = [string]$manifest.expiresAt
    $result['renewedManifestSha256'] = $renewedManifestSha256
    $result.success = $true
} catch {
    $failure = $_
    $result['error'] = $_.Exception.Message
    $result['fullyQualifiedErrorId'] = $_.FullyQualifiedErrorId
} finally {
    if ($mounted) {
        try {
            Invoke-Bounded -Name 'Dismount-DiskImage' -TimeoutSeconds 120 -Arguments @($overlayPath) -Action {
                param($Path)
                Import-Module Storage -ErrorAction Stop
                Dismount-DiskImage -ImagePath $Path -ErrorAction Stop
            } | Out-Null
        } catch {
            $result.dismountError = $_.Exception.Message
            if ($null -eq $failure) { $failure = $_; $result.success = $false }
        }
    }
    $result['completedAtUtc'] = [DateTimeOffset]::UtcNow.ToString('O')
    $temporaryEvidencePath = "$resolvedEvidencePath.$([Guid]::NewGuid().ToString('N')).tmp"
    [IO.File]::WriteAllText($temporaryEvidencePath, ($result | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporaryEvidencePath -Destination $resolvedEvidencePath -Force
}

if ($null -ne $failure) { throw $failure }
$result | ConvertTo-Json -Depth 30
