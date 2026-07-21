import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { z } from "zod";
import { riskLevelSchema } from "./contracts.js";

const skillIdPattern = /^[a-z0-9][a-z0-9._-]{2,99}$/;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

export const skillManifestUnsignedSchema = z.object({
  schemaVersion: z.literal(1),
  skillId: z.string().regex(skillIdPattern),
  version: z.string().regex(semverPattern),
  displayName: z.string().min(1).max(200),
  allowedAgents: z.array(z.string().min(1).max(200)).max(100),
  allowedApplications: z.array(z.string().min(1).max(300)).max(100),
  allowedOrigins: z.array(z.string().url()).max(100),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
  maximumSteps: z.number().int().min(1).max(10_000),
  maximumDurationMs: z.number().int().min(100).max(86_400_000),
  riskCeiling: riskLevelSchema,
  requiredApprovals: z.array(z.enum(["local_click", "typed_confirmation", "local_only"])).max(20),
  verificationPlan: z.array(z.string().min(1).max(2_000)).min(1).max(100),
  recoveryPlan: z.array(z.string().min(1).max(2_000)).min(1).max(100),
  retentionPolicy: z.enum(["ephemeral", "workflow", "persistent_metadata_only"]),
  issuedAt: z.string().datetime(),
  keyId: z.string().min(1).max(200),
});
export type SkillManifestUnsigned = z.infer<typeof skillManifestUnsignedSchema>;

export const signedSkillManifestSchema = skillManifestUnsignedSchema.extend({
  signature: z.string().min(1).max(2_000),
});
export type SignedSkillManifest = z.infer<typeof signedSkillManifestSchema>;

export type SkillPermissionDiff = {
  expandsPermissions: boolean;
  changes: string[];
};

export type InstalledSkill = {
  manifest: SignedSkillManifest;
  enabled: boolean;
  installedAt: string;
  revokedAt?: string;
};

export class SkillManifestSigner {
  readonly #privateKey?: KeyObject;
  readonly #publicKeys: Map<string, KeyObject>;

  constructor(options: {
    privateKeyPem?: string | Buffer;
    publicKeys: Record<string, string | Buffer>;
  }) {
    this.#privateKey = options.privateKeyPem ? createPrivateKey(options.privateKeyPem) : undefined;
    this.#publicKeys = new Map(
      Object.entries(options.publicKeys).map(([keyId, key]) => [keyId, createPublicKey(key)]),
    );
    if (this.#publicKeys.size === 0) throw new Error("At least one trusted skill-signing public key is required.");
  }

  sign(manifest: SkillManifestUnsigned): SignedSkillManifest {
    if (!this.#privateKey) throw new Error("This signer has no private key.");
    const parsed = skillManifestUnsignedSchema.parse(manifest);
    if (!this.#publicKeys.has(parsed.keyId)) {
      throw new Error("The manifest keyId is not in the trusted public-key set.");
    }
    const signature = sign(null, Buffer.from(stableStringify(parsed), "utf8"), this.#privateKey).toString("base64");
    return signedSkillManifestSchema.parse({ ...parsed, signature });
  }

  verify(manifest: SignedSkillManifest): SkillManifestUnsigned {
    const parsed = signedSkillManifestSchema.parse(manifest);
    const publicKey = this.#publicKeys.get(parsed.keyId);
    if (!publicKey) throw new Error("The skill manifest key is not trusted.");
    const { signature, ...unsigned } = parsed;
    const valid = verify(
      null,
      Buffer.from(stableStringify(unsigned), "utf8"),
      publicKey,
      Buffer.from(signature, "base64"),
    );
    if (!valid) throw new Error("The skill manifest signature is invalid.");
    return skillManifestUnsignedSchema.parse(unsigned);
  }
}

export class SkillRegistry {
  readonly #signer: SkillManifestSigner;
  readonly #skills = new Map<string, InstalledSkill>();

  constructor(signer: SkillManifestSigner) {
    this.#signer = signer;
  }

  install(manifest: SignedSkillManifest, options: { approveExpansion?: boolean } = {}): {
    installed: InstalledSkill;
    permissionDiff: SkillPermissionDiff;
  } {
    const verified = this.#signer.verify(manifest);
    const existing = this.#skills.get(verified.skillId);
    if (existing && compareSemver(verified.version, existing.manifest.version) <= 0) {
      throw new Error("Skill upgrades must use a strictly newer semantic version.");
    }
    const permissionDiff = comparePermissions(existing?.manifest, manifest);
    if (permissionDiff.expandsPermissions && !options.approveExpansion) {
      throw new Error(`Skill upgrade expands permissions: ${permissionDiff.changes.join("; ")}`);
    }
    const installed: InstalledSkill = {
      manifest: structuredClone(manifest),
      enabled: false,
      installedAt: new Date().toISOString(),
    };
    this.#skills.set(verified.skillId, installed);
    return { installed: structuredClone(installed), permissionDiff };
  }

  enable(skillId: string): InstalledSkill {
    const installed = this.#require(skillId);
    if (installed.revokedAt) throw new Error("A revoked skill cannot be enabled.");
    installed.enabled = true;
    return structuredClone(installed);
  }

  disable(skillId: string): InstalledSkill {
    const installed = this.#require(skillId);
    installed.enabled = false;
    return structuredClone(installed);
  }

  revoke(skillId: string): InstalledSkill {
    const installed = this.#require(skillId);
    installed.enabled = false;
    installed.revokedAt = new Date().toISOString();
    return structuredClone(installed);
  }

  get(skillId: string): InstalledSkill | undefined {
    const installed = this.#skills.get(skillId);
    return installed ? structuredClone(installed) : undefined;
  }

  list(): InstalledSkill[] {
    return [...this.#skills.values()].map((item) => structuredClone(item));
  }

  assertInvocation(input: {
    skillId: string;
    agentId: string;
    application?: string;
    origin?: string;
    requestedRisk: z.infer<typeof riskLevelSchema>;
    requestedSteps: number;
    requestedDurationMs: number;
  }): InstalledSkill {
    const installed = this.#require(input.skillId);
    if (!installed.enabled || installed.revokedAt) throw new Error("The skill is not enabled.");
    const manifest = installed.manifest;
    if (!manifest.allowedAgents.includes(input.agentId)) throw new Error("The agent is outside the skill scope.");
    if (input.application && !manifest.allowedApplications.includes(input.application)) {
      throw new Error("The application is outside the skill scope.");
    }
    if (input.origin && !manifest.allowedOrigins.includes(exactOrigin(input.origin))) {
      throw new Error("The origin is outside the skill scope.");
    }
    if (riskRank(input.requestedRisk) > riskRank(manifest.riskCeiling)) {
      throw new Error("The requested risk exceeds the skill ceiling.");
    }
    if (input.requestedSteps > manifest.maximumSteps || input.requestedSteps < 1) {
      throw new Error("The requested step budget exceeds the skill limit.");
    }
    if (input.requestedDurationMs > manifest.maximumDurationMs || input.requestedDurationMs < 100) {
      throw new Error("The requested duration exceeds the skill limit.");
    }
    return structuredClone(installed);
  }

  #require(skillId: string): InstalledSkill {
    const installed = this.#skills.get(skillId);
    if (!installed) throw new Error(`Skill ${skillId} is not installed.`);
    return installed;
  }
}

export function comparePermissions(
  previous: SignedSkillManifest | undefined,
  next: SignedSkillManifest,
): SkillPermissionDiff {
  if (!previous) return { expandsPermissions: false, changes: [] };
  const changes: string[] = [];
  additions("agent", previous.allowedAgents, next.allowedAgents, changes);
  additions("application", previous.allowedApplications, next.allowedApplications, changes);
  additions("origin", previous.allowedOrigins, next.allowedOrigins, changes);
  if (riskRank(next.riskCeiling) > riskRank(previous.riskCeiling)) {
    changes.push(`risk ceiling increased from ${previous.riskCeiling} to ${next.riskCeiling}`);
  }
  if (next.maximumSteps > previous.maximumSteps) changes.push("maximum step count increased");
  if (next.maximumDurationMs > previous.maximumDurationMs) changes.push("maximum duration increased");
  const removedApprovals = previous.requiredApprovals.filter(
    (approval) => !next.requiredApprovals.includes(approval),
  );
  if (removedApprovals.length > 0) changes.push(`required approvals removed: ${removedApprovals.join(", ")}`);
  return { expandsPermissions: changes.length > 0, changes };
}

function additions(label: string, previous: string[], next: string[], changes: string[]): void {
  const prior = new Set(previous);
  const added = next.filter((item) => !prior.has(item));
  if (added.length > 0) changes.push(`${label} scope added: ${added.join(", ")}`);
}

function compareSemver(left: string, right: string): number {
  const parse = (value: string) => value.split("-")[0]!.split(".").map(Number);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function riskRank(value: z.infer<typeof riskLevelSchema>): number {
  return ["info", "low", "medium", "high", "critical"].indexOf(value);
}

function exactOrigin(value: string): string {
  const url = new URL(value);
  if (url.origin !== value) throw new Error("Skill origins must be exact origins without paths.");
  return url.origin;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}
