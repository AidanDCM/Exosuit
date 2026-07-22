import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FieldCommandAuthorizer, fieldGuestCommandSchema } from "../src/fieldCommand.js";
import { fieldPolicySchema, sha256Canonical } from "../src/fieldContracts.js";

const field = { fieldId: randomUUID(), fieldGeneration: 1 };

function policy(mode: "teach" | "shadow" | "pilot" = "pilot") {
  return fieldPolicySchema.parse({
    contractVersion: 1,
    policyId: randomUUID(),
    field,
    mode,
    allowedProcesses: ["notepad"],
    allowedCapabilities: mode === "pilot" ? ["observe_desktop", "semantic_input", "physical_input"] : mode === "shadow" ? ["observe_desktop", "predict_next_action"] : ["observe_desktop", "record_demonstration"],
    allowedOrigins: [],
    maximumRuntimeSeconds: 3_600,
    maximumActions: 2,
    recordingConsent: mode === "teach" ? "granted" : "not_applicable",
    allowHostDesktopAccess: false,
    allowHostDriveWrite: false,
    allowPrivilegeEscalation: false,
    allowSecurityControlChanges: false,
    issuedAt: "2026-07-21T18:00:00.000Z",
    expiresAt: "2026-07-21T19:00:00.000Z",
  });
}

function base(kind: string, overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: 1,
    commandId: randomUUID(),
    field,
    issuedBy: "glove_host",
    kind,
    issuedAt: "2026-07-21T18:00:00.000Z",
    expiresAt: "2026-07-21T18:01:00.000Z",
    ...overrides,
  };
}

function action(route = "os_accessibility", actionType = "invoke_element") {
  return {
    id: randomUUID(),
    actionType,
    route,
    targetWindowId: "window-a",
    targetElementId: "element-a",
    rationale: "Fixture action.",
    expected: { kind: "element_state", elementId: "element-a", state: "invoked" },
    requestedBy: "test",
  };
}

describe("Field guest command authorizer", () => {
  it("allows status observation and emergency stop through typed commands", () => {
    const value = policy();
    const authorizer = new FieldCommandAuthorizer({ field, policy: value, provisionedPolicyHash: sha256Canonical(value) });
    expect(authorizer.authorize(fieldGuestCommandSchema.parse(base("get_status")), { now: new Date("2026-07-21T18:00:30.000Z") })).toMatchObject({ status: "allow", rule: "status_read" });
    expect(authorizer.authorize(fieldGuestCommandSchema.parse(base("observe_scene", { includeElements: true, includeVisualReference: false })), { now: new Date("2026-07-21T18:00:30.000Z") })).toMatchObject({ status: "allow", rule: "scene_observation" });
    expect(authorizer.authorize(fieldGuestCommandSchema.parse(base("emergency_stop", { reason: "Owner stop." })), { now: new Date("2026-07-21T18:00:30.000Z") })).toMatchObject({ status: "allow", rule: "emergency_stop_always_available" });
  });

  it("executes only exact bounded pilot actions", () => {
    const value = policy("pilot");
    const hash = sha256Canonical(value);
    const authorizer = new FieldCommandAuthorizer({ field, policy: value, provisionedPolicyHash: hash });
    const command = fieldGuestCommandSchema.parse(base("execute_action", {
      proposalId: "proposal-a",
      policyId: value.policyId,
      policyHash: hash,
      expectedSceneVersion: 4,
      actionOrdinal: 1,
      action: action(),
    }));
    expect(authorizer.authorize(command, { currentSceneVersion: 4, now: new Date("2026-07-21T18:00:30.000Z") })).toMatchObject({ status: "allow", rule: "bounded_pilot_action", action: { route: "os_accessibility" } });
    expect(authorizer.lastActionOrdinal()).toBe(1);
  });

  it("blocks action in Teach or Shadow and rejects shell route policy substitution and stale scene", () => {
    for (const mode of ["teach", "shadow"] as const) {
      const value = policy(mode);
      const hash = sha256Canonical(value);
      const authorizer = new FieldCommandAuthorizer({ field, policy: value, provisionedPolicyHash: hash });
      expect(authorizer.authorize(fieldGuestCommandSchema.parse(base("execute_action", {
        proposalId: "proposal-a",
        policyId: value.policyId,
        policyHash: hash,
        expectedSceneVersion: 1,
        actionOrdinal: 1,
        action: action(),
      })), { currentSceneVersion: 1, now: new Date("2026-07-21T18:00:30.000Z") })).toMatchObject({ status: "block", rule: "pilot_mode_required" });
    }

    const value = policy("pilot");
    const hash = sha256Canonical(value);
    const shell = new FieldCommandAuthorizer({ field, policy: value, provisionedPolicyHash: hash });
    expect(shell.authorize(fieldGuestCommandSchema.parse(base("execute_action", {
      proposalId: "proposal-shell",
      policyId: value.policyId,
      policyHash: hash,
      expectedSceneVersion: 1,
      actionOrdinal: 1,
      action: action("shell"),
    })), { currentSceneVersion: 1, now: new Date("2026-07-21T18:00:30.000Z") })).toMatchObject({ status: "block", rule: "guest_route" });

    const substituted = new FieldCommandAuthorizer({ field, policy: value, provisionedPolicyHash: hash });
    expect(substituted.authorize(fieldGuestCommandSchema.parse(base("execute_action", {
      proposalId: "proposal-substitution",
      policyId: randomUUID(),
      policyHash: hash,
      expectedSceneVersion: 1,
      actionOrdinal: 1,
      action: action(),
    })), { currentSceneVersion: 1, now: new Date("2026-07-21T18:00:30.000Z") })).toMatchObject({ status: "block", rule: "policy_binding" });

    const staleScene = new FieldCommandAuthorizer({ field, policy: value, provisionedPolicyHash: hash });
    expect(staleScene.authorize(fieldGuestCommandSchema.parse(base("execute_action", {
      proposalId: "proposal-scene",
      policyId: value.policyId,
      policyHash: hash,
      expectedSceneVersion: 2,
      actionOrdinal: 1,
      action: action(),
    })), { currentSceneVersion: 3, now: new Date("2026-07-21T18:00:30.000Z") })).toMatchObject({ status: "block", rule: "scene_version" });
  });

  it("enforces contiguous action budgets command expiry replay and admin-only shutdown", () => {
    const value = policy("pilot");
    const hash = sha256Canonical(value);
    const authorizer = new FieldCommandAuthorizer({ field, policy: value, provisionedPolicyHash: hash });
    const ordinalTwo = fieldGuestCommandSchema.parse(base("execute_action", {
      proposalId: "proposal-b",
      policyId: value.policyId,
      policyHash: hash,
      expectedSceneVersion: 1,
      actionOrdinal: 2,
      action: action(),
    }));
    expect(authorizer.authorize(ordinalTwo, { currentSceneVersion: 1, now: new Date("2026-07-21T18:00:30.000Z") })).toMatchObject({ status: "block", rule: "action_sequence" });

    const expired = fieldGuestCommandSchema.parse(base("get_status"));
    expect(authorizer.authorize(expired, { now: new Date("2026-07-21T18:01:00.000Z") })).toMatchObject({ status: "block", rule: "command_expired" });

    const status = fieldGuestCommandSchema.parse(base("get_status"));
    expect(authorizer.authorize(status, { now: new Date("2026-07-21T18:00:30.000Z") }).status).toBe("allow");
    expect(authorizer.authorize(status, { now: new Date("2026-07-21T18:00:30.000Z") })).toMatchObject({ status: "block", rule: "command_replay" });

    expect(authorizer.authorize(fieldGuestCommandSchema.parse(base("shutdown", { reason: "stop" })), { now: new Date("2026-07-21T18:00:30.000Z") })).toMatchObject({ status: "block", rule: "shutdown_admin_only" });
    expect(authorizer.authorize(fieldGuestCommandSchema.parse(base("shutdown", { issuedBy: "field_admin", reason: "stop" })), { now: new Date("2026-07-21T18:00:30.000Z") })).toMatchObject({ status: "allow", rule: "local_admin_shutdown" });
  });
});
