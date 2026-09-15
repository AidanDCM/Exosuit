import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fieldIdentitySchema } from "../src/fieldContracts.js";
import { FieldRegistry } from "../src/fieldRegistry.js";

function identity(fieldId = randomUUID(), fieldGeneration = 1) {
  return fieldIdentitySchema.parse({
    subsystem: "field",
    fieldId,
    fieldGeneration,
    agentId: `field-agent-${fieldGeneration}`,
    machineId: "vm-a",
    windowsSessionId: `session-${fieldGeneration}`,
    baseImageDigest: "a".repeat(64),
    taskDiskId: `task-${fieldGeneration}`,
    createdAt: `2026-07-21T18:00:0${fieldGeneration}.000Z`,
  });
}

describe("glove and field boundary registry", () => {
  it("binds a field generation to one glove agent and requires the matching active lifecycle", () => {
    const registry = new FieldRegistry();
    const current = identity();
    registry.register({ identity: current, gloveAgentId: "glove-agent-a" });
    registry.transition({ field: current, to: "provisioning" });
    registry.transition({ field: current, to: "ready" });
    registry.transition({ field: current, to: "teaching" });

    expect(registry.assertModeReady({ field: current, mode: "teach", gloveAgentId: "glove-agent-a" }).subsystem).toBe("field");
    expect(() => registry.assertModeReady({ field: current, mode: "pilot", gloveAgentId: "glove-agent-a" })).toThrow(/piloting/);
    expect(() => registry.assertModeReady({ field: current, mode: "teach", gloveAgentId: "another-glove" })).toThrow(/not bound/);
  });

  it("rejects invalid lifecycle transitions and requires explicit fault evidence", () => {
    const registry = new FieldRegistry();
    const current = identity();
    registry.register({ identity: current, gloveAgentId: "glove-agent-a" });
    expect(() => registry.transition({ field: current, to: "piloting" })).toThrow(/cannot transition/);
    registry.transition({ field: current, to: "provisioning" });
    expect(() => registry.transition({ field: current, to: "faulted" })).toThrow(/fault reason/);
    expect(registry.transition({ field: current, to: "faulted", faultReason: "Guest heartbeat expired." }).faultReason).toMatch(/heartbeat/);
    expect(() => registry.transition({ field: current, to: "ready" })).toThrow(/cannot transition/);
  });

  it("allows a new generation only after a strictly older generation", () => {
    const registry = new FieldRegistry();
    const fieldId = randomUUID();
    registry.register({ identity: identity(fieldId, 1), gloveAgentId: "glove-agent-a" });
    registry.register({ identity: identity(fieldId, 2), gloveAgentId: "glove-agent-a" });
    expect(registry.list()).toHaveLength(2);
    expect(() => registry.register({ identity: identity(fieldId, 2), gloveAgentId: "glove-agent-a" })).toThrow(/already registered|increase/);
    expect(() => registry.register({ identity: identity(fieldId, 1), gloveAgentId: "glove-agent-a" })).toThrow(/already registered|increase/);
  });
});
