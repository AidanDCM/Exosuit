import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { DemonstrationRecorder } from "../src/demonstration.js";
import { EncryptedFileDemonstrationStore } from "../src/encryptedDemonstrationStore.js";

const directories: string[] = [];

async function directory(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "exosuit-demonstrations-"));
  directories.push(value);
  return value;
}

function completedEpisode(options: { fieldId?: string; generation?: number; includeSecret?: boolean } = {}) {
  const recorder = new DemonstrationRecorder({
    field: { fieldId: options.fieldId ?? randomUUID(), fieldGeneration: options.generation ?? 1 },
    operatorId: "aidan",
    goal: "Inspect a fixture site and save the strongest result.",
    successCriteria: ["one result saved"],
    consentGrantedAt: "2026-07-21T17:59:59.000Z",
    startedAt: "2026-07-21T18:00:00.000Z",
  });
  recorder.append({
    source: "input",
    kind: "type_text",
    occurredAt: "2026-07-21T18:00:00.100Z",
    payload: options.includeSecret
      ? { keyDownAtUs: 100, accessToken: "must-not-survive" }
      : { keyDownAtUs: 100, textLength: 5 },
  });
  return recorder.complete({
    successful: true,
    summary: "Fixture result saved.",
    artifactIds: ["artifact-1"],
    endedAt: "2026-07-21T18:00:01.000Z",
  });
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("encrypted demonstration store", () => {
  it("round trips terminal episodes without plaintext metadata leakage", async () => {
    const path = await directory();
    const key = randomBytes(32);
    const store = new EncryptedFileDemonstrationStore({ directory: path, key });
    const episode = completedEpisode({ includeSecret: true });

    await store.save(episode);
    expect(await store.list()).toEqual([episode.episodeId]);
    const loaded = await store.load(episode.episodeId);
    expect(loaded).toMatchObject({ episodeId: episode.episodeId, status: "completed" });
    expect(loaded?.events[0]?.payload).toMatchObject({ keyDownAtUs: 100, accessToken: "[REDACTED]" });

    const [name] = await readdir(path);
    const raw = await readFile(join(path, name!), "utf8");
    expect(raw).not.toContain(episode.goal);
    expect(raw).not.toContain("must-not-survive");
    expect(raw).toContain('"algorithm":"aes-256-gcm"');
  });

  it("rejects recording episodes and inline visual byte fields", async () => {
    const path = await directory();
    const store = new EncryptedFileDemonstrationStore({ directory: path, key: randomBytes(32) });
    const recording = new DemonstrationRecorder({
      field: { fieldId: randomUUID(), fieldGeneration: 1 },
      operatorId: "aidan",
      goal: "Still recording.",
      successCriteria: ["not complete"],
      consentGrantedAt: "2026-07-21T17:59:59.000Z",
      startedAt: "2026-07-21T18:00:00.000Z",
    }).snapshot();
    await expect(store.save(recording)).rejects.toThrow(/completed or aborted/);

    const episode = completedEpisode();
    const unsafe = {
      ...episode,
      events: [
        ...episode.events,
        {
          eventId: randomUUID(),
          sequence: episode.events.length,
          occurredAt: "2026-07-21T18:00:00.200Z",
          source: "visual" as const,
          kind: "frame",
          payload: { screenshotBase64: "not-allowed-inline" },
        },
      ],
    };
    await expect(store.save(unsafe)).rejects.toThrow(/visual bytes/);
  });

  it("rejects noncontiguous duplicate or out-of-interval event timelines", async () => {
    const path = await directory();
    const store = new EncryptedFileDemonstrationStore({ directory: path, key: randomBytes(32) });
    const episode = completedEpisode();
    const first = episode.events[0]!;

    await expect(
      store.save({ ...episode, events: [{ ...first, sequence: 2 }] }),
    ).rejects.toThrow(/sequence is not contiguous/);
    await expect(
      store.save({
        ...episode,
        events: [first, { ...first, sequence: 1 }],
      }),
    ).rejects.toThrow(/IDs must be unique/);
    await expect(
      store.save({
        ...episode,
        events: [{ ...first, occurredAt: "2026-07-21T18:00:02.000Z" }],
      }),
    ).rejects.toThrow(/outside the episode interval/);
    await expect(
      store.save({
        ...episode,
        consent: { ...episode.consent, grantedAt: "2026-07-21T18:00:00.500Z" },
      }),
    ).rejects.toThrow(/before recording starts/);
  });

  it("detects tampering and hides wrong-key files from listing", async () => {
    const path = await directory();
    const key = randomBytes(32);
    const store = new EncryptedFileDemonstrationStore({ directory: path, key });
    const episode = completedEpisode();
    await store.save(episode);

    const wrongKeyStore = new EncryptedFileDemonstrationStore({ directory: path, key: randomBytes(32) });
    expect(await wrongKeyStore.list()).toEqual([]);
    await expect(wrongKeyStore.load(episode.episodeId)).rejects.toThrow(/authentication failed/);

    const [name] = await readdir(path);
    const file = join(path, name!);
    const envelope = JSON.parse(await readFile(file, "utf8")) as { ciphertext: string };
    envelope.ciphertext = `${envelope.ciphertext.startsWith("A") ? "B" : "A"}${envelope.ciphertext.slice(1)}`;
    await writeFile(file, JSON.stringify(envelope), "utf8");
    await expect(store.load(episode.episodeId)).rejects.toThrow(/authentication failed/);
  });

  it("deletes one episode or every episode from a selected Field generation", async () => {
    const path = await directory();
    const store = new EncryptedFileDemonstrationStore({ directory: path, key: randomBytes(32) });
    const fieldId = randomUUID();
    const first = completedEpisode({ fieldId, generation: 1 });
    const second = completedEpisode({ fieldId, generation: 2 });
    const other = completedEpisode();
    await Promise.all([store.save(first), store.save(second), store.save(other)]);

    expect(await store.deleteByField(fieldId, 1)).toBe(1);
    expect(await store.load(first.episodeId)).toBeUndefined();
    expect(await store.load(second.episodeId)).toBeDefined();
    expect(await store.deleteByField(fieldId)).toBe(1);
    expect(await store.list()).toEqual([other.episodeId]);
    await store.delete(other.episodeId);
    expect(await store.list()).toEqual([]);
  });
});
