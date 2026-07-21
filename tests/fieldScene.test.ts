import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FieldSceneGraph, fieldSceneSnapshotSchema, type FieldSceneSnapshot } from "../src/fieldScene.js";

const field = { fieldId: randomUUID(), fieldGeneration: 1 };

function snapshot(overrides: Partial<FieldSceneSnapshot> = {}): FieldSceneSnapshot {
  return fieldSceneSnapshotSchema.parse({
    contractVersion: 1,
    field,
    sceneVersion: 1,
    capturedAt: "2026-07-21T18:00:00.000Z",
    display: {
      monitorCount: 1,
      width: 1920,
      height: 1080,
      scalePercent: 100,
      browserZoomPercent: 100,
      keyboardLayout: "en-US",
      dynamicResolutionAllowed: false,
    },
    observationId: "observation-1",
    activeWindowId: "window-a",
    windows: [
      {
        id: "window-a",
        title: "Fixture",
        processName: "fixture",
        processId: 100,
        isActive: true,
        isMinimized: false,
        bounds: { x: 0, y: 0, width: 1920, height: 1040 },
      },
    ],
    elements: [
      {
        id: "element-a",
        windowId: "window-a",
        name: "Search",
        controlType: "Edit",
        automationId: "search",
        value: "",
        enabled: true,
        focused: true,
        offscreen: false,
        isSensitive: false,
        bounds: { x: 100, y: 100, width: 400, height: 40 },
        source: "accessibility",
        supportedActions: ["set_element_value"],
      },
    ],
    cursor: { x: 200, y: 200, visible: true },
    modal: { present: false },
    system: { desktopReady: true, secureDesktopActive: false, sessionLocked: false, inputQueueBusy: false },
    warnings: [],
    ...overrides,
  });
}

describe("Field scene graph", () => {
  it("initializes and emits incremental desktop events", () => {
    const graph = new FieldSceneGraph(field);
    expect(graph.update(snapshot())).toEqual([
      expect.objectContaining({ eventType: "scene_initialized", sceneVersion: 1 }),
    ]);

    const next = snapshot({
      sceneVersion: 2,
      capturedAt: "2026-07-21T18:00:01.000Z",
      observationId: "observation-2",
      activeWindowId: "window-b",
      windows: [
        ...snapshot().windows.map((window) => ({ ...window, isActive: false })),
        {
          id: "window-b",
          title: "Dialog",
          processName: "fixture",
          processId: 100,
          isActive: true,
          isMinimized: false,
          bounds: { x: 500, y: 300, width: 600, height: 300 },
        },
      ],
      elements: snapshot().elements.map((element) => ({ ...element, focused: false })),
      modal: { present: true, windowId: "window-b", kind: "confirmation" },
      system: { desktopReady: true, secureDesktopActive: false, sessionLocked: false, inputQueueBusy: true },
    });
    expect(graph.update(next).map((event) => event.eventType)).toEqual([
      "window_appeared",
      "active_window_changed",
      "modal_changed",
      "system_state_changed",
      "elements_changed",
    ]);
    expect(graph.snapshot()?.activeWindowId).toBe("window-b");
  });

  it("allows input only when the guest desktop is ready unlocked and idle", () => {
    const graph = new FieldSceneGraph(field);
    graph.update(snapshot());
    expect(graph.assertReadyForInput().observationId).toBe("observation-1");

    graph.update(
      snapshot({
        sceneVersion: 2,
        capturedAt: "2026-07-21T18:00:01.000Z",
        observationId: "observation-2",
        system: { desktopReady: true, secureDesktopActive: false, sessionLocked: false, inputQueueBusy: true },
      }),
    );
    expect(() => graph.assertReadyForInput()).toThrow(/queue/);
  });

  it("rejects stale versions cross generation orphan elements invalid modals and unsafe session state", () => {
    const graph = new FieldSceneGraph(field);
    graph.update(snapshot());
    expect(() => graph.update(snapshot())).toThrow(/versions must increase/);
    expect(() =>
      graph.update(snapshot({ field: { fieldId: field.fieldId, fieldGeneration: 2 }, sceneVersion: 2 })),
    ).toThrow(/cross Field generations/);
    expect(() => snapshot({ elements: [{ ...snapshot().elements[0]!, windowId: "missing" }] })).toThrow(/listed window/);
    expect(() => snapshot({ modal: { present: true, windowId: "missing", kind: "dialog" } })).toThrow(/Modal window/);
    expect(() =>
      snapshot({
        system: { desktopReady: true, secureDesktopActive: true, sessionLocked: false, inputQueueBusy: false },
      }),
    ).toThrow(/cannot report the desktop ready/);
    expect(() => snapshot({ cursor: { x: 2000, y: 100, visible: true } })).toThrow(/inside the display/);
  });
});
