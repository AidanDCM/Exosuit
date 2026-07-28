import { describe, expect, it } from "vitest";
import type { DesktopObservation } from "../src/contracts.js";
import { ExosuitOrchestrator } from "../src/orchestrator.js";
import { WorkflowRuntime } from "../src/workflowRuntime.js";
import { WorkspaceSynchronizer } from "../src/workspaceSync.js";

class ObservationOrchestrator extends ExosuitOrchestrator {
  observation: DesktopObservation = {
    observationId: "observation-1",
    capturedAt: "2026-07-21T15:00:00.000Z",
    mode: "sandbox",
    provider: "fake",
    activeWindow: {
      id: "w1",
      title: "Private customer title",
      processName: "notepad",
      processId: 1,
      isActive: true,
      isMinimized: false,
    },
    windows: [
      {
        id: "w1",
        title: "Private customer title",
        processName: "notepad",
        processId: 1,
        isActive: true,
        isMinimized: false,
      },
    ],
    elements: [],
    warnings: [],
  };

  override async observe(): Promise<DesktopObservation> {
    return this.observation;
  }
}

describe("workspace synchronization", () => {
  it("hashes titles, preserves generations, and increments changed identities", async () => {
    const orchestrator = new ObservationOrchestrator({
      agent: {} as never,
    });
    const runtime = new WorkflowRuntime();
    const sync = new WorkspaceSynchronizer({ orchestrator, runtime });
    const first = await sync.refresh();
    expect(first.windows[0]?.fingerprint).not.toContain("Private customer title");
    expect(first.windows[0]?.windowGeneration).toBe(1);
    const second = await sync.refresh();
    expect(second.windowRegistryVersion).toBe(2);
    expect(second.windows[0]?.windowGeneration).toBe(1);
    orchestrator.observation = {
      ...orchestrator.observation,
      observationId: "observation-2",
      capturedAt: "2026-07-21T15:00:01.000Z",
      activeWindow: {
        ...orchestrator.observation.activeWindow!,
        title: "Different page",
      },
      windows: [
        {
          ...orchestrator.observation.windows[0]!,
          title: "Different page",
        },
      ],
    };
    const third = await sync.refresh();
    expect(third.windows[0]?.windowGeneration).toBe(2);
  });

  // Master roadmap Phase 2 GitHub test: "three fake windows observed concurrently".
  // The other tests here use a single window, so nothing proved that several windows
  // keep distinct identity, generation, and privacy within one snapshot.
  it("observes three windows concurrently with distinct identity and no plain titles", async () => {
    const orchestrator = new ObservationOrchestrator({ agent: {} as never });
    const window = (id: string, processName: string, title: string, processId: number) => ({
      id,
      title,
      processName,
      processId,
      isActive: id === "w1",
      isMinimized: false,
    });
    const titles = ["Private customer title", "Confidential invoice 4471", "Patient record ABC"];
    orchestrator.observation = {
      ...orchestrator.observation,
      activeWindow: window("w1", "notepad", titles[0]!, 1),
      windows: [
        window("w1", "notepad", titles[0]!, 1),
        window("w2", "calculator", titles[1]!, 2),
        window("w3", "browser", titles[2]!, 3),
      ],
    };

    const snapshot = await orchestrator.observe().then(() =>
      new WorkspaceSynchronizer({ orchestrator, runtime: new WorkflowRuntime() }).refresh(),
    );

    expect(snapshot.windows).toHaveLength(3);
    expect(snapshot.windows.map((w) => w.windowId).sort()).toEqual(["w1", "w2", "w3"]);
    expect(snapshot.windows.map((w) => w.processName).sort()).toEqual([
      "browser",
      "calculator",
      "notepad",
    ]);

    // Identity must be per-window, not shared or reused across the snapshot.
    expect(new Set(snapshot.windows.map((w) => w.fingerprint)).size).toBe(3);
    for (const record of snapshot.windows) expect(record.windowGeneration).toBe(1);

    // Exactly one window is active even though three are tracked concurrently.
    expect(snapshot.windows.filter((w) => w.isActive).map((w) => w.windowId)).toEqual(["w1"]);

    // No plain title may survive into the workspace model, for any of the three.
    const serialized = JSON.stringify(snapshot);
    for (const title of titles) expect(serialized).not.toContain(title);
  });

  it("removes closed windows from the live snapshot", async () => {
    const orchestrator = new ObservationOrchestrator({
      agent: {} as never,
    });
    const runtime = new WorkflowRuntime();
    const sync = new WorkspaceSynchronizer({ orchestrator, runtime });
    await sync.refresh();
    orchestrator.observation = {
      ...orchestrator.observation,
      observationId: "observation-2",
      capturedAt: "2026-07-21T15:00:01.000Z",
      activeWindow: undefined,
      windows: [],
    };
    expect((await sync.refresh()).windows).toEqual([]);
  });
});
