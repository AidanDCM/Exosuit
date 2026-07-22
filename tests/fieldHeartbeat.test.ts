import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FieldHeartbeatMonitor, fieldHeartbeatSchema } from "../src/fieldHeartbeat.js";

const field = { fieldId: randomUUID(), fieldGeneration: 1 };
const bootId = randomUUID();

function heartbeat(overrides: Record<string, unknown> = {}) {
  return fieldHeartbeatSchema.parse({
    contractVersion: 1,
    field,
    agentId: "field-agent-a",
    bootId,
    sequence: 0,
    observedAt: "2026-07-21T18:00:00.000Z",
    lifecycle: "ready",
    desktopReady: true,
    sessionLocked: false,
    secureDesktopActive: false,
    inputQueueDepth: 0,
    pendingCommandCount: 0,
    workingSetBytes: 200_000_000,
    ...overrides,
  });
}

describe("Field heartbeat monitor", () => {
  it("moves from healthy to degraded to faulted as liveness expires", () => {
    const monitor = new FieldHeartbeatMonitor({ field, agentId: "field-agent-a", degradedAfterMs: 5_000, faultAfterMs: 15_000 });
    monitor.accept(heartbeat(), new Date("2026-07-21T18:00:00.000Z"));
    expect(monitor.assess(new Date("2026-07-21T18:00:04.999Z")).state).toBe("healthy");
    expect(monitor.assess(new Date("2026-07-21T18:00:05.000Z")).state).toBe("degraded");
    expect(monitor.assess(new Date("2026-07-21T18:00:15.000Z"))).toMatchObject({ state: "faulted", reason: "Guest heartbeat expired." });
  });

  it("rejects stale sequences boot changes cross-generation identity and impossible desktop state", () => {
    const monitor = new FieldHeartbeatMonitor({ field, agentId: "field-agent-a" });
    monitor.accept(heartbeat(), new Date("2026-07-21T18:00:00.000Z"));
    expect(() => monitor.accept(heartbeat(), new Date("2026-07-21T18:00:01.000Z"))).toThrow(/increase strictly/);
    expect(() =>
      monitor.accept(heartbeat({ sequence: 1, bootId: randomUUID(), observedAt: "2026-07-21T18:00:01.000Z" }), new Date("2026-07-21T18:00:01.000Z")),
    ).toThrow(/boot identity changed/);

    const otherGeneration = new FieldHeartbeatMonitor({ field, agentId: "field-agent-a" });
    expect(() =>
      otherGeneration.accept(heartbeat({ field: { ...field, fieldGeneration: 2 } }), new Date("2026-07-21T18:00:00.000Z")),
    ).toThrow(/cross Field generations/);
    expect(() =>
      otherGeneration.accept(heartbeat({ desktopReady: true, sessionLocked: true }), new Date("2026-07-21T18:00:00.000Z")),
    ).toThrow(/cannot report/);
  });

  it("treats guest faults locks and secure desktop as non-healthy", () => {
    const faulted = new FieldHeartbeatMonitor({ field, agentId: "field-agent-a" });
    faulted.accept(heartbeat({ lifecycle: "faulted", desktopReady: false, lastErrorCode: "agent_crash" }), new Date("2026-07-21T18:00:00.000Z"));
    expect(faulted.assess(new Date("2026-07-21T18:00:00.100Z"))).toMatchObject({ state: "faulted", reason: "agent_crash" });

    const locked = new FieldHeartbeatMonitor({ field, agentId: "field-agent-a" });
    locked.accept(heartbeat({ desktopReady: false, sessionLocked: true }), new Date("2026-07-21T18:00:00.000Z"));
    expect(locked.assess(new Date("2026-07-21T18:00:00.100Z")).state).toBe("degraded");

    const secure = new FieldHeartbeatMonitor({ field, agentId: "field-agent-a" });
    secure.accept(heartbeat({ desktopReady: false, secureDesktopActive: true }), new Date("2026-07-21T18:00:00.000Z"));
    expect(secure.assess(new Date("2026-07-21T18:00:00.100Z")).state).toBe("degraded");
  });
});
