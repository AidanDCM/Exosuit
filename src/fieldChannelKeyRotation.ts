import { z } from "zod";
import {
  decideFieldAdminRequest,
  fieldAdminRequestSchema,
  type FieldAdminRequest,
} from "./fieldAdminAuthority.js";
import { fieldRefSchema, type FieldRef } from "./fieldContracts.js";

const keyIdSchema = z.string().trim().min(1).max(200);
const rotationStatusSchema = z.enum(["committed", "rolled_back", "blocked_uncertain"]);

export const fieldChannelKeyRotationRequestSchema = z.object({
  rotationId: z.string().uuid(),
  field: fieldRefSchema,
  currentKeyId: keyIdSchema,
  nextKeyId: keyIdSchema,
  nextSecretHandle: z.string().trim().min(1).max(500),
  authorization: fieldAdminRequestSchema,
});
export type FieldChannelKeyRotationRequest = z.infer<typeof fieldChannelKeyRotationRequestSchema>;

export const fieldChannelKeyRotationResultSchema = z.object({
  rotationId: z.string().uuid(),
  field: fieldRefSchema,
  priorKeyId: keyIdSchema,
  requestedKeyId: keyIdSchema,
  activeKeyId: keyIdSchema.nullable(),
  status: rotationStatusSchema,
  reconciled: z.boolean(),
  completedAt: z.string().datetime(),
  reason: z.string().min(1).max(1_000),
});
export type FieldChannelKeyRotationResult = z.infer<typeof fieldChannelKeyRotationResultSchema>;

export const fieldChannelKeyRotationStateSchema = z.object({
  contractVersion: z.literal(1),
  field: fieldRefSchema,
  activeKeyId: keyIdSchema,
  continuationBlocked: z.boolean(),
  recentRotationIds: z.array(z.string().uuid()).max(128),
  lastResult: fieldChannelKeyRotationResultSchema.optional(),
}).superRefine((state, context) => {
  if (new Set(state.recentRotationIds).size !== state.recentRotationIds.length) {
    context.addIssue({ code: "custom", path: ["recentRotationIds"], message: "Recent rotation IDs must be unique." });
  }
  if (!state.lastResult) {
    if (state.continuationBlocked) context.addIssue({ code: "custom", path: ["continuationBlocked"], message: "Blocked rotation state requires a result." });
    return;
  }
  if (!sameField(state.lastResult.field, state.field) || !state.recentRotationIds.includes(state.lastResult.rotationId)) {
    context.addIssue({ code: "custom", path: ["lastResult"], message: "The last rotation result is not bound to this state." });
  }
  if (state.continuationBlocked !== (state.lastResult.status === "blocked_uncertain")) {
    context.addIssue({ code: "custom", path: ["continuationBlocked"], message: "Blocked state and the last rotation result disagree." });
  }
  if (!state.continuationBlocked && state.lastResult.activeKeyId !== state.activeKeyId) {
    context.addIssue({ code: "custom", path: ["activeKeyId"], message: "Active key ID and the last rotation result disagree." });
  }
});
export type FieldChannelKeyRotationState = z.infer<typeof fieldChannelKeyRotationStateSchema>;

const preparedReceiptSchema = z.object({
  contractVersion: z.literal(1),
  rotationId: z.string().uuid(),
  field: fieldRefSchema,
  priorKeyId: keyIdSchema,
  nextKeyId: keyIdSchema,
  guestAcknowledged: z.literal(true),
  preparedAt: z.string().datetime(),
});

const committedReceiptSchema = z.object({
  contractVersion: z.literal(1),
  rotationId: z.string().uuid(),
  field: fieldRefSchema,
  activeKeyId: keyIdSchema,
  committedAt: z.string().datetime(),
});

const rollbackReceiptSchema = z.object({
  contractVersion: z.literal(1),
  rotationId: z.string().uuid(),
  field: fieldRefSchema,
  activeKeyId: keyIdSchema,
  rolledBack: z.literal(true),
  completedAt: z.string().datetime(),
});

const reconciliationReceiptSchema = z.object({
  contractVersion: z.literal(1),
  rotationId: z.string().uuid(),
  field: fieldRefSchema,
  priorKeyId: keyIdSchema,
  nextKeyId: keyIdSchema,
  state: z.enum(["current_active", "next_prepared", "next_active", "unknown"]),
  observedAt: z.string().datetime(),
});

export interface FieldChannelKeyRotationProvider {
  readonly name: string;
  prepare(input: {
    rotationId: string;
    field: FieldRef;
    priorKeyId: string;
    nextKeyId: string;
    nextSecretHandle: string;
  }): Promise<unknown>;
  commit(input: { rotationId: string; field: FieldRef; priorKeyId: string; nextKeyId: string }): Promise<unknown>;
  reconcile(input: { rotationId: string; field: FieldRef; priorKeyId: string; nextKeyId: string }): Promise<unknown>;
  rollback(input: { rotationId: string; field: FieldRef; priorKeyId: string; nextKeyId: string }): Promise<unknown>;
}

export class FieldChannelKeyRotationCoordinator {
  readonly #provider: FieldChannelKeyRotationProvider;
  #state: FieldChannelKeyRotationState;
  #inProgress = false;

  constructor(input: {
    provider: FieldChannelKeyRotationProvider;
    field?: FieldRef;
    activeKeyId?: string;
    state?: FieldChannelKeyRotationState;
  }) {
    this.#provider = input.provider;
    if (input.state) {
      this.#state = fieldChannelKeyRotationStateSchema.parse(structuredClone(input.state));
    } else {
      if (!input.field || !input.activeKeyId) throw new Error("A Field and active key ID are required for rotation state.");
      this.#state = fieldChannelKeyRotationStateSchema.parse({
        contractVersion: 1,
        field: input.field,
        activeKeyId: input.activeKeyId,
        continuationBlocked: false,
        recentRotationIds: [],
      });
    }
  }

  exportState(): FieldChannelKeyRotationState {
    return structuredClone(this.#state);
  }

  isActiveKeyId(keyId: string): boolean {
    return !this.#state.continuationBlocked && keyId === this.#state.activeKeyId;
  }

  async rotate(input: FieldChannelKeyRotationRequest, now = new Date()): Promise<FieldChannelKeyRotationResult> {
    const request = fieldChannelKeyRotationRequestSchema.parse(input);
    this.#validateRequest(request, now);
    if (this.#inProgress) throw new Error("A Field channel-key rotation is already in progress.");
    this.#inProgress = true;
    this.#rememberRotation(request.rotationId);
    try {
      try {
        const prepared = preparedReceiptSchema.parse(await this.#provider.prepare({
          rotationId: request.rotationId,
          field: structuredClone(request.field),
          priorKeyId: request.currentKeyId,
          nextKeyId: request.nextKeyId,
          nextSecretHandle: request.nextSecretHandle,
        }));
        requireReceiptIdentity(prepared, request);
        requireFreshReceipt(prepared.preparedAt, now);

        const committed = committedReceiptSchema.parse(await this.#provider.commit({
          rotationId: request.rotationId,
          field: structuredClone(request.field),
          priorKeyId: request.currentKeyId,
          nextKeyId: request.nextKeyId,
        }));
        requireFieldAndRotation(committed, request);
        requireFreshReceipt(committed.committedAt, now);
        if (committed.activeKeyId !== request.nextKeyId) throw new Error("Rotation commit did not activate the requested key ID.");
        return this.#complete(request, "committed", request.nextKeyId, false, now,
          "The provider prepared and committed the owner-authorized channel key rotation.");
      } catch (error) {
        return await this.#reconcileFailure(request, now, error);
      }
    } finally {
      this.#inProgress = false;
    }
  }

  #validateRequest(request: FieldChannelKeyRotationRequest, now: Date): void {
    if (this.#state.continuationBlocked) throw new Error("Channel-key rotation is blocked pending local owner reconciliation.");
    if (!sameField(request.field, this.#state.field)) throw new Error("Channel-key rotation cannot cross Field generations.");
    if (request.currentKeyId !== this.#state.activeKeyId) throw new Error("Channel-key rotation current key does not match local authority.");
    if (request.nextKeyId === request.currentKeyId) throw new Error("Channel-key rotation requires a distinct new key ID.");
    if (this.#state.recentRotationIds.includes(request.rotationId)) throw new Error("Channel-key rotation IDs cannot be replayed.");
    if (request.authorization.requestId !== request.rotationId || request.authorization.operation !== "rotate_channel_key" ||
        !request.authorization.field || !sameField(request.authorization.field, request.field)) {
      throw new Error("Channel-key rotation authorization is not bound to this exact request and Field generation.");
    }
    const requestedAt = new Date(request.authorization.requestedAt).getTime();
    if (requestedAt > now.getTime() + 30_000 || now.getTime() - requestedAt > 5 * 60_000) {
      throw new Error("Channel-key rotation authorization is outside its freshness window.");
    }
    const decision = decideFieldAdminRequest(request.authorization as FieldAdminRequest);
    if (decision.status !== "allow" || request.authorization.actor !== "owner_local") {
      throw new Error("Channel-key rotation requires an interactive local owner authorization.");
    }
  }

  async #reconcileFailure(
    request: FieldChannelKeyRotationRequest,
    now: Date,
    cause: unknown,
  ): Promise<FieldChannelKeyRotationResult> {
    void cause;
    try {
      const reconciliation = reconciliationReceiptSchema.parse(await this.#provider.reconcile({
        rotationId: request.rotationId,
        field: structuredClone(request.field),
        priorKeyId: request.currentKeyId,
        nextKeyId: request.nextKeyId,
      }));
      requireReceiptIdentity(reconciliation, request);
      requireFreshReceipt(reconciliation.observedAt, now);
      if (reconciliation.state === "next_active") {
        return this.#complete(request, "committed", request.nextKeyId, true, now,
          "The provider effect reconciled to the requested key after a provider error.");
      }
      if (reconciliation.state === "current_active") {
        return this.#complete(request, "rolled_back", request.currentKeyId, true, now,
          "The provider effect reconciled to the prior key after a provider error.");
      }
      if (reconciliation.state === "next_prepared") {
        const rollback = rollbackReceiptSchema.parse(await this.#provider.rollback({
          rotationId: request.rotationId,
          field: structuredClone(request.field),
          priorKeyId: request.currentKeyId,
          nextKeyId: request.nextKeyId,
        }));
        requireFieldAndRotation(rollback, request);
        requireFreshReceipt(rollback.completedAt, now);
        if (rollback.activeKeyId !== request.currentKeyId) throw new Error("Rotation rollback did not restore the prior key ID.");
        return this.#complete(request, "rolled_back", request.currentKeyId, true, now,
          "A prepared key was rolled back after a provider error.");
      }
      return this.#blockUncertain(request, now, "Provider reconciliation could not prove which key is active.");
    } catch (reconciliationError) {
      void reconciliationError;
      return this.#blockUncertain(request, now, "Provider reconciliation or rollback failed; no key is trusted as active.");
    }
  }

  #complete(
    request: FieldChannelKeyRotationRequest,
    status: "committed" | "rolled_back",
    activeKeyId: string,
    reconciled: boolean,
    now: Date,
    reason: string,
  ): FieldChannelKeyRotationResult {
    const result = fieldChannelKeyRotationResultSchema.parse({
      rotationId: request.rotationId,
      field: request.field,
      priorKeyId: request.currentKeyId,
      requestedKeyId: request.nextKeyId,
      activeKeyId,
      status,
      reconciled,
      completedAt: now.toISOString(),
      reason,
    });
    this.#state.activeKeyId = activeKeyId;
    this.#state.lastResult = structuredClone(result);
    return structuredClone(result);
  }

  #blockUncertain(request: FieldChannelKeyRotationRequest, now: Date, reason: string): FieldChannelKeyRotationResult {
    const result = fieldChannelKeyRotationResultSchema.parse({
      rotationId: request.rotationId,
      field: request.field,
      priorKeyId: request.currentKeyId,
      requestedKeyId: request.nextKeyId,
      activeKeyId: null,
      status: "blocked_uncertain",
      reconciled: true,
      completedAt: now.toISOString(),
      reason,
    });
    this.#state.continuationBlocked = true;
    this.#state.lastResult = structuredClone(result);
    return structuredClone(result);
  }

  #rememberRotation(rotationId: string): void {
    this.#state.recentRotationIds.push(rotationId);
    if (this.#state.recentRotationIds.length > 128) this.#state.recentRotationIds.shift();
  }
}

export class FakeFieldChannelKeyRotationProvider implements FieldChannelKeyRotationProvider {
  readonly name = "fake-field-channel-key-rotation-provider";
  readonly events: string[] = [];
  #state: "current_active" | "next_prepared" | "next_active" | "unknown" = "current_active";
  readonly #failPrepare: boolean;
  readonly #failCommit: boolean;
  readonly #failRollback: boolean;
  readonly #forcedReconciliation?: "current_active" | "next_prepared" | "next_active" | "unknown";

  constructor(options: {
    failPrepare?: boolean;
    failCommit?: boolean;
    failRollback?: boolean;
    forcedReconciliation?: "current_active" | "next_prepared" | "next_active" | "unknown";
  } = {}) {
    this.#failPrepare = options.failPrepare ?? false;
    this.#failCommit = options.failCommit ?? false;
    this.#failRollback = options.failRollback ?? false;
    this.#forcedReconciliation = options.forcedReconciliation;
  }

  async prepare(input: Parameters<FieldChannelKeyRotationProvider["prepare"]>[0]): Promise<unknown> {
    this.events.push(`prepare:${input.rotationId}`);
    if (this.#failPrepare) throw new Error("Fake rotation prepare failed.");
    this.#state = "next_prepared";
    return receipt(input, { guestAcknowledged: true, preparedAt: "2026-08-01T06:00:01.000Z" });
  }

  async commit(input: Parameters<FieldChannelKeyRotationProvider["commit"]>[0]): Promise<unknown> {
    this.events.push(`commit:${input.rotationId}`);
    if (this.#failCommit) throw new Error("Fake rotation commit failed.");
    this.#state = "next_active";
    return { contractVersion: 1, rotationId: input.rotationId, field: input.field, activeKeyId: input.nextKeyId, committedAt: "2026-08-01T06:00:02.000Z" };
  }

  async reconcile(input: Parameters<FieldChannelKeyRotationProvider["reconcile"]>[0]): Promise<unknown> {
    this.events.push(`reconcile:${input.rotationId}`);
    return receipt(input, { state: this.#forcedReconciliation ?? this.#state, observedAt: "2026-08-01T06:00:03.000Z" });
  }

  async rollback(input: Parameters<FieldChannelKeyRotationProvider["rollback"]>[0]): Promise<unknown> {
    this.events.push(`rollback:${input.rotationId}`);
    if (this.#failRollback) throw new Error("Fake rotation rollback failed.");
    this.#state = "current_active";
    return { contractVersion: 1, rotationId: input.rotationId, field: input.field, activeKeyId: input.priorKeyId, rolledBack: true, completedAt: "2026-08-01T06:00:04.000Z" };
  }
}

function receipt(
  input: { rotationId: string; field: FieldRef; priorKeyId: string; nextKeyId: string },
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return { contractVersion: 1, rotationId: input.rotationId, field: input.field, priorKeyId: input.priorKeyId, nextKeyId: input.nextKeyId, ...extra };
}

function requireReceiptIdentity(
  receiptValue: { rotationId: string; field: FieldRef; priorKeyId: string; nextKeyId: string },
  request: FieldChannelKeyRotationRequest,
): void {
  requireFieldAndRotation(receiptValue, request);
  if (receiptValue.priorKeyId !== request.currentKeyId || receiptValue.nextKeyId !== request.nextKeyId) {
    throw new Error("Rotation provider receipt key identity is invalid.");
  }
}

function requireFieldAndRotation(
  receiptValue: { rotationId: string; field: FieldRef },
  request: FieldChannelKeyRotationRequest,
): void {
  if (receiptValue.rotationId !== request.rotationId || !sameField(receiptValue.field, request.field)) {
    throw new Error("Rotation provider receipt is not bound to the exact request and Field generation.");
  }
}

function sameField(left: FieldRef, right: FieldRef): boolean {
  return left.fieldId === right.fieldId && left.fieldGeneration === right.fieldGeneration;
}

function requireFreshReceipt(timestamp: string, now: Date): void {
  const receiptTime = new Date(timestamp).getTime();
  if (receiptTime > now.getTime() + 30_000 || now.getTime() - receiptTime > 5 * 60_000) {
    throw new Error("Rotation provider receipt is outside its freshness window.");
  }
}
