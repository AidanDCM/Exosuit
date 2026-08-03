[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)][ValidateScript({ Test-Path $_ -PathType Leaf })][string]$InstallPlanPath,
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{64}$')][string]$ExpectedInstallPlanSha256,
    [Parameter(Mandatory)][ValidateScript({ Test-Path $_ -PathType Container })][string]$PublishDirectory,
    [Parameter(Mandatory)][ValidateScript({ Test-Path $_ -PathType Container })][string]$ObserverPublishDirectory,
    [Parameter(Mandatory)][ValidateScript({ Test-Path $_ -PathType Leaf })][string]$HostConfigPath,
    [Parameter(Mandatory)][ValidateScript({ Test-Path $_ -PathType Container })][string]$RepositoryRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:InstallStage = 10
trap {
    $global:ExosuitFieldOwnerInstallStage = $script:InstallStage
    throw
}

function Read-Json([string]$Path, [int]$Depth) {
    $raw = Get-Content -LiteralPath $Path -Raw
    if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('Depth')) { return $raw | ConvertFrom-Json -Depth $Depth }
    return $raw | ConvertFrom-Json
}
function Get-Digest([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Invoke-Sc([string[]]$Arguments) {
    & "$env:SystemRoot\System32\sc.exe" @Arguments | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $global:ExosuitFieldOwnerNativeExitCode = $LASTEXITCODE
        throw "Service Control Manager command failed: $($Arguments[0])"
    }
}
function Invoke-Icacls([string[]]$Arguments) {
    & "$env:SystemRoot\System32\icacls.exe" @Arguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to establish the Field owner service ACL.' }
}
function Grant-PendingQueueAccess([string]$Path, [string]$OwnerSid) {
    $identity = [Security.Principal.SecurityIdentifier]::new($OwnerSid)
    $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
    $rule = [Security.AccessControl.FileSystemAccessRule]::new(
        $identity,
        [Security.AccessControl.FileSystemRights]::Modify,
        $inheritance,
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Allow
    )
    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRule($rule)
    Set-Acl -LiteralPath $Path -AclObject $acl
}

$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Field owner service installation requires an elevated local administrator.' }

$script:InstallStage = 11
if ((Get-Digest $InstallPlanPath) -cne $ExpectedInstallPlanSha256) { throw 'Field owner installation plan changed after owner review.' }
$plan = Read-Json $InstallPlanPath 30
if ($plan.contractVersion -ne 1) { throw 'Unsupported Field owner installation contract version.' }
$policyId = [Guid]::Parse([string]$plan.policyId).ToString()
$createdAt = [DateTimeOffset]::Parse([string]$plan.createdAt)
$expiresAt = [DateTimeOffset]::Parse([string]$plan.expiresAt)
if ($createdAt -ge $expiresAt -or ($expiresAt - $createdAt).TotalDays -gt 180 -or [DateTimeOffset]::UtcNow -ge $expiresAt) { throw 'Field owner installation policy interval is invalid.' }
if ([string]$plan.ownerSid -notmatch '^S-1-5-21-') { throw 'Field owner installation requires an exact local owner SID.' }
if (@($plan.allowedOperations).Count -ne 3 -or @($plan.allowedOperations) -cnotcontains 'provision' -or @($plan.allowedOperations) -cnotcontains 'observe' -or @($plan.allowedOperations) -cnotcontains 'destroy') { throw 'Field owner installation operation scope is invalid.' }
if ([int]$plan.maxActiveFields -lt 1 -or [int]$plan.maxActiveFields -gt 4 -or [int]$plan.maxJobAgeSeconds -lt 30 -or [int]$plan.maxJobAgeSeconds -gt 900) { throw 'Field owner installation bounds are invalid.' }

$publish = [IO.Path]::GetFullPath($PublishDirectory)
$observerPublish = [IO.Path]::GetFullPath($ObserverPublishDirectory)
$repository = [IO.Path]::GetFullPath($RepositoryRoot)
$hostConfig = [IO.Path]::GetFullPath($HostConfigPath)
$serviceBinary = Join-Path $publish 'Exosuit.FieldOwner.Service.exe'
$provisionScript = Join-Path $repository 'scripts\windows\Invoke-ExosuitFieldProvisioning.ps1'
$destroyScript = Join-Path $repository 'scripts\windows\Remove-ExosuitFieldGeneration.ps1'
$observeScript = Join-Path $repository 'scripts\windows\Read-ExosuitFieldGuestKvp.ps1'
$observerAgent = Join-Path $observerPublish 'Exosuit.Agent.exe'
$expected = @{
    $serviceBinary = [string]$plan.serviceBinarySha256
    $hostConfig = [string]$plan.hostConfigSha256
    $provisionScript = [string]$plan.provisionScriptSha256
    $destroyScript = [string]$plan.destroyScriptSha256
    $observeScript = [string]$plan.observeScriptSha256
    $observerAgent = [string]$plan.observerAgentSha256
}
foreach ($pair in $expected.GetEnumerator()) {
    if (-not (Test-Path -LiteralPath $pair.Key -PathType Leaf) -or (Get-Digest $pair.Key) -cne $pair.Value) { throw "Installation input digest changed: $($pair.Key)" }
}
$script:InstallStage = 12
$config = Read-Json $hostConfig 50
if ($config.contractVersion -ne 1 -or [IO.Path]::GetFullPath([string]$config.storageRoot).TrimEnd('\') -cne [IO.Path]::GetFullPath([string]$plan.storageRoot).TrimEnd('\')) { throw 'Host configuration does not match the reviewed owner policy.' }

$installRoot = 'C:\Program Files\Exosuit\FieldOwner'
$dataRoot = 'C:\ProgramData\Exosuit\FieldOwner'
$scriptsRoot = Join-Path $installRoot 'Scripts'
$observerRoot = Join-Path $installRoot 'Observer'
$pendingRoot = Join-Path $dataRoot 'Queue\Pending'
$processingRoot = Join-Path $dataRoot 'Queue\Processing'
$resultsRoot = Join-Path $dataRoot 'Results'
$evidenceRoot = Join-Path $dataRoot 'Evidence'
$serviceName = 'ExosuitFieldOwner'
$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
$script:InstallStage = 20
if ($existing) {
    if ($existing.Status -ne 'Stopped') { Stop-Service -Name $serviceName -Force; $existing.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30)) }
    Invoke-Sc @('delete', $serviceName)
    Start-Sleep -Milliseconds 500
}

$script:InstallStage = 21
New-Item -ItemType Directory -Path $installRoot, $scriptsRoot, $observerRoot, $dataRoot, $pendingRoot, $processingRoot, $resultsRoot, $evidenceRoot -Force | Out-Null
Get-ChildItem -LiteralPath $installRoot -Force | Remove-Item -Recurse -Force
New-Item -ItemType Directory -Path $scriptsRoot, $observerRoot -Force | Out-Null
$script:InstallStage = 22
Copy-Item -LiteralPath $serviceBinary -Destination (Join-Path $installRoot 'Exosuit.FieldOwner.Service.exe') -Force
Copy-Item -LiteralPath $provisionScript -Destination (Join-Path $scriptsRoot 'Invoke-ExosuitFieldProvisioning.ps1') -Force
Copy-Item -LiteralPath $destroyScript -Destination (Join-Path $scriptsRoot 'Remove-ExosuitFieldGeneration.ps1') -Force
Copy-Item -LiteralPath $observeScript -Destination (Join-Path $scriptsRoot 'Read-ExosuitFieldGuestKvp.ps1') -Force
Copy-Item -LiteralPath $observerAgent -Destination (Join-Path $observerRoot 'Exosuit.Agent.exe') -Force
Copy-Item -LiteralPath $hostConfig -Destination (Join-Path $dataRoot 'host-config.json') -Force

$installedExpected = @{
    (Join-Path $installRoot 'Exosuit.FieldOwner.Service.exe') = [string]$plan.serviceBinarySha256
    (Join-Path $scriptsRoot 'Invoke-ExosuitFieldProvisioning.ps1') = [string]$plan.provisionScriptSha256
    (Join-Path $scriptsRoot 'Remove-ExosuitFieldGeneration.ps1') = [string]$plan.destroyScriptSha256
    (Join-Path $scriptsRoot 'Read-ExosuitFieldGuestKvp.ps1') = [string]$plan.observeScriptSha256
    (Join-Path $observerRoot 'Exosuit.Agent.exe') = [string]$plan.observerAgentSha256
    (Join-Path $dataRoot 'host-config.json') = [string]$plan.hostConfigSha256
}
foreach ($pair in $installedExpected.GetEnumerator()) {
    if ((Get-Digest $pair.Key) -cne $pair.Value) { throw "Installed Field owner input digest is invalid: $($pair.Key)" }
}

$script:InstallStage = 23
$policy = [ordered]@{
    contractVersion = 1
    policyId = $policyId
    createdAt = $createdAt.ToString('O')
    expiresAt = $expiresAt.ToString('O')
    ownerSid = [string]$plan.ownerSid
    storageRoot = [string]$plan.storageRoot
    hostConfigSha256 = [string]$plan.hostConfigSha256
    provisionScriptSha256 = [string]$plan.provisionScriptSha256
    destroyScriptSha256 = [string]$plan.destroyScriptSha256
    observeScriptSha256 = [string]$plan.observeScriptSha256
    observerAgentSha256 = [string]$plan.observerAgentSha256
    allowedOperations = @('provision', 'observe', 'destroy')
    allowDevelopmentAccess = [bool]$plan.allowDevelopmentAccess
    maxActiveFields = [int]$plan.maxActiveFields
    maxJobAgeSeconds = [int]$plan.maxJobAgeSeconds
}
[IO.File]::WriteAllText((Join-Path $dataRoot 'policy.json'), ($policy | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))

$script:InstallStage = 31
Invoke-Icacls @($installRoot, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F')
$script:InstallStage = 32
Invoke-Icacls @($dataRoot, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F')
$script:InstallStage = 33
Grant-PendingQueueAccess -Path $pendingRoot -OwnerSid ([string]$plan.ownerSid)

$script:InstallStage = 40
$installedBinary = Join-Path $installRoot 'Exosuit.FieldOwner.Service.exe'
$binaryPath = '"' + $installedBinary + '" --service'
New-Service -Name $serviceName -BinaryPathName $binaryPath -StartupType Automatic -DisplayName 'Exosuit Field Owner Authority' | Out-Null
$script:InstallStage = 41
Invoke-Sc @('config', $serviceName, 'start=', 'delayed-auto')
$script:InstallStage = 42
Invoke-Sc @('failure', $serviceName, 'reset=', '86400', 'actions=', 'restart/5000/restart/30000/restart/60000')
Invoke-Sc @('failureflag', $serviceName, '1')
$script:InstallStage = 50
Start-Service -Name $serviceName
(Get-Service -Name $serviceName).WaitForStatus('Running', [TimeSpan]::FromSeconds(30))

$script:InstallStage = 60
$receipt = [ordered]@{
    contractVersion = 1
    installedAt = [DateTimeOffset]::UtcNow.ToString('O')
    serviceName = $serviceName
    serviceIdentity = 'LocalSystem'
    status = 'installed_running'
    policyId = $policyId
    expiresAt = $expiresAt.ToString('O')
    ownerSid = [string]$plan.ownerSid
    allowedOperations = @('provision', 'observe', 'destroy')
    arbitraryCommandExecution = $false
    modelFacing = $false
    policyChangeRequiresElevation = $true
    rollback = 'Run scripts\windows\Uninstall-ExosuitFieldOwnerService.ps1 from an elevated owner console.'
}
$receiptPath = Join-Path $evidenceRoot "install-$policyId.json"
[IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
$receipt | ConvertTo-Json -Depth 20
