[CmdletBinding()]
param()

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

$taskCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Exosuit\Agent\Invoke-ExosuitFieldBaseMaintenance.ps1"'
$createOutput = @(& schtasks.exe /Create /TN $taskName /TR $taskCommand /SC ONSTART /RU SYSTEM /RL HIGHEST /F 2>&1)
if ($LASTEXITCODE -ne 0) {
    throw "Field base maintenance SYSTEM task creation failed with exit code $($LASTEXITCODE): $($createOutput -join ' ')"
}
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::FromMinutes(10))
Set-ScheduledTask -TaskName $taskName -Settings $taskSettings | Out-Null
$registered = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($registered.Principal.UserId -notin @('SYSTEM', 'S-1-5-18') -or
    @($registered.Actions).Count -ne 1 -or
    [string]$registered.Actions[0].Arguments -notlike '*Invoke-ExosuitFieldBaseMaintenance.ps1*') {
    throw 'Field base maintenance task registration did not preserve the reviewed SYSTEM identity and fixed-action contract.'
}
$runOutput = @(& schtasks.exe /Run /TN $taskName 2>&1)
if ($LASTEXITCODE -ne 0) {
    throw "Field base maintenance SYSTEM task start failed with exit code $($LASTEXITCODE): $($runOutput -join ' ')"
}
Start-Sleep -Milliseconds 250
Write-BootstrapStatus
return
} catch {
    Write-BootstrapStatus -ErrorText $_.Exception.Message
    throw
}
