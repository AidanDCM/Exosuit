import { z } from "zod";
import { fieldRefSchema, type FieldRef } from "./fieldContracts.js";

export const fieldFailureCodeSchema = z.enum([
  "channel_authentication_failed",
  "channel_replay_detected",
  "heartbeat_expired",
  "guest_boot_changed",
  "display_contract_mismatch",
  "policy_expired",
  "attestation_mismatch",
  "artifact_hash_mismatch",
  "artifact_path_escape",
  "recorder_fault",
  "visual_budget_exceeded",
  "uncertain_external_effect",
  "transient_guest_operation",
  "task_disk_corrupt",
  "emergency_stop_failed",
]);
export type FieldFailureCode = z.infer<typeof fieldFailureCodeSchema>;

export const fieldRecoveryActionSchema = z.enum([
  "freeze_input",
  "observe_and_reconcile",
  "retry_idempotent_operation",
  "abort_demonstration",
  "quarantine_artifact",
  "stop_field",
  "destroy_task_disk",
  "reprovision_field",
  "increment_field_generation",
  "require_owner_review",
  "deny_continuation",
]);
export type FieldRecoveryAction = z.infer<typeof fieldRecoveryActionSchema>;

export const fieldFailureReportSchema = z.object({
  failureId: z.string().uuid(),
  field: fieldRefSchema,
  code: fieldFailureCodeSchema,
  operationId: z.string().min(1).max(300),
  occurredAt: z.string().datetime(),
  idempotent: z.boolean(),
  externalEffect: z.enum(["none", "verified", "possible_unverified"]),
  details: z.record(z.string(), z.unknown()),
});
export type FieldFailureReport = z.infer<typeof fieldFailureReportSchema>;

export interface FieldRecoveryDecision {
  failureId: string;
  field: FieldRef;
  actions: FieldRecoveryAction[];
  retryAllowed: boolean;
  retryAttempt: number;
  requiresOwnerReview: boolean;
  requiresGenerationIncrement: boolean;
  reason: string;
}

export class FieldRecoveryPlanner {
  readonly #field: FieldRef;
  readonly #maximumRetriesPerOperation: number;
  readonly #attempts = new Map<string, number>();
  readonly #handledFailures = new Set<string>();

  constructor(input: { field: FieldRef; maximumRetriesPerOperation?: number }) {
    this.#field = fieldRefSchema.parse(input.field);
    this.#maximumRetriesPerOperation = input.maximumRetriesPerOperation ?? 1;
    if (!Number.isInteger(this.#maximumRetriesPerOperation) || this.#maximumRetriesPerOperation < 0 || this.#maximumRetriesPerOperation > 10) {
      throw new Error("maximumRetriesPerOperation must be from 0 through 10.");
    }
  }

  decide(input: FieldFailureReport): FieldRecoveryDecision {
    const failure = fieldFailureReportSchema.parse(input);
    if (failure.field.fieldId !== this.#field.fieldId || failure.field.fieldGeneration !== this.#field.fieldGeneration) {
      throw new Error("Recovery report cannot cross Field generations.");
    }
    if (this.#handledFailures.has(failure.failureId)) throw new Error("Each Field failure may be planned only once.");
    this.#handledFailures.add(failure.failureId);

    if (failure.externalEffect === "possible_unverified") {
      return decision(failure, ["freeze_input", "observe_and_reconcile", "require_owner_review", "deny_continuation"], false, 0, true, false,
        "A possible external effect must be reconciled before any retry or continuation.");
    }

    switch (failure.code) {
      case "transient_guest_operation": {
        const prior = this.#attempts.get(failure.operationId) ?? 0;
        const nextAttempt = prior + 1;
        if (failure.idempotent && failure.externalEffect === "none" && prior < this.#maximumRetriesPerOperation) {
          this.#attempts.set(failure.operationId, nextAttempt);
          return decision(failure, ["freeze_input", "observe_and_reconcile", "retry_idempotent_operation"], true, nextAttempt, false, false,
            "The operation is idempotent, has no external effect, and remains inside the retry budget.");
        }
        return decision(failure, ["freeze_input", "observe_and_reconcile", "require_owner_review", "deny_continuation"], false, prior, true, false,
          "Transient retries are exhausted or the operation is not safe to repeat.");
      }
      case "artifact_hash_mismatch":
      case "artifact_path_escape":
        return decision(failure, ["freeze_input", "quarantine_artifact", "require_owner_review", "deny_continuation"], false, 0, true, false,
          "Artifact integrity or path scope failed; the artifact must be quarantined.");
      case "recorder_fault":
      case "visual_budget_exceeded":
        return decision(failure, ["freeze_input", "abort_demonstration", "require_owner_review", "deny_continuation"], false, 0, true, false,
          "Teaching evidence is incomplete or exceeded its approved recording budget.");
      case "channel_authentication_failed":
      case "channel_replay_detected":
      case "guest_boot_changed":
      case "display_contract_mismatch":
      case "attestation_mismatch":
      case "task_disk_corrupt":
        return decision(failure, ["freeze_input", "stop_field", "destroy_task_disk", "increment_field_generation", "reprovision_field", "require_owner_review"], false, 0, true, true,
          "Field identity, isolation, or trusted state changed and requires a new generation.");
      case "heartbeat_expired":
        return decision(failure, ["freeze_input", "observe_and_reconcile", "stop_field", "increment_field_generation", "reprovision_field"], false, 0, false, true,
          "Guest liveness expired; stop and rebuild instead of continuing blind.");
      case "policy_expired":
        return decision(failure, ["freeze_input", "stop_field", "deny_continuation"], false, 0, false, false,
          "Expired policy cannot authorize further Field operation.");
      case "uncertain_external_effect":
        return decision(failure, ["freeze_input", "observe_and_reconcile", "require_owner_review", "deny_continuation"], false, 0, true, false,
          "Uncertain effects require reconciliation and explicit review.");
      case "emergency_stop_failed":
        return decision(failure, ["deny_continuation", "require_owner_review"], false, 0, true, false,
          "Emergency stop failure is release-blocking and must not trigger automated recovery.");
    }
  }

  retryCount(operationId: string): number {
    return this.#attempts.get(operationId) ?? 0;
  }
}

function decision(
  failure: FieldFailureReport,
  actions: FieldRecoveryAction[],
  retryAllowed: boolean,
  retryAttempt: number,
  requiresOwnerReview: boolean,
  requiresGenerationIncrement: boolean,
  reason: string,
): FieldRecoveryDecision {
  return {
    failureId: failure.failureId,
    field: structuredClone(failure.field),
    actions: [...actions],
    retryAllowed,
    retryAttempt,
    requiresOwnerReview,
    requiresGenerationIncrement,
    reason,
  };
}
