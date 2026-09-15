import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EncryptedFileWorkflowCheckpointStore } from "../src/encryptedCheckpointStore.js";
import type { RuntimeWorkflowRecord, WorkflowArtifact } from "../src/workflowRuntime.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "exosuit-encrypted-checkpoint-"));
  roots.push(value);
  return value;
}

function workflow(id = "workflow-sensitive"): RuntimeWorkflowRecord {
  return {
    definition: {
      contractVersion: 1,
      workflowId: id,
      requestedBy: "test",
      riskCeiling: "high",
      steps: [
        {
          stepId: "capture",
          dependsOn: [],
          workspaceId: "workspace-a",
          resourceMode: "read",
          actionIntent: "Capture private test state.",
          expectedResult: "Private state captured.",
          timeoutMs: 5_000,
          inputArtifactNames: [],
          outputArtifactNames: ["privateResult"],
          externalEffect: "none",
        },
      ],
    },
    status: "paused",
    createdAt: "2026-07-21T15:00:00.000Z",
    updatedAt: "2026-07-21T15:00:01.000Z",
    pauseReason: "test",
    checkpointVersion: 1,
    steps: {
      capture: {
        step: {
          stepId: "capture",
          dependsOn: [],
          workspaceId: "workspace-a",
          resourceMode: "read",
          actionIntent: "Capture private test state.",
          expectedResult: "Private state captured.",
          timeoutMs: 5_000,
          inputArtifactNames: [],
          outputArtifactNames: ["privateResult"],
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

function sensitiveArtifact(): WorkflowArtifact {
  return {
    artifactId: "4f970c50-12fd-4a08-8700-0791a8c15ff9",
    workflowId: "workflow-sensitive",
    name: "privateResult",
    value: { privateText: "this value must not appear in plaintext" },
    sourceStepId: "capture",
    capturedAt: "2026-07-21T15:00:01.000Z",
    classification: "sensitive",
    retention: "workflow",
    integrityHash: "a".repeat(64),
  };
}

describe("encrypted file workflow checkpoint store", () => {
  it("round-trips sensitive artifacts without plaintext leakage", async () => {
    const directory = await root();
    const key = randomBytes(32);
    const store = new EncryptedFileWorkflowCheckpointStore({ directory, key });
    await store.save(workflow(), [sensitiveArtifact()]);

    const [name] = await readdir(directory);
    const serialized = await readFile(join(directory, name!), "utf8");
    expect(serialized).not.toContain("workflow-sensitive");
    expect(serialized).not.toContain("privateResult");
    expect(serialized).not.toContain("this value must not appear in plaintext");
    expect(await store.list()).toEqual(["workflow-sensitive"]);
    expect(await store.load("workflow-sensitive")).toEqual({
      workflow: workflow(),
      artifacts: [sensitiveArtifact()],
    });
  });

  it("rejects the wrong key and authenticated-envelope tampering", async () => {
    const directory = await root();
    const store = new EncryptedFileWorkflowCheckpointStore({ directory, key: randomBytes(32) });
    await store.save(workflow(), [sensitiveArtifact()]);

    const wrongKey = new EncryptedFileWorkflowCheckpointStore({ directory, key: randomBytes(32) });
    await expect(wrongKey.load("workflow-sensitive")).rejects.toThrow(/authentication failed/);
    expect(await wrongKey.list()).toEqual([]);

    const [name] = await readdir(directory);
    const path = join(directory, name!);
    const envelope = JSON.parse(await readFile(path, "utf8")) as { ciphertext: string };
    envelope.ciphertext = `${envelope.ciphertext.startsWith("A") ? "B" : "A"}${envelope.ciphertext.slice(1)}`;
    await writeFile(path, JSON.stringify(envelope), "utf8");
    await expect(store.load("workflow-sensitive")).rejects.toThrow(/authentication failed/);
  });

  it("requires exactly 32 bytes of key material and supports deletion", async () => {
    const directory = await root();
    expect(() => new EncryptedFileWorkflowCheckpointStore({ directory, key: Buffer.alloc(16) })).toThrow(
      /exactly 32 bytes/,
    );
    const store = new EncryptedFileWorkflowCheckpointStore({ directory, key: randomBytes(32) });
    await store.save(workflow(), []);
    await store.delete("workflow-sensitive");
    expect(await store.load("workflow-sensitive")).toBeUndefined();
  });
});
