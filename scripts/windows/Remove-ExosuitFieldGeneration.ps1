[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [Guid]$FieldId,

    [Parameter(Mandatory)]
    [ValidateRange(1, 2147483647)]
    [int]$FieldGeneration,

    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$HostConfigPath,

    [Parameter(Mandatory)]
    [string]$TypedConfirmation,

    [Parameter()]
    [string]$EvidenceDirectory = "$env:ProgramData\Exosuit\Evidence"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function ConvertFrom-JsonDocument {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][int]$Depth)
    $json = Get-Content -LiteralPath $Path -Raw
    if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('Depth')) {
        return $json | ConvertFrom-Json -Depth $Depth
    }
    return $json | ConvertFrom-Json
}

$config = ConvertFrom-JsonDocument -Path $HostConfigPath -Depth 50
if ($config.contractVersion -ne 1) { throw 'Unsupported Field host configuration contract version.' }
$fieldIdText = $FieldId.ToString()
$expectedConfirmation = "DESTROY FIELD $fieldIdText GENERATION $FieldGeneration"
if ($TypedConfirmation -cne $expectedConfirmation) { throw "Exact typed confirmation required: $expectedConfirmation" }

$storageRoot = [System.IO.Path]::GetFullPath([string]$config.storageRoot)
if ([System.IO.Path]::GetPathRoot($storageRoot) -eq $storageRoot) { throw 'Field storage root cannot be an entire drive.' }
$generationRoot = Join-Path $storageRoot (Join-Path $fieldIdText "generation-$FieldGeneration")
$rootPrefix = $storageRoot.TrimEnd('\') + '\'
if (-not $generationRoot.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Generation path escapes the Field storage root.' }
if ($generationRoot -eq $storageRoot) { throw 'Generation path cannot equal the Field storage root.' }

$cursor = $generationRoot
while ($cursor.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    if (Test-Path -LiteralPath $cursor) {
        $item = Get-Item -LiteralPath $cursor -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Refusing deletion through reparse point: $cursor" }
    }
    $parent = Split-Path -Parent $cursor
    if ($parent -eq $cursor -or $parent -eq $storageRoot) { break }
    $cursor = $parent
}

$vmName = "Exosuit-Field-$fieldIdText-G$FieldGeneration"
$summary = [ordered]@{
    contractVersion = 1
    startedAt = [DateTimeOffset]::UtcNow.ToString('O')
    field = [ordered]@{ fieldId = $fieldIdText; fieldGeneration = $FieldGeneration }
    vmName = $vmName
    generationRoot = $generationRoot
    stoppedVm = $false
    removedVm = $false
    removedGenerationRoot = $false
    status = 'running'
    error = $null
}

try {
    $vm = Get-VM -Name $vmName -ErrorAction SilentlyContinue
    if ($vm) {
        if ($vm.State -ne 'Off' -and $PSCmdlet.ShouldProcess($vmName, 'Turn off Field VM')) {
            Stop-VM -Name $vmName -TurnOff -Force -Confirm:$false
            $summary.stoppedVm = $true
        }
        if ($PSCmdlet.ShouldProcess($vmName, 'Remove Field VM registration')) {
            Remove-VM -Name $vmName -Force -Confirm:$false
            $summary.removedVm = $true
        }
    }
    if (Test-Path -LiteralPath $generationRoot) {
        if ($PSCmdlet.ShouldProcess($generationRoot, 'Delete disposable Field generation files')) {
            Remove-Item -LiteralPath $generationRoot -Recurse -Force
            $summary.removedGenerationRoot = $true
        }
    }
    $summary.status = 'destroyed'
} catch {
    $summary.status = 'failed'
    $summary.error = $_.Exception.Message
    throw
} finally {
    $summary.completedAt = [DateTimeOffset]::UtcNow.ToString('O')
    New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
    $evidencePath = Join-Path $EvidenceDirectory "field-destroy-$fieldIdText-g$FieldGeneration-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()).json"
    [IO.File]::WriteAllText($evidencePath, ($summary | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
}

$summary | ConvertTo-Json -Depth 20
