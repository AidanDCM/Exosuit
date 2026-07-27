[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$authorizationPath = 'C:\Exosuit\Base\maintenance-authorization.json'
$receiptPath = 'C:\Exosuit\Base\maintenance-receipt.json'
$maintenancePath = 'C:\Exosuit\Agent\Invoke-ExosuitFieldBaseMaintenance.ps1'
$timeZonePath = 'C:\Exosuit\Base\host-timezone.txt'
$statusPath = 'C:\Exosuit\Logs\maintenance-bootstrap-status.txt'
$stagePath = 'C:\Exosuit\Logs\maintenance-stage.txt'
$dispatchName = 'ExosuitFieldBaseMaintenance'
# Declared up front so the status writer can run under StrictMode before a
# dispatch has been attempted, including on the early stand-down paths.
$script:timeZoneBefore = ''
$script:timeZoneAfter = ''
$script:utcBeforeAlignment = ''
$script:utcAfterAlignment = ''
$script:startExitCode = $null
$script:startText = ''

# Windows leaves scheduled tasks Queued for the whole Audit Mode session, and
# Panther proved the auditSystem pass runs but dispatches nothing on this build.
# The working route is a one-use LocalSystem service dispatching a shim that
# outlives the SCM's start timeout.
#
# The guest also computes a UTC hours ahead of the host, which fail-closes
# maintenance on an authorization it reads as expired. The VM's RTC carries host
# local time, and this image's timezone differs from the host's, so the guest
# converts that RTC with the wrong bias. Correcting the timezone alone does not
# fix it: Windows holds UTC fixed and shifts local time instead, and a reboot
# then writes that shifted local time back to the RTC, preserving the error
# exactly. Measured: local moved from matching the host to three hours off it
# while UTC never changed.
#
# So realign both. Take the local wall time first - it is host-derived and
# correct - then set the timezone, then restore that same local reading. UTC is
# recomputed from a correct local time and a correct bias. The host remains the
# only time authority: the timezone is image configuration written by the
# builder, the wall time comes from the guest's own RTC, and the authorization
# whose expiry is about to be checked is never read here.
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
        $lines.Add("servicePathName=$($service.PathName)")
        $lines.Add("serviceExitCode=$($service.ExitCode)")
    } else {
        $lines.Add('serviceState=absent')
    }
    if ($script:timeZoneBefore) { $lines.Add("timeZoneBefore=$($script:timeZoneBefore)") }
    if ($script:timeZoneAfter) { $lines.Add("timeZoneAfter=$($script:timeZoneAfter)") }
    if ($script:utcBeforeAlignment) { $lines.Add("utcBeforeAlignment=$($script:utcBeforeAlignment)") }
    if ($script:utcAfterAlignment) { $lines.Add("utcAfterAlignment=$($script:utcAfterAlignment)") }
    if ($script:startExitCode -ne $null) { $lines.Add("serviceStartExitCode=$($script:startExitCode)") }
    if ($script:startText) { $lines.Add("serviceStartOutput=$($script:startText -replace '[\r\n]+', ' ')") }
    if ($ErrorText) { $lines.Add("error=$($ErrorText -replace '[\r\n]+', ' ')") }
    [IO.File]::WriteAllLines($statusPath, $lines, [Text.UTF8Encoding]::new($false))
}

try {
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -or $identity.User.Value -notmatch '-500$') {
    throw 'Field base maintenance bootstrap requires the built-in Audit Mode administrator.'
}

# A single authorization must never back two concurrent maintenance runs.
if (Test-Path -LiteralPath $receiptPath -PathType Leaf) {
    Write-BootstrapStatus -Route 'stood_down_receipt_present'
    return
}
if (Test-Path -LiteralPath $stagePath -PathType Leaf) {
    Write-BootstrapStatus -Route 'stood_down_maintenance_in_progress'
    return
}

foreach ($path in @($authorizationPath, $maintenancePath, $timeZonePath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Field base maintenance bootstrap file is missing: $path" }
}

$script:utcBeforeAlignment = [DateTimeOffset]::UtcNow.ToString('O')
$script:timeZoneBefore = (Get-TimeZone).Id
$hostTimeZoneId = (Get-Content -LiteralPath $timeZonePath -Raw).Trim()
if ($hostTimeZoneId -notmatch '^[A-Za-z0-9 .\-+()]{1,80}$') {
    throw 'Field base maintenance host timezone identifier is not a plain timezone name.'
}

# Captured before the bias changes, and carried across with a monotonic
# stopwatch so the restore does not lose the time the alignment itself takes.
$localBeforeAlignment = [DateTime]::Now
$alignmentTimer = [Diagnostics.Stopwatch]::StartNew()
& tzutil.exe /s $hostTimeZoneId
if ($LASTEXITCODE -ne 0) { throw "Field base maintenance timezone alignment failed with exit code $($LASTEXITCODE)." }
$script:timeZoneAfter = (Get-TimeZone).Id
if ($script:timeZoneAfter -cne $hostTimeZoneId) { throw 'Field base maintenance timezone alignment did not take effect.' }
$alignmentTimer.Stop()
Set-Date -Date $localBeforeAlignment.Add($alignmentTimer.Elapsed) | Out-Null
$script:utcAfterAlignment = [DateTimeOffset]::UtcNow.ToString('O')

$binPath = 'C:\Windows\System32\cmd.exe /c C:\Exosuit\Agent\Dispatch-ExosuitFieldBaseMaintenance.cmd'
$createOutput = @(& sc.exe create $dispatchName binPath= $binPath type= own start= demand obj= LocalSystem)
if ($LASTEXITCODE -ne 0) {
    throw "Field base maintenance SYSTEM service creation failed with exit code $($LASTEXITCODE): $($createOutput -join ' ')"
}
$registered = Get-CimInstance Win32_Service -Filter "Name='$dispatchName'" -ErrorAction Stop
if ([string]$registered.StartName -cne 'LocalSystem' -or
    [string]$registered.PathName -notlike '*Dispatch-ExosuitFieldBaseMaintenance.cmd*') {
    throw 'Field base maintenance service registration did not preserve the reviewed SYSTEM identity and fixed-action contract.'
}

# cmd is not a service binary, so the SCM never receives SERVICE_RUNNING and
# 1053 after its start timeout is the expected outcome, not a failure. What
# matters is whether the shim ran, which its own marker records.
$startOutput = @(& sc.exe start $dispatchName)
$script:startExitCode = $LASTEXITCODE
$script:startText = $startOutput -join ' '
if ($LASTEXITCODE -notin @(0, 1053)) {
    throw "Field base maintenance SYSTEM service start failed with exit code $($LASTEXITCODE): $($startOutput -join ' ')"
}
Start-Sleep -Seconds 45
Write-BootstrapStatus -Route 'auditUser_service'
return
} catch {
    Write-BootstrapStatus -Route 'dispatch_failed' -ErrorText $_.Exception.Message
    throw
}
