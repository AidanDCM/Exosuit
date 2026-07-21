import { z } from "zod";
import { fieldRefSchema, type FieldRef } from "./fieldContracts.js";

export const fieldAdminActorSchema = z.enum(["owner_local", "field_service", "pilot_model"]);
export type FieldAdminActor = z.infer<typeof fieldAdminActorSchema>;

export const fieldAdminOperationSchema = z.enum([
  "plan_field",
  "provision_field",
  "enter_teach",
  "enter_shadow",
  "enter_pilot",
  "stop_field",
  "destroy_field",
  "rotate_channel_key",
  "delete_demonstrations",
  "export_sensitive_artifact",
]);
export type FieldAdminOperation = z.infer<typeof fieldAdminOperationSchema>;

export const fieldAdminRequestSchema = z.object({
  requestId: z.string().uuid(),
  field: fieldRefSchema.optional(),
  actor: fieldAdminActorSchema,
  operation: fieldAdminOperationSchema,
  localTransport: z.boolean(),
  interactiveOwnerPresent: z.boolean(),
  requestedAt: z.string().datetime(),
  reason: z.string().min(1).max(1_000),
});
export type FieldAdminRequest = z.infer<typeof fieldAdminRequestSchema>;

export const fieldAdminDecisionSchema = z.object({
  requestId: z.string().uuid(),
  field: fieldRefSchema.optional(),
  status: z.enum(["allow", "review_required", "block"]),
  rule: z.string().min(1).max(200),
  reason: z.string().min(1).max(1_000),
  modelMaySatisfyReview: z.literal(false),
});
export type FieldAdminDecision = z.infer<typeof fieldAdminDecisionSchema>;

const serviceOperations = new Set<FieldAdminOperation>(["provision_field", "stop_field", "destroy_field"]);
const ownerPresenceOperations = new Set<FieldAdminOperation>([
  "enter_teach",
  "rotate_channel_key",
  "delete_demonstrations",
  "export_sensitive_artifact",
]);
const operationsRequiringExistingField = new Set<FieldAdminOperation>([
  "provision_field",
  "enter_teach",
  "enter_shadow",
  "enter_pilot",
  "stop_field",
  "destroy_field",
  "rotate_channel_key",
  "delete_demonstrations",
  "export_sensitive_artifact",
]);

export function decideFieldAdminRequest(input: FieldAdminRequest): FieldAdminDecision {
  const request = fieldAdminRequestSchema.parse(input);
  if (operationsRequiringExistingField.has(request.operation) && !request.field) {
    return blocked(request, "field_required", "This administration operation requires an exact Field generation.");
  }
  if (!request.localTransport) {
    return blocked(request, "local_transport_required", "Field administration is restricted to an authenticated local transport.");
  }
  if (request.actor === "pilot_model") {
    return blocked(request, "pilot_has_no_admin_authority", "A pilot or model cannot create consent, policy, VM, key, deletion, or export authority.");
  }
  if (request.actor === "field_service") {
    if (!serviceOperations.has(request.operation)) {
      return blocked(request, "service_scope", "The Field service is limited to reviewed lifecycle execution and cannot grant operating authority.");
    }
    return allowed(request, "service_lifecycle_scope", "The local Field service may execute this pre-authorized lifecycle operation.");
  }
  if (ownerPresenceOperations.has(request.operation) && !request.interactiveOwnerPresent) {
    return {
      requestId: request.requestId,
      ...(request.field ? { field: structuredClone(request.field) } : {}),
      status: "review_required",
      rule: "interactive_owner_presence",
      reason: "This operation requires an interactive local owner confirmation that cannot be supplied by a model.",
      modelMaySatisfyReview: false,
    };
  }
  return allowed(request, "local_owner_authority", "The interactive local owner may perform this bounded administration operation.");
}

export class FieldAdminDecisionLedger {
  readonly #decisions = new Map<string, FieldAdminDecision>();

  decide(input: FieldAdminRequest): FieldAdminDecision {
    const request = fieldAdminRequestSchema.parse(input);
    if (this.#decisions.has(request.requestId)) throw new Error("A Field administration request may be decided only once.");
    const decision = decideFieldAdminRequest(request);
    this.#decisions.set(request.requestId, structuredClone(decision));
    return structuredClone(decision);
  }

  get(requestId: string): FieldAdminDecision | undefined {
    const decision = this.#decisions.get(requestId);
    return decision ? structuredClone(decision) : undefined;
  }

  list(): FieldAdminDecision[] {
    return [...this.#decisions.values()].map((decision) => structuredClone(decision));
  }
}

function allowed(request: FieldAdminRequest, rule: string, reason: string): FieldAdminDecision {
  return {
    requestId: request.requestId,
    ...(request.field ? { field: structuredClone(request.field) } : {}),
    status: "allow",
    rule,
    reason,
    modelMaySatisfyReview: false,
  };
}

function blocked(request: FieldAdminRequest, rule: string, reason: string): FieldAdminDecision {
  return {
    requestId: request.requestId,
    ...(request.field ? { field: structuredClone(request.field) } : {}),
    status: "block",
    rule,
    reason,
    modelMaySatisfyReview: false,
  };
}

export function sameField(left: FieldRef | undefined, right: FieldRef | undefined): boolean {
  if (!left || !right) return left === right;
  return left.fieldId === right.fieldId && left.fieldGeneration === right.fieldGeneration;
}
