[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [Guid]$FieldId,

    [Parameter()]
    [ValidateRange(1, 1000000)]
    [int]$FieldGeneration = 1,

    [Parameter(Mandatory)]
    [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Bounded {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][scriptblock]$Action,
        [Parameter()][object[]]$Arguments = @(),
        [Parameter()][ValidateRange(1, 300)][int]$TimeoutSeconds = 120
    )
    $job = Start-Job -ScriptBlock $Action -ArgumentList $Arguments
    try {
        if (-not (Wait-Job -Job $job -Timeout $TimeoutSeconds)) {
            Stop-Job -Job $job -ErrorAction SilentlyContinue
            throw "$Name exceeded $TimeoutSeconds seconds."
        }
        Receive-Job -Job $job -ErrorAction Stop
    } finally {
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    }
}

$fieldIdText = $FieldId.ToString('D').ToLowerInvariant()
$vmName = "Exosuit-Field-$fieldIdText-G$FieldGeneration"
$generationRoot = [IO.Path]::GetFullPath("C:\ProgramData\Exosuit\Fields\$fieldIdText\generation-$FieldGeneration")
$overlayPath = Join-Path $generationRoot "$fieldIdText-g$FieldGeneration-os-overlay.vhdx"
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$outputParent = Split-Path -Parent $resolvedOutput
if (-not (Test-Path -LiteralPath $outputParent -PathType Container)) {
    throw "Offline inspection output directory is missing: $outputParent"
}
if (-not (Test-Path -LiteralPath $overlayPath -PathType Leaf)) {
    throw "Field overlay is missing: $overlayPath"
}

$vmState = Invoke-Bounded -Name 'Get-VM' -TimeoutSeconds 30 -Arguments @($vmName) -Action {
    param($Name)
    Import-Module Hyper-V -ErrorAction Stop
    (Get-VM -Name $Name -ErrorAction Stop).State.ToString()
}
if ($vmState -ne 'Off') {
    throw "Offline inspection refuses a running VM; observed state: $vmState"
}

$result = [ordered]@{
    contractVersion = 1
    inspectedAt = [DateTimeOffset]::UtcNow.ToString('O')
    readOnly = $true
    field = [ordered]@{ fieldId = $fieldIdText; fieldGeneration = $FieldGeneration }
    vmName = $vmName
    vmState = $vmState
    success = $false
    dismountError = $null
}
$mounted = $false
try {
    $mount = Invoke-Bounded -Name 'Mount-DiskImage' -TimeoutSeconds 120 -Arguments @($overlayPath) -Action {
        param($Path)
        Import-Module Storage -ErrorAction Stop
        Mount-DiskImage -ImagePath $Path -Access ReadOnly -StorageType VHDX -ErrorAction Stop | Out-Null
        $image = Get-DiskImage -ImagePath $Path -ErrorAction Stop
        $disk = Get-Disk -Number $image.Number -ErrorAction Stop
        [pscustomobject]@{
            DiskNumber = $disk.Number
            Volumes = @(Get-Partition -DiskNumber $disk.Number | Where-Object DriveLetter | ForEach-Object { "$($_.DriveLetter):\" })
        }
    }
    $mounted = $true
    $windowsRoot = @($mount.Volumes | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Windows\System32') })
    if ($windowsRoot.Count -ne 1) {
        throw "Expected exactly one Windows volume; found $($windowsRoot.Count)."
    }
    $root = $windowsRoot[0]
    $agentRoot = Join-Path $root 'Exosuit\Agent'
    $configRoot = Join-Path $root 'Exosuit\Config'
    $logRoot = Join-Path $root 'Exosuit\Logs'
    $diagnosticsRoot = Join-Path $root 'Exosuit\Diagnostics'
    $taskPath = Join-Path $root 'Windows\System32\Tasks\ExosuitFieldGuest'
    $taskEventLogPath = Join-Path $root 'Windows\System32\winevt\Logs\Microsoft-Windows-TaskScheduler%4Operational.evtx'
    $setupCompleteLogPath = Join-Path $logRoot 'setup-complete.log'

    $result.agentFiles = @(
        Get-ChildItem -LiteralPath $agentRoot -File -Force -ErrorAction SilentlyContinue |
            Sort-Object Name |
            ForEach-Object { [ordered]@{ name = $_.Name; length = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } }
    )
    $result.configFiles = @(
        Get-ChildItem -LiteralPath $configRoot -File -Force -ErrorAction SilentlyContinue |
            Sort-Object Name |
            ForEach-Object { [ordered]@{ name = $_.Name; length = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } }
    )
    $result.logFiles = @(
        Get-ChildItem -LiteralPath $logRoot -File -Force -ErrorAction SilentlyContinue |
            Sort-Object Name |
            ForEach-Object { [ordered]@{ name = $_.Name; length = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } }
    )
    $result.setupComplete = [ordered]@{ exists = Test-Path -LiteralPath $setupCompleteLogPath -PathType Leaf }
    if ($result.setupComplete.exists) {
        $setupCompleteItem = Get-Item -LiteralPath $setupCompleteLogPath
        $result.setupComplete.length = $setupCompleteItem.Length
        $result.setupComplete.sha256 = (Get-FileHash -LiteralPath $setupCompleteLogPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($setupCompleteItem.Length -eq 0) {
            $result.setupComplete.classification = 'empty'
        } else {
            $setupCompleteText = Get-Content -LiteralPath $setupCompleteLogPath -Raw
            $result.setupComplete.classification = if ($setupCompleteText -match '(?is)cannot convert.+SwitchParameter.+Confirm') {
                'confirm_switch_binding'
            } elseif ($setupCompleteText -match '(?is)(Access is denied|0x80070005)' -and
                      $setupCompleteText -match '(?is)(Register-ScheduledTask|ExosuitFieldGuest)') {
                'task_registration_access_denied'
            } elseif ($setupCompleteText -match '(?is)(Register-ScheduledTask|Unable to register ExosuitFieldGuest)') {
                'task_registration_error'
            } elseif ($setupCompleteText -match '(?is)Start-ScheduledTask') {
                'task_start_error'
            } elseif ($setupCompleteText -match '(?is)(Initialize-ExosuitDevelopmentAccess|Development access)') {
                'development_access_error'
            } else {
                'unclassified_nonempty'
            }
            $setupCompleteText = $null
        }
    }
    $bootstrapReportPath = Join-Path $diagnosticsRoot 'bootstrap-report.json'
    if (Test-Path -LiteralPath $bootstrapReportPath -PathType Leaf) {
        $bootstrapReport = Get-Content -LiteralPath $bootstrapReportPath -Raw | ConvertFrom-Json
        $checkResults = @($bootstrapReport.checks | ForEach-Object {
            [ordered]@{
                name = [string]$_.name
                passed = [bool]$_.passed
                observedAt = [string]$_.observedAt
            }
        })
        $result['bootstrapReport'] = [ordered]@{
            exists = $true
            length = (Get-Item -LiteralPath $bootstrapReportPath).Length
            sha256 = (Get-FileHash -LiteralPath $bootstrapReportPath -Algorithm SHA256).Hash.ToLowerInvariant()
            manifestDigest = [string]$bootstrapReport.manifestDigest
            reportedAt = [string]$bootstrapReport.reportedAt
            checks = $checkResults
            failedChecks = @($checkResults | Where-Object { -not $_.passed } | ForEach-Object { $_.name })
        }
    } else {
        $result['bootstrapReport'] = [ordered]@{ exists = $false }
    }
    $result.task = [ordered]@{ exists = Test-Path -LiteralPath $taskPath -PathType Leaf }
    if ($result.task.exists) {
        [xml]$taskXml = Get-Content -LiteralPath $taskPath -Raw -ErrorAction Stop
        $result.task.sha256 = (Get-FileHash -LiteralPath $taskPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $result.task.userId = $taskXml.SelectSingleNode("//*[local-name()='Principal']/*[local-name()='UserId']").InnerText
        $result.task.runLevel = $taskXml.SelectSingleNode("//*[local-name()='Principal']/*[local-name()='RunLevel']").InnerText
        $result.task.command = $taskXml.SelectSingleNode("//*[local-name()='Exec']/*[local-name()='Command']").InnerText
        $result.task.arguments = $taskXml.SelectSingleNode("//*[local-name()='Exec']/*[local-name()='Arguments']").InnerText
        $result.task.triggerTypes = @($taskXml.SelectNodes("//*[local-name()='Triggers']/*") | ForEach-Object LocalName)
        $enabledNode = $taskXml.SelectSingleNode("//*[local-name()='Settings']/*[local-name()='Enabled']")
        $startWhenAvailableNode = $taskXml.SelectSingleNode("//*[local-name()='Settings']/*[local-name()='StartWhenAvailable']")
        $multipleInstancesNode = $taskXml.SelectSingleNode("//*[local-name()='Settings']/*[local-name()='MultipleInstancesPolicy']")
        $result.task.enabled = $null -eq $enabledNode -or $enabledNode.InnerText -ceq 'true'
        $result.task.startWhenAvailable = $null -ne $startWhenAvailableNode -and $startWhenAvailableNode.InnerText -ceq 'true'
        $result.task.multipleInstancesPolicy = if ($null -eq $multipleInstancesNode) { $null } else { $multipleInstancesNode.InnerText }
    }
    $result.taskEvents = [ordered]@{ exists = Test-Path -LiteralPath $taskEventLogPath -PathType Leaf; events = @() }
    if ($result.taskEvents.exists) {
        $taskEvents = @(Get-WinEvent `
            -Path $taskEventLogPath `
            -FilterXPath "*[EventData[Data='\ExosuitFieldGuest']]" `
            -MaxEvents 64 `
            -ErrorAction SilentlyContinue)
        $result.taskEvents.events = @($taskEvents | ForEach-Object {
            [ordered]@{
                id = [int]$_.Id
                level = [int]$_.Level
                recordId = [long]$_.RecordId
                timeCreated = if ($null -eq $_.TimeCreated) { $null } else { $_.TimeCreated.ToUniversalTime().ToString('O') }
            }
        })
    }
    $result.success = $true
} catch {
    $result.error = $_.Exception.Message
} finally {
    if ($mounted) {
        try {
            Invoke-Bounded -Name 'Dismount-DiskImage' -TimeoutSeconds 60 -Arguments @($overlayPath) -Action {
                param($Path)
                Import-Module Storage -ErrorAction Stop
                Dismount-DiskImage -ImagePath $Path -ErrorAction Stop | Out-Null
            } | Out-Null
        } catch {
            $result.dismountError = $_.Exception.Message
        }
    }
}

$temporaryOutput = "$resolvedOutput.$([Guid]::NewGuid().ToString('N')).tmp"
try {
    $json = $result | ConvertTo-Json -Depth 10
    [IO.File]::WriteAllText($temporaryOutput, $json, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporaryOutput -Destination $resolvedOutput -Force
} finally {
    Remove-Item -LiteralPath $temporaryOutput -Force -ErrorAction SilentlyContinue
}

$result | ConvertTo-Json -Depth 10
if (-not $result.success -or $result.dismountError) { exit 2 }
