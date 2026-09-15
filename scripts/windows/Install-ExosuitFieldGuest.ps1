[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter()]
    [string]$AgentPath = 'C:\Exosuit\Agent\Exosuit.Agent.exe',

    [Parameter()]
    [string]$LaunchScriptPath = 'C:\Exosuit\Agent\Start-ExosuitFieldGuest.ps1',

    [Parameter()]
    [switch]$Start,

    [Parameter()]
    [ValidateSet('Automatic', 'Manual')]
    [string]$StartupType = 'Automatic'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$allowedRoot = [IO.Path]::GetFullPath('C:\Exosuit\Agent').TrimEnd('\') + '\'
$canonicalPaths = @(
    [IO.Path]::GetFullPath('C:\Exosuit\Agent\Exosuit.Agent.exe'),
    [IO.Path]::GetFullPath('C:\Exosuit\Agent\Start-ExosuitFieldGuest.ps1')
)
foreach ($path in @($AgentPath, $LaunchScriptPath)) {
    $resolved = [IO.Path]::GetFullPath($path)
    if (-not $resolved.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Field guest service path escapes C:\Exosuit\Agent: $resolved"
    }
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
        throw "Required Field guest service file is missing: $resolved"
    }
}
if ([IO.Path]::GetFullPath($AgentPath) -cne $canonicalPaths[0] -or
    [IO.Path]::GetFullPath($LaunchScriptPath) -cne $canonicalPaths[1]) {
    throw 'Field guest service installation requires the exact compiled launcher paths.'
}

$serviceName = 'ExosuitFieldGuest'
$legacyTaskName = 'ExosuitFieldGuest'
$resolvedAgentPath = [IO.Path]::GetFullPath($AgentPath)
$binaryPath = "`"$resolvedAgentPath`" --field-guest-service"
# SCM removes redundant quotes when an executable path has no spaces. Both
# strings below resolve to the same exact executable and fixed argument; no
# other service command serialization is accepted.
$allowedRegisteredBinaryPaths = @(
    $binaryPath,
    "$resolvedAgentPath --field-guest-service"
)
$scStartMode = if ($StartupType -ceq 'Automatic') { 'auto' } else { 'demand' }
$expectedStartMode = if ($StartupType -ceq 'Automatic') { 'Auto' } else { 'Manual' }

function Invoke-ServiceControl {
    param([Parameter(Mandatory)][string[]]$Arguments)
    $output = @(& sc.exe @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "Service Control Manager command failed with exit code $LASTEXITCODE."
    }
    $output
}

if ($Start -and $StartupType -cne 'Automatic') {
    throw 'Starting the Field guest service requires Automatic startup.'
}

if ($PSCmdlet.ShouldProcess($serviceName, "Install the fixed LocalSystem $StartupType Field guest service and remove the legacy task")) {
    $legacyTask = Get-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
    if ($legacyTask) {
        Stop-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false
    }
    if (Get-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue) {
        throw 'Legacy Field guest scheduled task removal did not complete.'
    }

    $existing = Get-CimInstance Win32_Service -Filter "Name='$serviceName'" -ErrorAction SilentlyContinue
    if ($existing) {
        if ([string]$existing.State -cne 'Stopped') {
            Stop-Service -Name $serviceName -Force -ErrorAction Stop
            (Get-Service -Name $serviceName -ErrorAction Stop).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
        }
        Invoke-ServiceControl -Arguments @(
            'config', $serviceName, 'binPath=', $binaryPath,
            'type=', 'own', 'start=', $scStartMode, 'obj=', 'LocalSystem') | Out-Null
    } else {
        Invoke-ServiceControl -Arguments @(
            'create', $serviceName, 'binPath=', $binaryPath,
            'type=', 'own', 'start=', $scStartMode, 'obj=', 'LocalSystem',
            'DisplayName=', 'Exosuit Field Guest Runtime') | Out-Null
    }
    Invoke-ServiceControl -Arguments @('description', $serviceName, 'Exosuit fixed local Field guest launcher') | Out-Null
    Invoke-ServiceControl -Arguments @('failure', $serviceName, 'reset=', '86400', 'actions=', 'restart/5000/restart/30000/restart/60000') | Out-Null
    Invoke-ServiceControl -Arguments @('failureflag', $serviceName, '1') | Out-Null

    $registered = Get-CimInstance Win32_Service -Filter "Name='$serviceName'" -ErrorAction Stop
    if ([string]$registered.StartName -cne 'LocalSystem' -or
        [string]$registered.StartMode -cne $expectedStartMode -or
        $allowedRegisteredBinaryPaths -cnotcontains [string]$registered.PathName) {
        throw 'Installed Field guest service does not match the reviewed LocalSystem execution contract.'
    }

    if ($Start) {
        Start-Service -Name $serviceName -ErrorAction Stop
        (Get-Service -Name $serviceName -ErrorAction Stop).WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
    }
}
