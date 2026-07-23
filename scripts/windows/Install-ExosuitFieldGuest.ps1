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
$taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$LaunchScriptPath`""
if ($PSCmdlet.ShouldProcess($taskName, 'Register SYSTEM startup task for the Field guest runtime')) {
    & schtasks.exe /Create /TN $taskName /SC ONSTART /RU SYSTEM /RL HIGHEST /TR $taskCommand /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to register $taskName." }
    & schtasks.exe /Run /TN $taskName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Unable to start $taskName." }
}
