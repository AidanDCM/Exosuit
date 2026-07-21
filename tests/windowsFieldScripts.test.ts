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
    expect(content).not.toContain("Invoke-Expression");
    expect(content).not.toContain("iex ");
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
    expect(host).toContain("Get-WindowsOptionalFeature");
    expect(host).not.toMatch(/Enable-WindowsOptionalFeature|Disable-WindowsOptionalFeature|New-VM|Remove-VM/);

    const guest = await script("Initialize-ExosuitFieldGuest.ps1");
    for (const root of ["C:\\Exosuit\\Agent", "C:\\Field\\Inbox", "C:\\Field\\Outbox", "C:\\Field\\Quarantine"]) {
      expect(guest).toContain(root);
    }
    expect(guest).toContain("heartbeat is not declared started");
    expect(guest).not.toContain("Invoke-Expression");
  });
});
