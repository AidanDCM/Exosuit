import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  canonicalOriginSchema,
  fieldRefSchema,
  reviewedExecutableIdentitySchema,
  sha256Canonical,
} from "./fieldContracts.js";

export const credentialPurposeSchema = z.enum(["sign_in", "unlock_local_vault", "fill_protected_field"]);
export type CredentialPurpose = z.infer<typeof credentialPurposeSchema>;

export const credentialGrantRequestSchema = z.object({
  requestId: z.string().uuid(),
  actor: z.enum(["owner_local", "field_service", "pilot_model"]),
  ownerId: z.string().min(1).max(200),
  field: fieldRefSchema,
  process: reviewedExecutableIdentitySchema,
  origin: canonicalOriginSchema,
  purpose: credentialPurposeSchema,
  localTransport: z.boolean(),
  interactiveOwnerPresent: z.boolean(),
  requestedAt: z.string().datetime(),
  ttlMs: z.number().int().min(1_000).max(15 * 60_000),
  reason: z.string().min(1).max(1_000),
}).strict();
export type CredentialGrantRequest = z.infer<typeof credentialGrantRequestSchema>;

export const credentialHandleSchema = z.object({
  contractVersion: z.literal(1),
  handleId: z.string().uuid(),
  opaqueHandle: z.string().regex(/^cred_[A-Za-z0-9_-]{32,200}$/),
  ownerIdHash: z.string().regex(/^[a-f0-9]{64}$/),
  field: fieldRefSchema,
  process: reviewedExecutableIdentitySchema,
  origin: canonicalOriginSchema,
  purpose: credentialPurposeSchema,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  maximumUses: z.literal(1),
  secretMaterialIncluded: z.literal(false),
  modelVisible: z.literal(false),
  actionAuthority: z.literal("none"),
  handleHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type CredentialHandle = z.infer<typeof credentialHandleSchema>;

export const credentialRedeemContextSchema = z.object({
  redemptionId: z.string().uuid(),
  opaqueHandle: z.string().regex(/^cred_[A-Za-z0-9_-]{32,200}$/),
  field: fieldRefSchema,
  process: reviewedExecutableIdentitySchema,
  origin: canonicalOriginSchema,
  purpose: credentialPurposeSchema,
  observedAt: z.string().datetime(),
  sceneVersion: z.number().int().nonnegative(),
  sceneHash: z.string().regex(/^[a-f0-9]{64}$/),
  protectedFieldFocused: z.boolean(),
  humanVerificationRequired: z.boolean(),
}).strict();
export type CredentialRedeemContext = z.infer<typeof credentialRedeemContextSchema>;

export const credentialRedeemDecisionSchema = z.object({
  contractVersion: z.literal(1),
  redemptionId: z.string().uuid(),
  handleId: z.string().uuid().optional(),
  status: z.enum(["allow_trusted_adapter", "block"]),
  rule: z.string().min(1).max(200),
  reason: z.string().min(1).max(1_000),
  singleUseConsumed: z.boolean(),
  secretMaterialIncluded: z.literal(false),
  modelVisible: z.literal(false),
  trustedAdapterRequired: z.literal(true),
  actionAuthority: z.literal("none"),
  decisionHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type CredentialRedeemDecision = z.infer<typeof credentialRedeemDecisionSchema>;

export class CredentialAuthorizationBroker {
  readonly #handlesByOpaqueValue = new Map<string, CredentialHandle>();
  readonly #consumedHandleIds = new Set<string>();
  readonly #grantRequestIds = new Set<string>();
  readonly #redemptionIds = new Set<string>();

  issue(input: CredentialGrantRequest): CredentialHandle {
    const request = credentialGrantRequestSchema.parse(structuredClone(input));
    if (this.#grantRequestIds.has(request.requestId)) throw new Error("A credential grant request may be processed only once.");
    this.#grantRequestIds.add(request.requestId);
    if (request.actor !== "owner_local") throw new Error("Only the interactive local owner may grant a credential handle.");
    if (!request.localTransport || !request.interactiveOwnerPresent) throw new Error("Credential grants require interactive owner presence over local transport.");
    const issuedAt = request.requestedAt;
    const core = {
      contractVersion: 1 as const,
      handleId: randomUUID(),
      opaqueHandle: `cred_${randomBytes(32).toString("base64url")}`,
      ownerIdHash: sha256Canonical({ ownerId: request.ownerId }),
      field: structuredClone(request.field),
      process: structuredClone(request.process),
      origin: request.origin,
      purpose: request.purpose,
      issuedAt,
      expiresAt: new Date(new Date(issuedAt).getTime() + request.ttlMs).toISOString(),
      maximumUses: 1 as const,
      secretMaterialIncluded: false as const,
      modelVisible: false as const,
      actionAuthority: "none" as const,
    };
    const handle = credentialHandleSchema.parse({ ...core, handleHash: sha256Canonical(core) });
    this.#handlesByOpaqueValue.set(handle.opaqueHandle, structuredClone(handle));
    return structuredClone(handle);
  }

  redeem(input: CredentialRedeemContext): CredentialRedeemDecision {
    const context = credentialRedeemContextSchema.parse(structuredClone(input));
    if (this.#redemptionIds.has(context.redemptionId)) throw new Error("A credential redemption may be decided only once.");
    this.#redemptionIds.add(context.redemptionId);
    const handle = this.#handlesByOpaqueValue.get(context.opaqueHandle);
    if (!handle) return this.#decision(context, undefined, "block", "unknown_handle", "Credential handle is unknown or no longer active.", false);
    if (!verifyHandle(handle)) return this.#decision(context, handle, "block", "handle_integrity", "Credential handle integrity verification failed.", false);
    if (this.#consumedHandleIds.has(handle.handleId)) return this.#decision(context, handle, "block", "single_use", "Credential handle was already consumed.", true);
    if (new Date(context.observedAt).getTime() > new Date(handle.expiresAt).getTime()) {
      return this.#decision(context, handle, "block", "expired", "Credential handle expired.", false);
    }
    if (!sameField(handle.field, context.field)) return this.#decision(context, handle, "block", "field_mismatch", "Credential handle Field generation changed.", false);
    if (handle.process.processName !== context.process.processName || handle.process.executableSha256 !== context.process.executableSha256) {
      return this.#decision(context, handle, "block", "process_mismatch", "Credential handle executable identity changed.", false);
    }
    if (handle.origin !== context.origin) return this.#decision(context, handle, "block", "origin_mismatch", "Credential handle origin changed.", false);
    if (handle.purpose !== context.purpose) return this.#decision(context, handle, "block", "purpose_mismatch", "Credential handle purpose changed.", false);
    if (!context.protectedFieldFocused) return this.#decision(context, handle, "block", "protected_field_required", "A reviewed protected field is not focused.", false);
    if (context.humanVerificationRequired) return this.#decision(context, handle, "block", "human_verification", "Human-verification challenges cannot be completed through the credential broker.", false);
    this.#consumedHandleIds.add(handle.handleId);
    return this.#decision(
      context,
      handle,
      "allow_trusted_adapter",
      "exact_single_use_scope",
      "A trusted local adapter may request the secret from the external vault for this exact one-time scope.",
      true,
    );
  }

  revoke(opaqueHandle: string): boolean {
    const handle = this.#handlesByOpaqueValue.get(opaqueHandle);
    if (!handle) return false;
    this.#consumedHandleIds.add(handle.handleId);
    this.#handlesByOpaqueValue.delete(opaqueHandle);
    return true;
  }

  #decision(
    context: CredentialRedeemContext,
    handle: CredentialHandle | undefined,
    status: "allow_trusted_adapter" | "block",
    rule: string,
    reason: string,
    singleUseConsumed: boolean,
  ): CredentialRedeemDecision {
    const core = {
      contractVersion: 1 as const,
      redemptionId: context.redemptionId,
      ...(handle ? { handleId: handle.handleId } : {}),
      status,
      rule,
      reason,
      singleUseConsumed,
      secretMaterialIncluded: false as const,
      modelVisible: false as const,
      trustedAdapterRequired: true as const,
      actionAuthority: "none" as const,
    };
    return credentialRedeemDecisionSchema.parse({ ...core, decisionHash: sha256Canonical(core) });
  }
}

export function verifyCredentialDecision(input: CredentialRedeemDecision): boolean {
  const decision = credentialRedeemDecisionSchema.parse(structuredClone(input));
  const { decisionHash, ...core } = decision;
  return sha256Canonical(core) === decisionHash && decision.secretMaterialIncluded === false && decision.modelVisible === false;
}

function verifyHandle(input: CredentialHandle): boolean {
  const handle = credentialHandleSchema.parse(structuredClone(input));
  const { handleHash, ...core } = handle;
  return sha256Canonical(core) === handleHash;
}

function sameField(left: z.infer<typeof fieldRefSchema>, right: z.infer<typeof fieldRefSchema>): boolean {
  return left.fieldId === right.fieldId && left.fieldGeneration === right.fieldGeneration;
}
