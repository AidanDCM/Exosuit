import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

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
    expect(content).toContain("SkipMachineOOBE");
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
    expect(guest).toContain("deliberately omitted here");
    expect(guest).toContain("not_ready instead of failed");
    expect(guest).not.toContain("Invoke-Expression");
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
    expect(start).toContain("--field-guest-kvp");
    expect(start).toContain("C:\\Exosuit");
    expect(start).toContain("if (-not $?)");
    expect(start).toContain("guest-runtime-error.log");
    expect(start).not.toContain("Guest bootstrap failed with exit code");
    expect(install).toContain("New-ScheduledTaskTrigger -AtStartup");
    expect(install).toContain("New-ScheduledTaskTrigger -AtLogOn");
    expect(install).toContain("New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest");
    expect(install).toContain("-MultipleInstances IgnoreNew");
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
    expect(setupComplete).toContain("Initialize-ExosuitDevelopmentAccess.ps1");
    expect(setupComplete).toContain("-NoRestart");
    expect(setupComplete).toContain("if errorlevel 1 exit /b 1");
    expect(setupComplete).toContain('del /f /q "C:\\Windows\\Panther\\Unattend.xml"');
    expect(sealBase).toContain("SEAL EXOSUIT FIELD BASE");
    expect(sealBase).toContain("Base sealing must run as the built-in Windows Audit Mode administrator.");
    expect(sealBase).toContain("Base sealing refuses an image containing per-generation configuration or secrets.");
    expect(sealBase).toContain("Base sealing refuses an image containing a non-built-in local account.");
    expect(sealBase).toContain("Get-ScheduledTask -TaskName $taskName");
    expect(sealBase).toContain("MSFT_TaskBootTrigger");
    expect(sealBase).toContain("MSFT_TaskLogonTrigger");
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
    expect(systemBaseMaintenance).toContain("Field base maintenance refuses to reuse an authorization after a receipt exists.");
    expect(systemBaseMaintenance).toContain("Remove-Item -LiteralPath $AuthorizationPath -Force");
    expect(systemBaseMaintenance).toContain("'/generalize', '/oobe', '/shutdown', '/quiet'");
    for (const content of [start, install, readKvp]) {
      expect(content).not.toMatch(/https?:\/\/|TcpListener|WebSocket|Invoke-WebRequest|Invoke-RestMethod/i);
      expect(content).not.toContain("Invoke-Expression");
    }
  });
});
