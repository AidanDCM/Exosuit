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
    [string]$EvidenceDirectory,

    [Parameter()]
    [ValidateSet('handshake', 'bootstrap', 'heartbeat')]
    [string[]]$MessageTypes = @('handshake', 'bootstrap', 'heartbeat'),

    [Parameter()]
    [string]$ReplayStatePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$vm = Get-CimInstance -Namespace 'root\virtualization\v2' -ClassName Msvm_ComputerSystem |
    Where-Object { $_.ElementName -eq $VmName -and $_.Caption -eq 'Virtual Machine' }
if (@($vm).Count -ne 1) { throw 'Exactly one running Field VM must match the requested name.' }
$component = Get-CimAssociatedInstance -InputObject $vm -ResultClassName Msvm_KvpExchangeComponent
if (@($component).Count -ne 1) { throw 'The Field KVP exchange component is unavailable.' }

function Get-FieldKvpItems {
    $currentComponent = Get-CimAssociatedInstance -InputObject $vm -ResultClassName Msvm_KvpExchangeComponent
    $currentItems = @{}
    foreach ($raw in $currentComponent.GuestExchangeItems) {
        $xml = [xml]$raw
        $name = $xml.SelectSingleNode("/INSTANCE/PROPERTY[@NAME='Name']/VALUE").InnerText
        $data = $xml.SelectSingleNode("/INSTANCE/PROPERTY[@NAME='Data']/VALUE").InnerText
        if ($name.StartsWith('Exosuit.Field.', [StringComparison]::Ordinal)) { $currentItems[$name] = $data }
    }
    return $currentItems
}

$entries = @(
    @{ name = 'handshake'; key = 'Exosuit.Field.Handshake' },
    @{ name = 'bootstrap'; key = 'Exosuit.Field.Bootstrap' },
    @{ name = 'heartbeat'; key = 'Exosuit.Field.Heartbeat' }
)
$selectedEntries = @($entries | Where-Object { $_.name -in $MessageTypes })
if ($selectedEntries.Count -ne $MessageTypes.Count) { throw 'Requested guest KVP message types must be unique.' }
$items = Get-FieldKvpItems
foreach ($entry in $selectedEntries) {
    if (-not $items.ContainsKey($entry.key)) { throw "Required guest KVP item is missing: $($entry.key)" }
}

function Resolve-KvpEnvelope {
    param([Parameter(Mandatory)][string]$Key)
    $lastError = $null
    for ($attempt = 1; $attempt -le 20; $attempt++) {
        $snapshot = Get-FieldKvpItems
        $value = [string]$snapshot[$Key]
        $marker = $null
        $isChunked = $false
        try {
            $marker = $value | ConvertFrom-Json
            if (-not ($marker.PSObject.Properties.Name -contains 'transport') -or $marker.transport -ne 'chunked') { return $value }
            $isChunked = $true
            if ($marker.contractVersion -ne 1 -or [int]$marker.chunkCount -lt 1 -or [int]$marker.chunkCount -gt 32) {
                throw 'Chunked KVP envelope marker is invalid.'
            }
            $builder = [Text.StringBuilder]::new()
            for ($index = 0; $index -lt [int]$marker.chunkCount; $index++) {
                $chunkKey = "$Key.$($index.ToString('D3'))"
                if (-not $snapshot.ContainsKey($chunkKey)) { throw "Chunked KVP envelope is missing $chunkKey." }
                [void]$builder.Append([string]$snapshot[$chunkKey])
            }
            $resolved = $builder.ToString()
            $hasher = [Security.Cryptography.SHA256]::Create()
            try {
                $digestBytes = $hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($resolved))
            } finally {
                $hasher.Dispose()
            }
            $digest = ([BitConverter]::ToString($digestBytes) -replace '-', '').ToLowerInvariant()
            if ($digest -cne [string]$marker.sha256) { throw 'Chunked KVP envelope digest is invalid.' }
            return $resolved
        } catch {
            if (-not $isChunked) { return $value }
            $lastError = $_
            if ($attempt -lt 20) { Start-Sleep -Milliseconds 100 }
        }
    }
    throw $lastError
}

New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$replayPath = if ([string]::IsNullOrWhiteSpace($ReplayStatePath)) {
    Join-Path $EvidenceDirectory 'guest-to-host-replay.json'
} else {
    $resolvedReplay = [IO.Path]::GetFullPath($ReplayStatePath)
    New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedReplay) -Force | Out-Null
    $resolvedReplay
}
$verified = [ordered]@{}
foreach ($entry in $selectedEntries) {
    $envelopePath = Join-Path $EvidenceDirectory "$($entry.name)-envelope.json"
    [IO.File]::WriteAllText($envelopePath, (Resolve-KvpEnvelope -Key $entry.key), [Text.UTF8Encoding]::new($false))
    $output = & $AgentPath --field-verify-envelope $RuntimeConfigPath $envelopePath $replayPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Guest $($entry.name) envelope verification failed: $($output -join ' ')"
    }
    $verified[$entry.name] = ($output -join [Environment]::NewLine) | ConvertFrom-Json
}

$result = [ordered]@{
    contractVersion = 1
    capturedAtUtc = [DateTimeOffset]::UtcNow.ToString('O')
    vmName = $VmName
    transport = 'hyperv_kvp'
}
foreach ($entry in $selectedEntries) { $result[$entry.name] = $verified[$entry.name] }
$resultPath = Join-Path $EvidenceDirectory 'verified-guest-kvp.json'
[IO.File]::WriteAllText($resultPath, ($result | ConvertTo-Json -Depth 50), [Text.UTF8Encoding]::new($false))
$result | ConvertTo-Json -Depth 50
