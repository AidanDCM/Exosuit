[CmdletBinding()]
param(
    [Parameter()]
    [ValidateRange(30, 900)]
    [int]$TimeoutSeconds = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -or $identity.User.Value -notmatch '-500$') {
    throw 'Field base maintenance bootstrap requires the built-in Audit Mode administrator.'
}

$authorizationPath = 'C:\Exosuit\Base\maintenance-authorization.json'
$receiptPath = 'C:\Exosuit\Base\maintenance-receipt.json'
$maintenancePath = 'C:\Exosuit\Agent\Invoke-ExosuitFieldBaseMaintenance.ps1'
$statusPath = 'C:\Exosuit\Logs\maintenance-bootstrap-status.txt'
$taskName = 'ExosuitFieldBaseMaintenance'
foreach ($path in @($authorizationPath, $maintenancePath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Field base maintenance bootstrap file is missing: $path" }
}
if (Test-Path -LiteralPath $receiptPath) { throw 'Field base maintenance bootstrap refuses an existing receipt.' }

$startedAt = [DateTimeOffset]::UtcNow
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$maintenancePath`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::FromMinutes(10))
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

$deadline = $startedAt.AddSeconds($TimeoutSeconds)
do {
    if (Test-Path -LiteralPath $receiptPath -PathType Leaf) { return }
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) { Start-Sleep -Milliseconds 250; continue }
    $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop
    [IO.File]::WriteAllText($statusPath, "state=$($task.State)`r`nlastRun=$($info.LastRunTime.ToUniversalTime().ToString('O'))`r`nlastResult=$($info.LastTaskResult)`r`n", [Text.UTF8Encoding]::new($false))
    $hasRun = $info.LastRunTime.ToUniversalTime() -ge $startedAt.UtcDateTime.AddSeconds(-2)
    if ($hasRun -and $task.State -ne 'Running' -and $info.LastTaskResult -ne 0) {
        throw "Field base maintenance SYSTEM task failed with result $($info.LastTaskResult)."
    }
    Start-Sleep -Seconds 1
} while ([DateTimeOffset]::UtcNow -lt $deadline)

[IO.File]::WriteAllText($statusPath, "error=receipt_timeout`r`n", [Text.UTF8Encoding]::new($false))
throw "Field base maintenance SYSTEM task did not produce a receipt within $TimeoutSeconds seconds."
