[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z][A-Za-z0-9]{2,19}$')]
    [string]$AccountName,

    [Parameter(Mandatory)]
    [string]$TypedConfirmation,

    [Parameter()]
    [string]$ReceiptPath = 'C:\Exosuit\Base\account-cleanup-receipt.json',

    [Parameter()]
    [switch]$Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$requiredConfirmation = "REMOVE FIELD BASE ACCOUNT $AccountName"
if (-not $Apply -or $TypedConfirmation -cne $requiredConfirmation) {
    throw "Account cleanup requires -Apply and exact typed confirmation: $requiredConfirmation"
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -or
    $identity.User.Value -notmatch '-500$') {
    throw 'Field base account cleanup requires the elevated built-in Windows Audit Mode administrator.'
}

$resolvedReceipt = [IO.Path]::GetFullPath($ReceiptPath)
$allowedRoot = [IO.Path]::GetFullPath('C:\Exosuit').TrimEnd('\') + '\'
if (-not $resolvedReceipt.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Account cleanup receipt path escapes C:\Exosuit: $resolvedReceipt"
}

$matches = @(Get-LocalUser -Name $AccountName -ErrorAction SilentlyContinue)
if ($matches.Count -ne 1) { throw 'Field base account cleanup requires exactly one matching local account.' }
$account = $matches[0]
$sid = $account.SID.Value
if ($sid -match '-(500|501|503|504)$' -or $sid -eq $identity.User.Value) {
    throw 'Field base account cleanup refuses built-in or current accounts.'
}

$profiles = @(Get-CimInstance Win32_UserProfile | Where-Object SID -eq $sid)
if (@($profiles | Where-Object { $_.Loaded -or $_.Special }).Count -ne 0) {
    throw 'Field base account cleanup refuses a loaded or special profile.'
}

if (-not $PSCmdlet.ShouldProcess($AccountName, 'Remove the non-built-in account and unloaded profile from the Field base staging image')) {
    return
}

foreach ($profile in $profiles) { $profile | Remove-CimInstance }
Remove-LocalUser -Name $AccountName
if (Get-LocalUser -Name $AccountName -ErrorAction SilentlyContinue) {
    throw 'Field base local account removal did not complete.'
}
if (@(Get-CimInstance Win32_UserProfile | Where-Object SID -eq $sid).Count -ne 0) {
    throw 'Field base profile removal did not complete.'
}

$receiptDirectory = Split-Path -Parent $resolvedReceipt
New-Item -ItemType Directory -Path $receiptDirectory -Force | Out-Null
$receipt = [ordered]@{
    contractVersion = 1
    operation = 'remove_field_base_account'
    removedAt = [DateTimeOffset]::UtcNow.ToString('O')
    accountName = $AccountName
    accountSid = $sid
    profileCountRemoved = $profiles.Count
    auditModeAdministrator = $true
}
[IO.File]::WriteAllText($resolvedReceipt, ($receipt | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
