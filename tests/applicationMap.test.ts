import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeDesktopAgent } from "../src/agent.js";
import {
  ApplicationMapStore,
  buildApplicationMap,
  matchApplicationMap,
} from "../src/applicationMap.js";
import type { DesktopObservation, UiElement, WindowInfo } from "../src/contracts.js";
import { ExosuitOrchestrator } from "../src/orchestrator.js";

const window: WindowInfo = {
  id: "window-current",
  title: "Confidential Client File - Example App",
  processName: "Example.App.exe",
  processId: 55,
  isActive: true,
  isMinimized: false,
  bounds: { x: 100, y: 100, width: 800, height: 600 },
};

const safeElement: UiElement = {
  id: "element-current",
  windowId: window.id,
  name: "Submit record",
  controlType: "Button",
  automationId: "submit-record",
  value: "private live value",
  enabled: true,
  focused: false,
  offscreen: false,
  isSensitive: false,
  bounds: { x: 700, y: 620, width: 120, height: 40 },
  source: "accessibility",
  supportedActions: ["invoke_element"],
};

const sensitiveElement: UiElement = {
  ...safeElement,
  id: "password-current",
  name: "Password",
  automationId: "password",
  value: "top-secret-password",
  isSensitive: true,
  supportedActions: ["set_element_value"],
};

function observation(elements: UiElement[], id = "observation-current"): DesktopObservation {
  return {
    observationId: id,
    capturedAt: "2026-07-17T20:00:00.000Z",
    mode: "observe",
    provider: "test-provider",
    activeWindow: window,
    windows: [window],
    elements,
    warnings: [],
  };
}

describe("application map sanitization", () => {
  it("excludes sensitive controls, live values, element IDs, and plain window titles", () => {
    const map = buildApplicationMap({ observation: observation([safeElement, sensitiveElement]), window, revision: 1 });
    const serialized = JSON.stringify(map);

    expect(map.controls).toHaveLength(1);
    expect(map.skippedSensitiveCount).toBe(1);
    expect(map.controls[0]).toMatchObject({
      name: "Submit record",
      controlType: "Button",
      automationId: "submit-record",
      supportedActions: ["invoke_element"],
    });
    expect(serialized).not.toContain("private live value");
    expect(serialized).not.toContain("top-secret-password");
    expect(serialized).not.toContain("element-current");
    expect(serialized).not.toContain(window.title);
    expect(map.windowTitleFingerprint).toHaveLength(64);
  });

  it("matches stored semantics to fresh element IDs without authorizing an action", () => {
    const map = buildApplicationMap({ observation: observation([safeElement]), window, revision: 1 });
    const freshElement = { ...safeElement, id: "element-fresh", value: "changed live value" };
    const result = matchApplicationMap(map, observation([freshElement], "observation-fresh"), window);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      controlKey: map.controls[0]?.controlKey,
      confidence: 1,
      element: { id: "element-fresh" },
    });
    expect(JSON.stringify(result)).toContain("changed live value");
    expect(result.warnings).toEqual([]);
  });

  it("refuses to match sensitive fresh controls", () => {
    const map = buildApplicationMap({ observation: observation([safeElement]), window, revision: 1 });
    const result = matchApplicationMap(
      map,
      observation([{ ...safeElement, id: "now-sensitive", isSensitive: true }], "observation-sensitive"),
      window,
    );

    expect(result.matches).toEqual([]);
    expect(result.unmatchedControlKeys).toEqual([map.controls[0]?.controlKey]);
  });
});

describe("application map persistence and versioning", () => {
  it("persists sanitized maps atomically and hydrates them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "exosuit-map-test-"));
    try {
      const store = new ApplicationMapStore({ directory });
      const map = buildApplicationMap({ observation: observation([safeElement]), window, revision: store.nextRevision(window.processName) });
      await store.save(map);

      const files = await readdir(directory);
      expect(files).toEqual([`${map.mapId}.json`]);
      expect(await readFile(join(directory, files[0] as string), "utf8")).not.toContain("private live value");

      const hydrated = new ApplicationMapStore({ directory });
      expect(await hydrated.hydrate()).toEqual({ loaded: 1, skipped: 0 });
      expect(hydrated.get(map.mapId)).toEqual(map);
      expect(hydrated.nextRevision(window.processName)).toBe(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps only the configured number of versions per application", async () => {
    const store = new ApplicationMapStore({ maxVersionsPerApplication: 2 });
    const maps = [1, 2, 3].map((revision) =>
      buildApplicationMap({ observation: observation([safeElement], `observation-${revision}`), window, revision }),
    );
    for (const map of maps) await store.save(map);

    const revisions = store.list().map((map) => map.revision).sort((left, right) => left - right);
    expect(revisions).toEqual([2, 3]);
    expect(store.get(maps[0]!.mapId)).toBeUndefined();
  });
});

describe("orchestrator application map flow", () => {
  it("builds, lists, retrieves, and freshly matches a fake application map", async () => {
    const applicationMaps = new ApplicationMapStore();
    const orchestrator = new ExosuitOrchestrator({ agent: new FakeDesktopAgent(), applicationMaps });

    const map = await orchestrator.buildApplicationMap({ windowId: "win-notepad" });
    expect(map.processName).toBe("exosuit-fake-notepad");
    expect(orchestrator.listApplicationMaps()).toHaveLength(1);
    expect(orchestrator.getApplicationMap(map.mapId)).toEqual(map);

    const match = await orchestrator.matchApplicationMap({ mapId: map.mapId, windowId: "win-notepad" });
    expect(match.matches.map((item) => item.element.id).sort()).toEqual(["el-editor", "el-save"]);
    expect(match.unmatchedControlKeys).toEqual([]);
  });
});
