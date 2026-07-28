[CmdletBinding()]
param(
    [Parameter()]
    [string]$AuthorizationPath = 'C:\Exosuit\Base\maintenance-authorization.json',

    [Parameter()]
    [string]$ReceiptPath = 'C:\Exosuit\Base\maintenance-receipt.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$stagePath = 'C:\Exosuit\Logs\maintenance-stage.txt'
function Set-MaintenanceStage([string]$Stage) {
    [IO.File]::WriteAllText(
        $stagePath,
        "observedAt=$([DateTimeOffset]::UtcNow.ToString('O'))`r`nstage=$Stage`r`n",
        [Text.UTF8Encoding]::new($false)
    )
}
Set-MaintenanceStage 'started'

$allowedRoot = [IO.Path]::GetFullPath('C:\Exosuit').TrimEnd('\') + '\'
foreach ($path in @($AuthorizationPath, $ReceiptPath)) {
    $resolved = [IO.Path]::GetFullPath($path)
    if (-not $resolved.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Field base maintenance path escapes C:\Exosuit: $resolved"
    }
}
if (-not (Test-Path -LiteralPath $AuthorizationPath -PathType Leaf)) {
    throw 'Field base maintenance authorization is missing.'
}
if (Test-Path -LiteralPath $ReceiptPath -PathType Leaf) {
    throw 'Field base maintenance refuses to reuse an authorization after a receipt exists.'
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if ($identity.User.Value -cne 'S-1-5-18') {
    throw 'Field base maintenance must run as local SYSTEM.'
}
Set-MaintenanceStage 'system_identity_verified'

$authorization = Get-Content -LiteralPath $AuthorizationPath -Raw | ConvertFrom-Json
$now = [DateTimeOffset]::UtcNow
$expiresAt = [DateTimeOffset]::ParseExact(
    [string]$authorization.expiresAt,
    'O',
    [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::RoundtripKind
)
if ($authorization.contractVersion -ne 1 -or
    $authorization.operation -cne 'clean_and_seal_field_base' -or
    $authorization.nonProductionMaintenance -ne $true -or
    [string]$authorization.targetImageId -cnotmatch '^exosuit-field-base-v[0-9]+$' -or
    [string]$authorization.sourceCommit -cnotmatch '^[0-9a-f]{40}$' -or
    [string]$authorization.accountName -cnotmatch '^[A-Za-z][A-Za-z0-9]{2,19}$' -or
    [string]$authorization.nonce -cnotmatch '^[0-9a-f]{32}$' -or
    [string]$authorization.maintenanceScriptSha256 -cnotmatch '^[0-9a-f]{64}$' -or
    [string]$authorization.bootstrapUnattendSha256 -cnotmatch '^[0-9a-f]{64}$' -or
    $expiresAt -le $now -or
    $expiresAt -gt $now.AddHours(4)) {
    throw 'Field base maintenance authorization is invalid or expired.'
}

$selfPath = $MyInvocation.MyCommand.Path
$selfDigest = (Get-FileHash -LiteralPath $selfPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($selfDigest -cne [string]$authorization.maintenanceScriptSha256) {
    throw 'Field base maintenance script digest does not match its authorization.'
}
Set-MaintenanceStage 'authorization_verified'

# Windows Setup does not leave the answer file byte-identical to the one that
# was injected: it reserialises the document, dropping comments and rewriting
# the XML declaration's quote style, and annotates each processed settings
# element with wasPassProcessed. A byte digest of the live file can therefore
# never match the reviewed content, which is what blocked this check.
#
# Compare the documents as XML instead. Comments and setup's own bookkeeping
# attribute are removed, and everything that determines what actually ran - the
# passes, components, and the exact command paths - is still covered.
function Get-CanonicalUnattendDigest {
    param([Parameter(Mandatory)][string]$Xml)
    $document = [Xml.XmlDocument]::new()
    $document.PreserveWhitespace = $false
    $document.LoadXml($Xml)
    foreach ($comment in @($document.SelectNodes('//comment()'))) {
        $null = $comment.ParentNode.RemoveChild($comment)
    }
    foreach ($processed in @($document.SelectNodes('//*[@wasPassProcessed]'))) {
        $null = $processed.RemoveAttribute('wasPassProcessed')
    }
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($document.DocumentElement.OuterXml)
        return ([BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha256.Dispose()
    }
}

$bootstrapUnattendPath = 'C:\Windows\Panther\Unattend.xml'
if (-not (Test-Path -LiteralPath $bootstrapUnattendPath -PathType Leaf)) {
    throw 'Field base maintenance bootstrap answer file is missing.'
}
$bootstrapUnattendText = Get-Content -LiteralPath $bootstrapUnattendPath -Raw
$bootstrapUnattendDigest = Get-CanonicalUnattendDigest -Xml $bootstrapUnattendText
if ($bootstrapUnattendDigest -cne [string]$authorization.bootstrapUnattendSha256 -or
    $bootstrapUnattendText -notlike '*ExosuitFieldBaseMaintenance*' -or
    $bootstrapUnattendText -notlike '*Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1*') {
    throw 'Field base maintenance bootstrap answer file does not match its authorization.'
}

$activeAdapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up')
if ($activeAdapters.Count -ne 0) {
    throw 'Field base maintenance requires a network-detached staging VM.'
}
Set-MaintenanceStage 'network_detachment_verified'

$configRoot = 'C:\Exosuit\Config'
if (Test-Path -LiteralPath $configRoot) {
    $seededFiles = @(Get-ChildItem -LiteralPath $configRoot -File -Recurse -Force)
    if ($seededFiles.Count -ne 0) {
        throw 'Field base maintenance refuses an image containing per-generation configuration or secrets.'
    }
}

$accountName = [string]$authorization.accountName
$matches = @(Get-LocalUser -Name $accountName -ErrorAction SilentlyContinue)
if ($matches.Count -ne 1) { throw 'Field base maintenance requires exactly one authorized local account.' }
$account = $matches[0]
$sid = $account.SID.Value
if ($sid -match '-(500|501|503|504)$' -or $sid -eq $identity.User.Value) {
    throw 'Field base maintenance refuses built-in or current accounts.'
}
$profiles = @(Get-CimInstance Win32_UserProfile | Where-Object SID -eq $sid)
if (@($profiles | Where-Object { $_.Loaded -or $_.Special }).Count -ne 0) {
    throw 'Field base maintenance refuses a loaded or special profile.'
}

foreach ($profile in $profiles) { $profile | Remove-CimInstance }
Set-MaintenanceStage 'profiles_removed'
Remove-LocalUser -Name $accountName
if (Get-LocalUser -Name $accountName -ErrorAction SilentlyContinue) {
    throw 'Authorized Field base account removal did not complete.'
}
if (@(Get-CimInstance Win32_UserProfile | Where-Object SID -eq $sid).Count -ne 0) {
    throw 'Authorized Field base profile removal did not complete.'
}
$remainingUsers = @(Get-LocalUser | Where-Object { $_.SID.Value -notmatch '-(500|501|503|504)$' })
if ($remainingUsers.Count -ne 0) {
    throw 'Field base maintenance found another non-built-in local account after cleanup.'
}
Set-MaintenanceStage 'account_cleanup_verified'

$requiredFiles = @(
    'Exosuit.Agent.exe',
    'Initialize-ExosuitDevelopmentAccess.ps1',
    'Initialize-ExosuitFieldGuest.ps1',
    'Install-ExosuitFieldGuest.ps1',
    'Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1',
    'Start-ExosuitFieldGuest.ps1'
)
$componentDigests = [ordered]@{}
foreach ($name in $requiredFiles) {
    $path = Join-Path 'C:\Exosuit\Agent' $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required base component is missing: $path" }
    $componentDigests[$name] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}
if (-not (Test-Path -LiteralPath 'C:\Windows\Setup\Scripts\SetupComplete.cmd' -PathType Leaf)) {
    throw 'Field base maintenance requires the reviewed SetupComplete hook.'
}
Set-MaintenanceStage 'components_verified'

# The one-use dispatch mechanism is whichever route actually reached SYSTEM:
# the native auditSystem pass leaves nothing behind, while the auditUser
# fallback leaves a task or a service. Any residue that exists must match the
# reviewed contract, and none of it may survive into the sealed image.
$maintenanceDispatchName = 'ExosuitFieldBaseMaintenance'
$maintenanceTask = Get-ScheduledTask -TaskName $maintenanceDispatchName -ErrorAction SilentlyContinue
if ($maintenanceTask) {
    if ($maintenanceTask.Principal.UserId -notin @('SYSTEM', 'S-1-5-18') -or
        @($maintenanceTask.Actions).Count -ne 1 -or
        [string]$maintenanceTask.Actions[0].Arguments -notlike '*Invoke-ExosuitFieldBaseMaintenance.ps1*') {
        throw 'Field base maintenance one-use task does not match the reviewed SYSTEM contract.'
    }
    Unregister-ScheduledTask -TaskName $maintenanceDispatchName -Confirm:$false
    if (Get-ScheduledTask -TaskName $maintenanceDispatchName -ErrorAction SilentlyContinue) {
        throw 'Field base maintenance did not consume its one-use task.'
    }
}
$maintenanceService = Get-CimInstance Win32_Service -Filter "Name='$maintenanceDispatchName'" -ErrorAction SilentlyContinue
if ($maintenanceService) {
    # Must name the dispatch shim the service image path actually uses. This
    # asserted the maintenance script's own path while the service ran the shim,
    # so consumption rejected a service the bootstrap had just registered
    # correctly, and the run died one stage short of writing its receipt.
    if ([string]$maintenanceService.StartName -cne 'LocalSystem' -or
        [string]$maintenanceService.PathName -notlike '*Dispatch-ExosuitFieldBaseMaintenance.cmd*') {
        throw 'Field base maintenance one-use service does not match the reviewed SYSTEM contract.'
    }
    & sc.exe delete $maintenanceDispatchName | Out-Null
    if (@(Get-CimInstance Win32_Service -Filter "Name='$maintenanceDispatchName'" -ErrorAction SilentlyContinue).Count -ne 0) {
        throw 'Field base maintenance did not consume its one-use service.'
    }
}
Set-MaintenanceStage 'maintenance_task_consumed'

Remove-Item -LiteralPath $bootstrapUnattendPath -Force
if (Test-Path -LiteralPath $bootstrapUnattendPath) {
    throw 'Field base maintenance did not consume its bootstrap answer file.'
}

$receiptDirectory = Split-Path -Parent $ReceiptPath
New-Item -ItemType Directory -Path $receiptDirectory -Force | Out-Null
$receipt = [ordered]@{
    contractVersion = 1
    operation = 'clean_and_seal_field_base'
    completedAt = [DateTimeOffset]::UtcNow.ToString('O')
    targetImageId = [string]$authorization.targetImageId
    sourceCommit = [string]$authorization.sourceCommit
    authorizationNonce = [string]$authorization.nonce
    authorizationConsumed = $true
    systemIdentity = $true
    networkDetached = $true
    perGenerationConfigurationAbsent = $true
    nonBuiltInLocalAccountsAbsent = $true
    removedAccountName = $accountName
    removedAccountSid = $sid
    removedProfileCount = $profiles.Count
    maintenanceScriptSha256 = $selfDigest
    bootstrapUnattendSha256 = $bootstrapUnattendDigest
    bootstrapUnattendConsumed = $true
    maintenanceTaskConsumed = $true
    componentDigests = $componentDigests
    sysprep = '/generalize /oobe /shutdown /quiet'
}
[IO.File]::WriteAllText($ReceiptPath, ($receipt | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
Remove-Item -LiteralPath $AuthorizationPath -Force
Set-MaintenanceStage 'receipt_written_and_authorization_consumed'

$sysprepPath = Join-Path $env:WINDIR 'System32\Sysprep\Sysprep.exe'
Set-MaintenanceStage 'sysprep_started'
$process = Start-Process -FilePath $sysprepPath -ArgumentList '/generalize', '/oobe', '/shutdown', '/quiet' -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "Sysprep failed with exit code $($process.ExitCode)." }
