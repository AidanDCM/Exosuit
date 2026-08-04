import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { selectBrainRoute } from "../src/brainRouting.js";
import {
  FileProductTaskStore,
  PersonalTaskController,
  ProductTaskRecipeRegistry,
  classifyProductApproval,
} from "../src/personalTaskControl.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function route() {
  return selectBrainRoute({
    interactiveOwnerPresent: true,
    requiresUnattendedContinuation: false,
    requiresWriteTools: true,
    estimatedApiCostUsd: 0.1,
    preference: "prefer_mcp",
    mcp: { connected: true, writeToolsAvailable: true, sessionId: "chat-session" },
    api: { configured: true, budgetRemainingUsd: 5, maximumTaskSpendUsd: 1 },
  });
}

describe("personal task control", () => {
  it("ships the five initial MVP recipes", () => {
    const registry = new ProductTaskRecipeRegistry();
    expect(registry.list().map((recipe) => recipe.recipeId)).toEqual([
      "download-and-organize-approved-files",
      "fill-form-stop-before-submit",
      "gather-approved-information",
      "prepare-message-stop-before-send",
      "research-normalize-organize",
    ]);
  });

  it("classifies harmless reads automatically, reversible form work as grouped, and identity-sensitive work immediately", () => {
    const registry = new ProductTaskRecipeRegistry();
    const gather = registry.get("gather-approved-information");
    const form = registry.get("fill-form-stop-before-submit");
    const message = registry.get("prepare-message-stop-before-send");
    expect(classifyProductApproval(gather.steps[0]!)).toBe("automatic");
    expect(classifyProductApproval(form.steps[1]!)).toBe("grouped");
    expect(classifyProductApproval(message.steps[2]!)).toBe("immediate");
  });

  it("creates, starts, plans, verifies, and completes a task without granting execution authority", async () => {
    const controller = new PersonalTaskController();
    const created = await controller.create({
      recipeId: "gather-approved-information",
      requestedBy: "owner",
      goal: "Gather the approved information and prepare a local summary.",
      variables: { query: "example" },
      brain: route(),
      createdAt: "2026-08-04T12:00:00.000Z",
    });
    expect(created.actionAuthority).toBe("none");
    expect(created.executionAllowed).toBe(false);

    const started = await controller.start(created.taskId, true);
    expect(started.status).toBe("running");
    const chunk = controller.planNextChunk(created.taskId, { createdAt: "2026-08-04T12:01:00.000Z" });
    expect(chunk.approvalClass).toBe("automatic");
    expect(chunk.steps).toHaveLength(3);
    expect(chunk.executionAllowed).toBe(false);

    const completed = await controller.recordTrustedOutcome({
      chunk,
      trustedLocalAdapter: true,
      outcome: "verified",
      completedStepIndexes: chunk.steps.map((item) => item.stepIndex),
      summary: "All requested information was verified and summarized locally.",
      evidenceHash: "a".repeat(64),
      recordedAt: "2026-08-04T12:02:00.000Z",
    });
    expect(completed.status).toBe("completed");
    expect(completed.steps.every((record) => record.status === "verified")).toBe(true);
  });

  it("stops a form workflow at the grouped approval boundary", async () => {
    const controller = new PersonalTaskController();
    const created = await controller.create({
      recipeId: "fill-form-stop-before-submit",
      requestedBy: "owner",
      goal: "Prepare the form without submitting it.",
      brain: route(),
    });
    await controller.start(created.taskId, true);
    const observe = controller.planNextChunk(created.taskId);
    expect(observe.approvalClass).toBe("automatic");
    const afterObserve = await controller.recordTrustedOutcome({
      chunk: observe,
      trustedLocalAdapter: true,
      outcome: "verified",
      completedStepIndexes: [0],
      summary: "Form fields were observed.",
      evidenceHash: "b".repeat(64),
    });
    expect(afterObserve.currentStepIndex).toBe(1);
    const fill = controller.planNextChunk(created.taskId);
    expect(fill.approvalClass).toBe("grouped");
    expect(fill.ownerApprovalRequired).toBe(true);
    expect(fill.steps.map((item) => item.step.stepKey)).toEqual(["fill-fields"]);
  });

  it("moves to recovery after the one automatic retry is exhausted", async () => {
    const controller = new PersonalTaskController();
    const created = await controller.create({
      recipeId: "gather-approved-information",
      requestedBy: "owner",
      goal: "Gather information.",
      brain: route(),
    });
    await controller.start(created.taskId, true);
    const first = controller.planNextChunk(created.taskId, { maximumSteps: 1 });
    const retrying = await controller.recordTrustedOutcome({
      chunk: first,
      trustedLocalAdapter: true,
      outcome: "retryable",
      completedStepIndexes: [],
      summary: "The application was still loading.",
      evidenceHash: "c".repeat(64),
    });
    expect(retrying.status).toBe("running");
    const second = controller.planNextChunk(created.taskId, { maximumSteps: 1 });
    const recovery = await controller.recordTrustedOutcome({
      chunk: second,
      trustedLocalAdapter: true,
      outcome: "retryable",
      completedStepIndexes: [],
      summary: "The application remained unavailable after re-observation.",
      evidenceHash: "d".repeat(64),
    });
    expect(recovery.status).toBe("recovery_required");
    expect(recovery.pauseReason).toBe("automatic_retry_budget_exhausted");
  });

  it("persists integrity-bound tasks and excludes tampered checkpoints from discovery", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "exosuit-product-task-"));
    temporaryDirectories.push(directory);
    const store = new FileProductTaskStore({ directory });
    const controller = new PersonalTaskController({ store });
    const created = await controller.create({
      recipeId: "gather-approved-information",
      requestedBy: "owner",
      goal: "Persist this task.",
      brain: route(),
    });

    const restored = new PersonalTaskController({ store });
    expect(await restored.hydrate()).toBe(1);
    expect(restored.get(created.taskId).taskHash).toBe(created.taskHash);

    const [file] = (await import("node:fs/promises")).then
      ? await (await import("node:fs/promises")).readdir(directory)
      : [];
    expect(file).toBeTruthy();
    const location = path.join(directory, file!);
    const parsed = JSON.parse(await readFile(location, "utf8")) as { goal: string };
    parsed.goal = "tampered";
    await writeFile(location, JSON.stringify(parsed), "utf8");
    expect(await store.list()).toEqual([]);
    await expect(store.load(created.taskId)).rejects.toThrow("integrity verification failed");
  });
});
