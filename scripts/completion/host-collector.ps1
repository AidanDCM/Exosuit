<#
.SYNOPSIS
  Read-only host attestation collector for Exosuit completion gate M0.5.

.DESCRIPTION
  Emits a JSON snapshot of the machine facts a host attestation must bind to.
  This script is READ-ONLY by construction: it calls only Get-* cmdlets and
  Confirm-SecureBootUEFI. It must never enable or clear the TPM, change Secure
  Boot, modify Hyper-V, install anything, or alter machine policy.

  Some facts (Secure Boot, TPM) are readable only from an elevated process.
  The caller hashes this file BEFORE elevating and passes the expected hash in,
  so a swapped collector is detected by the unelevated side.

.PARAMETER Nonce
  Fresh challenge nonce supplied by the caller, echoed into the snapshot so a
  captured snapshot cannot be replayed as a current one.

.PARAMETER ExpectedCollectorHash
  SHA-256 of this file as measured by the caller before elevation.

.PARAMETER ExactCommit
  The source commit the attestation is bound to.

.PARAMETER OutFile
  Where to write the JSON snapshot. Written by the elevated process so the
  unelevated caller can read it back.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Nonce,
  [Parameter(Mandatory = $true)][string]$ExpectedCollectorHash,
  [Parameter(Mandatory = $true)][string]$ExactCommit,
  [Parameter(Mandatory = $true)][string]$OutFile
)

$ErrorActionPreference = 'Stop'
$COLLECTOR_VERSION = '1.0.0'
$startedAt = (Get-Date).ToUniversalTime().ToString('o')

function Read-Fact {
  param([scriptblock]$Body)
  try { & $Body } catch { "unavailable: $($_.Exception.Message.Split([Environment]::NewLine)[0])" }
}

# The collector measures itself as well; the caller's pre-elevation hash is the
# authoritative one, and a mismatch between the two invalidates the run.
$selfHash = (Get-FileHash -Path $PSCommandPath -Algorithm SHA256).Hash.ToLower()

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)

$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem

$secureBoot = Read-Fact { Confirm-SecureBootUEFI }

$tpm = Read-Fact {
  $t = Get-Tpm
  # Unelevated, Get-Tpm succeeds but returns an object whose properties are all
  # null. Coercing those to $false would record "no TPM present" when the truth
  # is "not readable" — a false fact is worse than a missing one.
  if ($null -eq $t -or $null -eq $t.TpmPresent) {
    return 'unavailable: TPM state not readable (requires elevation)'
  }
  [ordered]@{
    present        = [bool]$t.TpmPresent
    ready          = [bool]$t.TpmReady
    enabled        = [bool]$t.TpmEnabled
    activated      = [bool]$t.TpmActivated
    owned          = [bool]$t.TpmOwned
    lockedOut      = [bool]$t.LockedOut
    managedAuthLevel = "$($t.ManagedAuthLevel)"
  }
}

$tpmSpec = Read-Fact {
  $w = Get-CimInstance -Namespace 'root\CIMV2\Security\MicrosoftTpm' -ClassName Win32_Tpm
  [ordered]@{
    specVersion      = "$($w.SpecVersion)"
    manufacturerId   = "$($w.ManufacturerIdTxt)"
    manufacturerVersion = "$($w.ManufacturerVersion)"
  }
}

$hyperVFeature = Read-Fact {
  (Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All).State.ToString()
}

$services = @{}
foreach ($name in 'vmms', 'vmcompute') {
  $services[$name] = Read-Fact {
    $s = Get-Service -Name $name
    [ordered]@{ status = "$($s.Status)"; startType = "$($s.StartType)" }
  }
}

$hostInfo = Read-Fact {
  $h = Get-VMHost
  [ordered]@{
    computerName          = $h.ComputerName
    logicalProcessorCount = $h.LogicalProcessorCount
    memoryCapacityBytes   = $h.MemoryCapacity
    virtualHardDiskPath   = $h.VirtualHardDiskPath
  }
}

$switches = Read-Fact {
  @(Get-VMSwitch | ForEach-Object {
    [ordered]@{ name = $_.Name; switchType = "$($_.SwitchType)"; id = "$($_.Id)" }
  })
}

$snapshot = [ordered]@{
  schema                = 'exosuit.host-attestation/1'
  collectorVersion      = $COLLECTOR_VERSION
  collectorSelfHash     = $selfHash
  expectedCollectorHash = $ExpectedCollectorHash.ToLower()
  collectorHashMatches  = ($selfHash -eq $ExpectedCollectorHash.ToLower())
  nonce                 = $Nonce
  exactCommit           = $ExactCommit
  startedAt             = $startedAt
  endedAt               = (Get-Date).ToUniversalTime().ToString('o')
  elevated              = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  runAsIdentity         = $identity.Name
  machine = [ordered]@{
    hostname     = [System.Net.Dns]::GetHostName()
    manufacturer = $cs.Manufacturer
    model        = $cs.Model
    uuid         = (Get-CimInstance Win32_ComputerSystemProduct).UUID
  }
  windows = [ordered]@{
    caption      = $os.Caption
    version      = $os.Version
    buildNumber  = $os.BuildNumber
    architecture = $os.OSArchitecture
    installDate  = $os.InstallDate.ToUniversalTime().ToString('o')
    lastBootUpTime = $os.LastBootUpTime.ToUniversalTime().ToString('o')
  }
  secureBoot        = $secureBoot
  tpm               = $tpm
  tpmSpec           = $tpmSpec
  hypervisorPresent = [bool]$cs.HypervisorPresent
  hyperVFeature     = $hyperVFeature
  services          = $services
  vmHost            = $hostInfo
  switches          = $switches
}

$json = $snapshot | ConvertTo-Json -Depth 8
Set-Content -Path $OutFile -Value $json -Encoding utf8
Write-Output "collector complete: $OutFile"
