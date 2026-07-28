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
      method: "manual",
      status: "proposed",
      basedOnSnapshotVersion: 1,
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
    expect(() =>
      registry.createSwitchIntent({
        agentId: "agent-a",
        windowsSessionId: "session-a",
        targetVirtualDesktopId: "desktop-b",
        reason: "Missing direction.",
        method: "approved_hotkey",
      }),
    ).toThrow(/explicit direction/);
  });

  it("confirms a switch only from a newer matching observation", () => {
    const registry = new VirtualDesktopRegistry();
    registry.update(snapshot());
    const intent = registry.createSwitchIntent({
      agentId: "agent-a",
      windowsSessionId: "session-a",
      targetVirtualDesktopId: "desktop-b",
      reason: "Continue the workflow on desktop B.",
      method: "approved_hotkey",
      direction: "right",
      now: new Date("2026-07-21T15:00:00.000Z"),
    });
    expect(() => registry.confirmSwitchIntent(intent.intentId, snapshot())).toThrow(/newer snapshot version/);
    expect(() =>
      registry.confirmSwitchIntent(
        intent.intentId,
        snapshot({
          version: 2,
          capturedAt: "2026-07-21T15:00:01.000Z",
          currentVirtualDesktopId: "desktop-a",
        }),
      ),
    ).toThrow(/did not confirm/);

    const confirmed = registry.confirmSwitchIntent(
      intent.intentId,
      snapshot({
        version: 3,
        capturedAt: "2026-07-21T15:00:02.000Z",
        currentVirtualDesktopId: "desktop-b",
      }),
    );
    expect(confirmed).toMatchObject({ status: "confirmed", targetVirtualDesktopId: "desktop-b" });
    expect(confirmed.confirmedAt).toBe("2026-07-21T15:00:02.000Z");
    expect(() => registry.cancelSwitchIntent(intent.intentId)).toThrow(/confirmed/);
  });

  it("expires and cancels pending switch intents", () => {
    const registry = new VirtualDesktopRegistry();
    registry.update(snapshot());
    const expiring = registry.createSwitchIntent({
      agentId: "agent-a",
      windowsSessionId: "session-a",
      targetVirtualDesktopId: "desktop-b",
      reason: "Short-lived switch.",
      ttlMs: 1_000,
      now: new Date("2026-07-21T15:00:00.000Z"),
    });
    expect(registry.expireSwitchIntents(new Date("2026-07-21T15:00:01.001Z"))).toHaveLength(1);
    expect(registry.getSwitchIntent(expiring.intentId)?.status).toBe("expired");
    expect(() => registry.confirmSwitchIntent(expiring.intentId, snapshot({ version: 2 }))).toThrow(/expired/);

    const registry2 = new VirtualDesktopRegistry();
    registry2.update(snapshot());
    const cancellable = registry2.createSwitchIntent({
      agentId: "agent-a",
      windowsSessionId: "session-a",
      targetVirtualDesktopId: "desktop-b",
      reason: "Operator changed their mind.",
    });
    expect(registry2.cancelSwitchIntent(cancellable.intentId).status).toBe("cancelled");
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
