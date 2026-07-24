[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$PlanPath,

    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$HostConfigPath,

    [Parameter()]
    [switch]$Apply,

    [Parameter()]
    [string]$TypedConfirmation,

    [Parameter()]
    [ValidateScript({ Test-Path $_ -PathType Container })]
    [string]$GuestSeedDirectory,

    [Parameter()]
    [switch]$DevelopmentAccess,

    [Parameter()]
    [string]$EvidenceDirectory = "$env:ProgramData\Exosuit\Evidence"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-FileDigest {
    param([Parameter(Mandatory)][string]$Path)
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function ConvertFrom-JsonDocument {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][int]$Depth)
    $json = Get-Content -LiteralPath $Path -Raw
    if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('Depth')) {
        return $json | ConvertFrom-Json -Depth $Depth
    }
    return $json | ConvertFrom-Json
}

function ConvertFrom-JsonText {
    param([Parameter(Mandatory)][string]$Json, [Parameter(Mandatory)][int]$Depth)
    if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('Depth')) {
        return $Json | ConvertFrom-Json -Depth $Depth
    }
    return $Json | ConvertFrom-Json
}

function Assert-ChildPath {
    param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string]$Target)
    $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    $targetPath = [System.IO.Path]::GetFullPath($Target)
    if (-not $targetPath.StartsWith($rootPath, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Target escapes approved Field storage root: $targetPath"
    }
}

$plan = ConvertFrom-JsonDocument -Path $PlanPath -Depth 100
$config = ConvertFrom-JsonDocument -Path $HostConfigPath -Depth 50
if ($plan.contractVersion -ne 1 -or $config.contractVersion -ne 1) { throw 'Unsupported Field provisioning or host configuration contract version.' }
if ($plan.hypervisor -ne 'hyper-v' -or $plan.vmGeneration -ne 2) { throw 'Only Hyper-V Generation 2 Field plans are supported.' }
if ($plan.identity.subsystem -ne 'field') { throw 'Provisioning plan does not contain a Field identity.' }
if ($plan.hostIntegrations.clipboard -ne $false -or $plan.hostIntegrations.broadDriveMapping -ne $false -or $plan.hostIntegrations.hostInputInjection -ne $false -or $plan.hostIntegrations.artifactBrokerOnly -ne $true) {
    throw 'Provisioning plan violates the Field host-integration boundary.'
}
if ($plan.security.secureBoot -ne $true -or $plan.security.nestedVirtualization -ne $false) { throw 'Provisioning security settings are outside the approved contract.' }
if ($plan.storage.baseImage.readOnly -ne $true) { throw 'Base image must remain immutable.' }
if ($plan.storage.runtimeOverlay.disposable -ne $true -or $plan.storage.runtimeOverlay.differencing -ne $true) { throw 'Runtime OS disk must be a disposable differencing overlay.' }
if ($plan.storage.runtimeOverlay.parentImageId -ne $plan.storage.baseImage.imageId) { throw 'Runtime overlay parent identity does not match the base image.' }
if ($plan.storage.taskDisk.disposable -ne $true) { throw 'Task disk must be disposable.' }
if ($plan.network.hostLanAccess -ne $false -or $plan.network.inboundConnections -ne $false) { throw 'Network plan attempts to enable forbidden connectivity.' }
if ($plan.network.mode -eq 'nat_filtered') { throw 'Filtered NAT apply is held until a reviewed firewall/origin-enforcement provider exists.' }

$fieldId = [Guid]::Parse([string]$plan.identity.fieldId).ToString()
$generation = [int]$plan.identity.fieldGeneration
if ($generation -lt 1) { throw 'Field generation is invalid.' }
$expectedConfirmation = "CREATE FIELD $fieldId GENERATION $generation"
if ($Apply -and $TypedConfirmation -cne $expectedConfirmation) {
    throw "Apply requires exact typed confirmation: $expectedConfirmation"
}

function Add-GuestSeedToOverlay {
    param(
        [Parameter(Mandatory)][string]$OverlayPath,
        [Parameter(Mandatory)][string]$SeedDirectory,
        [Parameter(Mandatory)]$Plan
    )
    $seedItem = Get-Item -LiteralPath $SeedDirectory -Force
    if (($seedItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Guest seed directory cannot be a reparse point.' }
    $baseSeedFiles = @('bootstrap-manifest.json', 'guest-runtime.json', 'guest-launch.json', 'channel-secret.txt')
    $developmentSeedFiles = @('development-access.json', 'development-password.txt')
    $planUsesDevelopmentAccess = $Plan.PSObject.Properties.Name -contains 'developmentAccess'
    if ($planUsesDevelopmentAccess -ne [bool]$DevelopmentAccess) {
        throw 'Development access requires both the signed provisioning plan field and the explicit host apply switch.'
    }
    $requiredSeedFiles = @($baseSeedFiles + $(if ($planUsesDevelopmentAccess) { $developmentSeedFiles } else { @() }))
    $actualSeedFiles = @(Get-ChildItem -LiteralPath $SeedDirectory -File -Force)
    if ($actualSeedFiles.Count -ne $requiredSeedFiles.Count -or
        (Compare-Object ($requiredSeedFiles | Sort-Object) ($actualSeedFiles.Name | Sort-Object))) {
        throw 'Guest seed directory must contain exactly the approved four files.'
    }
    $manifest = ConvertFrom-JsonDocument -Path (Join-Path $SeedDirectory 'bootstrap-manifest.json') -Depth 50
    $runtime = ConvertFrom-JsonDocument -Path (Join-Path $SeedDirectory 'guest-runtime.json') -Depth 30
    $launch = ConvertFrom-JsonDocument -Path (Join-Path $SeedDirectory 'guest-launch.json') -Depth 20
    if ($manifest.identity.fieldId -ne $Plan.identity.fieldId -or
        [int]$manifest.identity.fieldGeneration -ne [int]$Plan.identity.fieldGeneration -or
        $manifest.identity.baseImageDigest -ne $Plan.identity.baseImageDigest) {
        throw 'Guest seed manifest identity does not match the provisioning plan.'
    }
    if ($runtime.field.fieldId -ne $Plan.identity.fieldId -or
        [int]$runtime.field.fieldGeneration -ne [int]$Plan.identity.fieldGeneration -or
        $runtime.agentId -ne $Plan.identity.agentId -or
        $runtime.keyId -ne $manifest.channelKeyId) {
        throw 'Guest runtime identity or key ID does not match the provisioning plan and manifest.'
    }
    if ($runtime.secretPath -cne 'C:\Exosuit\Config\channel-secret.txt' -or
        $runtime.bootstrapReportPath -cne 'C:\Exosuit\Diagnostics\bootstrap-report.json' -or
        $launch.manifestPath -cne 'C:\Exosuit\Config\bootstrap-manifest.json' -or
        $launch.runtimeConfigPath -cne 'C:\Exosuit\Config\guest-runtime.json') {
        throw 'Guest seed uses a path outside the fixed guest contract.'
    }
    $secret = (Get-Content -LiteralPath (Join-Path $SeedDirectory 'channel-secret.txt') -Raw).Trim()
    if ($secret.Length -lt 32) { throw 'Guest channel secret must contain at least 32 characters.' }
    if ($planUsesDevelopmentAccess) {
        if ($Plan.network.mode -ne 'isolated' -or $Plan.storage.PSObject.Properties.Name -contains 'personalState') {
            throw 'Development access is restricted to isolated disposable Fields without personal state.'
        }
        $development = ConvertFrom-JsonDocument -Path (Join-Path $SeedDirectory 'development-access.json') -Depth 10
        if ($development.contractVersion -ne 1 -or
            $development.mode -cne 'auto_logon' -or
            $development.nonProduction -ne $true -or
            $development.userName -cne [string]$Plan.developmentAccess.userName -or
            $development.windowsSetup.mode -cne 'unattended_disposable' -or
            $development.windowsSetup.locale -cne 'en-US' -or
            $development.windowsSetup.timeZone -cne 'Eastern Standard Time' -or
            $development.windowsSetup.mode -cne [string]$Plan.developmentAccess.windowsSetup.mode -or
            $development.windowsSetup.locale -cne [string]$Plan.developmentAccess.windowsSetup.locale -or
            $development.windowsSetup.timeZone -cne [string]$Plan.developmentAccess.windowsSetup.timeZone) {
            throw 'Development access seed does not match the provisioning plan.'
        }
        $developmentPassword = (Get-Content -LiteralPath (Join-Path $SeedDirectory 'development-password.txt') -Raw).Trim()
        if ($developmentPassword.Length -lt 24) { throw 'Development password must contain at least 24 characters.' }
    }

    $mounted = $false
    try {
        $vhd = Mount-VHD -Path $OverlayPath -PassThru
        $mounted = $true
        $disk = $vhd | Get-Disk
        $partition = Get-Partition -DiskNumber $disk.Number |
            Where-Object { $_.Type -eq 'Basic' } |
            Sort-Object Size -Descending |
            Select-Object -First 1
        if (-not $partition) { throw 'Guest overlay does not contain a Windows data partition.' }
        if (-not $partition.DriveLetter) {
            $partition | Add-PartitionAccessPath -AssignDriveLetter
            $partition = Get-Partition -DiskNumber $disk.Number -PartitionNumber $partition.PartitionNumber
        }
        $configDirectory = "$($partition.DriveLetter):\Exosuit\Config"
        New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
        foreach ($name in $requiredSeedFiles) {
            Copy-Item -LiteralPath (Join-Path $SeedDirectory $name) -Destination (Join-Path $configDirectory $name)
        }
        if ($planUsesDevelopmentAccess) {
            $pantherDirectory = "$($partition.DriveLetter):\Windows\Panther"
            New-Item -ItemType Directory -Path $pantherDirectory -Force | Out-Null
            $unattendPath = Join-Path $pantherDirectory 'Unattend.xml'
            $unattend = @'
<?xml version="1.0" encoding="utf-8"?>
<unattend xmlns="urn:schemas-microsoft-com:unattend">
  <settings pass="specialize">
    <component name="Microsoft-Windows-Deployment" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <RunSynchronous>
        <RunSynchronousCommand wcm:action="add" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
          <Order>1</Order>
          <Description>Initialize isolated Exosuit development access</Description>
          <Path>powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Exosuit\Agent\Initialize-ExosuitDevelopmentAccess.ps1" -NoRestart</Path>
        </RunSynchronousCommand>
      </RunSynchronous>
    </component>
  </settings>
  <settings pass="oobeSystem">
    <component name="Microsoft-Windows-International-Core" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <InputLocale>en-US</InputLocale>
      <SystemLocale>en-US</SystemLocale>
      <UILanguage>en-US</UILanguage>
      <UserLocale>en-US</UserLocale>
    </component>
    <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <TimeZone>Eastern Standard Time</TimeZone>
      <OOBE>
        <HideEULAPage>true</HideEULAPage>
        <HideLocalAccountScreen>true</HideLocalAccountScreen>
        <HideOnlineAccountScreens>true</HideOnlineAccountScreens>
        <HideWirelessSetupInOOBE>true</HideWirelessSetupInOOBE>
        <NetworkLocation>Work</NetworkLocation>
        <ProtectYourPC>3</ProtectYourPC>
        <SkipMachineOOBE>true</SkipMachineOOBE>
        <SkipUserOOBE>true</SkipUserOOBE>
      </OOBE>
    </component>
  </settings>
</unattend>
'@
            if ($unattend -match '(?i)<Password>|development-password|channel-secret') {
                throw 'Development unattended setup must not contain a credential or channel secret.'
            }
            [IO.File]::WriteAllText($unattendPath, $unattend, [Text.UTF8Encoding]::new($false))
        }
        & icacls.exe $configDirectory /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict guest seed ACLs to SYSTEM and Administrators.' }
    } finally {
        if ($mounted) { Dismount-VHD -Path $OverlayPath -ErrorAction SilentlyContinue }
    }
}

$hostCheckJson = & "$PSScriptRoot\Test-ExosuitFieldHost.ps1" -StoragePath $config.storageRoot
$lastExitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
$hostCheckExit = if ($lastExitCodeVariable) { [int]$lastExitCodeVariable.Value } else { 0 }
$hostCheck = ConvertFrom-JsonText -Json ($hostCheckJson -join [Environment]::NewLine) -Depth 20
if ($hostCheckExit -ne 0 -or -not $hostCheck.ready) { throw 'Host capability check did not pass.' }

$baseMatches = @($config.baseImages | Where-Object { $_.imageId -eq $plan.storage.baseImage.imageId })
if ($baseMatches.Count -ne 1) { throw 'Host configuration must resolve exactly one approved base image.' }
$base = $baseMatches[0]
if (-not (Test-Path -LiteralPath $base.path -PathType Leaf)) { throw "Base image is missing: $($base.path)" }
$baseDigest = Get-FileDigest -Path $base.path
if ($baseDigest -ne $plan.storage.baseImage.digest -or $baseDigest -ne $base.digest) { throw 'Base image digest mismatch.' }

$personal = $null
$plannedPersonalState = $null
if ($plan.storage.PSObject.Properties.Name -contains 'personalState') {
    $plannedPersonalState = $plan.storage.personalState
}
if ($null -ne $plannedPersonalState) {
    $personalMatches = @($config.personalStateDisks | Where-Object {
        $_.diskId -eq $plannedPersonalState.diskId -and
        [int]$_.diskGeneration -eq [int]$plannedPersonalState.diskGeneration
    })
    if ($personalMatches.Count -ne 1) { throw 'Host configuration must resolve exactly one approved personal-state disk.' }
    $personal = $personalMatches[0]
    if (-not (Test-Path -LiteralPath $personal.path -PathType Leaf)) { throw "Personal-state disk is missing: $($personal.path)" }
    if ($personal.encrypted -ne $true -or $plannedPersonalState.encrypted -ne $true) { throw 'Personal-state disk must be registered as encrypted.' }
}

$storageRoot = [System.IO.Path]::GetFullPath([string]$config.storageRoot)
if ([System.IO.Path]::GetPathRoot($storageRoot) -eq $storageRoot) { throw 'Field storage root cannot be an entire drive.' }
$generationRoot = Join-Path $storageRoot (Join-Path $fieldId "generation-$generation")
$vmName = "Exosuit-Field-$fieldId-G$generation"
$vmPath = Join-Path $generationRoot 'VM'
$runtimeOverlayPath = Join-Path $generationRoot "$($plan.storage.runtimeOverlay.diskId).vhdx"
$taskDiskPath = Join-Path $generationRoot "$($plan.storage.taskDisk.diskId).vhdx"
Assert-ChildPath -Root $storageRoot -Target $generationRoot
Assert-ChildPath -Root $storageRoot -Target $runtimeOverlayPath
Assert-ChildPath -Root $storageRoot -Target $taskDiskPath

$switchName = $null
if ($plan.network.mode -eq 'isolated') {
    $switchName = [string]$config.networkSwitches.isolated
    if ([string]::IsNullOrWhiteSpace($switchName)) { throw 'Isolated virtual switch is not configured.' }
    $switch = Get-VMSwitch -Name $switchName -ErrorAction Stop
    if ($switch.SwitchType -ne 'Private') { throw 'The configured isolated switch must be a Hyper-V Private switch.' }
}

$summary = [ordered]@{
    contractVersion = 1
    generatedAt = [DateTimeOffset]::UtcNow.ToString('O')
    applyRequested = [bool]$Apply
    planId = [string]$plan.planId
    planHash = [string]$plan.planHash
    field = [ordered]@{ fieldId = $fieldId; fieldGeneration = $generation }
    vmName = $vmName
    generationRoot = $generationRoot
    runtimeOverlayPath = $runtimeOverlayPath
    taskDiskPath = $taskDiskPath
    networkMode = [string]$plan.network.mode
    switchName = $switchName
    developmentAccessEnabled = [bool]($plan.PSObject.Properties.Name -contains 'developmentAccess')
    developmentUnattendedSetupEnabled = [bool]($plan.PSObject.Properties.Name -contains 'developmentAccess')
    completedSteps = [System.Collections.Generic.List[string]]::new()
    rollbackSteps = [System.Collections.Generic.List[string]]::new()
    status = if ($Apply) { 'applying' } else { 'dry_run' }
    error = $null
}

if (-not $Apply) {
    $summary.status = 'dry_run_complete'
    $summary.warning = "No mutation performed. Re-run with -Apply and -TypedConfirmation '$expectedConfirmation'."
    $summary | ConvertTo-Json -Depth 20
    return
}

if (Get-VM -Name $vmName -ErrorAction SilentlyContinue) { throw "VM already exists: $vmName" }
if (Test-Path -LiteralPath $generationRoot) { throw "Field generation directory already exists: $generationRoot" }

try {
    if ($PSCmdlet.ShouldProcess($generationRoot, 'Create Field generation storage')) {
        New-Item -ItemType Directory -Path $generationRoot -Force | Out-Null
        $summary.completedSteps.Add('create_generation_root')
        $summary.rollbackSteps.Insert(0, 'remove_generation_root')
    }
    if ($PSCmdlet.ShouldProcess($runtimeOverlayPath, 'Create disposable differencing OS overlay')) {
        New-VHD -Path $runtimeOverlayPath -ParentPath $base.path -Differencing | Out-Null
        $summary.completedSteps.Add('create_runtime_overlay')
    }
    if ($GuestSeedDirectory) {
        if ($PSCmdlet.ShouldProcess($runtimeOverlayPath, 'Inject exact per-generation guest seed')) {
            Add-GuestSeedToOverlay -OverlayPath $runtimeOverlayPath -SeedDirectory $GuestSeedDirectory -Plan $plan
            $summary.completedSteps.Add('seed_guest_overlay')
        }
    }
    if ($PSCmdlet.ShouldProcess($taskDiskPath, 'Create disposable task disk')) {
        New-VHD -Path $taskDiskPath -Dynamic -SizeBytes ([UInt64]$plan.storage.taskDisk.maximumBytes) | Out-Null
        $summary.completedSteps.Add('create_task_disk')
    }

    $newVmParameters = @{
        Name = $vmName
        Generation = 2
        MemoryStartupBytes = [UInt64]$plan.compute.startupMemoryMiB * 1MB
        VHDPath = $runtimeOverlayPath
        Path = $vmPath
    }
    if ($switchName) { $newVmParameters.SwitchName = $switchName }
    if ($PSCmdlet.ShouldProcess($vmName, 'Create Hyper-V Field VM')) {
        New-VM @newVmParameters | Out-Null
        $summary.completedSteps.Add('create_vm')
        $summary.rollbackSteps.Insert(0, 'remove_vm')
    }

    Set-VMProcessor -VMName $vmName -Count ([int]$plan.compute.virtualProcessors) -ExposeVirtualizationExtensions $false
    if ($plan.compute.dynamicMemory) {
        Set-VMMemory -VMName $vmName -DynamicMemoryEnabled $true -MinimumBytes ([UInt64]$plan.compute.minimumMemoryMiB * 1MB) -StartupBytes ([UInt64]$plan.compute.startupMemoryMiB * 1MB) -MaximumBytes ([UInt64]$plan.compute.maximumMemoryMiB * 1MB)
    } else {
        Set-VMMemory -VMName $vmName -DynamicMemoryEnabled $false -StartupBytes ([UInt64]$plan.compute.startupMemoryMiB * 1MB)
    }
    Set-VMFirmware -VMName $vmName -EnableSecureBoot On -SecureBootTemplate 'MicrosoftWindows'
    Set-VMVideo -VMName $vmName -HorizontalResolution ([int]$plan.display.width) -VerticalResolution ([int]$plan.display.height) -ResolutionType Single
    Set-VM -VMName $vmName -CheckpointType $(if ($plan.security.checkpoints -eq 'production') { 'Production' } else { 'Disabled' }) -AutomaticCheckpointsEnabled $false
    Enable-VMIntegrationService -VMName $vmName -Name 'Time Synchronization'
    $summary.completedSteps.Add('configure_vm')

    if ($plan.security.tpmRequired) {
        Set-VMKeyProtector -VMName $vmName -NewLocalKeyProtector
        Enable-VMTPM -VMName $vmName
        $summary.completedSteps.Add('enable_tpm')
    }

    if ($personal) {
        Add-VMHardDiskDrive -VMName $vmName -ControllerType SCSI -Path $personal.path | Out-Null
        $summary.completedSteps.Add('attach_personal_state')
    }
    Add-VMHardDiskDrive -VMName $vmName -ControllerType SCSI -Path $taskDiskPath | Out-Null
    $summary.completedSteps.Add('attach_task_disk')

    if ($plan.network.mode -eq 'disabled') {
        Get-VMNetworkAdapter -VMName $vmName -ErrorAction SilentlyContinue | Remove-VMNetworkAdapter -Confirm:$false
        $summary.completedSteps.Add('remove_network_adapter')
    }

    if ($PSCmdlet.ShouldProcess($vmName, 'Start Hyper-V Field VM')) {
        Start-VM -Name $vmName | Out-Null
        $summary.completedSteps.Add('start_vm')
    }
    $summary.status = 'started_pending_guest_validation'
} catch {
    $summary.status = 'failed_rolling_back'
    $summary.error = $_.Exception.Message
    try {
        $vm = Get-VM -Name $vmName -ErrorAction SilentlyContinue
        if ($vm) {
            if ($vm.State -ne 'Off') { Stop-VM -Name $vmName -TurnOff -Force -Confirm:$false -ErrorAction SilentlyContinue }
            Remove-VM -Name $vmName -Force -Confirm:$false -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $generationRoot) { Remove-Item -LiteralPath $generationRoot -Recurse -Force }
        $summary.status = 'failed_rolled_back'
    } catch {
        $summary.status = 'failed_rollback_incomplete'
        $summary.rollbackError = $_.Exception.Message
    }
    throw
} finally {
    New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
    $evidencePath = Join-Path $EvidenceDirectory "field-provision-$fieldId-g$generation-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()).json"
    [IO.File]::WriteAllText($evidencePath, ($summary | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
}

$summary | ConvertTo-Json -Depth 20
