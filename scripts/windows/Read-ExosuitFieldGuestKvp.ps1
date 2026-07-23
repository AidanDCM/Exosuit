[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$VmName,

    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$RuntimeConfigPath,

    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$AgentPath,

    [Parameter(Mandatory)]
    [string]$EvidenceDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$vm = Get-CimInstance -Namespace 'root\virtualization\v2' -ClassName Msvm_ComputerSystem |
    Where-Object { $_.ElementName -eq $VmName -and $_.Caption -eq 'Virtual Machine' }
if (@($vm).Count -ne 1) { throw 'Exactly one running Field VM must match the requested name.' }
$component = Get-CimAssociatedInstance -InputObject $vm -ResultClassName Msvm_KvpExchangeComponent
if (@($component).Count -ne 1) { throw 'The Field KVP exchange component is unavailable.' }

$items = @{}
foreach ($raw in $component.GuestExchangeItems) {
    $xml = [xml]$raw
    $name = $xml.SelectSingleNode("/INSTANCE/PROPERTY[@NAME='Name']/VALUE").InnerText
    $data = $xml.SelectSingleNode("/INSTANCE/PROPERTY[@NAME='Data']/VALUE").InnerText
    if ($name.StartsWith('Exosuit.Field.', [StringComparison]::Ordinal)) { $items[$name] = $data }
}

$required = @('Exosuit.Field.Handshake', 'Exosuit.Field.Bootstrap', 'Exosuit.Field.Heartbeat')
foreach ($name in $required) {
    if (-not $items.ContainsKey($name)) { throw "Required guest KVP item is missing: $name" }
}

New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$replayPath = Join-Path $EvidenceDirectory 'guest-to-host-replay.json'
$verified = @()
foreach ($entry in @(
    @{ name = 'handshake'; key = 'Exosuit.Field.Handshake' },
    @{ name = 'bootstrap'; key = 'Exosuit.Field.Bootstrap' },
    @{ name = 'heartbeat'; key = 'Exosuit.Field.Heartbeat' }
)) {
    $envelopePath = Join-Path $EvidenceDirectory "$($entry.name)-envelope.json"
    [IO.File]::WriteAllText($envelopePath, [string]$items[$entry.key], [Text.UTF8Encoding]::new($false))
    $output = & $AgentPath --field-verify-envelope $RuntimeConfigPath $envelopePath $replayPath
    if ($LASTEXITCODE -ne 0) { throw "Guest $($entry.name) envelope verification failed." }
    $verified += ($output -join [Environment]::NewLine) | ConvertFrom-Json
}

$result = [ordered]@{
    contractVersion = 1
    capturedAtUtc = [DateTimeOffset]::UtcNow.ToString('O')
    vmName = $VmName
    transport = 'hyperv_kvp'
    handshake = $verified[0]
    bootstrap = $verified[1]
    heartbeat = $verified[2]
}
$resultPath = Join-Path $EvidenceDirectory 'verified-guest-kvp.json'
[IO.File]::WriteAllText($resultPath, ($result | ConvertTo-Json -Depth 50), [Text.UTF8Encoding]::new($false))
$result | ConvertTo-Json -Depth 50
