import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { selectBrainRoute } from "../src/brainRouting.js";
import { EncryptedProductTaskStore, parseProductTaskEncryptionKey } from "../src/encryptedProductTaskStore.js";
import { PersonalTaskController } from "../src/personalTaskControl.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function route() {
  return selectBrainRoute({
    interactiveOwnerPresent: true,
    requiresUnattendedContinuation: false,
    requiresWriteTools: true,
    estimatedApiCostUsd: 0,
    preference: "prefer_mcp",
    mcp: { connected: true, writeToolsAvailable: true, sessionId: "encrypted-task-test" },
    api: { configured: false, budgetRemainingUsd: 0, maximumTaskSpendUsd: 0 },
  });
}

async function makeDirectory(): Promise<string> {
  const value = await mkdtemp(path.join(os.tmpdir(), "exosuit-encrypted-task-"));
  temporaryDirectories.push(value);
  return value;
}

describe("encrypted product task storage", () => {
  it("persists and hydrates tasks without exposing task content or identifiers in plaintext", async () => {
    const root = await makeDirectory();
    const key = randomBytes(32);
    const store = new EncryptedProductTaskStore({ directory: root, key });
    const controller = new PersonalTaskController({ store });
    const task = await controller.create({
      recipeId: "gather-approved-information",
      requestedBy: "owner-local",
      goal: "Collect sensitive local planning notes.",
      variables: { query: "sensitive local planning" },
      brain: route(),
    });

    const [name] = await readdir(root);
    expect(name).toMatch(/^[a-f0-9]{64}\.product-task\.enc\.json$/);
    const stored = await readFile(path.join(root, name!), "utf8");
    expect(stored).not.toContain(task.taskId);
    expect(stored).not.toContain(task.goal);
    expect(stored).not.toContain("sensitive local planning");
    expect(stored).not.toContain("owner-local");

    const restored = new PersonalTaskController({ store: new EncryptedProductTaskStore({ directory: root, key }) });
    expect(await restored.hydrate()).toBe(1);
    expect(restored.get(task.taskId)).toMatchObject({
      taskId: task.taskId,
      goal: task.goal,
      variables: task.variables,
      taskHash: task.taskHash,
    });
  });

  it("rejects a wrong key and excludes unreadable records from discovery", async () => {
    const root = await makeDirectory();
    const store = new EncryptedProductTaskStore({ directory: root, key: randomBytes(32) });
    const controller = new PersonalTaskController({ store });
    const task = await controller.create({
      recipeId: "gather-approved-information",
      requestedBy: "owner",
      goal: "Encrypted task.",
      brain: route(),
    });

    const wrong = new EncryptedProductTaskStore({ directory: root, key: randomBytes(32) });
    expect(await wrong.list()).toEqual([]);
    await expect(wrong.load(task.taskId)).rejects.toThrow("authentication failed");
  });

  it("rejects ciphertext tampering and never advertises the corrupted checkpoint", async () => {
    const root = await makeDirectory();
    const key = randomBytes(32);
    const store = new EncryptedProductTaskStore({ directory: root, key });
    const controller = new PersonalTaskController({ store });
    const task = await controller.create({
      recipeId: "gather-approved-information",
      requestedBy: "owner",
      goal: "Integrity test.",
      brain: route(),
    });
    const [name] = await readdir(root);
    const location = path.join(root, name!);
    const envelope = JSON.parse(await readFile(location, "utf8")) as { ciphertext: string };
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`;
    await writeFile(location, JSON.stringify(envelope), "utf8");

    expect(await store.list()).toEqual([]);
    await expect(store.load(task.taskId)).rejects.toThrow("authentication failed");
  });

  it("accepts exact 32-byte hex and base64url environment keys and rejects other lengths", () => {
    const key = randomBytes(32);
    expect(parseProductTaskEncryptionKey(key.toString("hex"))).toEqual(key);
    expect(parseProductTaskEncryptionKey(key.toString("base64url"))).toEqual(key);
    expect(parseProductTaskEncryptionKey(undefined)).toBeUndefined();
    expect(() => parseProductTaskEncryptionKey(randomBytes(31).toString("base64url"))).toThrow("exactly 32 bytes");
  });
});
