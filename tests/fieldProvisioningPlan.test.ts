import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fieldDisplayContractSchema, fieldIdentitySchema } from "../src/fieldContracts.js";
import {
  createFieldProvisioningPlan,
  fieldProvisioningPlanSchema,
  verifyFieldProvisioningPlan,
} from "../src/fieldProvisioningPlan.js";

function identity(withPersonalState = true) {
  return fieldIdentitySchema.parse({
    subsystem: "field",
    fieldId: randomUUID(),
    fieldGeneration: 1,
    agentId: "field-agent-a",
    machineId: "vm-a",
    windowsSessionId: "session-a",
    baseImageDigest: "a".repeat(64),
    ...(withPersonalState ? { personalStateDigest: "b".repeat(64) } : {}),
    taskDiskId: "task-disk-a",
    createdAt: "2026-07-21T18:00:00.000Z",
  });
}

const display = fieldDisplayContractSchema.parse({
  monitorCount: 1,
  width: 1920,
  height: 1080,
  scalePercent: 100,
  browserZoomPercent: 100,
  keyboardLayout: "en-US",
  dynamicResolutionAllowed: false,
});

describe("Field provisioning plan", () => {
  it("creates an integrity checked Generation 2 Hyper-V plan with immutable base and disposable OS overlay", () => {
    const plan = createFieldProvisioningPlan({
      identity: identity(),
      display,
      baseImageId: "exosuit-field-base-v1",
      personalStateDiskId: "aidan-personal-state-v1",
      createdAt: "2026-07-21T18:00:00.000Z",
      planId: randomUUID(),
    });
    expect(verifyFieldProvisioningPlan(plan)).toEqual(plan);
    expect(plan).toMatchObject({
      hypervisor: "hyper-v",
      vmGeneration: 2,
      storage: {
        baseImage: { imageId: "exosuit-field-base-v1", readOnly: true },
        runtimeOverlay: { parentImageId: "exosuit-field-base-v1", disposable: true, differencing: true },
      },
      security: { secureBoot: true, nestedVirtualization: false, checkpoints: "production" },
      network: { mode: "isolated", hostLanAccess: false, inboundConnections: false },
      hostIntegrations: {
        clipboard: false,
        broadDriveMapping: false,
        hostInputInjection: false,
        artifactBrokerOnly: true,
      },
    });
    expect(plan.steps).toContain("verify_personal_state");
    expect(plan.steps).toContain("create_runtime_overlay");
    expect(plan.steps).toContain("attach_runtime_overlay");
    expect((plan.steps as string[])).not.toContain("attach_base_image");
    expect(plan.steps).toContain("attach_personal_state");
    expect(new Set(plan.steps).size).toBe(plan.steps.length);
  });

  it("supports a disposable field without personal state and filtered NAT with explicit origins", () => {
    const plan = createFieldProvisioningPlan({
      identity: identity(false),
      display,
      baseImageId: "base-v1",
      networkMode: "nat_filtered",
      allowedOrigins: ["https://example.com"],
    });
    expect(plan.storage.personalState).toBeUndefined();
    expect(plan.steps).not.toContain("verify_personal_state");
    expect(plan.network.allowedOrigins).toEqual(["https://example.com"]);
    expect(plan.storage.runtimeOverlay.parentImageId).toBe("base-v1");
  });

  it("detects plan tampering and rejects arbitrary commands or unsafe host integrations", () => {
    const plan = createFieldProvisioningPlan({ identity: identity(), display, baseImageId: "base-v1" });
    expect(() => verifyFieldProvisioningPlan({ ...plan, compute: { ...plan.compute, virtualProcessors: 8 } })).toThrow(
      /integrity/,
    );
    expect(() => fieldProvisioningPlanSchema.parse({ ...plan, command: "powershell.exe arbitrary" })).toThrow();
    expect(() =>
      fieldProvisioningPlanSchema.parse({
        ...plan,
        hostIntegrations: { ...plan.hostIntegrations, clipboard: true },
      }),
    ).toThrow();
  });

  it("rejects mismatched disks overlays invalid memory and origin rules without filtered NAT", () => {
    const plan = createFieldProvisioningPlan({ identity: identity(), display, baseImageId: "base-v1" });
    expect(() =>
      fieldProvisioningPlanSchema.parse({
        ...plan,
        storage: { ...plan.storage, taskDisk: { ...plan.storage.taskDisk, diskId: "another-task" } },
      }),
    ).toThrow(/Task disk/);
    expect(() =>
      fieldProvisioningPlanSchema.parse({
        ...plan,
        storage: { ...plan.storage, runtimeOverlay: { ...plan.storage.runtimeOverlay, parentImageId: "other-base" } },
      }),
    ).toThrow(/child of the approved base image/);
    expect(() =>
      fieldProvisioningPlanSchema.parse({
        ...plan,
        storage: { ...plan.storage, runtimeOverlay: { ...plan.storage.runtimeOverlay, diskId: plan.storage.taskDisk.diskId } },
      }),
    ).toThrow(/must remain separate/);
    expect(() =>
      fieldProvisioningPlanSchema.parse({
        ...plan,
        compute: { ...plan.compute, minimumMemoryMiB: 16_384, startupMemoryMiB: 8_192, maximumMemoryMiB: 12_288 },
      }),
    ).toThrow(/Minimum memory/);
    expect(() =>
      createFieldProvisioningPlan({
        identity: identity(),
        display,
        baseImageId: "base-v1",
        networkMode: "isolated",
        allowedOrigins: ["https://example.com"],
      }),
    ).toThrow(/filtered NAT/);
  });
});
