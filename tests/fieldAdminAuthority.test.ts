import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FieldAdminDecisionLedger, decideFieldAdminRequest, fieldAdminRequestSchema } from "../src/fieldAdminAuthority.js";

const field = { fieldId: randomUUID(), fieldGeneration: 1 };

function request(overrides: Record<string, unknown> = {}) {
  return fieldAdminRequestSchema.parse({
    requestId: randomUUID(),
    field,
    actor: "owner_local",
    operation: "stop_field",
    localTransport: true,
    interactiveOwnerPresent: true,
    requestedAt: "2026-07-21T18:00:00.000Z",
    reason: "Owner requested this operation.",
    ...overrides,
  });
}

describe("Field administration authority", () => {
  it("blocks every pilot-model administration request", () => {
    for (const operation of [
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
    ] as const) {
      const decision = decideFieldAdminRequest(request({ actor: "pilot_model", operation, field: operation === "plan_field" ? undefined : field }));
      expect(decision).toMatchObject({ status: "block", rule: "pilot_has_no_admin_authority", modelMaySatisfyReview: false });
    }
  });

  it("requires local transport for owner and service actors", () => {
    expect(decideFieldAdminRequest(request({ localTransport: false }))).toMatchObject({ status: "block", rule: "local_transport_required" });
    expect(decideFieldAdminRequest(request({ actor: "field_service", localTransport: false }))).toMatchObject({ status: "block", rule: "local_transport_required" });
  });

  it("limits the Field service to lifecycle execution", () => {
    expect(decideFieldAdminRequest(request({ actor: "field_service", operation: "provision_field" }))).toMatchObject({ status: "allow", rule: "service_lifecycle_scope" });
    expect(decideFieldAdminRequest(request({ actor: "field_service", operation: "enter_pilot" }))).toMatchObject({ status: "block", rule: "service_scope" });
    expect(decideFieldAdminRequest(request({ actor: "field_service", operation: "export_sensitive_artifact" }))).toMatchObject({ status: "block", rule: "service_scope" });
  });

  it("requires interactive owner presence for consent key deletion and sensitive export operations", () => {
    for (const operation of ["enter_teach", "rotate_channel_key", "delete_demonstrations", "export_sensitive_artifact"] as const) {
      expect(decideFieldAdminRequest(request({ operation, interactiveOwnerPresent: false }))).toMatchObject({
        status: "review_required",
        rule: "interactive_owner_presence",
        modelMaySatisfyReview: false,
      });
      expect(decideFieldAdminRequest(request({ operation, interactiveOwnerPresent: true }))).toMatchObject({ status: "allow" });
    }
  });

  it("requires an exact Field generation and records one decision per request", () => {
    expect(decideFieldAdminRequest(request({ field: undefined, operation: "stop_field" }))).toMatchObject({ status: "block", rule: "field_required" });
    const ledger = new FieldAdminDecisionLedger();
    const value = request();
    expect(ledger.decide(value).status).toBe("allow");
    expect(() => ledger.decide(value)).toThrow(/only once/);
    expect(ledger.get(value.requestId)?.field).toEqual(field);
  });
});
