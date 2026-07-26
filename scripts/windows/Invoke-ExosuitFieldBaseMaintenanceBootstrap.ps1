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
$installerPath = 'C:\Exosuit\Agent\Install-ExosuitFieldGuest.ps1'
$taskName = 'ExosuitFieldGuest'
foreach ($path in @($authorizationPath, $installerPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Field base maintenance bootstrap file is missing: $path" }
}
if (Test-Path -LiteralPath $receiptPath) { throw 'Field base maintenance bootstrap refuses an existing receipt.' }

$startedAt = [DateTimeOffset]::UtcNow
& $installerPath -Confirm:$false
if (-not $?) { throw 'Field base maintenance task installation failed.' }

$deadline = $startedAt.AddSeconds($TimeoutSeconds)
do {
    if (Test-Path -LiteralPath $receiptPath -PathType Leaf) { return }
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
    $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop
    $hasRun = $info.LastRunTime.ToUniversalTime() -ge $startedAt.UtcDateTime.AddSeconds(-2)
    if ($hasRun -and $task.State -ne 'Running' -and $info.LastTaskResult -ne 0) {
        throw "Field base maintenance SYSTEM task failed with result $($info.LastTaskResult)."
    }
    Start-Sleep -Seconds 1
} while ([DateTimeOffset]::UtcNow -lt $deadline)

throw "Field base maintenance SYSTEM task did not produce a receipt within $TimeoutSeconds seconds."
