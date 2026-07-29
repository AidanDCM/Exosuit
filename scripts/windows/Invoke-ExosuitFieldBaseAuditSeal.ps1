[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$receiptPath = 'C:\Exosuit\Base\maintenance-receipt.json'
$auditSysprepReceiptPath = 'C:\Exosuit\Base\audit-sysprep-receipt.json'
$maintenancePath = 'C:\Exosuit\Agent\Invoke-ExosuitFieldBaseMaintenance.ps1'
$statusPath = 'C:\Exosuit\Logs\audit-seal-status.txt'
$sysprepPath = [IO.Path]::GetFullPath((Join-Path $env:WINDIR 'System32\Sysprep\Sysprep.exe'))

function Write-AuditSealStatus([string]$Stage, [string]$ErrorText = '') {
    $lines = [Collections.Generic.List[string]]::new()
    $lines.Add("observedAt=$([DateTimeOffset]::UtcNow.ToString('O'))")
    $lines.Add("stage=$Stage")
    if ($ErrorText) { $lines.Add("error=$($ErrorText -replace '[\r\n]+', ' ')") }
    [IO.File]::WriteAllLines($statusPath, $lines, [Text.UTF8Encoding]::new($false))
}

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -or $identity.User.Value -notmatch '-500$') {
        throw 'Field base sealing requires the built-in Audit Mode administrator.'
    }
    foreach ($path in @($receiptPath, $maintenancePath, $sysprepPath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Field base sealing file is missing: $path" }
    }
    if (Test-Path -LiteralPath $auditSysprepReceiptPath -PathType Leaf) { throw 'Field base Audit administrator Sysprep receipt already exists.' }

    $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    $expectedMaintenanceSha256 = (Get-FileHash -LiteralPath $maintenancePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($receipt.contractVersion -ne 1 -or
        $receipt.operation -cne 'clean_and_seal_field_base' -or
        [string]$receipt.sourceCommit -cnotmatch '^[0-9a-f]{40}$' -or
        [string]$receipt.targetImageId -cnotmatch '^exosuit-field-base-v[0-9]+$' -or
        $receipt.systemIdentity -ne $true -or
        $receipt.networkDetached -ne $true -or
        $receipt.perGenerationConfigurationAbsent -ne $true -or
        $receipt.authorizationConsumed -ne $true -or
        $receipt.bootstrapUnattendConsumed -ne $true -or
        $receipt.maintenanceTaskConsumed -ne $true -or
        $receipt.nonBuiltInLocalAccountsAbsent -ne $true -or
        [string]$receipt.maintenanceScriptSha256 -cne $expectedMaintenanceSha256 -or
        $receipt.runtimeService.name -cne 'ExosuitFieldGuest' -or
        $receipt.runtimeService.principal -cne 'SYSTEM' -or
        $receipt.runtimeService.startMode -cne 'Automatic' -or
        $receipt.sysprep -cne 'pending_audit_administrator') {
        throw 'Field base SYSTEM maintenance receipt is incomplete or invalid for Audit administrator Sysprep.'
    }

    $auditUiDeadline = [DateTimeOffset]::UtcNow.AddMinutes(5)
    do {
        $sysprepProcesses = @(Get-CimInstance Win32_Process -Filter "Name='sysprep.exe'" -ErrorAction Stop)
        if ($sysprepProcesses.Count -gt 0) { break }
        Start-Sleep -Seconds 2
    } while ([DateTimeOffset]::UtcNow -lt $auditUiDeadline)
    if ($sysprepProcesses.Count -ne 1) { throw 'Field base sealing expected exactly one automatic Audit Mode Sysprep UI process.' }
    $auditUi = $sysprepProcesses[0]
    if ([IO.Path]::GetFullPath([string]$auditUi.ExecutablePath) -cne $sysprepPath -or
        [string]$auditUi.CommandLine -cnotmatch '(?i)^\s*"?[^"\r\n]*\\Sysprep\.exe"?\s+/reboot\s*$') {
        throw 'Field base sealing refuses a non-canonical or non-Audit-UI Sysprep process.'
    }
    Stop-Process -Id ([int]$auditUi.ProcessId) -Force -ErrorAction Stop
    $exitDeadline = [DateTimeOffset]::UtcNow.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        $remainingSysprep = @(Get-CimInstance Win32_Process -Filter "Name='sysprep.exe'" -ErrorAction Stop)
    } while ($remainingSysprep.Count -gt 0 -and [DateTimeOffset]::UtcNow -lt $exitDeadline)
    if ($remainingSysprep.Count -ne 0) { throw 'Automatic Audit Mode Sysprep UI did not terminate.' }

    $systemReceiptSha256 = (Get-FileHash -LiteralPath $receiptPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $auditSealScriptSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $auditReceipt = [ordered]@{
        contractVersion = 1
        requestedAt = [DateTimeOffset]::UtcNow.ToString('O')
        sourceCommit = [string]$receipt.sourceCommit
        targetImageId = [string]$receipt.targetImageId
        systemMaintenanceReceiptSha256 = $systemReceiptSha256
        auditSealScriptSha256 = $auditSealScriptSha256
        principal = 'built_in_audit_administrator'
        automaticAuditUiTerminated = $true
        sysprep = '/generalize /oobe /shutdown /quiet'
    }
    [IO.File]::WriteAllText($auditSysprepReceiptPath, ($auditReceipt | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    Write-AuditSealStatus -Stage 'canonical_sysprep_requested'
    $process = Start-Process -FilePath $sysprepPath -ArgumentList '/generalize', '/oobe', '/shutdown', '/quiet' -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Sysprep failed with exit code $($process.ExitCode)." }
} catch {
    Write-AuditSealStatus -Stage 'failed' -ErrorText $_.Exception.Message
    throw
}
