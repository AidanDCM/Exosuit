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
    expect(start).toContain("--field-guest-kvp");
    expect(start).toContain("C:\\Exosuit");
    expect(start).toContain("$bootstrapSucceeded = $?");
    expect(start).toContain("guest-runtime-error.log");
    expect(start).not.toContain("Guest bootstrap failed with exit code");
    expect(install).toContain("New-ScheduledTaskTrigger -AtStartup");
    expect(install).toContain("New-ScheduledTaskTrigger -AtLogOn");
    expect(install).toContain("New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest");
    expect(install).toContain("-MultipleInstances IgnoreNew");
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
    for (const content of [start, install, readKvp]) {
      expect(content).not.toMatch(/https?:\/\/|TcpListener|WebSocket|Invoke-WebRequest|Invoke-RestMethod/i);
      expect(content).not.toContain("Invoke-Expression");
    }
  });
});
