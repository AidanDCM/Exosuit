[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter()]
    [string]$LaunchScriptPath = 'C:\Exosuit\Agent\Start-ExosuitFieldGuest.ps1'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $LaunchScriptPath -PathType Leaf)) {
    throw "Guest launch script is missing: $LaunchScriptPath"
}
$taskName = 'ExosuitFieldGuest'
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$LaunchScriptPath`""
if ($PSCmdlet.ShouldProcess($taskName, 'Register SYSTEM startup and logon recovery task for the Field guest runtime')) {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
    $triggers = @(
        New-ScheduledTaskTrigger -AtStartup
        New-ScheduledTaskTrigger -AtLogOn
    )
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $triggers `
        -Principal $principal `
        -Settings $settings `
        -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
}
