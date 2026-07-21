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
