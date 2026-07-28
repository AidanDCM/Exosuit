import { z } from "zod";
import {
  fieldDisplayContractSchema,
  fieldIdentitySchema,
  sha256DigestSchema,
  type FieldDisplayContract,
  type FieldIdentity,
} from "./fieldContracts.js";

export const fieldBootstrapCheckNameSchema = z.enum([
  "identity",
  "base_image",
  "personal_state",
  "task_disk",
  "directory_layout",
  "display_contract",
  "agent_binary",
  "channel_key",
  "policy_binding",
  "session_unlocked",
  "secure_desktop_inactive",
  "heartbeat_started",
]);
export type FieldBootstrapCheckName = z.infer<typeof fieldBootstrapCheckNameSchema>;

export const REQUIRED_FIELD_DIRECTORIES = [
  "C:\\Exosuit\\Agent",
  "C:\\Exosuit\\Config",
  "C:\\Exosuit\\Logs",
  "C:\\Exosuit\\Maps",
  "C:\\Exosuit\\Checkpoints",
  "C:\\Exosuit\\Demonstrations",
  "C:\\Exosuit\\Diagnostics",
  "C:\\Field\\Inbox",
  "C:\\Field\\Workspace",
  "C:\\Field\\Downloads",
  "C:\\Field\\Outbox",
  "C:\\Field\\Quarantine",
] as const;

export const fieldBootstrapManifestSchema = z
  .object({
    contractVersion: z.literal(1),
    identity: fieldIdentitySchema,
    display: fieldDisplayContractSchema,
    policyHash: sha256DigestSchema,
    agentBinaryDigest: sha256DigestSchema,
    channelKeyId: z.string().min(1).max(200),
    requiredDirectories: z.array(z.string().min(3).max(400)).length(REQUIRED_FIELD_DIRECTORIES.length),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .superRefine((manifest, context) => {
    if (new Date(manifest.expiresAt).getTime() <= new Date(manifest.createdAt).getTime()) {
      context.addIssue({ code: "custom", path: ["expiresAt"], message: "Bootstrap manifest must expire after creation." });
    }
    if (new Set(manifest.requiredDirectories.map((value) => value.toLowerCase())).size !== manifest.requiredDirectories.length) {
      context.addIssue({ code: "custom", path: ["requiredDirectories"], message: "Bootstrap directories must be unique." });
    }
    const expected = new Set(REQUIRED_FIELD_DIRECTORIES.map((value) => value.toLowerCase()));
    const actual = new Set(manifest.requiredDirectories.map((value) => value.toLowerCase()));
    if (expected.size !== actual.size || [...expected].some((value) => !actual.has(value))) {
      context.addIssue({ code: "custom", path: ["requiredDirectories"], message: "Bootstrap manifest must contain the exact Field directory layout." });
    }
  });
export type FieldBootstrapManifest = z.infer<typeof fieldBootstrapManifestSchema>;

export const fieldBootstrapCheckSchema = z.object({
  name: fieldBootstrapCheckNameSchema,
  passed: z.boolean(),
  observedAt: z.string().datetime(),
  summary: z.string().min(1).max(1_000),
  evidence: z.record(z.string(), z.unknown()),
});
export type FieldBootstrapCheck = z.infer<typeof fieldBootstrapCheckSchema>;

export const fieldBootstrapReportSchema = z.object({
  contractVersion: z.literal(1),
  identity: fieldIdentitySchema,
  manifestDigest: sha256DigestSchema,
  reportedAt: z.string().datetime(),
  checks: z.array(fieldBootstrapCheckSchema).max(100),
});
export type FieldBootstrapReport = z.infer<typeof fieldBootstrapReportSchema>;

export type FieldBootstrapReadiness =
  | { status: "not_ready"; missingChecks: FieldBootstrapCheckName[]; failedChecks: FieldBootstrapCheckName[] }
  | { status: "failed"; missingChecks: FieldBootstrapCheckName[]; failedChecks: FieldBootstrapCheckName[] }
  | { status: "ready"; identity: FieldIdentity; display: FieldDisplayContract; completedAt: string };

const mandatoryChecks = fieldBootstrapCheckNameSchema.options;

export class FieldBootstrapEvaluator {
  readonly #manifest: FieldBootstrapManifest;
  readonly #manifestDigest: string;

  constructor(input: { manifest: FieldBootstrapManifest; manifestDigest: string }) {
    this.#manifest = fieldBootstrapManifestSchema.parse(input.manifest);
    this.#manifestDigest = sha256DigestSchema.parse(input.manifestDigest);
  }

  evaluate(input: FieldBootstrapReport, now = new Date()): FieldBootstrapReadiness {
    const report = fieldBootstrapReportSchema.parse(input);
    if (
      report.identity.fieldId !== this.#manifest.identity.fieldId ||
      report.identity.fieldGeneration !== this.#manifest.identity.fieldGeneration
    ) {
      throw new Error("Bootstrap report cannot cross Field generations.");
    }
    if (report.identity.agentId !== this.#manifest.identity.agentId || report.identity.windowsSessionId !== this.#manifest.identity.windowsSessionId) {
      throw new Error("Bootstrap report guest identity does not match the manifest.");
    }
    if (report.manifestDigest !== this.#manifestDigest) throw new Error("Bootstrap report manifest digest is invalid.");
    if (now.getTime() >= new Date(this.#manifest.expiresAt).getTime()) throw new Error("Bootstrap manifest has expired.");
    if (new Date(report.reportedAt).getTime() < new Date(this.#manifest.createdAt).getTime()) {
      throw new Error("Bootstrap report predates its manifest.");
    }
    const names = report.checks.map((check) => check.name);
    if (new Set(names).size !== names.length) throw new Error("Bootstrap checks must be unique.");
    for (const check of report.checks) {
      const observed = new Date(check.observedAt).getTime();
      if (observed < new Date(this.#manifest.createdAt).getTime() || observed > new Date(report.reportedAt).getTime()) {
        throw new Error("Bootstrap check timestamps must fall inside the bootstrap reporting interval.");
      }
    }
    const byName = new Map(report.checks.map((check) => [check.name, check]));
    const missingChecks = mandatoryChecks.filter((name) => !byName.has(name));
    const failedChecks = mandatoryChecks.filter((name) => byName.get(name)?.passed === false);
    if (failedChecks.length > 0) return { status: "failed", missingChecks, failedChecks };
    if (missingChecks.length > 0) return { status: "not_ready", missingChecks, failedChecks: [] };
    return {
      status: "ready",
      identity: structuredClone(this.#manifest.identity),
      display: structuredClone(this.#manifest.display),
      completedAt: report.reportedAt,
    };
  }
}
