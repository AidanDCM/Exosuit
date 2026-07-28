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
$hyperVFeatureCim = Get-SafeValue { Get-CimInstance Win32_OptionalFeature -Filter "Name='Microsoft-Hyper-V-All'" }
$computerInfo = Get-SafeValue { Get-ComputerInfo -Property HyperVisorPresent }
$hyperVHostSystem = Get-SafeValue { Get-CimInstance -Namespace root\virtualization\v2 -ClassName Msvm_ComputerSystem | Select-Object -First 1 }
$hyperVCmdlets = [bool](Get-Command Get-VM -ErrorAction SilentlyContinue)
$hypervisorPresent = if ($computerInfo) { [bool]$computerInfo.HyperVisorPresent } else { $false }
$hyperVFeatureEnabled = ($hyperVFeature -and $hyperVFeature.State -eq 'Enabled') -or ($hyperVFeatureCim -and $hyperVFeatureCim.InstallState -eq 1)
$processorFirmwareVirtualization = if ($processor) { [bool]$processor.VirtualizationFirmwareEnabled } else { $false }
$processorSecondLevelAddressTranslation = if ($processor) { [bool]$processor.SecondLevelAddressTranslationExtensions } else { $false }
$firmwareVirtualization = $processorFirmwareVirtualization -or $hypervisorPresent
$secondLevelAddressTranslation = $processorSecondLevelAddressTranslation -or $hypervisorPresent
$totalMemoryGiB = if ($computer) { [math]::Round($computer.TotalPhysicalMemory / 1GB, 2) } else { 0 }

$storageRoot = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($StoragePath))
$drive = Get-SafeValue { Get-PSDrive -Name $storageRoot.TrimEnd(':\') }
$freeDiskGiB = if ($drive) { [math]::Round($drive.Free / 1GB, 2) } else { 0 }

$checks = [ordered]@{
    isWindows = $true
    supportedEdition = if ($operatingSystem) { $operatingSystem.Caption -match 'Pro|Enterprise|Education|Server' } else { $false }
    hyperVFeatureEnabled = $hyperVFeatureEnabled
    hyperVCmdletsAvailable = $hyperVCmdlets
    hyperVHostAvailable = [bool]$hyperVHostSystem
    hypervisorPresent = $hypervisorPresent
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
        $sha256 = [Security.Cryptography.SHA256]::Create()
        try {
            (($sha256.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
        } finally {
            $sha256.Dispose()
        }
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
        if (-not $checks.hyperVHostAvailable) { 'Hyper-V host namespace is unavailable.' }
        if (-not $checks.hypervisorPresent) { 'Hypervisor is not active.' }
        if (-not $checks.firmwareVirtualizationEnabled) { 'Firmware virtualization is disabled or unavailable.' }
        if (-not $checks.secondLevelAddressTranslation) { 'SLAT is unavailable.' }
        if (-not $checks.enoughMemory) { "Less than $RequiredMemoryGiB GiB total memory is available." }
        if (-not $checks.enoughFreeDisk) { "Less than $RequiredFreeDiskGiB GiB free disk is available." }
    )
}

$result | ConvertTo-Json -Depth 8
if (-not $result.ready) { exit 2 }
