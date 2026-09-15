import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fieldRefSchema, sha256Canonical } from "./fieldContracts.js";
import { shadowPredictionSchema, type ShadowPrediction } from "./shadowLearning.js";

export const shadowCapabilitySchema = z.object({
  contractVersion: z.literal(1),
  sessionId: z.string().uuid(),
  field: fieldRefSchema,
  processInstanceId: z.string().uuid(),
  modelVersion: z.string().min(1).max(200),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  mayObserveScene: z.literal(true),
  mayReadRetrievalIndex: z.literal(true),
  mayPredict: z.literal(true),
  mayUseNetwork: z.literal(false),
  mayReadCredentials: z.literal(false),
  mayAuthorize: z.literal(false),
  mayInvokeCommands: z.literal(false),
  mayInjectInput: z.literal(false),
  mayAdministerField: z.literal(false),
  actionAuthority: z.literal("none"),
  capabilityHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ShadowCapability = z.infer<typeof shadowCapabilitySchema>;

export const shadowObservationRequestSchema = z.object({
  requestId: z.string().uuid(),
  sessionId: z.string().uuid(),
  field: fieldRefSchema,
  observationId: z.string().min(1).max(300),
  sceneVersion: z.number().int().nonnegative(),
  sceneHash: z.string().regex(/^[a-f0-9]{64}$/),
  requestedAt: z.string().datetime(),
  features: z.array(z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,99}$/)).min(1).max(100),
  layoutFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ShadowObservationRequest = z.infer<typeof shadowObservationRequestSchema>;

export const shadowPredictionReceiptSchema = z.object({
  contractVersion: z.literal(1),
  requestId: z.string().uuid(),
  sessionId: z.string().uuid(),
  field: fieldRefSchema,
  observationId: z.string().min(1).max(300),
  sceneVersion: z.number().int().nonnegative(),
  sceneHash: z.string().regex(/^[a-f0-9]{64}$/),
  prediction: shadowPredictionSchema,
  receivedAt: z.string().datetime(),
  executionForwarded: z.literal(false),
  inputInjected: z.literal(false),
  actionAuthority: z.literal("none"),
  receiptHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ShadowPredictionReceipt = z.infer<typeof shadowPredictionReceiptSchema>;

export interface ShadowPredictorPort {
  predict(request: ShadowObservationRequest): Promise<ShadowPrediction> | ShadowPrediction;
}

export function issueShadowCapability(input: {
  field: z.infer<typeof fieldRefSchema>;
  processInstanceId: string;
  modelVersion: string;
  issuedAt?: string;
  ttlMs?: number;
  sessionId?: string;
}): ShadowCapability {
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const ttlMs = input.ttlMs ?? 30 * 60_000;
  if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 8 * 60 * 60_000) throw new Error("Shadow capability ttlMs must be from 1000 through 28800000.");
  const core = {
    contractVersion: 1 as const,
    sessionId: input.sessionId ?? randomUUID(),
    field: fieldRefSchema.parse(input.field),
    processInstanceId: input.processInstanceId,
    modelVersion: input.modelVersion,
    issuedAt,
    expiresAt: new Date(new Date(issuedAt).getTime() + ttlMs).toISOString(),
    mayObserveScene: true as const,
    mayReadRetrievalIndex: true as const,
    mayPredict: true as const,
    mayUseNetwork: false as const,
    mayReadCredentials: false as const,
    mayAuthorize: false as const,
    mayInvokeCommands: false as const,
    mayInjectInput: false as const,
    mayAdministerField: false as const,
    actionAuthority: "none" as const,
  };
  return shadowCapabilitySchema.parse({ ...core, capabilityHash: sha256Canonical(core) });
}

export class ShadowPredictionOnlyGateway {
  readonly #capability: ShadowCapability;
  readonly #predictor: ShadowPredictorPort;
  readonly #seenRequests = new Set<string>();

  constructor(capabilityInput: ShadowCapability, predictor: ShadowPredictorPort) {
    this.#capability = verifyCapability(capabilityInput);
    this.#predictor = predictor;
  }

  capability(): ShadowCapability {
    return structuredClone(this.#capability);
  }

  async predict(requestInput: ShadowObservationRequest, receivedAt = new Date().toISOString()): Promise<ShadowPredictionReceipt> {
    const request = shadowObservationRequestSchema.parse(structuredClone(requestInput));
    if (this.#seenRequests.has(request.requestId)) throw new Error("A Shadow observation request may be processed only once.");
    if (new Date(request.requestedAt).getTime() > new Date(this.#capability.expiresAt).getTime() || new Date(receivedAt).getTime() > new Date(this.#capability.expiresAt).getTime()) {
      throw new Error("Shadow capability expired.");
    }
    if (request.sessionId !== this.#capability.sessionId || !sameField(request.field, this.#capability.field)) {
      throw new Error("Shadow request is not bound to this session and Field generation.");
    }
    const prediction = shadowPredictionSchema.parse(await this.#predictor.predict(structuredClone(request)));
    if (prediction.executionAllowed !== false) throw new Error("Shadow predictor attempted to return executable output.");
    if (!sameField(prediction.field, request.field) || prediction.observationId !== request.observationId) {
      throw new Error("Shadow prediction is not bound to the requested Field observation.");
    }
    if (prediction.modelVersion !== this.#capability.modelVersion) throw new Error("Shadow prediction model version does not match the capability.");
    this.#seenRequests.add(request.requestId);
    const core = {
      contractVersion: 1 as const,
      requestId: request.requestId,
      sessionId: request.sessionId,
      field: structuredClone(request.field),
      observationId: request.observationId,
      sceneVersion: request.sceneVersion,
      sceneHash: request.sceneHash,
      prediction: structuredClone(prediction),
      receivedAt,
      executionForwarded: false as const,
      inputInjected: false as const,
      actionAuthority: "none" as const,
    };
    return shadowPredictionReceiptSchema.parse({ ...core, receiptHash: sha256Canonical(core) });
  }
}

export function verifyShadowReceipt(input: ShadowPredictionReceipt): boolean {
  const receipt = shadowPredictionReceiptSchema.parse(structuredClone(input));
  const { receiptHash, ...core } = receipt;
  return sha256Canonical(core) === receiptHash
    && receipt.executionForwarded === false
    && receipt.inputInjected === false
    && receipt.prediction.executionAllowed === false;
}

function verifyCapability(input: ShadowCapability): ShadowCapability {
  const capability = shadowCapabilitySchema.parse(structuredClone(input));
  const { capabilityHash, ...core } = capability;
  if (sha256Canonical(core) !== capabilityHash) throw new Error("Shadow capability integrity verification failed.");
  return capability;
}

function sameField(left: z.infer<typeof fieldRefSchema>, right: z.infer<typeof fieldRefSchema>): boolean {
  return left.fieldId === right.fieldId && left.fieldGeneration === right.fieldGeneration;
}
