import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sha256Canonical } from "./fieldContracts.js";
import { personaProfileSchema, verifyPersonaProfile, type PersonaProfile } from "./personaBehavior.js";
import { personaEvaluationSchema, type PersonaEvaluation } from "./personaDerivation.js";
import {
  motorPreferenceModelSchema,
  typingProcessModelSchema,
  type MotorPreferenceModel,
  type TypingProcessModel,
} from "./personalBehaviorModels.js";
import {
  attentionVerificationModelSchema,
  languageStyleModelSchema,
  type AttentionVerificationModel,
  type LanguageStyleModel,
} from "./languageAttentionModels.js";

export const personaModelBundleSchema = z.object({
  contractVersion: z.literal(1),
  bundleId: z.string().uuid(),
  ownerId: z.string().min(1).max(200),
  profileId: z.string().uuid(),
  profileVersion: z.number().int().positive(),
  profileHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  evaluationHash: z.string().regex(/^[a-f0-9]{64}$/),
  evaluationStableEnoughForOwnerReview: z.boolean(),
  modelHashes: z.object({
    typing: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    motor: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    language: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    attention: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict(),
  supportedDimensions: z.array(z.enum(["task", "timing", "typing", "motor", "language", "attention", "verification", "habits"])).min(1).max(8),
  advisoryOnly: z.literal(true),
  mayLowerPolicyVerification: z.literal(false),
  mayAuthorizeActions: z.literal(false),
  mayInjectInput: z.literal(false),
  actionAuthority: z.literal("none"),
  bundleHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type PersonaModelBundle = z.infer<typeof personaModelBundleSchema>;

export const personaBundleActivationRequestSchema = z.object({
  requestId: z.string().uuid(),
  actor: z.enum(["owner_local", "field_service", "pilot_model"]),
  ownerId: z.string().min(1).max(200),
  operation: z.enum(["activate", "deactivate", "rollback"]),
  bundleId: z.string().uuid(),
  bundleHash: z.string().regex(/^[a-f0-9]{64}$/),
  localTransport: z.boolean(),
  interactiveOwnerPresent: z.boolean(),
  requestedAt: z.string().datetime(),
  reason: z.string().min(1).max(1_000),
}).strict();
export type PersonaBundleActivationRequest = z.infer<typeof personaBundleActivationRequestSchema>;

export const personaBundleActivationSchema = z.object({
  contractVersion: z.literal(1),
  activationId: z.string().uuid(),
  requestId: z.string().uuid(),
  ownerId: z.string().min(1).max(200),
  bundleId: z.string().uuid(),
  bundleHash: z.string().regex(/^[a-f0-9]{64}$/),
  operation: z.enum(["activate", "deactivate", "rollback"]),
  status: z.enum(["active", "inactive", "blocked"]),
  previousBundleHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  decidedAt: z.string().datetime(),
  rule: z.string().min(1).max(200),
  runtimeUse: z.literal("advisory_only"),
  downstreamPolicyAuthoritative: z.literal(true),
  modelMayActivate: z.literal(false),
  actionAuthority: z.literal("none"),
  activationHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type PersonaBundleActivation = z.infer<typeof personaBundleActivationSchema>;

export function createPersonaModelBundle(input: {
  bundleId?: string;
  profile: PersonaProfile;
  evaluation: PersonaEvaluation;
  typing?: TypingProcessModel;
  motor?: MotorPreferenceModel;
  language?: LanguageStyleModel;
  attention?: AttentionVerificationModel;
  createdAt?: string;
}): PersonaModelBundle {
  const profile = personaProfileSchema.parse(structuredClone(input.profile));
  if (!verifyPersonaProfile(profile)) throw new Error("Persona model bundle requires an integrity-valid profile.");
  const evaluation = personaEvaluationSchema.parse(structuredClone(input.evaluation));
  const models = {
    ...(input.typing ? { typing: verifyBoundModel(input.typing, typingProcessModelSchema, profile, "Typing") } : {}),
    ...(input.motor ? { motor: verifyBoundModel(input.motor, motorPreferenceModelSchema, profile, "Motor") } : {}),
    ...(input.language ? { language: verifyBoundModel(input.language, languageStyleModelSchema, profile, "Language") } : {}),
    ...(input.attention ? { attention: verifyBoundModel(input.attention, attentionVerificationModelSchema, profile, "Attention") } : {}),
  };
  if (Object.keys(models).length === 0) throw new Error("Persona model bundle requires at least one observed personal model.");
  const supportedDimensions = new Set<z.infer<typeof personaModelBundleSchema>["supportedDimensions"][number]>(["task", "timing", "habits"]);
  if (models.typing) supportedDimensions.add("typing");
  if (models.motor) supportedDimensions.add("motor");
  if (models.language) supportedDimensions.add("language");
  if (models.attention) {
    supportedDimensions.add("attention");
    supportedDimensions.add("verification");
  }
  const modelHashes = {
    ...(models.typing ? { typing: models.typing.modelHash } : {}),
    ...(models.motor ? { motor: models.motor.modelHash } : {}),
    ...(models.language ? { language: models.language.modelHash } : {}),
    ...(models.attention ? { attention: models.attention.modelHash } : {}),
  };
  const core = {
    contractVersion: 1 as const,
    bundleId: input.bundleId ?? randomUUID(),
    ownerId: profile.ownerId,
    profileId: profile.profileId,
    profileVersion: profile.version,
    profileHash: profile.profileHash,
    createdAt: input.createdAt ?? new Date().toISOString(),
    evaluationHash: sha256Canonical(evaluation),
    evaluationStableEnoughForOwnerReview: evaluation.stableEnoughForOwnerReview,
    modelHashes,
    supportedDimensions: [...supportedDimensions].sort(),
    advisoryOnly: true as const,
    mayLowerPolicyVerification: false as const,
    mayAuthorizeActions: false as const,
    mayInjectInput: false as const,
    actionAuthority: "none" as const,
  };
  return personaModelBundleSchema.parse({ ...core, bundleHash: sha256Canonical(core) });
}

export class PersonaModelBundleRegistry {
  readonly #bundles = new Map<string, PersonaModelBundle>();
  readonly #requests = new Set<string>();
  readonly #activations: PersonaBundleActivation[] = [];
  #activeBundleHash?: string;

  register(input: PersonaModelBundle): void {
    const bundle = verifyBundle(input);
    if (this.#bundles.has(bundle.bundleHash)) throw new Error("Persona model bundle is already registered.");
    this.#bundles.set(bundle.bundleHash, structuredClone(bundle));
  }

  decide(input: {
    request: PersonaBundleActivationRequest;
    profile: PersonaProfile;
    decidedAt?: string;
  }): PersonaBundleActivation {
    const request = personaBundleActivationRequestSchema.parse(structuredClone(input.request));
    if (this.#requests.has(request.requestId)) throw new Error("A persona bundle activation request may be decided only once.");
    this.#requests.add(request.requestId);
    const profile = personaProfileSchema.parse(structuredClone(input.profile));
    const bundle = this.#bundles.get(request.bundleHash);
    const previousBundleHash = this.#activeBundleHash;
    const decidedAt = input.decidedAt ?? new Date().toISOString();
    let status: "active" | "inactive" | "blocked" = "blocked";
    let rule = "blocked";
    if (!bundle || bundle.bundleId !== request.bundleId) rule = "registered_bundle_required";
    else if (request.actor !== "owner_local") rule = "owner_only_activation";
    else if (!request.localTransport || !request.interactiveOwnerPresent) rule = "interactive_local_owner_required";
    else if (request.ownerId !== bundle.ownerId || profile.ownerId !== bundle.ownerId || profile.profileId !== bundle.profileId || profile.version !== bundle.profileVersion || profile.profileHash !== bundle.profileHash) rule = "exact_owner_profile_binding";
    else if (!verifyPersonaProfile(profile) || profile.status !== "approved" || !profile.ownerApproved) rule = "approved_profile_required";
    else if (!bundle.evaluationStableEnoughForOwnerReview) rule = "stable_evaluation_required";
    else if (request.operation === "deactivate") {
      if (this.#activeBundleHash !== bundle.bundleHash) rule = "bundle_not_active";
      else { this.#activeBundleHash = undefined; status = "inactive"; rule = "interactive_owner_deactivate"; }
    } else {
      this.#activeBundleHash = bundle.bundleHash;
      status = "active";
      rule = request.operation === "rollback" ? "interactive_owner_rollback" : "interactive_owner_activate";
    }
    const core = {
      contractVersion: 1 as const,
      activationId: randomUUID(),
      requestId: request.requestId,
      ownerId: request.ownerId,
      bundleId: request.bundleId,
      bundleHash: request.bundleHash,
      operation: request.operation,
      status,
      ...(previousBundleHash ? { previousBundleHash } : {}),
      decidedAt,
      rule,
      runtimeUse: "advisory_only" as const,
      downstreamPolicyAuthoritative: true as const,
      modelMayActivate: false as const,
      actionAuthority: "none" as const,
    };
    const activation = personaBundleActivationSchema.parse({ ...core, activationHash: sha256Canonical(core) });
    this.#activations.push(structuredClone(activation));
    return activation;
  }

  active(): PersonaModelBundle | undefined {
    const bundle = this.#activeBundleHash ? this.#bundles.get(this.#activeBundleHash) : undefined;
    return bundle ? structuredClone(bundle) : undefined;
  }

  activations(): PersonaBundleActivation[] {
    return structuredClone(this.#activations);
  }
}

function verifyBoundModel<T extends { ownerId: string; profileId: string; profileVersion: number; modelHash: string }>(
  input: T,
  schema: z.ZodType<T>,
  profile: PersonaProfile,
  label: string,
): T {
  const model = schema.parse(structuredClone(input));
  const { modelHash: _modelHash, ...core } = model;
  if (sha256Canonical(core) !== model.modelHash) throw new Error(`${label} model integrity verification failed.`);
  if (model.ownerId !== profile.ownerId || model.profileId !== profile.profileId || model.profileVersion !== profile.version) {
    throw new Error(`${label} model is not bound to the exact persona profile version.`);
  }
  return model;
}

function verifyBundle(input: PersonaModelBundle): PersonaModelBundle {
  const bundle = personaModelBundleSchema.parse(structuredClone(input));
  const { bundleHash, ...core } = bundle;
  if (sha256Canonical(core) !== bundle.bundleHash) throw new Error("Persona model bundle integrity verification failed.");
  return bundle;
}
