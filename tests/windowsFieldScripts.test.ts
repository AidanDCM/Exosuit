import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { fieldBootstrapCheckNameSchema } from "../src/fieldBootstrap.js";

async function script(name: string): Promise<string> {
  return readFile(`scripts/windows/${name}`, "utf8");
}

describe("Windows Field administration scripts", () => {
  it("keeps the plan resolver non-mutating", async () => {
    const content = await script("Show-ExosuitFieldProvisioningPlan.ps1");
    expect(content).toContain("applySupportedByThisScript = $false");
    expect(content).toContain("It performs no Hyper-V mutations");
    expect(content).not.toMatch(/\bNew-VM\s+-|\bStart-VM\s+-|\bRemove-VM\s+-/);
    expect(content).not.toContain("Invoke-Expression");
  });

  it("requires exact confirmation and a disposable differencing overlay before apply", async () => {
    const content = await script("Invoke-ExosuitFieldProvisioning.ps1");
    expect(content).toContain("CREATE FIELD $fieldId GENERATION $generation");
    expect(content).toContain("runtimeOverlay.differencing");
    expect(content).toContain("New-VHD -Path $runtimeOverlayPath -ParentPath $base.path -Differencing");
    expect(content).toContain("Filtered NAT apply is held");
    expect(content).toContain("artifactBrokerOnly");
    expect(content).toContain("Guest seed directory must contain exactly the approved four files.");
    expect(content).toContain("Guest seed manifest identity does not match the provisioning plan.");
    expect(content).toContain("seed_guest_overlay");
    expect(content).toContain("Development access requires both the signed provisioning plan field and the explicit host apply switch.");
    expect(content).toContain("Development unattended setup must not contain a credential or channel secret.");
    expect(content).toContain("Initialize-ExosuitDevelopmentAccess.ps1");
    expect(content).toContain("HideOEMRegistrationScreen");
    expect(content).toContain("Development unattended setup must use supported OOBE page configuration, not skip flags.");
    const generatedUnattend = content.match(/\$unattend = @'([\s\S]*?)'@/)?.[1] ?? "";
    expect(generatedUnattend).not.toMatch(/SkipMachineOOBE|SkipUserOOBE/);
    expect(content).toContain("Enable-VMIntegrationService -VMName $vmName -Name 'Time Synchronization'");
    expect(content).toContain("*S-1-5-18:(OI)(CI)F");
    expect(content).toContain("Set-VMVideo");
    expect(content).not.toContain("Invoke-Expression");
    expect(content).not.toContain("iex ");
  });

  it("supports disposable Fields whose plan omits optional personal state", async () => {
    for (const content of [
      await script("Show-ExosuitFieldProvisioningPlan.ps1"),
      await script("Invoke-ExosuitFieldProvisioning.ps1"),
    ]) {
      expect(content).toContain("PSObject.Properties.Name -contains 'personalState'");
      expect(content).not.toContain("if ($null -ne $plan.storage.personalState)");
    }
  });

  it("rolls back only the disposable generation root and VM registration", async () => {
    const content = await script("Remove-ExosuitFieldGeneration.ps1");
    expect(content).toContain("DESTROY FIELD $fieldIdText GENERATION $FieldGeneration");
    expect(content).toContain("Refusing deletion through reparse point");
    expect(content).toContain("Remove-VM -Name $vmName");
    expect(content).toContain("Remove-Item -LiteralPath $generationRoot");
    expect(content).not.toMatch(/Remove-Item[^\n]*(baseImages|personalStateDisks|base\.path|personal\.path)/i);
  });

  it("keeps host capability checks read-only and guest bootstrap within fixed roots", async () => {
    const host = await script("Test-ExosuitFieldHost.ps1");
    const showPlan = await script("Show-ExosuitFieldProvisioningPlan.ps1");
    const apply = await script("Invoke-ExosuitFieldProvisioning.ps1");
    const destroy = await script("Remove-ExosuitFieldGeneration.ps1");
    const guest = await script("Initialize-ExosuitFieldGuest.ps1");
    expect(host).toContain("Get-WindowsOptionalFeature");
    expect(host).toContain("Win32_OptionalFeature");
    expect(host).toContain("HyperVisorPresent");
    expect(host).toContain("root\\virtualization\\v2");
    expect(host).not.toMatch(/Enable-WindowsOptionalFeature|Disable-WindowsOptionalFeature|New-VM|Remove-VM/);
    for (const content of [showPlan, apply, destroy, guest]) {
      expect(content).toContain("Parameters.ContainsKey('Depth')");
    }
    for (const content of [apply, destroy]) {
      expect(content).not.toContain("Encoding utf8NoBOM");
      expect(content).toContain("[IO.File]::WriteAllText");
    }

    for (const root of ["C:\\Exosuit\\Agent", "C:\\Field\\Inbox", "C:\\Field\\Outbox", "C:\\Field\\Quarantine"]) {
      expect(guest).toContain(root);
    }
    expect(guest).toContain("[string]$ManifestDigest");
    expect(guest).toContain("actualWindowsSessionId");
    expect(guest).toContain("Win32_VideoController");
    expect(guest).toContain("win32_video_controller");
    expect(guest).toContain("WTSGetActiveConsoleSessionId");
    expect(guest).toContain("WTSQuerySessionInformation");
    expect(guest).toContain("WTSEnumerateSessions");
    expect(guest).toContain("GetActiveInteractiveSessionId");
    expect(guest).toContain("Get-FieldWireTimestamp");
    expect(guest).toContain("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");
    expect(guest).toContain("sessionFlags");
    expect(guest).toContain("activeConsoleSessionId");
    expect(guest).toContain("C:\\Exosuit\\Config\\bootstrap-enrollment.json");
    expect(guest).toContain("Bootstrap enrollment manifest binding is invalid.");
    expect(guest).toContain("Bootstrap enrollment Field identity is invalid.");
    expect(guest).toContain("$enrollmentIdentity -cne $manifestIdentity");
    expect(guest).toContain("Bootstrap enrollment was not created inside the manifest authorization window.");
    expect(guest).toContain("Bootstrap manifest has expired without a valid durable enrollment.");
    expect(guest).toContain("Record exact digest-bound Field bootstrap enrollment");
    expect(guest).toContain("$durableEnrollmentChecks.Count -eq $durableEnrollmentCheckNames.Count");
    expect(guest).toContain("Move-Item -LiteralPath $temporaryEnrollmentPath -Destination $resolvedEnrollmentPath");
    expect(guest).not.toContain("enrolledAt = $manifestExpiresAt");
    expect(guest).toContain("deliberately omitted here");
    expect(guest).toContain("not_ready instead of failed");
    expect(guest).not.toContain("Invoke-Expression");
  });

  it("keeps offline guest inspection bounded, private-content-free, and read-only", async () => {
    const inspector = await script("Inspect-ExosuitFieldGuestOffline.ps1");
    expect(inspector).toContain("Offline inspection refuses a running VM");
    expect(inspector).toContain("Mount-DiskImage -ImagePath $Path -Access ReadOnly");
    expect(inspector).toContain("Dismount-DiskImage -ImagePath $Path");
    expect(inspector).toContain("Invoke-Bounded -Name 'Get-VM'");
    expect(inspector).toContain("Windows\\System32\\Tasks\\ExosuitFieldGuest");
    expect(inspector).toContain("Get-FileHash");
    expect(inspector).toContain("$diagnosticsRoot = Join-Path $root 'Exosuit\\Diagnostics'");
    expect(inspector).toContain("failedChecks = @($checkResults");
    expect(inspector).toContain("manifestDigest = [string]$bootstrapReport.manifestDigest");
    expect(inspector).toContain("Microsoft-Windows-TaskScheduler%4Operational.evtx");
    expect(inspector).toContain("-FilterXPath \"*[EventData[Data='\\ExosuitFieldGuest']]\"");
    expect(inspector).toContain("$result.task.enabled");
    expect(inspector).toContain("$result.task.startWhenAvailable");
    expect(inspector).toContain("$result.task.multipleInstancesPolicy");
    expect(inspector).toContain("$result.setupComplete.classification");
    expect(inspector).toContain("'confirm_switch_binding'");
    expect(inspector).toContain("'task_registration_access_denied'");
    expect(inspector).toContain("'unclassified_nonempty'");
    expect(inspector).not.toContain("$result.setupComplete.content");
    expect(inspector).not.toContain("$result.setupComplete.message");
    expect(inspector).not.toContain("$_.Message");
    expect(inspector).not.toContain("$_.Properties");
    expect(inspector).not.toContain("summary = [string]$_.summary");
    expect(inspector).not.toContain("evidence = $_.evidence");
    expect(inspector).not.toMatch(/\bStart-VM\b|\bStop-VM\b|\bRemove-VM\b|\bMount-VHD\b/);
    expect(inspector).not.toContain("Get-Content -LiteralPath $log");
    expect(inspector).not.toContain("Invoke-Expression");
  });

  it("repairs only an off disposable guest through exact reviewed hashes and owner confirmation", async () => {
    const repair = await script("Repair-ExosuitFieldGuestEnrollment.ps1");
    expect(repair).toContain("REPAIR FIELD $fieldIdText GENERATION $FieldGeneration BOOTSTRAP ENROLLMENT");
    expect(repair).toContain("Exact local typed confirmation is required for guest enrollment repair.");
    expect(repair).toContain("Guest enrollment repair refuses a running VM");
    expect(repair).toContain("$vmState = [string]$vmState");
    expect(repair).toContain("ExpectedPreviousManifestSha256");
    expect(repair).toContain("ExpectedAgentSha256");
    expect(repair).toContain("ExpectedInitializeScriptSha256");
    expect(repair).toContain("Repair refuses a guest that already has a bootstrap enrollment record.");
    expect(repair).toContain("Repair is limited to an expired first-use manifest.");
    expect(repair).toContain("Mount-DiskImage -ImagePath $Path -Access ReadWrite");
    expect(repair).toContain("Dismount-DiskImage -ImagePath $Path");
    expect(repair).toContain("$completedSwaps.Count - 1");
    expect(repair).toContain("Repair refuses a reparse point");
    expect(repair).not.toMatch(/\bStart-VM\b|\bStop-VM\b|\bRemove-VM\b/);
    expect(repair).not.toContain("Get-Content -LiteralPath (Join-Path $resolvedSeedDirectory 'channel-secret.txt')");
    expect(repair).not.toContain("Invoke-Expression");
  });

  it("keeps live guest readiness on authenticated Hyper-V KVP without a network listener", async () => {
    const start = await script("Start-ExosuitFieldGuest.ps1");
    const install = await script("Install-ExosuitFieldGuest.ps1");
    const initializeGuest = await script("Initialize-ExosuitFieldGuest.ps1");
    const readKvp = await script("Read-ExosuitFieldGuestKvp.ps1");
    const setupComplete = await script("SetupComplete-ExosuitFieldGuest.cmd");
    const developmentAccess = await script("Initialize-ExosuitDevelopmentAccess.ps1");
    const sealBase = await script("Seal-ExosuitFieldBase.ps1");
    const sealBaseLauncher = await script("Seal-ExosuitFieldBase.cmd");
    const removeBaseAccount = await script("Remove-ExosuitFieldBaseAccount.ps1");
    const systemBaseMaintenance = await script("Invoke-ExosuitFieldBaseMaintenance.ps1");
    const baseMaintenanceBootstrap = await script("Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1");
    expect(start).toContain("--field-guest-kvp");
    expect(start).toContain("C:\\Exosuit");
    expect(start).toContain("if (-not $?)");
    expect(start).toContain("guest-runtime-error.log");
    expect(start).not.toContain("Guest bootstrap failed with exit code");
    expect(install).toContain("$serviceName = 'ExosuitFieldGuest'");
    expect(install).toContain("--field-guest-service");
    expect(install).toContain("Field guest service installation requires the exact compiled launcher paths.");
    expect(install).toContain("'start=', 'auto', 'obj=', 'LocalSystem'");
    expect(install).toContain("'restart/5000/restart/30000/restart/60000'");
    expect(install).toContain('$allowedRegisteredBinaryPaths -cnotcontains [string]$registered.PathName');
    expect(install).toContain('$binaryPath,');
    expect(install).toContain('"$resolvedAgentPath --field-guest-service"');
    expect(install).toContain("Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false");
    expect(install).toContain("Legacy Field guest scheduled task removal did not complete.");
    expect(install).toContain("[switch]$Start");
    expect(install).toContain("Start-Service -Name $serviceName");
    expect(install).not.toContain("New-ScheduledTaskTrigger");
    expect(start).toContain("DesktopReadyTimeoutSeconds");
    expect(start).toContain("session_unlocked");
    expect(start).toContain("Interactive desktop did not become ready");
    expect(start).toContain("Initialize-ExosuitDevelopmentAccess.ps1");
    expect(start).toContain("maintenance-authorization.json");
    expect(start).toContain("Invoke-ExosuitFieldBaseMaintenance.ps1");
    expect(developmentAccess).toContain("[Exosuit.LsaPrivateData]::Store('DefaultPassword', $password)");
    expect(developmentAccess).toContain("Development access refuses to modify an existing local account.");
    expect(developmentAccess).toContain("administrator = $false");
    expect(developmentAccess).toContain("[switch]$NoRestart");
    expect(developmentAccess).toContain("if (-not $NoRestart)");
    expect(developmentAccess).not.toMatch(/Add-LocalGroupMember[^\r\n]*Administrators/i);
    expect(readKvp).toContain("Msvm_KvpExchangeComponent");
    expect(readKvp).toContain("--field-verify-envelope");
    expect(readKvp).toContain("Resolve-KvpEnvelope");
    expect(readKvp).toContain("Chunked KVP envelope digest is invalid");
    expect(readKvp).toContain("for ($attempt = 1; $attempt -le 20; $attempt++)");
    expect(readKvp).toContain("$snapshot = Get-FieldKvpItems");
    expect(initializeGuest).toContain("Marshal.ReadInt32(buffer, 16)");
    expect(setupComplete).toContain('if not exist "C:\\Exosuit\\Logs" mkdir "C:\\Exosuit\\Logs"');
    expect(setupComplete).toContain("-Command");
    expect(setupComplete).toContain("-Confirm:$false");
    expect(setupComplete).toContain("-Start -Confirm:$false");
    expect(setupComplete).toContain("Initialize-ExosuitDevelopmentAccess.ps1");
    // New-LocalUser caps Description at 48 characters. A 61 character value
    // failed validation in the guest, so ExosuitDev was never created and the
    // agent never published its handshake. Assert both the guard and the
    // literal, since the failure is silent from the host's point of view.
    expect(developmentAccess).toContain("New-LocalUser allows 48.");
    const developmentDescription = developmentAccess.match(/\$accountDescription = '([^']+)'/)?.[1];
    expect(developmentDescription).toBeDefined();
    expect((developmentDescription ?? "").length).toBeLessThanOrEqual(48);
    expect(setupComplete).toContain("-NoRestart");
    expect(setupComplete).toContain("if errorlevel 1 exit /b 1");
    expect(setupComplete).toContain('del /f /q "C:\\Windows\\Panther\\Unattend.xml"');
    expect(sealBase).toContain("SEAL EXOSUIT FIELD BASE");
    expect(sealBase).toContain("Base sealing must run as the built-in Windows Audit Mode administrator.");
    expect(sealBase).toContain("Base sealing refuses an image containing per-generation configuration or secrets.");
    expect(sealBase).toContain("Base sealing refuses an image containing a non-built-in local account.");
    expect(sealBase).toContain("Get-CimInstance Win32_Service -Filter \"Name='$serviceName'\"");
    expect(sealBase).toContain("StartName -cne 'LocalSystem'");
    expect(sealBase).toContain("StartMode -cne 'Auto'");
    expect(sealBase).toContain('$allowedRegisteredBinaryPaths -cnotcontains [string]$service.PathName');
    expect(sealBase).toContain("--field-guest-service");
    expect(sealBase).toContain("Legacy Field guest scheduled task remains after service installation.");
    expect(sealBase).toContain("'/generalize', '/oobe', '/shutdown', '/quiet'");
    expect(sealBaseLauncher).toContain('-Apply -TypedConfirmation "SEAL EXOSUIT FIELD BASE"');
    expect(sealBaseLauncher).not.toMatch(/password|secret|token/i);
    expect(removeBaseAccount).toContain("REMOVE FIELD BASE ACCOUNT $AccountName");
    expect(removeBaseAccount).toContain("Field base account cleanup requires the elevated built-in Windows Audit Mode administrator.");
    expect(removeBaseAccount).toContain("Field base account cleanup refuses built-in or current accounts.");
    expect(removeBaseAccount).toContain("Field base account cleanup refuses a loaded or special profile.");
    expect(removeBaseAccount).toContain("Remove-LocalUser -Name $AccountName");
    expect(systemBaseMaintenance).toContain("clean_and_seal_field_base");
    expect(systemBaseMaintenance).toContain("Field base maintenance must run as local SYSTEM.");
    expect(systemBaseMaintenance).toContain("Field base maintenance requires a network-detached staging VM.");
    expect(systemBaseMaintenance).toContain("maintenanceScriptSha256");
    expect(systemBaseMaintenance).toContain("Field base maintenance script digest does not match its authorization.");
    expect(systemBaseMaintenance).toContain("bootstrapUnattendSha256");
    expect(systemBaseMaintenance).toContain("Field base maintenance bootstrap answer file does not match its authorization.");
    // Windows Setup reserialises the answer file in place, dropping comments and
    // rewriting the XML declaration, so a byte digest of the live file can never
    // match what was injected. The documents are compared as canonical XML, with
    // only comments and setup's own wasPassProcessed bookkeeping removed - the
    // passes, components and exact command paths all remain covered.
    expect(systemBaseMaintenance).toContain("Get-CanonicalUnattendDigest");
    expect(systemBaseMaintenance).toContain("$document.SelectNodes('//*[@wasPassProcessed]')");
    expect(systemBaseMaintenance).toContain("$document.DocumentElement.OuterXml");
    expect(systemBaseMaintenance).toContain("Invoke-ExosuitFieldBaseMaintenanceBootstrap.ps1");
    expect(systemBaseMaintenance).toContain("Remove-Item -LiteralPath $bootstrapUnattendPath -Force");
    expect(systemBaseMaintenance).toContain("bootstrapUnattendConsumed = $true");
    expect(systemBaseMaintenance).toContain("Unregister-ScheduledTask -TaskName $maintenanceDispatchName -Confirm:$false");
    expect(systemBaseMaintenance).toContain("Field base maintenance did not consume its one-use task.");
    expect(systemBaseMaintenance).toContain("Field base maintenance one-use service does not match the reviewed SYSTEM contract.");
    // The bootstrap registers the service and the maintenance script consumes
    // it, so both must name the same dispatch shim. Divergence here has voided
    // two build attempts: once when registration rejected itself, and once when
    // consumption rejected a correctly registered service one stage short of the
    // receipt. Assert they agree rather than asserting each in isolation.
    const dispatchShim = "Dispatch-ExosuitFieldBaseMaintenance.cmd";
    const bootstrapServiceCheck = baseMaintenanceBootstrap.match(/\$registered\.PathName -notlike '\*([^*]+)\*'/);
    const maintenanceServiceCheck = systemBaseMaintenance.match(/\$maintenanceService\.PathName -notlike '\*([^*]+)\*'/);
    expect(bootstrapServiceCheck?.[1]).toBe(dispatchShim);
    expect(maintenanceServiceCheck?.[1]).toBe(dispatchShim);
    expect(baseMaintenanceBootstrap).toContain(`/c C:\\Exosuit\\Agent\\${dispatchShim}`);
    expect(systemBaseMaintenance).toContain("sc.exe delete $maintenanceDispatchName");
    expect(systemBaseMaintenance).toContain("Field base maintenance did not consume its one-use service.");
    expect(systemBaseMaintenance).toContain("maintenanceTaskConsumed = $true");
    expect(systemBaseMaintenance).toContain("runtime_service_installed");
    expect(systemBaseMaintenance).toContain("Field base maintenance runtime service does not match the reviewed LocalSystem contract.");
    expect(systemBaseMaintenance).toContain('$allowedRuntimeBinaryPaths -cnotcontains [string]$runtimeService.PathName');
    expect(systemBaseMaintenance).toContain('"$runtimeAgentPath --field-guest-service"');
    expect(systemBaseMaintenance).toContain("Field base maintenance refuses to reuse an authorization after a receipt exists.");
    expect(systemBaseMaintenance).toContain("Remove-Item -LiteralPath $AuthorizationPath -Force");
    expect(baseMaintenanceBootstrap).toContain("'/generalize', '/oobe', '/shutdown', '/quiet'");
    expect(baseMaintenanceBootstrap).toContain("built-in Audit Mode administrator");
    expect(baseMaintenanceBootstrap).toContain("ExosuitFieldBaseMaintenance");
    // Audit Mode leaves scheduled tasks Queued for the whole session, so dispatch
    // goes through a one-use LocalSystem service running the reviewed shim.
    expect(baseMaintenanceBootstrap).toContain("sc.exe create $dispatchName binPath= $binPath type= own start= demand obj= LocalSystem");
    expect(baseMaintenanceBootstrap).toContain("C:\\Windows\\System32\\cmd.exe /c C:\\Exosuit\\Agent\\Dispatch-ExosuitFieldBaseMaintenance.cmd");
    expect(baseMaintenanceBootstrap).toContain("[string]$registered.StartName -cne 'LocalSystem'");
    // Must name the dispatch shim the image path actually uses. Asserting the
    // old command string here made the bootstrap reject its own registration
    // and throw before the dispatch, voiding a whole build attempt.
    expect(baseMaintenanceBootstrap).toContain("[string]$registered.PathName -notlike '*Dispatch-ExosuitFieldBaseMaintenance.cmd*'");
    expect(baseMaintenanceBootstrap).toContain("sc.exe start $dispatchName");
    expect(baseMaintenanceBootstrap).not.toContain("Set-ScheduledTask");
    expect(baseMaintenanceBootstrap).not.toContain("schtasks.exe");
    // A single authorization must never back two concurrent maintenance runs.
    expect(baseMaintenanceBootstrap).toContain("stood_down_receipt_present");
    expect(baseMaintenanceBootstrap).toContain("stood_down_maintenance_in_progress");
    expect(baseMaintenanceBootstrap).toContain("Write-BootstrapStatus -Route 'dispatch_failed' -ErrorText $_.Exception.Message");
    // Clock alignment. Correcting the timezone alone cannot repair UTC: Windows
    // holds UTC fixed and shifts local time, and a reboot then writes that
    // shifted local time back to the RTC, preserving the error exactly. So the
    // host-derived local wall time is captured BEFORE the bias changes and
    // restored after it, which is the only ordering that yields a correct UTC.
    expect(baseMaintenanceBootstrap).toContain("tzutil.exe /s $hostTimeZoneId");
    expect(baseMaintenanceBootstrap).toContain("host-timezone.txt");
    const localCaptureIndex = baseMaintenanceBootstrap.indexOf("$localBeforeAlignment = [DateTime]::Now");
    const tzutilIndex = baseMaintenanceBootstrap.indexOf("tzutil.exe /s");
    const setDateIndex = baseMaintenanceBootstrap.indexOf("Set-Date -Date $localBeforeAlignment");
    expect(localCaptureIndex).toBeGreaterThan(-1);
    expect(tzutilIndex).toBeGreaterThan(localCaptureIndex);
    expect(setDateIndex).toBeGreaterThan(tzutilIndex);
    // The host is the only time authority. Writing the clock is permitted, but
    // the value must never come from the authorization whose expiry is about to
    // be checked - deriving it from expiresAt would silently void expiry as
    // replay protection. This guard, not a ban on clock writes, is the invariant.
    expect(baseMaintenanceBootstrap).not.toContain("expiresAt");
    expect(baseMaintenanceBootstrap).not.toContain("maintenance-authorization.json' -Raw");
    expect(baseMaintenanceBootstrap).toContain("servicePathName=$($service.PathName)");
    expect(baseMaintenanceBootstrap).toContain("serviceStartExitCode");
    expect(baseMaintenanceBootstrap).not.toContain("did not produce a receipt within");
    // The guest agent carries its own copy of the mandatory check list so it can
    // decide when a bootstrap report is complete. If the two drift, the agent
    // either withholds a completing report forever or claims completeness it
    // cannot justify, and neither is visible from the host until a live run.
    const agentRuntime = await readFile("apps/windows-agent/FieldKvpRuntime.cs", "utf8");
    const agentCheckBlock = agentRuntime.match(/MandatoryBootstrapChecks\s*=\s*\{([\s\S]*?)\};/);
    expect(agentCheckBlock?.[1]).toBeDefined();
    const agentChecks = [...(agentCheckBlock?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
    expect(agentChecks).toEqual([...fieldBootstrapCheckNameSchema.options]);
    expect(systemBaseMaintenance).toContain("Set-MaintenanceStage 'system_identity_verified'");
    expect(systemBaseMaintenance).toContain("Set-MaintenanceStage 'system_maintenance_complete_sysprep_pending'");
    expect(systemBaseMaintenance).toContain("sysprep = 'pending_audit_administrator'");
    expect(systemBaseMaintenance).not.toContain("Start-Process -FilePath $sysprepPath");
    expect(baseMaintenanceBootstrap).toContain("Field base Sysprep requires the built-in Audit Mode administrator.");
    expect(baseMaintenanceBootstrap).toContain("systemMaintenanceReceiptSha256");
    expect(baseMaintenanceBootstrap).toContain("$expectedMaintenanceSha256");
    expect(baseMaintenanceBootstrap).toContain("$receipt.runtimeService.principal -cne 'SYSTEM'");
    expect(baseMaintenanceBootstrap).toContain("$receipt.perGenerationConfigurationAbsent -ne $true");
    expect(baseMaintenanceBootstrap).toContain("principal = 'built_in_audit_administrator'");
    expect(baseMaintenanceBootstrap).toContain("Start-Process -FilePath $sysprepPath");
    expect(baseMaintenanceBootstrap).toContain("'/generalize', '/oobe', '/shutdown', '/quiet'");
    for (const content of [start, install, readKvp]) {
      expect(content).not.toMatch(/https?:\/\/|TcpListener|WebSocket|Invoke-WebRequest|Invoke-RestMethod/i);
      expect(content).not.toContain("Invoke-Expression");
    }
  });
});
