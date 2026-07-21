import { describe, expect, it } from "vitest";
import {
  VirtualDesktopRegistry,
  type VirtualDesktopSnapshot,
} from "../src/virtualDesktop.js";

function snapshot(overrides: Partial<VirtualDesktopSnapshot> = {}): VirtualDesktopSnapshot {
  return {
    contractVersion: 1,
    agentId: "agent-a",
    windowsSessionId: "session-a",
    version: 1,
    capturedAt: "2026-07-21T15:00:00.000Z",
    currentVirtualDesktopId: "desktop-a",
    knownVirtualDesktopIds: ["desktop-a", "desktop-b"],
    assignments: [
      {
        window: {
          agentId: "agent-a",
          windowsSessionId: "session-a",
          windowId: "window-a",
          windowGeneration: 1,
        },
        virtualDesktopId: "desktop-a",
      },
      {
        window: {
          agentId: "agent-a",
          windowsSessionId: "session-a",
          windowId: "window-b",
          windowGeneration: 1,
        },
        virtualDesktopId: "desktop-b",
      },
    ],
    ...overrides,
  };
}

describe("virtual desktop registry", () => {
  it("reports current, other, unassigned, and stale window availability", () => {
    const registry = new VirtualDesktopRegistry();
    registry.update(
      snapshot({
        assignments: [
          ...snapshot().assignments,
          {
            window: {
              agentId: "agent-a",
              windowsSessionId: "session-a",
              windowId: "window-c",
              windowGeneration: 1,
            },
            virtualDesktopId: null,
          },
        ],
      }),
    );
    expect(
      registry.availability({
        agentId: "agent-a",
        windowsSessionId: "session-a",
        windowId: "window-a",
        windowGeneration: 1,
      }),
    ).toEqual({ state: "current", virtualDesktopId: "desktop-a" });
    expect(
      registry.availability({
        agentId: "agent-a",
        windowsSessionId: "session-a",
        windowId: "window-b",
        windowGeneration: 1,
      }),
    ).toEqual({ state: "other_desktop", virtualDesktopId: "desktop-b" });
    expect(
      registry.availability({
        agentId: "agent-a",
        windowsSessionId: "session-a",
        windowId: "window-c",
        windowGeneration: 1,
      }),
    ).toEqual({ state: "unassigned", virtualDesktopId: null });
    expect(
      registry.availability({
        agentId: "agent-a",
        windowsSessionId: "session-a",
        windowId: "missing",
        windowGeneration: 1,
      }),
    ).toEqual({ state: "stale", virtualDesktopId: null });
  });

  it("records desktop transitions that invalidate focus leases", () => {
    const registry = new VirtualDesktopRegistry();
    registry.update(snapshot());
    const result = registry.update(
      snapshot({
        version: 2,
        capturedAt: "2026-07-21T15:00:01.000Z",
        currentVirtualDesktopId: "desktop-b",
      }),
    );
    expect(result.transition).toMatchObject({
      previousVirtualDesktopId: "desktop-a",
      currentVirtualDesktopId: "desktop-b",
      invalidatesFocusLease: true,
    });
    expect(registry.transitions()).toHaveLength(1);
  });

  it("creates only local-approval switch intents", () => {
    const registry = new VirtualDesktopRegistry();
    registry.update(snapshot());
    expect(
      registry.createSwitchIntent({
        agentId: "agent-a",
        windowsSessionId: "session-a",
        targetVirtualDesktopId: "desktop-b",
        reason: "The next verified workflow target is on desktop B.",
      }),
    ).toMatchObject({
      fromVirtualDesktopId: "desktop-a",
      targetVirtualDesktopId: "desktop-b",
      requiresLocalApproval: true,
      automaticExecutionAllowed: false,
    });
    expect(() =>
      registry.createSwitchIntent({
        agentId: "agent-a",
        windowsSessionId: "session-a",
        targetVirtualDesktopId: "desktop-a",
        reason: "Already current.",
      }),
    ).toThrow(/already current/);
    expect(() =>
      registry.createSwitchIntent({
        agentId: "agent-a",
        windowsSessionId: "session-a",
        targetVirtualDesktopId: "unknown",
        reason: "Unknown desktop.",
      }),
    ).toThrow(/not present/);
  });

  it("rejects stale versions, duplicate assignments, and cross-session windows", () => {
    const registry = new VirtualDesktopRegistry();
    registry.update(snapshot());
    expect(() => registry.update(snapshot())).toThrow(/versions must increase/);
    expect(() =>
      new VirtualDesktopRegistry().update(
        snapshot({
          assignments: [snapshot().assignments[0]!, snapshot().assignments[0]!],
        }),
      ),
    ).toThrow(/only one desktop assignment/);
    expect(() =>
      new VirtualDesktopRegistry().update(
        snapshot({
          assignments: [
            {
              ...snapshot().assignments[0]!,
              window: {
                ...snapshot().assignments[0]!.window,
                windowsSessionId: "other-session",
              },
            },
          ],
        }),
      ),
    ).toThrow(/cannot cross/);
  });
});
