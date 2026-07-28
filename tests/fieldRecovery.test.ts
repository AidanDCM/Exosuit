import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FieldRecoveryPlanner, fieldFailureReportSchema } from "../src/fieldRecovery.js";

const field = { fieldId: randomUUID(), fieldGeneration: 1 };

function failure(overrides: Record<string, unknown> = {}) {
  return fieldFailureReportSchema.parse({
    failureId: randomUUID(),
    field,
    code: "transient_guest_operation",
    operationId: "operation-a",
    occurredAt: "2026-07-21T18:00:00.000Z",
    idempotent: true,
    externalEffect: "none",
    details: {},
    ...overrides,
  });
}

describe("Field recovery planner", () => {
  it("allows only bounded idempotent no-effect retries", () => {
    const planner = new FieldRecoveryPlanner({ field, maximumRetriesPerOperation: 1 });
    expect(planner.decide(failure())).toMatchObject({
      retryAllowed: true,
      retryAttempt: 1,
      actions: ["freeze_input", "observe_and_reconcile", "retry_idempotent_operation"],
    });
    expect(planner.retryCount("operation-a")).toBe(1);
    expect(planner.decide(failure())).toMatchObject({ retryAllowed: false, requiresOwnerReview: true });
  });

  it("never retries a possible unverified external effect", () => {
    const planner = new FieldRecoveryPlanner({ field });
    expect(planner.decide(failure({ externalEffect: "possible_unverified" }))).toMatchObject({
      retryAllowed: false,
      requiresOwnerReview: true,
      actions: ["freeze_input", "observe_and_reconcile", "require_owner_review", "deny_continuation"],
    });
  });

  it("quarantines artifact failures and aborts corrupted teaching evidence", () => {
    const planner = new FieldRecoveryPlanner({ field });
    expect(planner.decide(failure({ code: "artifact_hash_mismatch", idempotent: false }))).toMatchObject({
      retryAllowed: false,
      actions: ["freeze_input", "quarantine_artifact", "require_owner_review", "deny_continuation"],
    });
    expect(planner.decide(failure({ code: "recorder_fault", operationId: "recording-a", idempotent: false }))).toMatchObject({
      actions: ["freeze_input", "abort_demonstration", "require_owner_review", "deny_continuation"],
    });
  });

  it("requires a new Field generation after identity or trusted-state failures", () => {
    const planner = new FieldRecoveryPlanner({ field });
    for (const code of [
      "channel_authentication_failed",
      "channel_replay_detected",
      "guest_boot_changed",
      "display_contract_mismatch",
      "attestation_mismatch",
      "task_disk_corrupt",
    ] as const) {
      expect(planner.decide(failure({ code, operationId: code }))).toMatchObject({
        retryAllowed: false,
        requiresGenerationIncrement: true,
        actions: ["freeze_input", "stop_field", "destroy_task_disk", "increment_field_generation", "reprovision_field", "require_owner_review"],
      });
    }
  });

  it("treats emergency-stop failure as release blocking", () => {
    const planner = new FieldRecoveryPlanner({ field });
    expect(planner.decide(failure({ code: "emergency_stop_failed", idempotent: false }))).toMatchObject({
      retryAllowed: false,
      requiresOwnerReview: true,
      actions: ["deny_continuation", "require_owner_review"],
    });
  });

  it("rejects cross-generation reports and duplicate failure planning", () => {
    const planner = new FieldRecoveryPlanner({ field });
    expect(() => planner.decide(failure({ field: { ...field, fieldGeneration: 2 } }))).toThrow(/cross Field generations/);
    const value = failure();
    planner.decide(value);
    expect(() => planner.decide(value)).toThrow(/only once/);
  });
});
