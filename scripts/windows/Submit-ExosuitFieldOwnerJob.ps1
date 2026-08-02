[CmdletBinding(DefaultParameterSetName = 'Destroy')]
param(
    [Parameter(Mandatory)][ValidateSet('provision', 'observe', 'destroy')][string]$Operation,
    [Parameter(Mandatory)][Guid]$FieldId,
    [Parameter(Mandatory)][ValidateRange(1, 2147483647)][int]$FieldGeneration,
    [Parameter(Mandatory, ParameterSetName = 'Provision')][ValidateScript({ Test-Path $_ -PathType Leaf })][string]$PlanPath,
    [Parameter(Mandatory, ParameterSetName = 'Provision')][ValidateScript({ Test-Path $_ -PathType Container })][string]$GuestSeedDirectory,
    [Parameter(ParameterSetName = 'Provision')][switch]$DevelopmentAccess,
    [Parameter(Mandatory, ParameterSetName = 'Observe')][ValidateScript({ Test-Path $_ -PathType Leaf })][string]$RuntimeConfigPath,
    [Parameter(Mandatory, ParameterSetName = 'Observe')][ValidateScript({ Test-Path $_ -PathType Leaf })][string]$HostSecretPath,
    [Parameter()][string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [Parameter()][ValidateRange(30, 300)][int]$ValiditySeconds = 180,
    [Parameter()][switch]$Wait
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (($Operation -ceq 'provision' -and $PSCmdlet.ParameterSetName -cne 'Provision') -or
    ($Operation -ceq 'observe' -and $PSCmdlet.ParameterSetName -cne 'Observe') -or
    ($Operation -ceq 'destroy' -and $PSCmdlet.ParameterSetName -cne 'Destroy')) { throw 'Operation inputs do not match the requested owner-service operation.' }
$policyPath = 'C:\ProgramData\Exosuit\FieldOwner\policy.json'
if (-not (Test-Path -LiteralPath $policyPath -PathType Leaf)) { throw 'Field owner service policy is not installed.' }
$policy = Get-Content -LiteralPath $policyPath -Raw | ConvertFrom-Json
if (@($policy.allowedOperations) -cnotcontains $Operation) { throw 'Requested operation is outside the installed owner policy.' }
$head = (& git -C $RepositoryRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -notmatch '^[0-9a-f]{40}$') { throw 'Unable to bind the job to an exact source head.' }
$jobId = [Guid]::NewGuid()
$pendingRoot = 'C:\ProgramData\Exosuit\FieldOwner\Queue\Pending'
$staging = Join-Path $pendingRoot ".staging-$($jobId.ToString('D'))"
$destination = Join-Path $pendingRoot $jobId.ToString('D')
New-Item -ItemType Directory -Path $staging | Out-Null
try {
    $planDigest = $null
    $runtimeConfigDigest = $null
    $hostSecretDigest = $null
    if ($Operation -ceq 'provision') {
        Copy-Item -LiteralPath $PlanPath -Destination (Join-Path $staging 'plan.json')
        $planDigest = (Get-FileHash -LiteralPath (Join-Path $staging 'plan.json') -Algorithm SHA256).Hash.ToLowerInvariant()
        Copy-Item -LiteralPath $GuestSeedDirectory -Destination (Join-Path $staging 'guest-seed') -Recurse
    } elseif ($Operation -ceq 'observe') {
        $runtimeDestination = Join-Path $staging 'runtime-config.json'
        $secretDestination = Join-Path $staging 'host-secret.txt'
        Copy-Item -LiteralPath $RuntimeConfigPath -Destination $runtimeDestination
        Copy-Item -LiteralPath $HostSecretPath -Destination $secretDestination
        $runtime = Get-Content -LiteralPath $runtimeDestination -Raw | ConvertFrom-Json
        if ($runtime.field.fieldId -cne $FieldId.ToString('D') -or [int]$runtime.field.fieldGeneration -ne $FieldGeneration) { throw 'Observation runtime identity does not match the submitted Field generation.' }
        $runtime.secretPath = Join-Path (Join-Path 'C:\ProgramData\Exosuit\FieldOwner\Queue\Processing' $jobId.ToString('D')) 'host-secret.txt'
        [IO.File]::WriteAllText($runtimeDestination, ($runtime | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
        $runtimeConfigDigest = (Get-FileHash -LiteralPath $runtimeDestination -Algorithm SHA256).Hash.ToLowerInvariant()
        $hostSecretDigest = (Get-FileHash -LiteralPath $secretDestination -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $createdAt = [DateTimeOffset]::UtcNow
    $job = [ordered]@{
        contractVersion = 1
        jobId = $jobId.ToString('D')
        policyId = [string]$policy.policyId
        createdAt = $createdAt.ToString('O')
        expiresAt = $createdAt.AddSeconds($ValiditySeconds).ToString('O')
        sourceHead = $head
        operation = $Operation
        fieldId = $FieldId.ToString('D')
        fieldGeneration = $FieldGeneration
        planSha256 = $planDigest
        runtimeConfigSha256 = $runtimeConfigDigest
        hostSecretSha256 = $hostSecretDigest
        developmentAccess = [bool]$DevelopmentAccess
    }
    [IO.File]::WriteAllText((Join-Path $staging 'job.json'), ($job | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $staging -Destination $destination
} catch {
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    throw
}
$submission = [ordered]@{ contractVersion = 1; jobId = $jobId.ToString('D'); status = 'submitted'; sourceHead = $head; operation = $Operation; field = @{ fieldId = $FieldId.ToString('D'); fieldGeneration = $FieldGeneration } }
if ($Wait) {
    $resultPath = "C:\ProgramData\Exosuit\FieldOwner\Results\$($jobId.ToString('D')).json"
    $deadline = [DateTimeOffset]::UtcNow.AddMinutes(90)
    while (-not (Test-Path -LiteralPath $resultPath -PathType Leaf)) {
        if ([DateTimeOffset]::UtcNow -ge $deadline) { throw 'Timed out waiting for the bounded Field owner job result.' }
        Start-Sleep -Seconds 2
    }
    Get-Content -LiteralPath $resultPath -Raw
} else {
    $submission | ConvertTo-Json -Depth 10
}
