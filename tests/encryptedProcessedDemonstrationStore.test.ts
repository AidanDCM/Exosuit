import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DemonstrationRecorder } from "../src/demonstration.js";
import { EncryptedFileDemonstrationStore } from "../src/encryptedDemonstrationStore.js";
import {
  EncryptedDemonstrationCorpus,
  EncryptedFileProcessedDemonstrationStore,
} from "../src/encryptedProcessedDemonstrationStore.js";

const roots: string[] = [];
const layout = "a".repeat(64);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function stores() {
  const root = await mkdtemp(join(tmpdir(), "exosuit-processed-corpus-"));
  roots.push(root);
  const source = new EncryptedFileDemonstrationStore({ directory: join(root, "source"), key: randomBytes(32) });
  const derivedKey = randomBytes(32);
  const derived = new EncryptedFileProcessedDemonstrationStore({ directory: join(root, "derived"), key: derivedKey });
  return { root, source, derived, derivedKey, corpus: new EncryptedDemonstrationCorpus({ source, derived }) };
}

function episode() {
  const recorder = new DemonstrationRecorder({
    field: { fieldId: randomUUID(), fieldGeneration: 1 }, operatorId: "aidan",
    goal: "Open the strongest result.", successCriteria: ["result opened"],
    consentGrantedAt: "2026-07-28T21:59:59.000Z", startedAt: "2026-07-28T22:00:00.000Z",
  });
  recorder.append({ source: "input", kind: "click", occurredAt: "2026-07-28T22:00:00.100Z", payload: { button: "left" } });
  recorder.append({ source: "annotation", kind: "semantic_step", occurredAt: "2026-07-28T22:00:00.300Z",
    payload: { sourceSequenceStart: 0, sourceSequenceEnd: 0, observationKey: "results", intent: "Open strongest result",
      targetKey: "result-card", method: "mouse", expectedResult: "Result detail appears", label: "preferred",
      layoutFingerprint: layout, features: ["open", "result", "strongest"] } });
  return recorder.complete({ successful: true, summary: "Opened.", endedAt: "2026-07-28T22:00:01.000Z" });
}

describe("encrypted processed demonstration corpus", () => {
  it("processes encrypted source, survives restart, and exposes no plaintext behavior", async () => {
    const { root, source, derived, derivedKey, corpus } = await stores();
    const raw = episode();
    await source.save(raw);
    const processed = await corpus.processSource(raw.episodeId, "2026-07-28T22:01:00.000Z");
    expect(await derived.list()).toEqual([raw.episodeId]);
    expect((await derived.load(raw.episodeId))?.sourceEpisodeHash).toBe(processed.sourceEpisodeHash);

    const [file] = await readdir(join(root, "derived"));
    const bytes = await readFile(join(root, "derived", file!), "utf8");
    expect(bytes).not.toContain("Open strongest result");
    expect(bytes).not.toContain("result-card");
    expect(bytes).not.toContain("aidan");
    expect(bytes).toContain('"algorithm":"aes-256-gcm"');

    const reopened = new EncryptedFileProcessedDemonstrationStore({ directory: join(root, "derived"), key: derivedKey });
    const index = await reopened.hydrateIndex();
    expect(index.retrieve({ operatorId: "aidan", layoutFingerprint: layout, features: ["open", "result"] })).toHaveLength(1);
  });

  it("fails authentication after tampering and never advertises wrong-key records", async () => {
    const { root, source, derived, corpus } = await stores();
    const raw = episode();
    await source.save(raw);
    await corpus.processSource(raw.episodeId);
    const wrong = new EncryptedFileProcessedDemonstrationStore({ directory: join(root, "derived"), key: randomBytes(32) });
    expect(await wrong.list()).toEqual([]);
    await expect(wrong.load(raw.episodeId)).rejects.toThrow(/authentication failed/);

    const [name] = await readdir(join(root, "derived"));
    const path = join(root, "derived", name!);
    const envelope = JSON.parse(await readFile(path, "utf8")) as { ciphertext: string };
    envelope.ciphertext = `${envelope.ciphertext.startsWith("A") ? "B" : "A"}${envelope.ciphertext.slice(1)}`;
    await writeFile(path, JSON.stringify(envelope), "utf8");
    await expect(derived.load(raw.episodeId)).rejects.toThrow(/authentication failed/);
  });

  it("deletes derived behavior before deleting its source episode", async () => {
    const { source, derived, corpus } = await stores();
    const raw = episode();
    await source.save(raw);
    await corpus.processSource(raw.episodeId);
    await corpus.deleteSource(raw.episodeId);
    expect(await derived.load(raw.episodeId)).toBeUndefined();
    expect(await source.load(raw.episodeId)).toBeUndefined();
    expect((await corpus.hydrateIndex()).size()).toBe(0);
  });

  it("rejects weak keys, missing sources, and undersized record budgets", async () => {
    const root = await mkdtemp(join(tmpdir(), "exosuit-processed-bounds-"));
    roots.push(root);
    expect(() => new EncryptedFileProcessedDemonstrationStore({ directory: root, key: randomBytes(16) })).toThrow(/32 bytes/);
    const { corpus, derived, source } = await stores();
    await expect(corpus.processSource(randomUUID())).rejects.toThrow(/does not exist/);
    const raw = episode();
    await source.save(raw);
    const processed = await corpus.processSource(raw.episodeId);
    const small = new EncryptedFileProcessedDemonstrationStore({ directory: join(root, "small"), key: randomBytes(32), maxRecordBytes: 1_024 });
    await expect(small.save(processed)).rejects.toThrow(/size limit/);
    expect(await derived.list()).toEqual([raw.episodeId]);
  });
});
