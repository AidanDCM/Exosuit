import { createHash, verify as verifySignature } from "node:crypto";
import { z } from "zod";
import { sha256Canonical } from "./fieldContracts.js";

const semverSchema = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const relativePathSchema = z.string().min(1).max(500).superRefine((value, context) => {
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    context.addIssue({ code: "custom", message: "Release component paths must be relative." });
  }
  if (normalized.split("/").some((segment) => segment === ".." || segment === "")) {
    context.addIssue({ code: "custom", message: "Release component paths must be normalized and confined." });
  }
});

export const releaseComponentSchema = z.object({
  componentId: z.string().min(1).max(100),
  kind: z.enum(["gateway", "windows_agent", "cockpit", "field_image", "runtime", "documentation", "configuration"]),
  relativePath: relativePathSchema,
  sha256: sha256Schema,
  sizeBytes: z.number().int().nonnegative().max(100 * 1024 * 1024 * 1024),
  required: z.boolean(),
  executable: z.boolean(),
  signedArtifact: z.boolean(),
}).strict();
export type ReleaseComponent = z.infer<typeof releaseComponentSchema>;

export const unsignedReleaseManifestSchema = z.object({
  contractVersion: z.literal(1),
  product: z.literal("exosuit"),
  releaseId: z.string().uuid(),
  version: semverSchema,
  channel: z.enum(["development", "preview", "stable"]),
  createdAt: z.string().datetime(),
  sourceCommit: sha256Schema,
  supportedArchitecture: z.literal("x64"),
  minimumWindowsBuild: z.number().int().min(22_000),
  minimumNodeMajor: z.number().int().min(22),
  minimumDotnetMajor: z.number().int().min(8),
  components: z.array(releaseComponentSchema).min(1).max(1_000),
  npmSbomSha256: sha256Schema,
  dotnetSbomSha256: sha256Schema.optional(),
  provenanceSha256: sha256Schema.optional(),
  rollbackCompatibleFrom: z.array(semverSchema).max(100),
  requiredServices: z.array(z.enum(["gateway", "windows_agent", "cockpit", "field_manager"])).min(1),
  signingKeyId: z.string().min(1).max(200),
}).strict().superRefine((manifest, context) => {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const [index, component] of manifest.components.entries()) {
    if (ids.has(component.componentId)) {
      context.addIssue({ code: "custom", path: ["components", index, "componentId"], message: "Release component IDs must be unique." });
    }
    if (paths.has(component.relativePath.toLowerCase())) {
      context.addIssue({ code: "custom", path: ["components", index, "relativePath"], message: "Release component paths must be unique." });
    }
    ids.add(component.componentId);
    paths.add(component.relativePath.toLowerCase());
    if (manifest.channel === "stable" && component.executable && !component.signedArtifact) {
      context.addIssue({ code: "custom", path: ["components", index, "signedArtifact"], message: "Stable executable components must be signed." });
    }
  }
  const requiredKinds = new Set(manifest.components.filter((item) => item.required).map((item) => item.kind));
  for (const required of ["gateway", "windows_agent", "cockpit"] as const) {
    if (!requiredKinds.has(required)) {
      context.addIssue({ code: "custom", path: ["components"], message: `A required ${required} component is missing.` });
    }
  }
});
export type UnsignedReleaseManifest = z.infer<typeof unsignedReleaseManifestSchema>;

export const signedReleaseManifestSchema = unsignedReleaseManifestSchema.extend({
  manifestHash: sha256Schema,
  signatureAlgorithm: z.literal("ed25519"),
  signature: z.string().min(1).max(1_000),
}).strict();
export type SignedReleaseManifest = z.infer<typeof signedReleaseManifestSchema>;

export const releaseVerificationResultSchema = z.object({
  manifestValid: z.boolean(),
  signatureValid: z.boolean(),
  trustedKey: z.boolean(),
  componentSetValid: z.boolean(),
  releaseEligible: z.boolean(),
  reasons: z.array(z.string().min(1).max(200)),
  executionAllowed: z.literal(false),
}).strict();
export type ReleaseVerificationResult = z.infer<typeof releaseVerificationResultSchema>;

export function createManifestHash(raw: UnsignedReleaseManifest): string {
  return sha256Canonical(unsignedReleaseManifestSchema.parse(structuredClone(raw)));
}

export function verifyReleaseManifest(input: {
  manifest: SignedReleaseManifest;
  trustedPublicKeys: Record<string, string | Buffer>;
}): ReleaseVerificationResult {
  let manifest: SignedReleaseManifest;
  try {
    manifest = signedReleaseManifestSchema.parse(structuredClone(input.manifest));
  } catch {
    return result(false, false, false, false, ["manifest_schema_invalid"]);
  }

  const { manifestHash, signatureAlgorithm: _signatureAlgorithm, signature, ...unsigned } = manifest;
  const expectedHash = createManifestHash(unsigned);
  const manifestValid = expectedHash === manifestHash;
  const trustedKeyValue = input.trustedPublicKeys[manifest.signingKeyId];
  const trustedKey = trustedKeyValue !== undefined;
  let signatureValid = false;
  if (manifestValid && trustedKeyValue) {
    try {
      signatureValid = verifySignature(
        null,
        Buffer.from(manifestHash, "hex"),
        trustedKeyValue,
        Buffer.from(signature, "base64url"),
      );
    } catch {
      signatureValid = false;
    }
  }
  const componentSetValid = manifest.components.every((component) => component.sha256.length === 64 && component.sizeBytes >= 0);
  const reasons: string[] = [];
  if (!manifestValid) reasons.push("manifest_hash_invalid");
  if (!trustedKey) reasons.push("signing_key_untrusted");
  if (!signatureValid) reasons.push("manifest_signature_invalid");
  if (!componentSetValid) reasons.push("component_set_invalid");
  return result(manifestValid, signatureValid, trustedKey, componentSetValid, reasons);
}

function result(
  manifestValid: boolean,
  signatureValid: boolean,
  trustedKey: boolean,
  componentSetValid: boolean,
  reasons: string[],
): ReleaseVerificationResult {
  return releaseVerificationResultSchema.parse({
    manifestValid,
    signatureValid,
    trustedKey,
    componentSetValid,
    releaseEligible: manifestValid && signatureValid && trustedKey && componentSetValid,
    reasons,
    executionAllowed: false,
  });
}

export const installedComponentSchema = z.object({
  componentId: z.string().min(1).max(100),
  relativePath: relativePathSchema,
  sha256: sha256Schema,
  sizeBytes: z.number().int().nonnegative(),
}).strict();

export const installedProductStateSchema = z.object({
  contractVersion: z.literal(1),
  installedVersion: semverSchema.optional(),
  installedReleaseId: z.string().uuid().optional(),
  components: z.array(installedComponentSchema).max(1_000),
  serviceStates: z.record(z.string(), z.enum(["missing", "stopped", "running", "degraded", "unknown"])),
  personalDataPresent: z.boolean(),
  fieldPresent: z.boolean(),
  lastKnownGoodVersion: semverSchema.optional(),
}).strict();
export type InstalledProductState = z.infer<typeof installedProductStateSchema>;

export const lifecycleOperationSchema = z.enum(["install", "update", "repair", "rollback", "uninstall"]);
export type LifecycleOperation = z.infer<typeof lifecycleOperationSchema>;

export const lifecyclePlanStepSchema = z.object({
  sequence: z.number().int().positive(),
  stepId: z.string().min(1).max(100),
  operation: z.enum(["verify", "backup", "stop_service", "stage", "replace", "migrate", "start_service", "health_check", "remove", "preserve", "delete_owner_data"]),
  componentId: z.string().min(1).max(100).optional(),
  reversible: z.boolean(),
  ownerConfirmationRequired: z.boolean(),
  expectedEvidence: z.string().min(1).max(500),
}).strict();

export const lifecyclePlanSchema = z.object({
  contractVersion: z.literal(1),
  planId: z.string().uuid(),
  operation: lifecycleOperationSchema,
  currentVersion: semverSchema.optional(),
  targetVersion: semverSchema.optional(),
  targetReleaseId: z.string().uuid().optional(),
  preservePersonalData: z.boolean(),
  requiresAdministrator: z.literal(true),
  requiresOwnerConfirmation: z.boolean(),
  requiresFreshReleaseVerification: z.literal(true),
  steps: z.array(lifecyclePlanStepSchema).min(1).max(5_000),
  executionAllowed: z.literal(false),
  planHash: sha256Schema,
}).strict();
export type LifecyclePlan = z.infer<typeof lifecyclePlanSchema>;

export function createLifecyclePlan(input: {
  planId: string;
  operation: LifecycleOperation;
  installed: InstalledProductState;
  targetManifest?: SignedReleaseManifest;
  verification?: ReleaseVerificationResult;
  preservePersonalData?: boolean;
}): LifecyclePlan {
  const installed = installedProductStateSchema.parse(structuredClone(input.installed));
  const preservePersonalData = input.preservePersonalData ?? true;
  let target: SignedReleaseManifest | undefined;
  if (input.operation !== "uninstall") {
    if (!input.targetManifest || !input.verification?.releaseEligible) {
      throw new Error("A verified eligible release manifest is required for install, update, repair, and rollback plans.");
    }
    target = signedReleaseManifestSchema.parse(structuredClone(input.targetManifest));
  }

  validateLifecycleTransition(input.operation, installed, target);
  const steps: z.infer<typeof lifecyclePlanStepSchema>[] = [];
  const add = (step: Omit<z.infer<typeof lifecyclePlanStepSchema>, "sequence">) => {
    steps.push(lifecyclePlanStepSchema.parse({ ...step, sequence: steps.length + 1 }));
  };

  add({ stepId: "verify-current-state", operation: "verify", reversible: true, ownerConfirmationRequired: false, expectedEvidence: "Installed component and service state inventory." });
  if (input.operation !== "install") {
    add({ stepId: "backup-last-known-good", operation: "backup", reversible: true, ownerConfirmationRequired: false, expectedEvidence: "Rollback manifest and backup integrity digest." });
  }
  for (const service of ["cockpit", "gateway", "windows_agent", "field_manager"]) {
    add({ stepId: `stop-${service}`, operation: "stop_service", componentId: service, reversible: true, ownerConfirmationRequired: false, expectedEvidence: `${service} reports stopped or absent.` });
  }

  if (input.operation === "uninstall") {
    for (const component of installed.components) {
      add({ stepId: `remove-${component.componentId}`, operation: "remove", componentId: component.componentId, reversible: false, ownerConfirmationRequired: true, expectedEvidence: `${component.componentId} path removed after confinement verification.` });
    }
    add({
      stepId: preservePersonalData ? "preserve-owner-data" : "delete-owner-data",
      operation: preservePersonalData ? "preserve" : "delete_owner_data",
      reversible: preservePersonalData,
      ownerConfirmationRequired: !preservePersonalData,
      expectedEvidence: preservePersonalData ? "Personal data export/preservation manifest." : "Owner-confirmed deletion certificate.",
    });
  } else {
    for (const component of target!.components) {
      add({ stepId: `stage-${component.componentId}`, operation: "stage", componentId: component.componentId, reversible: true, ownerConfirmationRequired: false, expectedEvidence: `${component.componentId} staged with matching SHA-256 and size.` });
      add({ stepId: `replace-${component.componentId}`, operation: "replace", componentId: component.componentId, reversible: true, ownerConfirmationRequired: false, expectedEvidence: `${component.componentId} installed at its confined target path.` });
    }
    add({ stepId: "migrate-state", operation: "migrate", reversible: true, ownerConfirmationRequired: false, expectedEvidence: "Migration receipt and rollback-compatible state version." });
    for (const service of target!.requiredServices) {
      add({ stepId: `start-${service}`, operation: "start_service", componentId: service, reversible: true, ownerConfirmationRequired: false, expectedEvidence: `${service} health endpoint reports ready.` });
    }
    add({ stepId: "post-install-health", operation: "health_check", reversible: true, ownerConfirmationRequired: false, expectedEvidence: "Signed release identity, service health, and dependency inventory match the target manifest." });
  }

  const core = {
    contractVersion: 1 as const,
    planId: input.planId,
    operation: input.operation,
    currentVersion: installed.installedVersion,
    targetVersion: target?.version,
    targetReleaseId: target?.releaseId,
    preservePersonalData,
    requiresAdministrator: true as const,
    requiresOwnerConfirmation: input.operation === "uninstall" || !preservePersonalData,
    requiresFreshReleaseVerification: true as const,
    steps,
    executionAllowed: false as const,
  };
  return lifecyclePlanSchema.parse({ ...core, planHash: sha256Canonical(core) });
}

export function verifyLifecyclePlan(raw: LifecyclePlan): boolean {
  const plan = lifecyclePlanSchema.parse(structuredClone(raw));
  const { planHash, ...core } = plan;
  return sha256Canonical(core) === planHash;
}

function validateLifecycleTransition(operation: LifecycleOperation, installed: InstalledProductState, target?: SignedReleaseManifest): void {
  if (operation === "install" && installed.installedVersion) throw new Error("Install requires no existing installed version.");
  if (["update", "repair", "rollback", "uninstall"].includes(operation) && !installed.installedVersion) {
    throw new Error(`${operation} requires an installed version.`);
  }
  if (!target) return;
  const comparison = compareSemver(target.version, installed.installedVersion);
  if (operation === "update" && comparison <= 0) throw new Error("Update target must be newer than the installed version.");
  if (operation === "repair" && comparison !== 0) throw new Error("Repair target must match the installed version.");
  if (operation === "rollback") {
    if (comparison >= 0) throw new Error("Rollback target must be older than the installed version.");
    if (!target.rollbackCompatibleFrom.includes(installed.installedVersion!)) {
      throw new Error("Rollback target does not declare compatibility from the installed version.");
    }
  }
}

function compareSemver(left: string, right?: string): number {
  if (!right) return 1;
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    const delta = a[index]! - b[index]!;
    if (delta !== 0) return delta;
  }
  return 0;
}

function parseSemver(value: string): [number, number, number] {
  const stable = semverSchema.parse(value).split("-", 1)[0]!;
  const [major, minor, patch] = stable.split(".").map(Number);
  return [major!, minor!, patch!];
}

const sensitiveDiagnosticKey = /(authorization|cookie|credential|password|secret|token|api[_-]?key|goal|variables?|screenshot|raw[_-]?text|clipboard|message[_-]?body|persona[_-]?text)/i;

export function redactDiagnosticValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth-limit]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}[truncated]` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactDiagnosticValue(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 200)) {
      output[key] = sensitiveDiagnosticKey.test(key) ? "[redacted]" : redactDiagnosticValue(item, depth + 1);
    }
    return output;
  }
  return `[${typeof value}]`;
}

export function hashReleaseComponent(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
