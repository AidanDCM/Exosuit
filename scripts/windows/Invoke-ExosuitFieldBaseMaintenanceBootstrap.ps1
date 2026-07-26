[CmdletBinding()]
param(
    [Parameter()]
    [ValidateRange(30, 900)]
    [int]$TimeoutSeconds = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$authorizationPath = 'C:\Exosuit\Base\maintenance-authorization.json'
$receiptPath = 'C:\Exosuit\Base\maintenance-receipt.json'
$maintenancePath = 'C:\Exosuit\Agent\Invoke-ExosuitFieldBaseMaintenance.ps1'
$statusPath = 'C:\Exosuit\Logs\maintenance-bootstrap-status.txt'
$taskName = 'ExosuitFieldBaseMaintenance'

function Write-BootstrapStatus([string]$ErrorText = '') {
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add("observedAt=$([DateTimeOffset]::UtcNow.ToString('O'))")
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
        $lines.Add("state=$($task.State)")
        $lines.Add("principalUserId=$($task.Principal.UserId)")
        $lines.Add("principalLogonType=$($task.Principal.LogonType)")
        if ($info) {
            $lines.Add("lastRun=$($info.LastRunTime.ToUniversalTime().ToString('O'))")
            $lines.Add("lastResult=$($info.LastTaskResult)")
        }
    } else {
        $lines.Add('state=absent')
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

foreach ($path in @($authorizationPath, $maintenancePath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Field base maintenance bootstrap file is missing: $path" }
}
if (Test-Path -LiteralPath $receiptPath) { throw 'Field base maintenance bootstrap refuses an existing receipt.' }

$startedAt = [DateTimeOffset]::UtcNow
$taskXml = @'
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><URI>\ExosuitFieldBaseMaintenance</URI></RegistrationInfo>
  <Triggers />
  <Principals>
    <Principal id="System">
      <UserId>S-1-5-18</UserId>
      <LogonType>ServiceAccount</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <ExecutionTimeLimit>PT10M</ExecutionTimeLimit>
  </Settings>
  <Actions Context="System">
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-NoProfile -ExecutionPolicy Bypass -File "C:\Exosuit\Agent\Invoke-ExosuitFieldBaseMaintenance.ps1"</Arguments>
    </Exec>
  </Actions>
</Task>
'@
Register-ScheduledTask -TaskName $taskName -Xml $taskXml -Force | Out-Null
$registered = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($registered.Principal.UserId -notin @('SYSTEM', 'S-1-5-18') -or
    $registered.Principal.LogonType -ne 'ServiceAccount' -or
    @($registered.Actions).Count -ne 1 -or
    [string]$registered.Actions[0].Arguments -notlike '*Invoke-ExosuitFieldBaseMaintenance.ps1*') {
    throw 'Field base maintenance task registration did not preserve the reviewed SYSTEM service-account contract.'
}
Start-ScheduledTask -TaskName $taskName

$deadline = $startedAt.AddSeconds($TimeoutSeconds)
do {
    if (Test-Path -LiteralPath $receiptPath -PathType Leaf) { return }
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) { Start-Sleep -Milliseconds 250; continue }
    $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop
    Write-BootstrapStatus
    $hasRun = $info.LastRunTime.ToUniversalTime() -ge $startedAt.UtcDateTime.AddSeconds(-2)
    if ($hasRun -and $task.State -ne 'Running' -and $info.LastTaskResult -ne 0) {
        throw "Field base maintenance SYSTEM task failed with result $($info.LastTaskResult)."
    }
    Start-Sleep -Seconds 1
} while ([DateTimeOffset]::UtcNow -lt $deadline)

throw "Field base maintenance SYSTEM task did not produce a receipt within $TimeoutSeconds seconds."
} catch {
    Write-BootstrapStatus -ErrorText $_.Exception.Message
    throw
}
