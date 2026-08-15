import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { observationSchema, type DesktopObservation } from "../src/contracts.js";
import { fieldDisplayContractSchema } from "../src/fieldContracts.js";
import { fieldHeartbeatSchema, type FieldHeartbeat } from "../src/fieldHeartbeat.js";
import { FieldSceneObservationAdapter } from "../src/fieldSceneObservation.js";

const field = { fieldId: randomUUID(), fieldGeneration: 2 };
const display = fieldDisplayContractSchema.parse({
  monitorCount: 1, width: 1920, height: 1080, scalePercent: 100, browserZoomPercent: 100,
  keyboardLayout: "en-US", dynamicResolutionAllowed: false,
});

function observation(overrides: Partial<DesktopObservation> = {}): DesktopObservation {
  const window = { id: "window-a", title: "Private customer record", processName: "fixture", processId: 10,
    isActive: true, isMinimized: false, bounds: { x: 0, y: 0, width: 1200, height: 900 } };
  return observationSchema.parse({
    observationId: "observation-a", capturedAt: "2026-07-28T22:30:00.000Z", mode: "observe",
    provider: "windows-ui-automation", activeWindow: window, windows: [window],
    elements: [
      { id: "search", windowId: "window-a", name: "Customer search", controlType: "Edit", automationId: "search-box",
        value: "Aidan", enabled: true, focused: true, offscreen: false, isSensitive: false,
        bounds: { x: 10, y: 10, width: 200, height: 30 }, source: "accessibility", supportedActions: ["set_element_value"] },
      { id: "password", windowId: "window-a", name: "Password", controlType: "Edit", automationId: "password-box",
        value: "must-never-pass", enabled: true, focused: false, offscreen: false, isSensitive: true,
        bounds: { x: 10, y: 50, width: 200, height: 30 }, source: "accessibility", supportedActions: ["set_element_value"] },
    ], warnings: [], ...overrides,
  });
}

function heartbeat(overrides: Partial<FieldHeartbeat> = {}): FieldHeartbeat {
  return fieldHeartbeatSchema.parse({
    contractVersion: 1, field, agentId: "field-agent", bootId: randomUUID(), sequence: 1,
    observedAt: "2026-07-28T22:30:00.000Z", lifecycle: "shadowing", desktopReady: true,
    sessionLocked: false, secureDesktopActive: false, inputQueueDepth: 0, pendingCommandCount: 0,
    workingSetBytes: 100, ...overrides,
  });
}

const at = new Date("2026-07-28T22:30:01.000Z");

describe("read-only Field scene observation adapter", () => {
  it("defaults to structural metadata and strips all UI text and sensitive authority", () => {
    const adapter = new FieldSceneObservationAdapter({ field, display });
    const scene = adapter.adapt({ observation: observation(), heartbeat: heartbeat(), cursor: { x: 100, y: 100, visible: true }, now: at });
    expect(scene).toMatchObject({ field, sceneVersion: 1, observationId: "observation-a", activeWindowId: "window-a",
      system: { desktopReady: true, inputQueueBusy: false } });
    expect(scene.windows[0]!.title).toBe("");
    expect(scene.elements[0]).toMatchObject({ name: "", value: undefined, automationId: "search-box" });
    expect(scene.elements[1]).toMatchObject({ name: "[SENSITIVE]", value: undefined, automationId: undefined, supportedActions: [] });
    expect(JSON.stringify(scene)).not.toContain("Private customer record");
    expect(JSON.stringify(scene)).not.toContain("must-never-pass");
    expect(scene.warnings).toContain("UI text was removed by the structural-only Field scene policy.");
  });

  it("allows non-sensitive UI text only under the explicit consented policy", () => {
    const adapter = new FieldSceneObservationAdapter({ field, display, textPolicy: "consented_ui_text" });
    const scene = adapter.adapt({ observation: observation(), heartbeat: heartbeat(), cursor: { x: 1, y: 1, visible: true }, now: at });
    expect(scene.windows[0]!.title).toBe("Private customer record");
    expect(scene.elements[0]).toMatchObject({ name: "Customer search", value: "Aidan" });
    expect(scene.elements[1]).toMatchObject({ name: "[SENSITIVE]", value: undefined, supportedActions: [] });
    expect(JSON.stringify(scene)).not.toContain("must-never-pass");
  });

  it("rejects screenshots, stale trust, and cross-generation heartbeat state", () => {
    const adapter = new FieldSceneObservationAdapter({ field, display });
    expect(() => adapter.adapt({ observation: observation({ screenshotBase64: "abc", screenshotMimeType: "image/png" }),
      heartbeat: heartbeat(), cursor: { x: 1, y: 1, visible: true }, now: at })).toThrow(/never accepts screenshot/);
    expect(() => adapter.adapt({ observation: observation(), heartbeat: heartbeat({ observedAt: "2026-07-28T22:29:00.000Z" }),
      cursor: { x: 1, y: 1, visible: true }, now: at })).toThrow(/fresh authenticated heartbeat/);
    expect(() => adapter.adapt({ observation: observation(), heartbeat: heartbeat({ field: { ...field, fieldGeneration: 3 } }),
      cursor: { x: 1, y: 1, visible: true }, now: at })).toThrow(/cross Field generations/);
  });

  it("rejects structural coordinates outside the approved display contract", () => {
    const adapter = new FieldSceneObservationAdapter({ field, display });
    const oversizedWindow = { ...observation().windows[0]!, bounds: { x: 0, y: 0, width: 2048, height: 1152 } };
    expect(() => adapter.adapt({
      observation: observation({ activeWindow: oversizedWindow, windows: [oversizedWindow] }),
      heartbeat: heartbeat(), cursor: { x: 0, y: 0, visible: false }, now: at,
    })).toThrow(/active window bounds exceed the approved display contract/);

    const outsideElement = { ...observation().elements[0]!, bounds: { x: 1900, y: 100, width: 40, height: 30 } };
    expect(() => adapter.adapt({
      observation: observation({ elements: [outsideElement] }),
      heartbeat: heartbeat(), cursor: { x: 0, y: 0, visible: false }, now: at,
    })).toThrow(/element bounds exceed the approved display contract/);
  });

  it("does not consume a scene version on denial and derives queue safety from heartbeat", () => {
    const adapter = new FieldSceneObservationAdapter({ field, display });
    expect(() => adapter.adapt({ observation: observation({ screenshotBase64: "abc" }), heartbeat: heartbeat(),
      cursor: { x: 1, y: 1, visible: true }, now: at })).toThrow();
    const first = adapter.adapt({ observation: observation(), heartbeat: heartbeat({ inputQueueDepth: 1 }),
      cursor: { x: 1, y: 1, visible: true }, now: at });
    const second = adapter.adapt({ observation: observation({ observationId: "observation-b", capturedAt: "2026-07-28T22:30:01.500Z" }),
      heartbeat: heartbeat({ sequence: 2, observedAt: "2026-07-28T22:30:01.000Z" }), cursor: { x: 2, y: 2, visible: true },
      now: new Date("2026-07-28T22:30:02.000Z") });
    expect(first).toMatchObject({ sceneVersion: 1, system: { inputQueueBusy: true } });
    expect(second.sceneVersion).toBe(2);
  });
});
