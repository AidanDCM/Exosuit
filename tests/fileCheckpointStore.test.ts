import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileWorkflowCheckpointStore } from "../src/fileCheckpointStore.js";
import type { RuntimeWorkflowRecord, WorkflowArtifact } from "../src/workflowRuntime.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function directory(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "exosuit-checkpoint-"));
  directories.push(value);
  return value;
}

function workflow(id = "workflow-a"): RuntimeWorkflowRecord {
  return {
    definition: {
      contractVersion: 1,
      workflowId: id,
      requestedBy: "test",
      riskCeiling: "low",
      steps: [
        {
          stepId: "step-a",
          dependsOn: [],
          workspaceId: "workspace-a",
          resourceMode: "read",
          actionIntent: "Read test state.",
          expectedResult: "State captured.",
          timeoutMs: 5_000,
          inputArtifactNames: [],
          outputArtifactNames: ["result"],
          externalEffect: "none",
        },
      ],
    },
    status: "paused",
    createdAt: "2026-07-21T15:00:00.000Z",
    updatedAt: "2026-07-21T15:00:01.000Z",
    pauseReason: "test",
    checkpointVersion: 2,
    steps: {
      "step-a": {
        step: {
          stepId: "step-a",
          dependsOn: [],
          workspaceId: "workspace-a",
          resourceMode: "read",
          actionIntent: "Read test state.",
          expectedResult: "State captured.",
          timeoutMs: 5_000,
          inputArtifactNames: [],
          outputArtifactNames: ["result"],
          externalEffect: "none",
        },
        status: "succeeded",
        attempts: 1,
        completedAt: "2026-07-21T15:00:01.000Z",
        summary: "Captured.",
        verificationStatus: "passed",
      },
    },
    completedIdempotencyKeys: [],
  };
}

function artifact(overrides: Partial<WorkflowArtifact> = {}): WorkflowArtifact {
  return {
    artifactId: "4f970c50-12fd-4a08-8700-0791a8c15ff9",
    workflowId: "workflow-a",
    name: "result",
    value: { answer: 42 },
    sourceStepId: "step-a",
    capturedAt: "2026-07-21T15:00:01.000Z",
    classification: "internal",
    retention: "workflow",
    integrityHash: "a".repeat(64),
    ...overrides,
  };
}

describe("file workflow checkpoint store", () => {
  it("atomically saves, lists, loads, and deletes a checkpoint", async () => {
    const root = await directory();
    const store = new FileWorkflowCheckpointStore({ directory: root });
    await store.save(workflow(), []);
    expect(await store.list()).toEqual(["workflow-a"]);
    expect(await store.load("workflow-a")).toEqual({ workflow: workflow(), artifacts: [] });
    const names = await readdir(root);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^[a-f0-9]{64}\.checkpoint\.json$/);
    expect(names[0]).not.toContain("workflow-a");
    await store.delete("workflow-a");
    expect(await store.load("workflow-a")).toBeUndefined();
  });

  it("detects envelope tampering", async () => {
    const root = await directory();
    const store = new FileWorkflowCheckpointStore({ directory: root });
    await store.save(workflow(), []);
    const [name] = await readdir(root);
    const path = join(root, name!);
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      payload: { workflow: { status: string } };
    };
    parsed.payload.workflow.status = "completed";
    await writeFile(path, JSON.stringify(parsed), "utf8");
    await expect(store.load("workflow-a")).rejects.toThrow(/integrity verification/);
    expect(await store.list()).toEqual([]);
  });

  it("refuses unencrypted sensitive artifacts", async () => {
    const root = await directory();
    const store = new FileWorkflowCheckpointStore({ directory: root });
    await expect(
      store.save(workflow(), [artifact({ classification: "sensitive" })]),
    ).rejects.toThrow(/encrypted checkpoint store/);
    expect(await readdir(root).catch(() => [])).toEqual([]);
  });

  it("enforces checkpoint size bounds", async () => {
    const root = await directory();
    const store = new FileWorkflowCheckpointStore({
      directory: root,
      maxCheckpointBytes: 1_024,
    });
    const oversized = workflow();
    oversized.steps["step-a"]!.summary = "x".repeat(2_000);
    await expect(store.save(oversized, [])).rejects.toThrow(/size limit/);
  });
});
