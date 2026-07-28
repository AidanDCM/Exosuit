[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [string]$TypedConfirmation,

    [Parameter()]
    [string]$AgentRoot = 'C:\Exosuit\Agent',

    [Parameter()]
    [string]$ConfigRoot = 'C:\Exosuit\Config',

    [Parameter()]
    [string]$ReceiptPath = 'C:\Exosuit\Base\seal-receipt.json',

    [Parameter()]
    [switch]$Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$requiredConfirmation = 'SEAL EXOSUIT FIELD BASE'
if (-not $Apply -or $TypedConfirmation -cne $requiredConfirmation) {
    throw "Base sealing requires -Apply and exact typed confirmation: $requiredConfirmation"
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Base sealing requires an elevated Windows Audit Mode session.'
}
if ($identity.User.Value -notmatch '-500$') {
    throw 'Base sealing must run as the built-in Windows Audit Mode administrator.'
}

$nonBuiltInUsers = @(Get-LocalUser | Where-Object { $_.SID.Value -notmatch '-(500|501|503|504)$' })
if ($nonBuiltInUsers.Count -ne 0) {
    throw 'Base sealing refuses an image containing a non-built-in local account.'
}

$allowedRoot = [IO.Path]::GetFullPath('C:\Exosuit').TrimEnd('\') + '\'
foreach ($path in @($AgentRoot, $ConfigRoot, $ReceiptPath)) {
    $resolved = [IO.Path]::GetFullPath($path)
    if (-not $resolved.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Base sealing path escapes C:\Exosuit: $resolved"
    }
}

$requiredFiles = @(
    'Exosuit.Agent.exe',
    'Initialize-ExosuitDevelopmentAccess.ps1',
    'Initialize-ExosuitFieldGuest.ps1',
    'Install-ExosuitFieldGuest.ps1',
    'Start-ExosuitFieldGuest.ps1'
)
foreach ($name in $requiredFiles) {
    $path = Join-Path $AgentRoot $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required base component is missing: $path"
    }
}

if (Test-Path -LiteralPath $ConfigRoot) {
    $seededFiles = @(Get-ChildItem -LiteralPath $ConfigRoot -File -Recurse -Force)
    if ($seededFiles.Count -ne 0) {
        throw 'Base sealing refuses an image containing per-generation configuration or secrets.'
    }
}

$installerPath = Join-Path $AgentRoot 'Install-ExosuitFieldGuest.ps1'
$launchPath = Join-Path $AgentRoot 'Start-ExosuitFieldGuest.ps1'
$serviceName = 'ExosuitFieldGuest'
$sysprepPath = Join-Path $env:WINDIR 'System32\Sysprep\Sysprep.exe'
if (-not (Test-Path -LiteralPath $sysprepPath -PathType Leaf)) {
    throw "Windows Sysprep is missing: $sysprepPath"
}

if (-not $PSCmdlet.ShouldProcess($env:COMPUTERNAME, 'Install and verify the Field guest service, generalize the image, and shut down')) {
    return
}

& $installerPath -LaunchScriptPath $launchPath -Confirm:$false
if (-not $?) { throw 'Field guest service installation failed.' }

if (Get-ScheduledTask -TaskName $serviceName -ErrorAction SilentlyContinue) {
    throw 'Legacy Field guest scheduled task remains after service installation.'
}
$service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'" -ErrorAction Stop
$expectedBinaryPath = "`"$(Join-Path $AgentRoot 'Exosuit.Agent.exe')`" --field-guest-service"
if ([string]$service.StartName -cne 'LocalSystem' -or
    [string]$service.StartMode -cne 'Auto' -or
    [string]$service.PathName -cne $expectedBinaryPath) {
    throw 'Installed Field guest service does not match the reviewed LocalSystem execution contract.'
}

$componentDigests = [ordered]@{}
foreach ($name in $requiredFiles) {
    $componentDigests[$name] = (Get-FileHash -LiteralPath (Join-Path $AgentRoot $name) -Algorithm SHA256).Hash.ToLowerInvariant()
}
$receiptDirectory = Split-Path -Parent $ReceiptPath
New-Item -ItemType Directory -Path $receiptDirectory -Force | Out-Null
$receipt = [ordered]@{
    contractVersion = 1
    operation = 'seal_field_base'
    sealedAt = [DateTimeOffset]::UtcNow.ToString('O')
    computerName = $env:COMPUTERNAME
    auditModeAdministrator = $true
    perGenerationConfigurationAbsent = $true
    nonBuiltInLocalAccountsAbsent = $true
    service = [ordered]@{
        name = $serviceName
        principal = 'SYSTEM'
        startMode = 'Automatic'
        recovery = 'restart/5000,restart/30000,restart/60000'
        launchScript = $launchPath
    }
    componentDigests = $componentDigests
    sysprep = '/generalize /oobe /shutdown /quiet'
}
[IO.File]::WriteAllText($ReceiptPath, ($receipt | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))

$process = Start-Process -FilePath $sysprepPath -ArgumentList '/generalize', '/oobe', '/shutdown', '/quiet' -PassThru -Wait
if ($process.ExitCode -ne 0) {
    throw "Sysprep failed with exit code $($process.ExitCode)."
}
