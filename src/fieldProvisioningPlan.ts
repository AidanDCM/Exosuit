import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  fieldDisplayContractSchema,
  fieldIdentitySchema,
  canonicalOriginSchema,
  sha256Canonical,
  sha256DigestSchema,
  type FieldDisplayContract,
  type FieldIdentity,
} from "./fieldContracts.js";

export const fieldNetworkModeSchema = z.enum(["disabled", "isolated", "nat_filtered"]);
export type FieldNetworkMode = z.infer<typeof fieldNetworkModeSchema>;

export const fieldProvisioningStepSchema = z.enum([
  "verify_host_capabilities",
  "verify_base_image",
  "verify_personal_state",
  "create_runtime_overlay",
  "create_task_disk",
  "create_generation_2_vm",
  "configure_compute",
  "configure_secure_boot",
  "configure_network",
  "configure_host_integrations",
  "attach_runtime_overlay",
  "attach_personal_state",
  "attach_task_disk",
  "start_vm",
  "await_guest_heartbeat",
  "verify_guest_identity",
  "verify_display_contract",
  "issue_field_attestation",
  "declare_ready",
]);
export type FieldProvisioningStep = z.infer<typeof fieldProvisioningStepSchema>;

export const fieldProvisioningPlanSchema = z
  .object({
    contractVersion: z.literal(1),
    planId: z.string().uuid(),
    createdAt: z.string().datetime(),
    identity: fieldIdentitySchema,
    display: fieldDisplayContractSchema,
    hypervisor: z.literal("hyper-v"),
    vmGeneration: z.literal(2),
    compute: z
      .object({
        virtualProcessors: z.number().int().min(2).max(32),
        startupMemoryMiB: z.number().int().min(4_096).max(131_072),
        dynamicMemory: z.boolean(),
        minimumMemoryMiB: z.number().int().min(2_048).max(131_072),
        maximumMemoryMiB: z.number().int().min(4_096).max(262_144),
      })
      .strict(),
    security: z
      .object({
        secureBoot: z.literal(true),
        tpmRequired: z.boolean(),
        nestedVirtualization: z.literal(false),
        checkpoints: z.enum(["disabled", "production"]),
      })
      .strict(),
    storage: z
      .object({
        baseImage: z
          .object({
            imageId: z.string().min(1).max(300),
            digest: sha256DigestSchema,
            readOnly: z.literal(true),
          })
          .strict(),
        runtimeOverlay: z
          .object({
            diskId: z.string().min(1).max(300),
            parentImageId: z.string().min(1).max(300),
            disposable: z.literal(true),
            differencing: z.literal(true),
            maximumBytes: z.number().int().min(8_589_934_592).max(1_099_511_627_776),
          })
          .strict(),
        personalState: z
          .object({
            diskId: z.string().min(1).max(300),
            diskGeneration: z.number().int().positive(),
            encrypted: z.literal(true),
          })
          .strict()
          .optional(),
        taskDisk: z
          .object({
            diskId: z.string().min(1).max(300),
            disposable: z.literal(true),
            maximumBytes: z.number().int().min(1_073_741_824).max(1_099_511_627_776),
          })
          .strict(),
      })
      .strict(),
    network: z
      .object({
        mode: fieldNetworkModeSchema,
        hostLanAccess: z.literal(false),
        inboundConnections: z.literal(false),
        allowedOrigins: z.array(canonicalOriginSchema).max(128),
      })
      .strict(),
    hostIntegrations: z
      .object({
        clipboard: z.literal(false),
        broadDriveMapping: z.literal(false),
        hostInputInjection: z.literal(false),
        viewerEnabled: z.boolean(),
        artifactBrokerOnly: z.literal(true),
      })
      .strict(),
    developmentAccess: z
      .object({
        mode: z.literal("auto_logon"),
        userName: z.string().regex(/^[A-Za-z][A-Za-z0-9]{2,19}$/),
        nonProduction: z.literal(true),
        windowsSetup: z
          .object({
            mode: z.literal("unattended_disposable"),
            locale: z.literal("en-US"),
            timeZone: z.literal("Eastern Standard Time"),
          })
          .strict(),
      })
      .strict()
      .optional(),
    steps: z.array(fieldProvisioningStepSchema).min(1).max(64),
    planHash: sha256DigestSchema,
  })
  .strict()
  .superRefine((plan, context) => {
    if (plan.compute.minimumMemoryMiB > plan.compute.startupMemoryMiB) {
      context.addIssue({ code: "custom", path: ["compute", "minimumMemoryMiB"], message: "Minimum memory cannot exceed startup memory." });
    }
    if (plan.compute.startupMemoryMiB > plan.compute.maximumMemoryMiB) {
      context.addIssue({ code: "custom", path: ["compute", "maximumMemoryMiB"], message: "Maximum memory cannot be below startup memory." });
    }
    if (!plan.compute.dynamicMemory && (plan.compute.minimumMemoryMiB !== plan.compute.startupMemoryMiB || plan.compute.maximumMemoryMiB !== plan.compute.startupMemoryMiB)) {
      context.addIssue({ code: "custom", path: ["compute"], message: "Fixed memory requires equal minimum, startup, and maximum values." });
    }
    if (plan.storage.baseImage.digest !== plan.identity.baseImageDigest) {
      context.addIssue({ code: "custom", path: ["storage", "baseImage", "digest"], message: "Base-image digest must match Field identity." });
    }
    if (plan.storage.runtimeOverlay.parentImageId !== plan.storage.baseImage.imageId) {
      context.addIssue({ code: "custom", path: ["storage", "runtimeOverlay", "parentImageId"], message: "Runtime overlay must be a child of the approved base image." });
    }
    if (plan.storage.runtimeOverlay.diskId === plan.storage.taskDisk.diskId) {
      context.addIssue({ code: "custom", path: ["storage", "runtimeOverlay", "diskId"], message: "Runtime overlay and task disk identities must remain separate." });
    }
    if (plan.storage.taskDisk.diskId !== plan.identity.taskDiskId) {
      context.addIssue({ code: "custom", path: ["storage", "taskDisk", "diskId"], message: "Task disk must match Field identity." });
    }
    if (plan.identity.personalStateDiskId !== undefined && plan.identity.personalStateGeneration !== undefined) {
      if (
        !plan.storage.personalState ||
        plan.storage.personalState.diskId !== plan.identity.personalStateDiskId ||
        plan.storage.personalState.diskGeneration !== plan.identity.personalStateGeneration
      ) {
        context.addIssue({ code: "custom", path: ["storage", "personalState"], message: "Personal-state disk must match Field identity." });
      }
    } else if (plan.storage.personalState) {
      context.addIssue({ code: "custom", path: ["storage", "personalState"], message: "Unidentified personal-state disks are forbidden." });
    }
    const steps = new Set(plan.steps);
    if (steps.size !== plan.steps.length) {
      context.addIssue({ code: "custom", path: ["steps"], message: "Provisioning steps must be unique." });
    }
    const required = requiredSteps(Boolean(plan.storage.personalState));
    for (const step of required) {
      if (!steps.has(step)) context.addIssue({ code: "custom", path: ["steps"], message: `Provisioning plan is missing required step ${step}.` });
    }
    if (plan.network.mode !== "nat_filtered" && plan.network.allowedOrigins.length > 0) {
      context.addIssue({ code: "custom", path: ["network", "allowedOrigins"], message: "Origin rules require filtered NAT mode." });
    }
    if (plan.developmentAccess) {
      if (plan.network.mode !== "isolated") {
        context.addIssue({ code: "custom", path: ["developmentAccess"], message: "Development auto-login requires isolated networking." });
      }
      if (plan.storage.personalState) {
        context.addIssue({ code: "custom", path: ["developmentAccess"], message: "Development auto-login cannot attach personal state." });
      }
    }
  });
export type FieldProvisioningPlan = z.infer<typeof fieldProvisioningPlanSchema>;

export function createFieldProvisioningPlan(input: {
  identity: FieldIdentity;
  display: FieldDisplayContract;
  baseImageId: string;
  runtimeOverlayDiskId?: string;
  runtimeOverlayMaximumBytes?: number;
  personalStateDiskId?: string;
  virtualProcessors?: number;
  startupMemoryMiB?: number;
  minimumMemoryMiB?: number;
  maximumMemoryMiB?: number;
  dynamicMemory?: boolean;
  taskDiskMaximumBytes?: number;
  networkMode?: FieldNetworkMode;
  allowedOrigins?: string[];
  tpmRequired?: boolean;
  viewerEnabled?: boolean;
  developmentAccess?: {
    mode: "auto_logon";
    userName: string;
    nonProduction: true;
    windowsSetup: { mode: "unattended_disposable"; locale: "en-US"; timeZone: "Eastern Standard Time" };
  };
  createdAt?: string;
  planId?: string;
}): FieldProvisioningPlan {
  const identity = fieldIdentitySchema.parse(input.identity);
  const display = fieldDisplayContractSchema.parse(input.display);
  const startupMemoryMiB = input.startupMemoryMiB ?? 8_192;
  const dynamicMemory = input.dynamicMemory ?? true;
  const unsigned = {
    contractVersion: 1 as const,
    planId: input.planId ?? randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    identity,
    display,
    hypervisor: "hyper-v" as const,
    vmGeneration: 2 as const,
    compute: {
      virtualProcessors: input.virtualProcessors ?? 4,
      startupMemoryMiB,
      dynamicMemory,
      minimumMemoryMiB: input.minimumMemoryMiB ?? (dynamicMemory ? 4_096 : startupMemoryMiB),
      maximumMemoryMiB: input.maximumMemoryMiB ?? (dynamicMemory ? 12_288 : startupMemoryMiB),
    },
    security: {
      secureBoot: true as const,
      tpmRequired: input.tpmRequired ?? true,
      nestedVirtualization: false as const,
      checkpoints: "production" as const,
    },
    storage: {
      baseImage: { imageId: input.baseImageId, digest: identity.baseImageDigest, readOnly: true as const },
      runtimeOverlay: {
        diskId: input.runtimeOverlayDiskId ?? `${identity.fieldId}-g${identity.fieldGeneration}-os-overlay`,
        parentImageId: input.baseImageId,
        disposable: true as const,
        differencing: true as const,
        maximumBytes: input.runtimeOverlayMaximumBytes ?? 128 * 1024 * 1024 * 1024,
      },
      ...(identity.personalStateDiskId !== undefined && identity.personalStateGeneration !== undefined
        ? {
            personalState: {
              diskId: input.personalStateDiskId ?? identity.personalStateDiskId,
              diskGeneration: identity.personalStateGeneration,
              encrypted: true as const,
            },
          }
        : {}),
      taskDisk: {
        diskId: identity.taskDiskId,
        disposable: true as const,
        maximumBytes: input.taskDiskMaximumBytes ?? 64 * 1024 * 1024 * 1024,
      },
    },
    network: {
      mode: input.networkMode ?? "isolated",
      hostLanAccess: false as const,
      inboundConnections: false as const,
      allowedOrigins: input.allowedOrigins ?? [],
    },
    hostIntegrations: {
      clipboard: false as const,
      broadDriveMapping: false as const,
      hostInputInjection: false as const,
      viewerEnabled: input.viewerEnabled ?? true,
      artifactBrokerOnly: true as const,
    },
    ...(input.developmentAccess ? { developmentAccess: input.developmentAccess } : {}),
    steps: requiredSteps(identity.personalStateDiskId !== undefined),
  };
  return fieldProvisioningPlanSchema.parse({ ...unsigned, planHash: sha256Canonical(unsigned) });
}

export function verifyFieldProvisioningPlan(input: FieldProvisioningPlan): FieldProvisioningPlan {
  const plan = fieldProvisioningPlanSchema.parse(input);
  const { planHash, ...unsigned } = plan;
  if (sha256Canonical(unsigned) !== planHash) throw new Error("Field provisioning plan failed integrity verification.");
  return plan;
}

function requiredSteps(personalState: boolean): FieldProvisioningStep[] {
  return [
    "verify_host_capabilities",
    "verify_base_image",
    ...(personalState ? (["verify_personal_state"] as const) : []),
    "create_runtime_overlay",
    "create_task_disk",
    "create_generation_2_vm",
    "configure_compute",
    "configure_secure_boot",
    "configure_network",
    "configure_host_integrations",
    "attach_runtime_overlay",
    ...(personalState ? (["attach_personal_state"] as const) : []),
    "attach_task_disk",
    "start_vm",
    "await_guest_heartbeat",
    "verify_guest_identity",
    "verify_display_contract",
    "issue_field_attestation",
    "declare_ready",
  ];
}
