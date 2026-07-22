[CmdletBinding()]
param(
    [Parameter()]
    [ValidateRange(4, 512)]
    [int]$RequiredMemoryGiB = 12,

    [Parameter()]
    [ValidateRange(20, 2048)]
    [int]$RequiredFreeDiskGiB = 80,

    [Parameter()]
    [string]$StoragePath = "$env:ProgramData\Exosuit\Fields"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-SafeValue {
    param([scriptblock]$Action, $Fallback = $null)
    try { & $Action } catch { $Fallback }
}

$processor = Get-SafeValue { Get-CimInstance Win32_Processor | Select-Object -First 1 }
$computer = Get-SafeValue { Get-CimInstance Win32_ComputerSystem }
$operatingSystem = Get-SafeValue { Get-CimInstance Win32_OperatingSystem }
$hyperVFeature = Get-SafeValue { Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All }
$hyperVCmdlets = [bool](Get-Command Get-VM -ErrorAction SilentlyContinue)
$firmwareVirtualization = if ($processor) { [bool]$processor.VirtualizationFirmwareEnabled } else { $false }
$secondLevelAddressTranslation = if ($processor) { [bool]$processor.SecondLevelAddressTranslationExtensions } else { $false }
$totalMemoryGiB = if ($computer) { [math]::Round($computer.TotalPhysicalMemory / 1GB, 2) } else { 0 }

$storageRoot = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($StoragePath))
$drive = Get-SafeValue { Get-PSDrive -Name $storageRoot.TrimEnd(':\') }
$freeDiskGiB = if ($drive) { [math]::Round($drive.Free / 1GB, 2) } else { 0 }

$checks = [ordered]@{
    isWindows = $true
    supportedEdition = if ($operatingSystem) { $operatingSystem.Caption -match 'Pro|Enterprise|Education|Server' } else { $false }
    hyperVFeatureEnabled = $hyperVFeature -and $hyperVFeature.State -eq 'Enabled'
    hyperVCmdletsAvailable = $hyperVCmdlets
    firmwareVirtualizationEnabled = $firmwareVirtualization
    secondLevelAddressTranslation = $secondLevelAddressTranslation
    enoughMemory = $totalMemoryGiB -ge $RequiredMemoryGiB
    enoughFreeDisk = $freeDiskGiB -ge $RequiredFreeDiskGiB
}

$result = [ordered]@{
    contractVersion = 1
    checkedAt = [DateTimeOffset]::UtcNow.ToString('O')
    computerNameHash = if ($env:COMPUTERNAME) {
        $bytes = [Text.Encoding]::UTF8.GetBytes($env:COMPUTERNAME)
        [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
    } else { $null }
    osCaption = if ($operatingSystem) { $operatingSystem.Caption } else { $null }
    osVersion = if ($operatingSystem) { $operatingSystem.Version } else { $null }
    totalMemoryGiB = $totalMemoryGiB
    freeDiskGiB = $freeDiskGiB
    storagePath = [System.IO.Path]::GetFullPath($StoragePath)
    checks = $checks
    ready = -not ($checks.Values -contains $false)
    warnings = @(
        if (-not $checks.supportedEdition) { 'Windows edition may not support Hyper-V.' }
        if (-not $checks.hyperVFeatureEnabled) { 'Hyper-V optional feature is not enabled.' }
        if (-not $checks.hyperVCmdletsAvailable) { 'Hyper-V PowerShell cmdlets are unavailable.' }
        if (-not $checks.firmwareVirtualizationEnabled) { 'Firmware virtualization is disabled or unavailable.' }
        if (-not $checks.secondLevelAddressTranslation) { 'SLAT is unavailable.' }
        if (-not $checks.enoughMemory) { "Less than $RequiredMemoryGiB GiB total memory is available." }
        if (-not $checks.enoughFreeDisk) { "Less than $RequiredFreeDiskGiB GiB free disk is available." }
    )
}

$result | ConvertTo-Json -Depth 8
if (-not $result.ready) { exit 2 }
