import { describe, expect, it } from "vitest";
import { selectBrainRoute } from "../src/brainRouting.js";
import { CockpitEventJournal, createCockpitState, verifyCockpitState } from "../src/cockpitState.js";
import { PersonalTaskController } from "../src/personalTaskControl.js";

function route() {
  return selectBrainRoute({
    interactiveOwnerPresent: true,
    requiresUnattendedContinuation: false,
    requiresWriteTools: true,
    estimatedApiCostUsd: 0,
    preference: "prefer_mcp",
    mcp: { connected: true, writeToolsAvailable: true, sessionId: "cockpit-test" },
    api: { configured: true, budgetRemainingUsd: 5, maximumTaskSpendUsd: 1 },
  });
}

describe("cockpit state", () => {
  it("projects task progress without exposing goals, variables, screenshots, credentials, or persona text", async () => {
    const tasks = new PersonalTaskController();
    const created = await tasks.create({
      recipeId: "gather-approved-information",
      requestedBy: "owner",
      goal: "Sensitive task goal that must not reach the cockpit state.",
      variables: { query: "sensitive task variable" },
      brain: route(),
      createdAt: "2026-08-04T16:00:00.000Z",
    });
    await tasks.start(created.taskId, true);

    const state = createCockpitState({
      generatedAt: "2026-08-04T16:01:00.000Z",
      field: { status: "ready", ready: true, generation: 3 },
      brain: {
        preferredProvider: "chatgpt_mcp",
        mcpStatus: "ready",
        apiStatus: "disabled",
        apiFallbackEnabled: false,
      },
      tasks: tasks.list(),
      persona: { profileIdHash: "a".repeat(64), version: 2, status: "approved" },
    });

    expect(verifyCockpitState(state)).toBe(true);
    expect(state.task.active).toMatchObject({
      taskId: created.taskId,
      recipeId: "gather-approved-information",
      status: "running",
      progressPercent: 0,
    });
    expect(state.controls).toMatchObject({ canPause: true, canResume: false, canCancel: true });
    expect(state.privacy).toEqual({
      rawScreenshotIncluded: false,
      rawCredentialsIncluded: false,
      rawTaskGoalIncluded: false,
      rawTaskVariablesIncluded: false,
      rawPersonaTextIncluded: false,
    });
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("Sensitive task goal");
    expect(serialized).not.toContain("sensitive task variable");
  });

  it("surfaces a privacy-safe approval reason without including the action payload", async () => {
    const tasks = new PersonalTaskController();
    const created = await tasks.create({
      recipeId: "prepare-message-stop-before-send",
      requestedBy: "owner",
      goal: "Prepare a draft without sending it.",
      brain: route(),
    });
    await tasks.start(created.taskId, true);
    const first = tasks.planNextChunk(created.taskId, { maximumSteps: 1 });
    await tasks.recordTrustedOutcome({
      chunk: first,
      trustedLocalAdapter: true,
      outcome: "verified",
      completedStepIndexes: [0],
      summary: "Context collected.",
      evidenceHash: "b".repeat(64),
    });
    const second = tasks.planNextChunk(created.taskId, { maximumSteps: 1 });
    await tasks.recordTrustedOutcome({
      chunk: second,
      trustedLocalAdapter: true,
      outcome: "verified",
      completedStepIndexes: [1],
      summary: "Draft prepared locally.",
      evidenceHash: "c".repeat(64),
    });
    const immediate = tasks.planNextChunk(created.taskId, { maximumSteps: 1 });
    await tasks.recordTrustedOutcome({
      chunk: immediate,
      trustedLocalAdapter: true,
      outcome: "needs_owner",
      completedStepIndexes: [],
      summary: "Owner review is required before placing identity-sensitive text.",
      evidenceHash: "d".repeat(64),
    });

    const state = createCockpitState({
      field: { status: "ready", ready: true },
      brain: {
        preferredProvider: "chatgpt_mcp",
        mcpStatus: "ready",
        apiStatus: "disabled",
        apiFallbackEnabled: false,
      },
      tasks: tasks.list(),
    });
    expect(state.task.pendingApproval).toEqual({
      taskId: created.taskId,
      stepKey: "place-draft",
      approvalClass: "immediate",
      reasonCode: "consequential_or_sensitive_action",
    });
    expect(state.controls.canResume).toBe(false);
  });

  it("rejects active recording without consent", () => {
    expect(() => createCockpitState({
      field: { status: "ready", ready: true },
      brain: {
        preferredProvider: "none",
        mcpStatus: "offline",
        apiStatus: "disabled",
        apiFallbackEnabled: false,
      },
      tasks: [],
      recording: { mode: "teach", consentActive: false },
    })).toThrow("without active consent");
  });

  it("maintains a privacy-safe hash chain for cockpit events", () => {
    const journal = new CockpitEventJournal();
    const first = journal.append({
      eventType: "field_status_changed",
      reasonCode: "field_ready",
      occurredAt: "2026-08-04T16:00:00.000Z",
    });
    const second = journal.append({
      eventType: "task_created",
      taskId: "11111111-1111-4111-8111-111111111111",
      reasonCode: "reviewed_recipe_selected",
      occurredAt: "2026-08-04T16:00:01.000Z",
    });
    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    expect(second.previousEventHash).toBe(first.eventHash);
    expect(second.containsSensitiveContent).toBe(false);
    expect(journal.verify()).toBe(true);
  });
});
