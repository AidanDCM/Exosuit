import { createHash } from "node:crypto";
import type { ExosuitOrchestrator } from "./orchestrator.js";
import type { WorkflowRuntime } from "./workflowRuntime.js";
import type { WorkspaceSnapshot } from "./coordinator.js";

export class WorkspaceSynchronizer {
  readonly #orchestrator: ExosuitOrchestrator;
  readonly #runtime: WorkflowRuntime;
  readonly #agentId: string;
  readonly #windowsSessionId: string;
  readonly #workspaceId: string;
  readonly #identity = new Map<string, { fingerprint: string; generation: number }>();
  #registryVersion = 0;

  constructor(options: {
    orchestrator: ExosuitOrchestrator;
    runtime: WorkflowRuntime;
    agentId?: string;
    windowsSessionId?: string;
    workspaceId?: string;
  }) {
    this.#orchestrator = options.orchestrator;
    this.#runtime = options.runtime;
    this.#agentId = options.agentId ?? "local-agent";
    this.#windowsSessionId = options.windowsSessionId ?? "interactive-session";
    this.#workspaceId = options.workspaceId ?? "local-workspace";
  }

  async refresh(): Promise<WorkspaceSnapshot> {
    const observation = await this.#orchestrator.observe({
      includeElements: false,
      includeScreenshot: false,
      maxElements: 1,
    });
    const seen = new Set<string>();
    const windows = observation.windows.map((window) => {
      seen.add(window.id);
      const fingerprint = hashIdentity({
        processName: window.processName,
        processId: window.processId,
        title: window.title,
      });
      const prior = this.#identity.get(window.id);
      const generation =
        prior && prior.fingerprint === fingerprint
          ? prior.generation
          : (prior?.generation ?? 0) + 1;
      this.#identity.set(window.id, { fingerprint, generation });
      return {
        agentId: this.#agentId,
        windowsSessionId: this.#windowsSessionId,
        windowId: window.id,
        windowGeneration: generation,
        processId: window.processId,
        processName: window.processName || "unknown",
        fingerprint,
        virtualDesktopId: null,
        isActive: window.isActive,
        isVisible: true,
        isMinimized: window.isMinimized,
      };
    });
    for (const windowId of this.#identity.keys()) {
      if (!seen.has(windowId)) this.#identity.delete(windowId);
    }
    const snapshot: WorkspaceSnapshot = {
      contractVersion: 1,
      workspaceId: this.#workspaceId,
      agentId: this.#agentId,
      windowsSessionId: this.#windowsSessionId,
      currentVirtualDesktopId: null,
      windowRegistryVersion: ++this.#registryVersion,
      capturedAt: observation.capturedAt,
      unexpectedDialogWindowId: null,
      windows,
    };
    return this.#runtime.updateWorkspace(snapshot);
  }
}

function hashIdentity(value: {
  processName: string;
  processId: number;
  title: string;
}): string {
  return createHash("sha256")
    .update(`${value.processName.toLowerCase()}\n${value.processId}\n${value.title}`)
    .digest("hex");
}
