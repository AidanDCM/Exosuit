[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)][ValidateScript({ Test-Path $_ -PathType Leaf })][string]$SourceImagePath,
    [Parameter(Mandatory)][string]$SourceImageId,
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{64}$')][string]$SourceImageSha256,
    [Parameter(Mandatory)][string]$TargetImagePath,
    [Parameter(Mandatory)][ValidatePattern('^exosuit-field-base-v[0-9]+$')][string]$TargetImageId,
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$SourceCommit,
    [Parameter(Mandatory)][ValidateScript({ Test-Path $_ -PathType Leaf })][string]$AgentPath,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [Parameter()][switch]$Apply,
    [Parameter()][string]$TypedConfirmation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Digest([string]$Path) {
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-UnderRoot([string]$Path, [string]$Root) {
    $resolved = [IO.Path]::GetFullPath($Path)
    $resolvedRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path escapes its authorized root: $resolved"
    }
    $resolved
}

function Set-ExactComponentAcl([string]$Path, [bool]$Container) {
    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) }
    $inheritance = if ($Container) {
        [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
    } else { [Security.AccessControl.InheritanceFlags]::None }
    $propagation = [Security.AccessControl.PropagationFlags]::None
    foreach ($entry in @(
        @{ Sid = 'S-1-5-18'; Rights = [Security.AccessControl.FileSystemRights]::FullControl },
        @{ Sid = 'S-1-5-32-544'; Rights = [Security.AccessControl.FileSystemRights]::FullControl },
        @{ Sid = 'S-1-5-32-545'; Rights = [Security.AccessControl.FileSystemRights]::ReadAndExecute }
    )) {
        $sid = [Security.Principal.SecurityIdentifier]::new($entry.Sid)
        $rule = [Security.AccessControl.FileSystemAccessRule]::new(
            $sid, $entry.Rights, $inheritance, $propagation, [Security.AccessControl.AccessControlType]::Allow)
        [void]$acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Assert-NoUntrustedWrite([string]$Path) {
    $acl = Get-Acl -LiteralPath $Path
    $trusted = @('S-1-5-18', 'S-1-5-32-544')
    $writeForUntrusted = @($acl.Access | Where-Object {
        $sid = $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        $_.AccessControlType -eq 'Allow' -and $trusted -notcontains $sid -and
        ($_.FileSystemRights.ToString() -match 'Write|Modify|FullControl|CreateFiles|CreateDirectories')
    })
    if ($writeForUntrusted.Count -ne 0) { throw "Derived base component ACL permits untrusted write: $Path" }
}

$source = [IO.Path]::GetFullPath($SourceImagePath)
$target = [IO.Path]::GetFullPath($TargetImagePath)
$imageRoot = [IO.Path]::GetFullPath('C:\ProgramData\Exosuit\Images')
$target = Assert-UnderRoot -Path $target -Root $imageRoot
if ([IO.Path]::GetFileNameWithoutExtension($target) -cne $TargetImageId) {
    throw 'Target image path must use the exact target image ID.'
}
if ($SourceImageId -cnotmatch '^exosuit-field-base-v[0-9]+$' -or $SourceImageId -ceq $TargetImageId) {
    throw 'Source and target image identities are invalid.'
}
$sourceItem = Get-Item -LiteralPath $source
if (-not $sourceItem.IsReadOnly) { throw 'Source base must already be immutable/read-only.' }
if (Test-Path -LiteralPath $target) { throw 'Target base already exists; derivation never overwrites an image.' }
if ((Get-Digest $source) -cne $SourceImageSha256) { throw 'Source base digest does not match its authorization.' }

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$head = (& git -C $repositoryRoot rev-parse HEAD 2>$null | Select-Object -First 1).Trim()
$trackedStatus = & git -C $repositoryRoot status --porcelain --untracked-files=no 2>$null
if ($LASTEXITCODE -ne 0 -or $head -cne $SourceCommit -or -not [string]::IsNullOrWhiteSpace(($trackedStatus -join ''))) {
    throw 'Derived base requires the exact clean source commit named by the authorization.'
}
$agentRoot = Join-Path $repositoryRoot 'scripts\windows'
$components = [ordered]@{
    'Exosuit.Agent.exe' = [IO.Path]::GetFullPath($AgentPath)
    'Initialize-ExosuitDevelopmentAccess.ps1' = Join-Path $agentRoot 'Initialize-ExosuitDevelopmentAccess.ps1'
    'Initialize-ExosuitFieldGuest.ps1' = Join-Path $agentRoot 'Initialize-ExosuitFieldGuest.ps1'
    'Install-ExosuitFieldGuest.ps1' = Join-Path $agentRoot 'Install-ExosuitFieldGuest.ps1'
    'Start-ExosuitFieldGuest.ps1' = Join-Path $agentRoot 'Start-ExosuitFieldGuest.ps1'
}
$setupCompleteSource = Join-Path $agentRoot 'SetupComplete-ExosuitFieldGuest.cmd'
foreach ($path in @($components.Values) + @($setupCompleteSource)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Derived-base component is missing: $path" }
}
$componentDigests = [ordered]@{}
foreach ($entry in $components.GetEnumerator()) { $componentDigests[$entry.Key] = Get-Digest $entry.Value }
$setupCompleteDigest = Get-Digest $setupCompleteSource

$expectedConfirmation = "BUILD FIELD BASE $TargetImageId FROM $SourceImageId"
$plan = [ordered]@{
    contractVersion = 1
    operation = 'derive_immutable_field_base_offline'
    sourceCommit = $SourceCommit
    source = [ordered]@{ imageId = $SourceImageId; path = $source; sha256 = $SourceImageSha256; remainsReadOnly = $true }
    target = [ordered]@{ imageId = $TargetImageId; path = $target; overwriteAllowed = $false }
    networkAttached = $false
    sourceMountedWritable = $false
    perGenerationConfigurationAllowed = $false
    components = $componentDigests
    setupCompleteSha256 = $setupCompleteDigest
    applyRequested = [bool]$Apply
    expectedConfirmation = $expectedConfirmation
}
if (-not $Apply) { $plan | ConvertTo-Json -Depth 10; return }
if ($TypedConfirmation -cne $expectedConfirmation) { throw "Typed confirmation must be exactly: $expectedConfirmation" }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Derived Field base creation requires an elevated local administrator.'
}
if (-not $PSCmdlet.ShouldProcess($target, "Derive immutable Field base from exact read-only source $source")) { return }

$targetDirectory = Split-Path -Parent $target
New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
$temporary = Assert-UnderRoot -Path (Join-Path $targetDirectory "$TargetImageId.$([Guid]::NewGuid().ToString('N')).building.vhdx") -Root $imageRoot
$mounted = $false
$targetPublished = $false
$startedAt = [DateTimeOffset]::UtcNow
try {
    Copy-Item -LiteralPath $source -Destination $temporary -ErrorAction Stop
    $temporaryItem = Get-Item -LiteralPath $temporary
    $temporaryItem.IsReadOnly = $false
    Mount-VHD -Path $temporary -ErrorAction Stop | Out-Null
    $mounted = $true
    $disk = Get-DiskImage -ImagePath $temporary | Get-Disk
    $windowsRoots = @()
    foreach ($partition in @($disk | Get-Partition)) {
        if (-not $partition.DriveLetter) { continue }
        $root = "$($partition.DriveLetter):\"
        if (Test-Path -LiteralPath (Join-Path $root 'Windows\System32') -PathType Container) { $windowsRoots += $root }
    }
    if ($windowsRoots.Count -ne 1) { throw 'Derived base requires exactly one offline Windows volume.' }
    $windowsRoot = $windowsRoots[0]
    $guestAgentRoot = Join-Path $windowsRoot 'Exosuit\Agent'
    $guestConfigRoot = Join-Path $windowsRoot 'Exosuit\Config'
    $guestSetupRoot = Join-Path $windowsRoot 'Windows\Setup\Scripts'
    foreach ($root in @($guestAgentRoot, $guestSetupRoot)) {
        if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "Expected sealed-base directory is absent: $root" }
    }
    if (Test-Path -LiteralPath $guestConfigRoot) {
        if (@(Get-ChildItem -LiteralPath $guestConfigRoot -File -Recurse -Force).Count -ne 0) {
            throw 'Derived base refuses source content containing per-generation configuration or secrets.'
        }
    }
    foreach ($entry in $components.GetEnumerator()) {
        $destination = Join-Path $guestAgentRoot $entry.Key
        if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) { throw "Expected fixed base component is absent: $destination" }
        Copy-Item -LiteralPath $entry.Value -Destination $destination -Force
        if ((Get-Digest $destination) -cne $componentDigests[$entry.Key]) { throw "Derived base component verification failed: $($entry.Key)" }
    }
    $setupDestination = Join-Path $guestSetupRoot 'SetupComplete.cmd'
    if (-not (Test-Path -LiteralPath $setupDestination -PathType Leaf)) { throw 'Expected SetupComplete hook is absent.' }
    Copy-Item -LiteralPath $setupCompleteSource -Destination $setupDestination -Force
    if ((Get-Digest $setupDestination) -cne $setupCompleteDigest) { throw 'Derived base SetupComplete verification failed.' }
    Set-ExactComponentAcl -Path $guestAgentRoot -Container $true
    foreach ($entry in $components.GetEnumerator()) { Set-ExactComponentAcl -Path (Join-Path $guestAgentRoot $entry.Key) -Container $false }
    Set-ExactComponentAcl -Path $setupDestination -Container $false
    foreach ($path in @($guestAgentRoot, $setupDestination) + @($components.Keys | ForEach-Object { Join-Path $guestAgentRoot $_ })) {
        Assert-NoUntrustedWrite -Path $path
    }
    Dismount-VHD -Path $temporary -ErrorAction Stop
    $mounted = $false
    $temporaryItem = Get-Item -LiteralPath $temporary
    $temporaryItem.IsReadOnly = $true
    $targetDigest = Get-Digest $temporary
    Move-Item -LiteralPath $temporary -Destination $target
    $targetPublished = $true
    if (-not (Get-Item -LiteralPath $target).IsReadOnly) { throw 'Derived target did not become read-only.' }
    New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
    $receipt = [ordered]@{
        contractVersion = 1
        operation = 'derive_immutable_field_base_offline'
        startedAt = $startedAt.ToString('O')
        completedAt = [DateTimeOffset]::UtcNow.ToString('O')
        sourceCommit = $SourceCommit
        source = [ordered]@{ imageId = $SourceImageId; path = $source; sha256 = $SourceImageSha256; readOnlyAfter = (Get-Item -LiteralPath $source).IsReadOnly }
        target = [ordered]@{ imageId = $TargetImageId; path = $target; sha256 = $targetDigest; readOnly = $true }
        networkAttached = $false
        sourceMountedWritable = $false
        perGenerationConfigurationAbsent = $true
        componentAclHardened = $true
        componentDigests = $componentDigests
        setupCompleteSha256 = $setupCompleteDigest
    }
    $receiptPath = Join-Path $EvidenceDirectory 'derived-base-receipt.json'
    [IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
    $receipt | ConvertTo-Json -Depth 10
} catch {
    if ($mounted) { Dismount-VHD -Path $temporary -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    if ($targetPublished -and (Test-Path -LiteralPath $target)) {
        (Get-Item -LiteralPath $target).IsReadOnly = $false
        Remove-Item -LiteralPath $target -Force
    }
    throw
}
