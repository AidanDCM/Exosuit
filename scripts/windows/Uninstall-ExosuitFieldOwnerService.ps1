[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param([Parameter(Mandatory)][string]$TypedConfirmation)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($TypedConfirmation -cne 'UNINSTALL EXOSUIT FIELD OWNER SERVICE') { throw 'Exact typed confirmation is required to uninstall the Field owner service.' }
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Uninstall requires an elevated local administrator.' }
$service = Get-Service -Name 'ExosuitFieldOwner' -ErrorAction SilentlyContinue
if ($service) {
    if ($service.Status -ne 'Stopped') { Stop-Service -Name 'ExosuitFieldOwner' -Force; $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30)) }
    & "$env:SystemRoot\System32\sc.exe" delete ExosuitFieldOwner | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to delete the Field owner service registration.' }
}
# Preserve sanitized results/evidence for review. Remove only the executable and
# policy/queue surfaces so no further privileged work can be accepted.
$installRoot = 'C:\Program Files\Exosuit\FieldOwner'
$dataRoot = 'C:\ProgramData\Exosuit\FieldOwner'
if (Test-Path -LiteralPath $installRoot) { Remove-Item -LiteralPath $installRoot -Recurse -Force }
foreach ($path in @((Join-Path $dataRoot 'policy.json'), (Join-Path $dataRoot 'host-config.json'), (Join-Path $dataRoot 'Queue'))) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
}
[ordered]@{ contractVersion = 1; status = 'uninstalled'; completedAt = [DateTimeOffset]::UtcNow.ToString('O'); evidencePreserved = $true } | ConvertTo-Json
