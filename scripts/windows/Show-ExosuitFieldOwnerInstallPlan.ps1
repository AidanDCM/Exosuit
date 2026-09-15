[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateScript({ Test-Path $_ -PathType Container })][string]$PublishDirectory,
    [Parameter(Mandatory)][ValidateScript({ Test-Path $_ -PathType Container })][string]$ObserverPublishDirectory,
    [Parameter(Mandatory)][ValidateScript({ Test-Path $_ -PathType Leaf })][string]$HostConfigPath,
    [Parameter(Mandatory)][ValidateScript({ Test-Path $_ -PathType Container })][string]$RepositoryRoot,
    [Parameter()][ValidateRange(1, 180)][int]$ValidityDays = 180,
    [Parameter()][ValidateRange(1, 4)][int]$MaxActiveFields = 2,
    [Parameter()][switch]$AllowDevelopmentAccess
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Digest([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Read-Json([string]$Path) {
    $raw = Get-Content -LiteralPath $Path -Raw
    if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('Depth')) { return $raw | ConvertFrom-Json -Depth 50 }
    return $raw | ConvertFrom-Json
}

$publish = [IO.Path]::GetFullPath($PublishDirectory)
$observerPublish = [IO.Path]::GetFullPath($ObserverPublishDirectory)
$repository = [IO.Path]::GetFullPath($RepositoryRoot)
$hostConfig = [IO.Path]::GetFullPath($HostConfigPath)
$serviceBinary = Join-Path $publish 'Exosuit.FieldOwner.Service.exe'
$provisionScript = Join-Path $repository 'scripts\windows\Invoke-ExosuitFieldProvisioning.ps1'
$hostCheckScript = Join-Path $repository 'scripts\windows\Test-ExosuitFieldHost.ps1'
$destroyScript = Join-Path $repository 'scripts\windows\Remove-ExosuitFieldGeneration.ps1'
$observeScript = Join-Path $repository 'scripts\windows\Read-ExosuitFieldGuestKvp.ps1'
$observerAgent = Join-Path $observerPublish 'Exosuit.Agent.exe'
foreach ($path in @($serviceBinary, $hostConfig, $provisionScript, $hostCheckScript, $destroyScript, $observeScript, $observerAgent)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required installation input is missing: $path" }
}
$config = Read-Json $hostConfig
if ($config.contractVersion -ne 1) { throw 'Unsupported Field host configuration contract version.' }
$storageRoot = [IO.Path]::GetFullPath([string]$config.storageRoot).TrimEnd('\')
if ([IO.Path]::GetPathRoot($storageRoot) -eq $storageRoot) { throw 'Field storage root cannot be an entire drive.' }
$ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$createdAt = [DateTimeOffset]::UtcNow
$plan = [ordered]@{
    contractVersion = 1
    policyId = [Guid]::NewGuid().ToString()
    createdAt = $createdAt.ToString('O')
    expiresAt = $createdAt.AddDays($ValidityDays).ToString('O')
    ownerSid = $ownerSid
    storageRoot = $storageRoot
    hostConfigSha256 = Get-Digest $hostConfig
    provisionScriptSha256 = Get-Digest $provisionScript
    hostCheckScriptSha256 = Get-Digest $hostCheckScript
    destroyScriptSha256 = Get-Digest $destroyScript
    observeScriptSha256 = Get-Digest $observeScript
    observerAgentSha256 = Get-Digest $observerAgent
    serviceBinarySha256 = Get-Digest $serviceBinary
    allowedOperations = @('provision', 'observe', 'destroy')
    allowDevelopmentAccess = [bool]$AllowDevelopmentAccess
    maxActiveFields = $MaxActiveFields
    maxJobAgeSeconds = 300
    installation = [ordered]@{
        serviceName = 'ExosuitFieldOwner'
        serviceIdentity = 'LocalSystem'
        startMode = 'AutomaticDelayedStart'
        installRoot = 'C:\Program Files\Exosuit\FieldOwner'
        dataRoot = 'C:\ProgramData\Exosuit\FieldOwner'
        arbitraryCommandExecution = $false
        mcpExposed = $false
        pilotMayChangePolicy = $false
        recordingAuthority = $false
        keyAuthority = $false
        exportAuthority = $false
        uninstallCommand = '.\scripts\windows\Uninstall-ExosuitFieldOwnerService.ps1'
    }
}
$plan | ConvertTo-Json -Depth 20
