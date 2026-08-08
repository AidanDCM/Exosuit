import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FakeFieldChannelKeyRotationProvider, FieldChannelKeyRotationCoordinator } from "../src/fieldChannelKeyRotation.js";
import { FileFieldChannelKeyRotationStateStore } from "../src/fieldChannelKeyRotationStore.js";

const roots: string[] = [];
const field = { fieldId: randomUUID(), fieldGeneration: 1 };
const secret = "rotation-state-integrity-secret-that-is-long-enough";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "exosuit-rotation-store-"));
  roots.push(root);
  const path = join(root, "rotation-state.json");
  const store = new FileFieldChannelKeyRotationStateStore({ path, field });
  const coordinator = new FieldChannelKeyRotationCoordinator({
    provider: new FakeFieldChannelKeyRotationProvider(), field, activeKeyId: "field-key-1",
  });
  return { root, path, store, state: coordinator.exportState() };
}

describe("protected Field channel-key rotation state store", () => {
  it("round trips authenticated state without persisting the integrity secret", async () => {
    const { path, store, state } = await fixture();
    await store.save(state, secret);
    expect(await store.load(secret)).toEqual(state);
    expect(await readFile(path, "utf8")).not.toContain(secret);
  });

  it("returns undefined only for a missing state file", async () => {
    const { store } = await fixture();
    expect(await store.load(secret)).toBeUndefined();
  });

  it("rejects tag and payload corruption without changing stored bytes", async () => {
    for (const property of ["authenticationTag", "payloadBase64"] as const) {
      const { path, store, state } = await fixture();
      await store.save(state, secret);
      const envelope = JSON.parse(await readFile(path, "utf8")) as Record<string, string>;
      const replacement = property === "authenticationTag"
        ? (envelope[property]?.startsWith("a") ? "b" : "a")
        : (envelope[property]?.startsWith("A") ? "B" : "A");
      envelope[property] = `${replacement}${envelope[property]?.slice(1)}`;
      await writeFile(path, JSON.stringify(envelope), "utf8");
      const before = await readFile(path, "utf8");
      await expect(store.load(secret)).rejects.toThrow(/authentication/);
      expect(await readFile(path, "utf8")).toBe(before);
    }
  });

  it("rejects wrong secrets, plaintext legacy state, and cross-generation envelopes", async () => {
    const { path, store, state } = await fixture();
    await store.save(state, secret);
    await expect(store.load("different-rotation-integrity-secret-that-is-long-enough")).rejects.toThrow(/authentication/);
    await writeFile(path, JSON.stringify(state), "utf8");
    await expect(store.load(secret)).rejects.toThrow(/envelope is malformed/);

    const otherStore = new FileFieldChannelKeyRotationStateStore({ path, field: { ...field, fieldGeneration: 2 } });
    await store.save(state, secret);
    await expect(otherStore.load(secret)).rejects.toThrow(/cross Field generations/);
  });

  it("rejects oversized files, weak secrets, and contradictory authenticated payloads", async () => {
    const { path, store, state } = await fixture();
    await expect(store.save(state, "short")).rejects.toThrow(/at least 32/);
    await writeFile(path, "A".repeat(192 * 1024 + 1), "utf8");
    await expect(store.load(secret)).rejects.toThrow(/oversized/);

    const invalid = { ...state, continuationBlocked: true };
    await expect(store.save(invalid, secret)).rejects.toThrow(/Blocked rotation state/);
  });

  it("atomically replaces a prior valid state and leaves no temporary files", async () => {
    const { root, path, store, state } = await fixture();
    await store.save(state, secret);
    await store.save({ ...state, activeKeyId: "field-key-2" }, secret);
    expect((await store.load(secret))?.activeKeyId).toBe("field-key-2");
    const names = await import("node:fs/promises").then(({ readdir }) => readdir(root));
    expect(names).toEqual(["rotation-state.json"]);
    expect(await readFile(path, "utf8")).toContain('"algorithm":"hmac-sha256"');
  });
});
