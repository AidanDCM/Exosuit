import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fieldRefSchema, sha256Canonical } from "./fieldContracts.js";
import { behaviorMethodSchema } from "./shadowLearning.js";

export const assistedRiskSchema = z.enum(["low", "medium", "high", "consequential"]);
export type AssistedRisk = z.infer<typeof assistedRiskSchema>;

export const assistedProposalStepSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  intent: z.string().min(1).max(1_000),
  targetKey: z.string().min(1).max(1_000),
  method: behaviorMethodSchema,
  expectedResult: z.string().min(1).max(2_000),
  verificationRequired: z.literal(true),
  finalSubmission: z.boolean(),
  externalCommitment: z.boolean(),
}).strict();
export type AssistedProposalStep = z.infer<typeof assistedProposalStepSchema>;

export const assistedProposalSchema = z.object({
  contractVersion: z.literal(1),
  proposalId: z.string().uuid(),
  field: fieldRefSchema,
  sceneVersion: z.number().int().nonnegative(),
  sceneHash: z.string().regex(/^[a-f0-9]{64}$/),
  policyHash: z.string().regex(/^[a-f0-9]{64}$/),
  personaProfileHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  declaredRisk: assistedRiskSchema,
  steps: z.array(assistedProposalStepSchema).min(1).max(100),
  ownerReviewRequired: z.literal(true),
  downstreamReauthorizationRequired: z.literal(true),
  reusable: z.literal(false),
  executionAllowed: z.literal(false),
  actionAuthority: z.literal("none"),
  proposalHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((proposal, context) => {
  if (proposal.steps.some((step, index) => step.ordinal !== index)) {
    context.addIssue({ code: "custom", path: ["steps"], message: "Assisted proposal step ordinals must be contiguous." });
  }
  if (proposal.declaredRisk === "consequential") {
    context.addIssue({ code: "custom", path: ["declaredRisk"], message: "Consequential actions cannot enter Assisted proposal review." });
  }
});
export type AssistedProposal = z.infer<typeof assistedProposalSchema>;

export const assistedReviewSchema = z.object({
  contractVersion: z.literal(1),
  reviewId: z.string().uuid(),
  proposalId: z.string().uuid(),
  proposalHash: z.string().regex(/^[a-f0-9]{64}$/),
  ownerId: z.string().min(1).max(200),
  actor: z.literal("owner_local"),
  localTransport: z.literal(true),
  interactiveOwnerPresent: z.literal(true),
  reviewedAt: z.string().datetime(),
  decision: z.enum(["approve_for_downstream_review", "reject"]),
  approvedStepOrdinals: z.array(z.number().int().nonnegative()).max(100),
  reason: z.string().min(1).max(1_000),
  modelMayReview: z.literal(false),
  executionAllowed: z.literal(false),
  actionAuthority: z.literal("none"),
  reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type AssistedReview = z.infer<typeof assistedReviewSchema>;

export const assistedExecutionEnvelopeSchema = z.object({
  contractVersion: z.literal(1),
  envelopeId: z.string().uuid(),
  proposalId: z.string().uuid(),
  proposalHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewId: z.string().uuid(),
  reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
  field: fieldRefSchema,
  sceneVersion: z.number().int().nonnegative(),
  sceneHash: z.string().regex(/^[a-f0-9]{64}$/),
  policyHash: z.string().regex(/^[a-f0-9]{64}$/),
  approvedStepOrdinals: z.array(z.number().int().nonnegative()).min(1).max(100),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  consumed: z.literal(false),
  downstreamMustReobserve: z.literal(true),
  downstreamMustReauthorizeEachStep: z.literal(true),
  finalSubmissionRequiresInteractiveOwner: z.boolean(),
  executionAllowed: z.literal(false),
  actionAuthority: z.literal("none"),
  envelopeHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type AssistedExecutionEnvelope = z.infer<typeof assistedExecutionEnvelopeSchema>;

export function createAssistedProposal(input: {
  field: z.infer<typeof fieldRefSchema>;
  sceneVersion: number;
  sceneHash: string;
  policyHash: string;
  personaProfileHash: string;
  declaredRisk: AssistedRisk;
  steps: AssistedProposalStep[];
  createdAt?: string;
  ttlMs?: number;
  proposalId?: string;
}): AssistedProposal {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const ttlMs = input.ttlMs ?? 5 * 60_000;
  if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 15 * 60_000) throw new Error("Assisted proposal ttlMs must be from 1000 through 900000.");
  if (input.declaredRisk === "consequential") throw new Error("Consequential actions cannot be proposed in Assisted Mode.");
  const core = {
    contractVersion: 1 as const,
    proposalId: input.proposalId ?? randomUUID(),
    field: fieldRefSchema.parse(input.field),
    sceneVersion: input.sceneVersion,
    sceneHash: input.sceneHash,
    policyHash: input.policyHash,
    personaProfileHash: input.personaProfileHash,
    createdAt,
    expiresAt: new Date(new Date(createdAt).getTime() + ttlMs).toISOString(),
    declaredRisk: input.declaredRisk,
    steps: input.steps.map((step) => assistedProposalStepSchema.parse(structuredClone(step))),
    ownerReviewRequired: true as const,
    downstreamReauthorizationRequired: true as const,
    reusable: false as const,
    executionAllowed: false as const,
    actionAuthority: "none" as const,
  };
  return assistedProposalSchema.parse({ ...core, proposalHash: sha256Canonical(core) });
}

export function reviewAssistedProposal(input: {
  proposal: AssistedProposal;
  ownerId: string;
  decision: "approve_for_downstream_review" | "reject";
  approvedStepOrdinals?: number[];
  reason: string;
  reviewedAt?: string;
  reviewId?: string;
  localTransport: boolean;
  interactiveOwnerPresent: boolean;
}): AssistedReview {
  const proposal = verifyProposal(input.proposal);
  if (!input.localTransport || !input.interactiveOwnerPresent) throw new Error("Assisted proposal review requires an interactive local owner.");
  const reviewedAt = input.reviewedAt ?? new Date().toISOString();
  if (new Date(reviewedAt).getTime() > new Date(proposal.expiresAt).getTime()) throw new Error("Assisted proposal expired before owner review.");
  const approved = input.decision === "approve_for_downstream_review"
    ? [...new Set(input.approvedStepOrdinals ?? proposal.steps.map((step) => step.ordinal))].sort((a, b) => a - b)
    : [];
  if (approved.some((ordinal) => !proposal.steps.some((step) => step.ordinal === ordinal))) {
    throw new Error("Assisted review references a step outside the proposal.");
  }
  if (input.decision === "approve_for_downstream_review" && approved.length === 0) {
    throw new Error("An approved Assisted review requires at least one approved step.");
  }
  const core = {
    contractVersion: 1 as const,
    reviewId: input.reviewId ?? randomUUID(),
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash,
    ownerId: input.ownerId,
    actor: "owner_local" as const,
    localTransport: true as const,
    interactiveOwnerPresent: true as const,
    reviewedAt,
    decision: input.decision,
    approvedStepOrdinals: approved,
    reason: input.reason,
    modelMayReview: false as const,
    executionAllowed: false as const,
    actionAuthority: "none" as const,
  };
  return assistedReviewSchema.parse({ ...core, reviewHash: sha256Canonical(core) });
}

export function createAssistedExecutionEnvelope(input: {
  proposal: AssistedProposal;
  review: AssistedReview;
  issuedAt?: string;
  ttlMs?: number;
  envelopeId?: string;
}): AssistedExecutionEnvelope {
  const proposal = verifyProposal(input.proposal);
  const review = verifyReview(input.review);
  if (review.proposalId !== proposal.proposalId || review.proposalHash !== proposal.proposalHash) {
    throw new Error("Assisted review is not bound to the proposal.");
  }
  if (review.decision !== "approve_for_downstream_review") throw new Error("Rejected Assisted proposals cannot produce an execution envelope.");
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  if (new Date(issuedAt).getTime() > new Date(proposal.expiresAt).getTime()) throw new Error("Assisted proposal expired before envelope issuance.");
  const ttlMs = input.ttlMs ?? 60_000;
  if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 5 * 60_000) throw new Error("Assisted envelope ttlMs must be from 1000 through 300000.");
  const expiresAt = new Date(Math.min(new Date(proposal.expiresAt).getTime(), new Date(issuedAt).getTime() + ttlMs)).toISOString();
  const approvedSteps = proposal.steps.filter((step) => review.approvedStepOrdinals.includes(step.ordinal));
  const core = {
    contractVersion: 1 as const,
    envelopeId: input.envelopeId ?? randomUUID(),
    proposalId: proposal.proposalId,
    proposalHash: proposal.proposalHash,
    reviewId: review.reviewId,
    reviewHash: review.reviewHash,
    field: structuredClone(proposal.field),
    sceneVersion: proposal.sceneVersion,
    sceneHash: proposal.sceneHash,
    policyHash: proposal.policyHash,
    approvedStepOrdinals: review.approvedStepOrdinals,
    issuedAt,
    expiresAt,
    consumed: false as const,
    downstreamMustReobserve: true as const,
    downstreamMustReauthorizeEachStep: true as const,
    finalSubmissionRequiresInteractiveOwner: approvedSteps.some((step) => step.finalSubmission || step.externalCommitment),
    executionAllowed: false as const,
    actionAuthority: "none" as const,
  };
  return assistedExecutionEnvelopeSchema.parse({ ...core, envelopeHash: sha256Canonical(core) });
}

export class AssistedEnvelopeReplayGuard {
  readonly #consumed = new Set<string>();

  consume(input: AssistedExecutionEnvelope, context: {
    field: z.infer<typeof fieldRefSchema>;
    sceneVersion: number;
    sceneHash: string;
    policyHash: string;
    now?: string;
  }): AssistedExecutionEnvelope {
    const envelope = verifyEnvelope(input);
    const now = context.now ?? new Date().toISOString();
    if (this.#consumed.has(envelope.envelopeId)) throw new Error("Assisted envelope was already consumed.");
    if (new Date(now).getTime() > new Date(envelope.expiresAt).getTime()) throw new Error("Assisted envelope expired.");
    if (!sameField(envelope.field, context.field)) throw new Error("Assisted envelope Field generation changed.");
    if (envelope.sceneVersion !== context.sceneVersion || envelope.sceneHash !== context.sceneHash) throw new Error("Assisted envelope scene is stale.");
    if (envelope.policyHash !== context.policyHash) throw new Error("Assisted envelope policy changed.");
    this.#consumed.add(envelope.envelopeId);
    return structuredClone(envelope);
  }
}

function verifyProposal(input: AssistedProposal): AssistedProposal {
  const proposal = assistedProposalSchema.parse(structuredClone(input));
  const { proposalHash, ...core } = proposal;
  if (sha256Canonical(core) !== proposalHash) throw new Error("Assisted proposal integrity verification failed.");
  return proposal;
}

function verifyReview(input: AssistedReview): AssistedReview {
  const review = assistedReviewSchema.parse(structuredClone(input));
  const { reviewHash, ...core } = review;
  if (sha256Canonical(core) !== reviewHash) throw new Error("Assisted review integrity verification failed.");
  return review;
}

function verifyEnvelope(input: AssistedExecutionEnvelope): AssistedExecutionEnvelope {
  const envelope = assistedExecutionEnvelopeSchema.parse(structuredClone(input));
  const { envelopeHash, ...core } = envelope;
  if (sha256Canonical(core) !== envelopeHash) throw new Error("Assisted envelope integrity verification failed.");
  return envelope;
}

function sameField(left: z.infer<typeof fieldRefSchema>, right: z.infer<typeof fieldRefSchema>): boolean {
  return left.fieldId === right.fieldId && left.fieldGeneration === right.fieldGeneration;
}
