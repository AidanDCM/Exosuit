import { z } from "zod";
import { desktopActionSchema, type DesktopAction } from "./contracts.js";
import {
  fieldPolicySchema,
  fieldRefSchema,
  sha256Canonical,
  sha256DigestSchema,
  type FieldPolicy,
  type FieldRef,
} from "./fieldContracts.js";

const commandBaseSchema = z.object({
  contractVersion: z.literal(1),
  commandId: z.string().uuid(),
  field: fieldRefSchema,
  issuedBy: z.enum(["glove_host", "field_admin"]),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const fieldGuestCommandSchema = z.discriminatedUnion("kind", [
  commandBaseSchema.extend({ kind: z.literal("get_status") }),
  commandBaseSchema.extend({
    kind: z.literal("observe_scene"),
    includeElements: z.boolean(),
    includeVisualReference: z.boolean(),
  }),
  commandBaseSchema.extend({
    kind: z.literal("execute_action"),
    proposalId: z.string().min(1).max(300),
    policyId: z.string().uuid(),
    policyHash: sha256DigestSchema,
    expectedSceneVersion: z.number().int().positive(),
    actionOrdinal: z.number().int().positive(),
    action: desktopActionSchema,
  }),
  commandBaseSchema.extend({
    kind: z.literal("emergency_stop"),
    reason: z.string().min(1).max(1_000),
  }),
  commandBaseSchema.extend({
    kind: z.literal("shutdown"),
    reason: z.string().min(1).max(1_000),
  }),
]);
export type FieldGuestCommand = z.infer<typeof fieldGuestCommandSchema>;

export interface FieldCommandDecision {
  commandId: string;
  status: "allow" | "block";
  rule: string;
  reason: string;
  action?: DesktopAction;
}

const guestActionRoutes = new Set(["os_accessibility", "desktop_selector", "visual_mouse_keyboard"]);
const physicalActionTypes = new Set(["move_pointer", "click_pointer", "type_text", "hotkey"]);

export class FieldCommandAuthorizer {
  readonly #field: FieldRef;
  readonly #policy: FieldPolicy;
  readonly #policyHash: string;
  readonly #seenCommandIds = new Set<string>();
  #lastActionOrdinal = 0;

  constructor(input: { field: FieldRef; policy: FieldPolicy; provisionedPolicyHash: string }) {
    this.#field = fieldRefSchema.parse(input.field);
    this.#policy = fieldPolicySchema.parse(input.policy);
    this.#policyHash = sha256DigestSchema.parse(input.provisionedPolicyHash);
    if (this.#policy.field.fieldId !== this.#field.fieldId || this.#policy.field.fieldGeneration !== this.#field.fieldGeneration) {
      throw new Error("Field command policy cannot cross Field generations.");
    }
    if (sha256Canonical(this.#policy) !== this.#policyHash) throw new Error("Provisioned Field policy hash is invalid.");
  }

  authorize(input: FieldGuestCommand, context: { currentSceneVersion?: number; now?: Date } = {}): FieldCommandDecision {
    const command = fieldGuestCommandSchema.parse(input);
    if (command.field.fieldId !== this.#field.fieldId || command.field.fieldGeneration !== this.#field.fieldGeneration) {
      return blocked(command.commandId, "field_generation", "Guest command refers to a different Field generation.");
    }
    if (this.#seenCommandIds.has(command.commandId)) return blocked(command.commandId, "command_replay", "Guest command ID was already handled.");
    const now = context.now ?? new Date();
    if (now.getTime() < new Date(command.issuedAt).getTime()) return blocked(command.commandId, "not_yet_valid", "Guest command is not valid yet.");
    if (now.getTime() >= new Date(command.expiresAt).getTime()) return blocked(command.commandId, "command_expired", "Guest command has expired.");
    this.#seenCommandIds.add(command.commandId);

    if (command.kind === "emergency_stop") {
      return allowed(command.commandId, "emergency_stop_always_available", "Emergency stop remains available independent of ordinary policy expiry.");
    }
    if (command.kind === "shutdown") {
      return command.issuedBy === "field_admin"
        ? allowed(command.commandId, "local_admin_shutdown", "Authenticated Field administration may request guest shutdown.")
        : blocked(command.commandId, "shutdown_admin_only", "Only Field administration may request guest shutdown.");
    }
    if (now.getTime() >= new Date(this.#policy.expiresAt).getTime()) {
      return blocked(command.commandId, "policy_expired", "Expired Field policy cannot authorize guest operation.");
    }
    if (command.kind === "get_status") return allowed(command.commandId, "status_read", "Field status is a non-mutating guest query.");
    if (command.kind === "observe_scene") {
      if (!this.#policy.allowedCapabilities.includes("observe_desktop")) {
        return blocked(command.commandId, "observe_capability", "Field policy does not allow desktop observation.");
      }
      if (command.includeVisualReference && !this.#policy.allowedCapabilities.includes("observe_desktop")) {
        return blocked(command.commandId, "visual_observation_capability", "Field policy does not allow visual observation.");
      }
      return allowed(command.commandId, "scene_observation", "Field policy allows a bounded scene observation.");
    }

    if (this.#policy.mode !== "pilot") return blocked(command.commandId, "pilot_mode_required", "Teach and Shadow modes cannot execute guest actions.");
    if (command.issuedBy !== "glove_host") return blocked(command.commandId, "glove_action_authority", "Desktop action commands must come from the authenticated Glove host.");
    if (command.policyId !== this.#policy.policyId || command.policyHash !== this.#policyHash) {
      return blocked(command.commandId, "policy_binding", "Guest action command does not match the provisioned Field policy.");
    }
    if (context.currentSceneVersion === undefined || command.expectedSceneVersion !== context.currentSceneVersion) {
      return blocked(command.commandId, "scene_version", "Guest action requires the exact current scene version.");
    }
    if (command.actionOrdinal !== this.#lastActionOrdinal + 1) {
      return blocked(command.commandId, "action_sequence", "Guest action ordinals must increase contiguously.");
    }
    if (command.actionOrdinal > this.#policy.maximumActions) {
      return blocked(command.commandId, "action_budget", "Field action budget is exhausted.");
    }
    if (!guestActionRoutes.has(command.action.route)) {
      return blocked(command.commandId, "guest_route", "Guest execution accepts only approved desktop routes and never arbitrary shell routes.");
    }
    const requiredCapability = physicalActionTypes.has(command.action.actionType) ? "physical_input" : "semantic_input";
    if (!this.#policy.allowedCapabilities.includes(requiredCapability)) {
      return blocked(command.commandId, "action_capability", `Field policy does not allow ${requiredCapability}.`);
    }
    this.#lastActionOrdinal = command.actionOrdinal;
    return {
      commandId: command.commandId,
      status: "allow",
      rule: "bounded_pilot_action",
      reason: "Action matches the exact Field generation, policy, scene, route, capability, and action budget.",
      action: structuredClone(command.action),
    };
  }

  lastActionOrdinal(): number {
    return this.#lastActionOrdinal;
  }
}

function allowed(commandId: string, rule: string, reason: string): FieldCommandDecision {
  return { commandId, status: "allow", rule, reason };
}

function blocked(commandId: string, rule: string, reason: string): FieldCommandDecision {
  return { commandId, status: "block", rule, reason };
}
