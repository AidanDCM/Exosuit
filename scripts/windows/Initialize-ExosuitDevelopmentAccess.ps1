[CmdletBinding()]
param(
    [Parameter()]
    [string]$ConfigPath = 'C:\Exosuit\Config\development-access.json',

    [Parameter()]
    [string]$PasswordPath = 'C:\Exosuit\Config\development-password.txt',

    [Parameter()]
    [string]$MarkerPath = 'C:\Exosuit\Config\development-access-configured.json',

    [Parameter()]
    [switch]$NoRestart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$allowedRoot = [IO.Path]::GetFullPath('C:\Exosuit').TrimEnd('\') + '\'
foreach ($path in @($ConfigPath, $PasswordPath, $MarkerPath)) {
    $resolved = [IO.Path]::GetFullPath($path)
    if (-not $resolved.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Development access path escapes C:\Exosuit: $resolved"
    }
}
if (Test-Path -LiteralPath $MarkerPath -PathType Leaf) {
    Get-Content -LiteralPath $MarkerPath -Raw
    return
}
if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $PasswordPath -PathType Leaf)) {
    throw 'Development access configuration is incomplete.'
}

$configuration = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ($configuration.contractVersion -ne 1 -or
    $configuration.mode -cne 'auto_logon' -or
    $configuration.nonProduction -ne $true -or
    $configuration.windowsSetup.mode -cne 'unattended_disposable' -or
    $configuration.windowsSetup.locale -cne 'en-US' -or
    $configuration.windowsSetup.timeZone -cne 'Eastern Standard Time' -or
    [string]$configuration.userName -cnotmatch '^[A-Za-z][A-Za-z0-9]{2,19}$') {
    throw 'Development access configuration is invalid.'
}
$userName = [string]$configuration.userName
$password = (Get-Content -LiteralPath $PasswordPath -Raw).Trim()
if ($password.Length -lt 24) { throw 'Development password must contain at least 24 characters.' }
if (Get-LocalUser -Name $userName -ErrorAction SilentlyContinue) {
    throw 'Development access refuses to modify an existing local account.'
}

$securePassword = ConvertTo-SecureString $password -AsPlainText -Force
$user = New-LocalUser `
    -Name $userName `
    -Password $securePassword `
    -AccountNeverExpires `
    -Description 'Exosuit disposable development guest; forbidden in production'
$usersGroup = Get-LocalGroup -SID 'S-1-5-32-545'
Add-LocalGroupMember -Group $usersGroup -Member $user

if (-not ('Exosuit.LsaPrivateData' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Exosuit {
    public static class LsaPrivateData {
        [StructLayout(LayoutKind.Sequential)]
        private struct LSA_OBJECT_ATTRIBUTES {
            public int Length;
            public IntPtr RootDirectory;
            public IntPtr ObjectName;
            public uint Attributes;
            public IntPtr SecurityDescriptor;
            public IntPtr SecurityQualityOfService;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct LSA_UNICODE_STRING {
            public ushort Length;
            public ushort MaximumLength;
            public IntPtr Buffer;
        }

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern uint LsaOpenPolicy(
            IntPtr systemName,
            ref LSA_OBJECT_ATTRIBUTES objectAttributes,
            uint desiredAccess,
            out IntPtr policyHandle);

        [DllImport("advapi32.dll")]
        private static extern uint LsaStorePrivateData(
            IntPtr policyHandle,
            ref LSA_UNICODE_STRING keyName,
            ref LSA_UNICODE_STRING privateData);

        [DllImport("advapi32.dll")]
        private static extern uint LsaClose(IntPtr policyHandle);

        [DllImport("advapi32.dll")]
        private static extern uint LsaNtStatusToWinError(uint status);

        private static LSA_UNICODE_STRING UnicodeString(string value) {
            if (value.Length > 32766) throw new ArgumentOutOfRangeException("value");
            return new LSA_UNICODE_STRING {
                Buffer = Marshal.StringToHGlobalUni(value),
                Length = checked((ushort)(value.Length * 2)),
                MaximumLength = checked((ushort)((value.Length + 1) * 2)),
            };
        }

        public static void Store(string key, string value) {
            const uint POLICY_CREATE_SECRET = 0x00000020;
            var attributes = new LSA_OBJECT_ATTRIBUTES { Length = Marshal.SizeOf(typeof(LSA_OBJECT_ATTRIBUTES)) };
            IntPtr handle;
            uint status = LsaOpenPolicy(IntPtr.Zero, ref attributes, POLICY_CREATE_SECRET, out handle);
            if (status != 0) throw new Win32Exception((int)LsaNtStatusToWinError(status));
            var keyName = UnicodeString(key);
            var privateData = UnicodeString(value);
            try {
                status = LsaStorePrivateData(handle, ref keyName, ref privateData);
                if (status != 0) throw new Win32Exception((int)LsaNtStatusToWinError(status));
            } finally {
                Marshal.ZeroFreeGlobalAllocUnicode(keyName.Buffer);
                Marshal.ZeroFreeGlobalAllocUnicode(privateData.Buffer);
                LsaClose(handle);
            }
        }
    }
}
'@
}

[Exosuit.LsaPrivateData]::Store('DefaultPassword', $password)
$winlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
Set-ItemProperty -LiteralPath $winlogon -Name AutoAdminLogon -Value '1' -Type String
Set-ItemProperty -LiteralPath $winlogon -Name ForceAutoLogon -Value '1' -Type String
Set-ItemProperty -LiteralPath $winlogon -Name DefaultUserName -Value $userName -Type String
Set-ItemProperty -LiteralPath $winlogon -Name DefaultDomainName -Value $env:COMPUTERNAME -Type String
Remove-ItemProperty -LiteralPath $winlogon -Name DefaultPassword -ErrorAction SilentlyContinue

$marker = [ordered]@{
    contractVersion = 1
    mode = 'auto_logon'
    userName = $userName
    nonProduction = $true
    configuredAt = [DateTimeOffset]::UtcNow.ToString('O')
    passwordStoredAsLsaSecret = $true
    administrator = $false
}
[IO.File]::WriteAllText($MarkerPath, ($marker | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$bytes = New-Object byte[] ([Math]::Max(64, (Get-Item -LiteralPath $PasswordPath).Length))
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[IO.File]::WriteAllBytes($PasswordPath, $bytes)
Remove-Item -LiteralPath $PasswordPath -Force

if (-not $NoRestart) {
    Restart-Computer -Force
}
return
