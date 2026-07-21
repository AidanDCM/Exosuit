[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$PlanPath,

    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$HostConfigPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json -Depth 100
$config = Get-Content -LiteralPath $HostConfigPath -Raw | ConvertFrom-Json -Depth 50

if ($plan.contractVersion -ne 1 -or $config.contractVersion -ne 1) { throw 'Unsupported Field provisioning or host configuration contract version.' }
if ($plan.hypervisor -ne 'hyper-v' -or $plan.vmGeneration -ne 2) { throw 'Only Hyper-V Generation 2 Field plans are supported.' }
if ($plan.identity.subsystem -ne 'field') { throw 'Provisioning plan does not contain a Field identity.' }
if ($plan.hostIntegrations.clipboard -ne $false -or $plan.hostIntegrations.broadDriveMapping -ne $false -or $plan.hostIntegrations.hostInputInjection -ne $false) {
    throw 'Provisioning plan attempts to enable a forbidden host integration.'
}
if ($plan.hostIntegrations.artifactBrokerOnly -ne $true) { throw 'Provisioning plan must require the artifact broker.' }
if ($plan.security.secureBoot -ne $true -or $plan.security.nestedVirtualization -ne $false) { throw 'Provisioning security settings are outside the approved contract.' }
if ($plan.storage.baseImage.readOnly -ne $true) { throw 'Base image must remain immutable.' }
if ($plan.storage.runtimeOverlay.disposable -ne $true -or $plan.storage.runtimeOverlay.differencing -ne $true) {
    throw 'Runtime OS disk must be a disposable differencing overlay.'
}
if ($plan.storage.runtimeOverlay.parentImageId -ne $plan.storage.baseImage.imageId) { throw 'Runtime overlay parent identity does not match the base image.' }
if ($plan.storage.taskDisk.disposable -ne $true) { throw 'Task disk must be disposable.' }
if ($plan.network.hostLanAccess -ne $false -or $plan.network.inboundConnections -ne $false) { throw 'Network plan attempts to enable forbidden connectivity.' }

$base = @($config.baseImages | Where-Object { $_.imageId -eq $plan.storage.baseImage.imageId })
if ($base.Count -ne 1) { throw 'Host configuration must resolve exactly one approved base image.' }
$base = $base[0]
if (-not (Test-Path -LiteralPath $base.path -PathType Leaf)) { throw "Base image file is missing: $($base.path)" }
$baseDigest = (Get-FileHash -LiteralPath $base.path -Algorithm SHA256).Hash.ToLowerInvariant()
if ($baseDigest -ne $plan.storage.baseImage.digest -or $baseDigest -ne $base.digest) { throw 'Base image digest does not match the plan and host registry.' }

$personal = $null
if ($null -ne $plan.storage.personalState) {
    $matches = @($config.personalStateDisks | Where-Object { $_.diskId -eq $plan.storage.personalState.diskId })
    if ($matches.Count -ne 1) { throw 'Host configuration must resolve exactly one approved personal-state disk.' }
    $personal = $matches[0]
    if (-not (Test-Path -LiteralPath $personal.path -PathType Leaf)) { throw "Personal-state disk is missing: $($personal.path)" }
    $personalDigest = (Get-FileHash -LiteralPath $personal.path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($personalDigest -ne $plan.storage.personalState.digest -or $personalDigest -ne $personal.digest) {
        throw 'Personal-state disk digest does not match the plan and host registry.'
    }
}

$fieldId = [Guid]::Parse([string]$plan.identity.fieldId).ToString()
$generation = [int]$plan.identity.fieldGeneration
if ($generation -lt 1) { throw 'Field generation is invalid.' }
$storageRoot = [System.IO.Path]::GetFullPath([string]$config.storageRoot)
if ([System.IO.Path]::GetPathRoot($storageRoot) -eq $storageRoot) { throw 'Field storage root cannot be an entire drive.' }
$generationRoot = Join-Path $storageRoot (Join-Path $fieldId "generation-$generation")
$vmName = "Exosuit-Field-$fieldId-G$generation"
$vmPath = Join-Path $generationRoot 'VM'
$runtimeOverlayPath = Join-Path $generationRoot "$($plan.storage.runtimeOverlay.diskId).vhdx"
$taskDiskPath = Join-Path $generationRoot "$($plan.storage.taskDisk.diskId).vhdx"

$switchName = switch ([string]$plan.network.mode) {
    'disabled' { $null }
    'isolated' { [string]$config.networkSwitches.isolated }
    'nat_filtered' { [string]$config.networkSwitches.natFiltered }
    default { throw 'Unsupported Field network mode.' }
}
if ($plan.network.mode -ne 'disabled' -and [string]::IsNullOrWhiteSpace($switchName)) { throw 'Host configuration does not provide the required virtual switch.' }

$operations = @(
    [ordered]@{ step = 'verify_host_capabilities'; mutation = $false; description = 'Run Test-ExosuitFieldHost.ps1 and require ready=true.' },
    [ordered]@{ step = 'create_runtime_overlay'; mutation = $true; cmdlet = 'New-VHD'; target = $runtimeOverlayPath; parentPath = $base.path; differencing = $true },
    [ordered]@{ step = 'create_task_disk'; mutation = $true; cmdlet = 'New-VHD'; target = $taskDiskPath; dynamic = $true; maximumBytes = [long]$plan.storage.taskDisk.maximumBytes },
    [ordered]@{ step = 'create_generation_2_vm'; mutation = $true; cmdlet = 'New-VM'; vmName = $vmName; vmPath = $vmPath; generation = 2; bootDisk = $runtimeOverlayPath },
    [ordered]@{ step = 'configure_compute'; mutation = $true; cmdlets = @('Set-VMProcessor', 'Set-VMMemory'); virtualProcessors = [int]$plan.compute.virtualProcessors; startupMemoryMiB = [int]$plan.compute.startupMemoryMiB; dynamicMemory = [bool]$plan.compute.dynamicMemory; minimumMemoryMiB = [int]$plan.compute.minimumMemoryMiB; maximumMemoryMiB = [int]$plan.compute.maximumMemoryMiB },
    [ordered]@{ step = 'configure_secure_boot'; mutation = $true; cmdlet = 'Set-VMFirmware'; secureBoot = $true; tpmRequired = [bool]$plan.security.tpmRequired },
    [ordered]@{ step = 'configure_network'; mutation = $true; mode = [string]$plan.network.mode; switchName = $switchName; hostLanAccess = $false; inboundConnections = $false; allowedOrigins = @($plan.network.allowedOrigins) },
    [ordered]@{ step = 'attach_personal_state'; mutation = $null -ne $personal; cmdlet = if ($personal) { 'Add-VMHardDiskDrive' } else { $null }; path = if ($personal) { $personal.path } else { $null } },
    [ordered]@{ step = 'attach_task_disk'; mutation = $true; cmdlet = 'Add-VMHardDiskDrive'; path = $taskDiskPath },
    [ordered]@{ step = 'start_vm'; mutation = $true; cmdlet = 'Start-VM'; vmName = $vmName },
    [ordered]@{ step = 'await_guest_heartbeat'; mutation = $false; timeoutSeconds = 120 },
    [ordered]@{ step = 'verify_guest_identity'; mutation = $false; fieldId = $fieldId; fieldGeneration = $generation; agentId = [string]$plan.identity.agentId },
    [ordered]@{ step = 'verify_display_contract'; mutation = $false; width = [int]$plan.display.width; height = [int]$plan.display.height; scalePercent = [int]$plan.display.scalePercent },
    [ordered]@{ step = 'declare_ready'; mutation = $false; requiresAttestation = $true }
)

$result = [ordered]@{
    contractVersion = 1
    resolvedAt = [DateTimeOffset]::UtcNow.ToString('O')
    planId = [string]$plan.planId
    planHash = [string]$plan.planHash
    field = [ordered]@{ fieldId = $fieldId; fieldGeneration = $generation }
    vmName = $vmName
    paths = [ordered]@{
        generationRoot = $generationRoot
        vmPath = $vmPath
        baseImagePath = [string]$base.path
        runtimeOverlayPath = $runtimeOverlayPath
        personalStatePath = if ($personal) { [string]$personal.path } else { $null }
        taskDiskPath = $taskDiskPath
    }
    network = [ordered]@{ mode = [string]$plan.network.mode; switchName = $switchName }
    operations = $operations
    applySupportedByThisScript = $false
    warning = 'This command resolves and validates a typed plan only. It performs no Hyper-V mutations.'
}

$result | ConvertTo-Json -Depth 30
