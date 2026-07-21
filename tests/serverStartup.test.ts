import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FakeDesktopAgent } from "../src/agent.js";
import { HashChainLedger } from "../src/audit.js";
import { FileWorkflowCheckpointStore } from "../src/fileCheckpointStore.js";
import { ExosuitOrchestrator } from "../src/orchestrator.js";
import { createExosuitMcpServerWithState } from "../src/server.js";
import { FileAgentRegistryStore } from "../src/supervisorStore.js";
import type { RuntimeWorkflowRecord } from "../src/workflowRuntime.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "exosuit-startup-"));
  roots.push(value);
  return value;
}

function workflow(): RuntimeWorkflowRecord {
  return {
    definition: {
      contractVersion: 1,
      workflowId: "startup-workflow",
      requestedBy: "test",
      riskCeiling: "low",
      steps: [
        {
          stepId: "observe",
          dependsOn: [],
          workspaceId: "workspace-a",
          resourceMode: "read",
          actionIntent: "Observe test state.",
          expectedResult: "State observed.",
          timeoutMs: 5_000,
          inputArtifactNames: [],
          outputArtifactNames: [],
          externalEffect: "none",
        },
      ],
    },
    status: "paused",
    createdAt: "2026-07-21T16:00:00.000Z",
    updatedAt: "2026-07-21T16:00:01.000Z",
    pauseReason: "restart-test",
    checkpointVersion: 1,
    steps: {
      observe: {
        step: {
          stepId: "observe",
          dependsOn: [],
          workspaceId: "workspace-a",
          resourceMode: "read",
          actionIntent: "Observe test state.",
          expectedResult: "State observed.",
          timeoutMs: 5_000,
          inputArtifactNames: [],
          outputArtifactNames: [],
          externalEffect: "none",
        },
        status: "pending",
        attempts: 0,
        verificationStatus: "not_checked",
      },
    },
    completedIdempotencyKeys: [],
  };
}

describe("durable MCP server startup", () => {
  it("hydrates workflow checkpoints and supervisor agents before serving tools", async () => {
    const directory = await root();
    const workflowDirectory = join(directory, "workflows");
    const agentPath = join(directory, "agents.json");
    await new FileWorkflowCheckpointStore({ directory: workflowDirectory }).save(workflow(), []);
    await new FileAgentRegistryStore({ path: agentPath }).save([
      {
        contractVersion: 1,
        agentId: "agent-vm",
        machineId: "machine-vm",
        windowsSessionId: "session-vm",
        userSessionKind: "vm",
        capabilities: ["uia"],
        healthState: "offline",
        lastHeartbeatAt: "2026-07-21T16:00:00.000Z",
        softwareVersion: "0.1.0",
        minimumContractVersion: 1,
        maximumContractVersion: 1,
      },
    ]);

    const orchestrator = new ExosuitOrchestrator({
      agent: new FakeDesktopAgent({ mode: "sandbox" }),
      ledger: new HashChainLedger(),
    });
    const result = await createExosuitMcpServerWithState(orchestrator, {
      EXOSUIT_WORKFLOW_STATE_DIR: workflowDirectory,
      EXOSUIT_AGENT_REGISTRY_PATH: agentPath,
    });
    expect(result.server).toBeDefined();
    expect(result.startup).toEqual({
      workflowPersistenceMode: "file",
      hydratedWorkflows: 1,
      hydratedAgents: 1,
    });
  });

  it("fails closed when persisted state is corrupt", async () => {
    const directory = await root();
    const workflowDirectory = join(directory, "workflows");
    const agentPath = join(directory, "agents.json");
    await new FileWorkflowCheckpointStore({ directory: workflowDirectory }).save(workflow(), []);
    await new FileAgentRegistryStore({ path: agentPath }).save([]);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(agentPath, "{not-json", "utf8");

    const orchestrator = new ExosuitOrchestrator({
      agent: new FakeDesktopAgent({ mode: "sandbox" }),
      ledger: new HashChainLedger(),
    });
    await expect(
      createExosuitMcpServerWithState(orchestrator, {
        EXOSUIT_WORKFLOW_STATE_DIR: workflowDirectory,
        EXOSUIT_AGENT_REGISTRY_PATH: agentPath,
      }),
    ).rejects.toThrow();
  });
});
