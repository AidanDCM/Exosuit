import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkflowRuntimeFromEnvironment } from "../src/runtimeFactory.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "exosuit-runtime-factory-"));
  roots.push(value);
  return value;
}

describe("workflow runtime environment factory", () => {
  it("uses memory persistence by default", () => {
    const bundle = createWorkflowRuntimeFromEnvironment({});
    expect(bundle.persistenceMode).toBe("memory");
    expect(bundle.stateDirectory).toBeUndefined();
  });

  it("uses integrity-protected file persistence when only a directory is configured", async () => {
    const directory = await root();
    const bundle = createWorkflowRuntimeFromEnvironment({ EXOSUIT_WORKFLOW_STATE_DIR: directory });
    expect(bundle.persistenceMode).toBe("file");
    expect(bundle.stateDirectory).toBe(directory);
  });

  it("uses encrypted persistence when a 32-byte base64url key is configured", async () => {
    const directory = await root();
    const bundle = createWorkflowRuntimeFromEnvironment({
      EXOSUIT_WORKFLOW_STATE_DIR: directory,
      EXOSUIT_WORKFLOW_STATE_KEY: randomBytes(32).toString("base64url"),
      EXOSUIT_WORKFLOW_MAX_CHECKPOINT_BYTES: "1048576",
    });
    expect(bundle.persistenceMode).toBe("encrypted_file");
  });

  it("fails closed for incomplete or malformed persistence settings", async () => {
    const directory = await root();
    expect(() =>
      createWorkflowRuntimeFromEnvironment({
        EXOSUIT_WORKFLOW_STATE_KEY: randomBytes(32).toString("base64url"),
      }),
    ).toThrow(/requires EXOSUIT_WORKFLOW_STATE_DIR/);
    expect(() =>
      createWorkflowRuntimeFromEnvironment({ EXOSUIT_WORKFLOW_MAX_CHECKPOINT_BYTES: "1000" }),
    ).toThrow(/requires EXOSUIT_WORKFLOW_STATE_DIR/);
    expect(() =>
      createWorkflowRuntimeFromEnvironment({
        EXOSUIT_WORKFLOW_STATE_DIR: directory,
        EXOSUIT_WORKFLOW_MAX_CHECKPOINT_BYTES: "not-a-number",
      }),
    ).toThrow(/positive integer/);
    expect(() =>
      createWorkflowRuntimeFromEnvironment({
        EXOSUIT_WORKFLOW_STATE_DIR: directory,
        EXOSUIT_WORKFLOW_STATE_KEY: Buffer.alloc(16).toString("base64url"),
      }),
    ).toThrow(/exactly 32 bytes/);
  });
});
