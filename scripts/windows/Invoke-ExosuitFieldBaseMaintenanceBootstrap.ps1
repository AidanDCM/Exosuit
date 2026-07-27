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
$preparedPath = 'C:\Exosuit\Logs\maintenance-prepared.txt'
$dispatchName = 'ExosuitFieldBaseMaintenance'
# Declared up front so the status writer can run under StrictMode before a
# preparation has been attempted, including on the early stand-down paths.
$script:timeZoneBefore = ''
$script:timeZoneAfter = ''
$script:createExitCode = $null
$script:createText = ''

# Windows leaves scheduled tasks Queued for the whole Audit Mode session, and
# Panther proved the auditSystem pass runs but dispatches nothing on this build,
# for both RunSynchronous and RunAsynchronous. The working route is a one-use
# LocalSystem service dispatching a shim that outlives the SCM's start timeout.
#
# That route is proven to reach the maintenance script, which then fail-closes on
# an authorization it reads as expired: the VM's RTC carries host local time and
# this image's timezone differs from the host's, so the guest computes a UTC
# hours ahead. Windows derives system UTC from RTC + bias once at boot and then
# runs on its own tick, so correcting the timezone on a running guest cannot
# repair UTC. It has to be corrected before a boot.
#
# So this pass prepares rather than dispatches: align the timezone, register the
# dispatch service to start automatically, and reboot. Audit Mode persists across
# the reboot, and the second boot computes UTC from the corrected bias before the
# service runs. The host remains the only time authority - the timezone comes
# from image configuration written by the builder, never from the authorization
# this run is about to be checked against.
function Write-BootstrapStatus([string]$Route = '', [string]$ErrorText = '') {
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add("observedAt=$([DateTimeOffset]::UtcNow.ToString('O'))")
    $lines.Add("localObservedAt=$([DateTime]::Now.ToString('O'))")
    if ($Route) { $lines.Add("route=$Route") }
    $lines.Add("receiptPresent=$(Test-Path -LiteralPath $receiptPath -PathType Leaf)")
    $lines.Add("preparedPresent=$(Test-Path -LiteralPath $preparedPath -PathType Leaf)")
    $service = Get-CimInstance Win32_Service -Filter "Name='$dispatchName'" -ErrorAction SilentlyContinue
    if ($service) {
        $lines.Add("serviceState=$($service.State)")
        $lines.Add("serviceStartMode=$($service.StartMode)")
        $lines.Add("serviceStartName=$($service.StartName)")
        $lines.Add("serviceProcessId=$($service.ProcessId)")
        $lines.Add("servicePathName=$($service.PathName)")
        $lines.Add("serviceExitCode=$($service.ExitCode)")
    } else {
        $lines.Add('serviceState=absent')
    }
    if ($script:timeZoneBefore) { $lines.Add("timeZoneBefore=$($script:timeZoneBefore)") }
    if ($script:timeZoneAfter) { $lines.Add("timeZoneAfter=$($script:timeZoneAfter)") }
    if ($script:createExitCode -ne $null) { $lines.Add("serviceCreateExitCode=$($script:createExitCode)") }
    if ($script:createText) { $lines.Add("serviceCreateOutput=$($script:createText -replace '[\r\n]+', ' ')") }
    if ($ErrorText) { $lines.Add("error=$($ErrorText -replace '[\r\n]+', ' ')") }
    [IO.File]::WriteAllLines($statusPath, $lines, [Text.UTF8Encoding]::new($false))
}

try {
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -or $identity.User.Value -notmatch '-500$') {
    throw 'Field base maintenance bootstrap requires the built-in Audit Mode administrator.'
}

# This pass re-runs on the boot it triggers. Standing down then is mandatory:
# preparing twice would reboot the VM again on every audit pass and consume the
# whole build deadline in a loop without ever dispatching maintenance.
if (Test-Path -LiteralPath $receiptPath -PathType Leaf) {
    Write-BootstrapStatus -Route 'stood_down_receipt_present'
    return
}
if (Test-Path -LiteralPath $stagePath -PathType Leaf) {
    Write-BootstrapStatus -Route 'stood_down_maintenance_in_progress'
    return
}
if (Test-Path -LiteralPath $preparedPath -PathType Leaf) {
    Write-BootstrapStatus -Route 'stood_down_already_prepared'
    return
}

foreach ($path in @($authorizationPath, $maintenancePath, $timeZonePath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Field base maintenance bootstrap file is missing: $path" }
}

# Timezone alignment. The identifier is image configuration written by the
# builder from the host that stamps the authorization, so the guest and that host
# agree on what UTC means. Nothing here reads the authorization itself.
$script:timeZoneBefore = (Get-TimeZone).Id
$hostTimeZoneId = (Get-Content -LiteralPath $timeZonePath -Raw).Trim()
if ($hostTimeZoneId -notmatch '^[A-Za-z0-9 .\-+()]{1,80}$') {
    throw 'Field base maintenance host timezone identifier is not a plain timezone name.'
}
& tzutil.exe /s $hostTimeZoneId
if ($LASTEXITCODE -ne 0) { throw "Field base maintenance timezone alignment failed with exit code $($LASTEXITCODE)." }
$script:timeZoneAfter = (Get-TimeZone).Id
if ($script:timeZoneAfter -cne $hostTimeZoneId) { throw 'Field base maintenance timezone alignment did not take effect.' }

# Registered to start automatically so the SCM dispatches it on the next boot,
# once UTC has been recomputed from the corrected bias. cmd is not a service
# binary, so the SCM will fail the start with 1053 and terminate it; the shim
# records that it ran and leaves maintenance running beyond that.
$binPath = 'C:\Windows\System32\cmd.exe /c C:\Exosuit\Agent\Dispatch-ExosuitFieldBaseMaintenance.cmd'
$createOutput = @(& sc.exe create $dispatchName binPath= $binPath type= own start= auto obj= LocalSystem)
$script:createExitCode = $LASTEXITCODE
$script:createText = $createOutput -join ' '
if ($LASTEXITCODE -ne 0) {
    throw "Field base maintenance SYSTEM service creation failed with exit code $($LASTEXITCODE): $($createOutput -join ' ')"
}
$registered = Get-CimInstance Win32_Service -Filter "Name='$dispatchName'" -ErrorAction Stop
if ([string]$registered.StartName -cne 'LocalSystem' -or
    [string]$registered.StartMode -cne 'Auto' -or
    [string]$registered.PathName -notlike '*Dispatch-ExosuitFieldBaseMaintenance.cmd*') {
    throw 'Field base maintenance service registration did not preserve the reviewed SYSTEM identity and fixed-action contract.'
}

# Written before the reboot is requested, so a reboot that happens at any point
# after this cannot re-enter preparation.
$preparedLines = @(
    "preparedAtUtc=$([DateTimeOffset]::UtcNow.ToString('O'))",
    "preparedAtLocal=$([DateTime]::Now.ToString('O'))",
    "timeZoneBefore=$($script:timeZoneBefore)",
    "timeZoneAfter=$($script:timeZoneAfter)",
    "serviceStartMode=$($registered.StartMode)"
)
[IO.File]::WriteAllLines($preparedPath, $preparedLines, [Text.UTF8Encoding]::new($false))

Write-BootstrapStatus -Route 'prepared_awaiting_reboot'
# Deferred briefly so this synchronous pass returns and Windows Setup can finish
# before the restart is taken.
& shutdown.exe /r /t 15 /c 'Exosuit Field base maintenance timezone alignment'
if ($LASTEXITCODE -ne 0) { throw "Field base maintenance reboot request failed with exit code $($LASTEXITCODE)." }
return
} catch {
    Write-BootstrapStatus -Route 'prepare_failed' -ErrorText $_.Exception.Message
    throw
}
