[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$authorizationPath = 'C:\Exosuit\Base\maintenance-authorization.json'
$receiptPath = 'C:\Exosuit\Base\maintenance-receipt.json'
$maintenancePath = 'C:\Exosuit\Agent\Invoke-ExosuitFieldBaseMaintenance.ps1'
$statusPath = 'C:\Exosuit\Logs\maintenance-bootstrap-status.txt'
$stagePath = 'C:\Exosuit\Logs\maintenance-stage.txt'
$dispatchName = 'ExosuitFieldBaseMaintenance'

# Windows leaves scheduled tasks Queued for the whole Audit Mode session, so a
# task is not a usable SYSTEM dispatch route here. The reviewed primary route is
# the native auditSystem pass, which already runs as SYSTEM. This auditUser
# bootstrap is the fallback: it dispatches the same fixed command through a
# one-use LocalSystem service, which the SCM does start during setup.
function Write-BootstrapStatus([string]$Route = '', [string]$ErrorText = '') {
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add("observedAt=$([DateTimeOffset]::UtcNow.ToString('O'))")
    $lines.Add("localObservedAt=$([DateTime]::Now.ToString('O'))")
    if ($Route) { $lines.Add("route=$Route") }
    $lines.Add("receiptPresent=$(Test-Path -LiteralPath $receiptPath -PathType Leaf)")
    $service = Get-CimInstance Win32_Service -Filter "Name='$dispatchName'" -ErrorAction SilentlyContinue
    if ($service) {
        $lines.Add("serviceState=$($service.State)")
        $lines.Add("serviceStartName=$($service.StartName)")
        $lines.Add("serviceProcessId=$($service.ProcessId)")
    } else {
        $lines.Add('serviceState=absent')
    }
    if ($ErrorText) { $lines.Add("error=$($ErrorText -replace '[\r\n]+', ' ')") }
    [IO.File]::WriteAllLines($statusPath, $lines, [Text.UTF8Encoding]::new($false))
}

try {
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -or $identity.User.Value -notmatch '-500$') {
    throw 'Field base maintenance bootstrap requires the built-in Audit Mode administrator.'
}

# The primary auditSystem route runs before this pass. If it already finished or
# is still in flight, this fallback must neither treat that as a failure nor
# dispatch a second concurrent maintenance run against the same authorization.
if (Test-Path -LiteralPath $receiptPath -PathType Leaf) {
    Write-BootstrapStatus -Route 'auditSystem_already_complete'
    return
}
if (Test-Path -LiteralPath $stagePath -PathType Leaf) {
    Write-BootstrapStatus -Route 'auditSystem_in_progress'
    return
}

foreach ($path in @($authorizationPath, $maintenancePath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Field base maintenance bootstrap file is missing: $path" }
}

$binPath = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Exosuit\Agent\Invoke-ExosuitFieldBaseMaintenance.ps1"'
$createOutput = @(& sc.exe create $dispatchName binPath= $binPath type= own start= demand obj= LocalSystem)
if ($LASTEXITCODE -ne 0) {
    throw "Field base maintenance SYSTEM service creation failed with exit code $($LASTEXITCODE): $($createOutput -join ' ')"
}
$registered = Get-CimInstance Win32_Service -Filter "Name='$dispatchName'" -ErrorAction Stop
if ([string]$registered.StartName -cne 'LocalSystem' -or
    [string]$registered.PathName -notlike '*Invoke-ExosuitFieldBaseMaintenance.ps1*') {
    throw 'Field base maintenance service registration did not preserve the reviewed SYSTEM identity and fixed-action contract.'
}

# PowerShell is not a service binary, so the SCM never receives SERVICE_RUNNING
# and reports 1053 after its start timeout. The dispatched SYSTEM process still
# runs, and the maintenance script is the authority on whether it may proceed.
$startOutput = @(& sc.exe start $dispatchName)
if ($LASTEXITCODE -notin @(0, 1053)) {
    throw "Field base maintenance SYSTEM service start failed with exit code $($LASTEXITCODE): $($startOutput -join ' ')"
}
Start-Sleep -Milliseconds 250
Write-BootstrapStatus -Route 'auditUser_service'
return
} catch {
    Write-BootstrapStatus -Route 'auditUser_service' -ErrorText $_.Exception.Message
    throw
}
