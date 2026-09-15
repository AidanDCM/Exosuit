import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FakeDesktopAgent } from "../src/agent.js";
import { HashChainLedger } from "../src/audit.js";
import { selectBrainRoute } from "../src/brainRouting.js";
import { EncryptedProductTaskStore } from "../src/encryptedProductTaskStore.js";
import { FileWorkflowCheckpointStore } from "../src/fileCheckpointStore.js";
import { ExosuitOrchestrator } from "../src/orchestrator.js";
import { PersonalTaskController } from "../src/personalTaskControl.js";
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

function orchestrator() {
  return new ExosuitOrchestrator({
    agent: new FakeDesktopAgent({ mode: "sandbox" }),
    ledger: new HashChainLedger(),
  });
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

    const result = await createExosuitMcpServerWithState(orchestrator(), {
      EXOSUIT_WORKFLOW_STATE_DIR: workflowDirectory,
      EXOSUIT_AGENT_REGISTRY_PATH: agentPath,
    });
    expect(result.server).toBeDefined();
    expect(result.startup).toEqual({
      workflowPersistenceMode: "file",
      hydratedWorkflows: 1,
      hydratedAgents: 1,
      hydratedProductTasks: 0,
      mcpSurface: "core",
    });
  });

  it("reports the composed full surface and still hydrates state", async () => {
    const directory = await root();
    const workflowDirectory = join(directory, "workflows");
    const agentPath = join(directory, "agents.json");
    await new FileWorkflowCheckpointStore({ directory: workflowDirectory }).save(workflow(), []);
    await new FileAgentRegistryStore({ path: agentPath }).save([]);

    const result = await createExosuitMcpServerWithState(orchestrator(), {
      EXOSUIT_WORKFLOW_STATE_DIR: workflowDirectory,
      EXOSUIT_AGENT_REGISTRY_PATH: agentPath,
      EXOSUIT_MCP_SURFACE: "full",
    });
    expect(result.startup.mcpSurface).toBe("full");
    expect(result.startup.hydratedWorkflows).toBe(1);
    expect(result.startup.hydratedProductTasks).toBe(0);
  });

  it("reports the product surface independently of the coordinator", async () => {
    const result = await createExosuitMcpServerWithState(orchestrator(), {
      EXOSUIT_MCP_SURFACE: "product",
    });
    expect(result.startup).toMatchObject({
      workflowPersistenceMode: "memory",
      hydratedWorkflows: 0,
      hydratedAgents: 0,
      hydratedProductTasks: 0,
      mcpSurface: "product",
    });
  });

  it("hydrates encrypted product tasks when the directory and key are paired", async () => {
    const directory = await root();
    const taskDirectory = join(directory, "tasks");
    const key = Buffer.alloc(32, 7);
    const controller = new PersonalTaskController({
      store: new EncryptedProductTaskStore({ directory: taskDirectory, key }),
    });
    await controller.create({
      recipeId: "gather-approved-information",
      requestedBy: "owner",
      goal: "Hydrate encrypted task state.",
      brain: selectBrainRoute({
        interactiveOwnerPresent: true,
        requiresUnattendedContinuation: false,
        requiresWriteTools: false,
        estimatedApiCostUsd: 0,
        preference: "prefer_mcp",
        mcp: { connected: true, writeToolsAvailable: false },
        api: { configured: false, budgetRemainingUsd: 0, maximumTaskSpendUsd: 0 },
      }),
    });

    const result = await createExosuitMcpServerWithState(orchestrator(), {
      EXOSUIT_MCP_SURFACE: "product",
      EXOSUIT_PRODUCT_TASK_DIR: taskDirectory,
      EXOSUIT_PRODUCT_TASK_KEY: key.toString("base64url"),
    });
    expect(result.startup.hydratedProductTasks).toBe(1);
  });

  it("fails closed when only one durable product-task setting is supplied", async () => {
    const directory = await root();
    await expect(createExosuitMcpServerWithState(orchestrator(), {
      EXOSUIT_PRODUCT_TASK_DIR: join(directory, "tasks"),
    })).rejects.toThrow("EXOSUIT_PRODUCT_TASK_KEY is required");
    await expect(createExosuitMcpServerWithState(orchestrator(), {
      EXOSUIT_PRODUCT_TASK_KEY: Buffer.alloc(32, 3).toString("base64url"),
    })).rejects.toThrow("EXOSUIT_PRODUCT_TASK_DIR is required");
  });

  it("fails startup on an unrecognized surface rather than defaulting", async () => {
    await expect(
      createExosuitMcpServerWithState(orchestrator(), { EXOSUIT_MCP_SURFACE: "everything" }),
    ).rejects.toThrow(/must be "core", "product", or "full"/);
  });

  it("fails closed when persisted state is corrupt", async () => {
    const directory = await root();
    const workflowDirectory = join(directory, "workflows");
    const agentPath = join(directory, "agents.json");
    await new FileWorkflowCheckpointStore({ directory: workflowDirectory }).save(workflow(), []);
    await new FileAgentRegistryStore({ path: agentPath }).save([]);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(agentPath, "{not-json", "utf8");

    await expect(
      createExosuitMcpServerWithState(orchestrator(), {
        EXOSUIT_WORKFLOW_STATE_DIR: workflowDirectory,
        EXOSUIT_AGENT_REGISTRY_PATH: agentPath,
      }),
    ).rejects.toThrow();
  });
});
