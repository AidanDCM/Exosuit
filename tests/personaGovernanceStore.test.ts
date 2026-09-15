import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPersonaProfile } from "../src/personaBehavior.js";
import { EncryptedPersonaGovernanceStore } from "../src/personaGovernanceStore.js";
import { PersonaGovernanceLedger } from "../src/personaProfileVault.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function profile() {
  return createPersonaProfile({
    contractVersion: 1,
    profileId: "11111111-1111-4111-8111-111111111111",
    ownerId: "owner-a",
    version: 1,
    createdAt: "2026-08-04T00:00:00.000Z",
    status: "evaluating",
    ownerApproved: false,
    traits: { cautiousness: 0, patience: 0, exploration: 0, directness: 0, expressiveness: 0, thoroughness: 0 },
    timing: {
      minimumThinkingMs: 100, maximumThinkingMs: 5_000, baseReactionMs: 300, readingMsPer100Characters: 700,
      uncertaintyMultiplier: 1.5, riskMultiplier: 1.5, familiarityDiscount: 0.8, urgencyDiscount: 0.75,
      deterministicVariationFraction: 0,
    },
    imperfection: {
      strategy: "observed_distribution_only", purpose: "personalization_not_evasion", maximumDraftTypoProbability: 0,
      maximumDraftMisclickProbability: 0, maximumImperfectionsPerActionChunk: 0, immediateCorrectionRequired: true,
      suppressAtOrAboveRisk: "medium", suppressDuringFinalSubmission: true,
    },
    habits: [],
  });
}

async function fixture(key = randomBytes(32)) {
  const directory = await mkdtemp(join(tmpdir(), "exosuit-governance-"));
  directories.push(directory);
  return { directory, key, store: new EncryptedPersonaGovernanceStore({ directory, key }) };
}

describe("EncryptedPersonaGovernanceStore", () => {
  it("persists an integrity-valid owner decision chain without plaintext owner or profile IDs", async () => {
    const current = profile();
    const ledger = new PersonaGovernanceLedger();
    const first = ledger.transition({
      current,
      request: {
        requestId: randomUUID(), actor: "owner_local", operation: "approve", ownerId: current.ownerId,
        profileId: current.profileId, currentVersion: current.version, localTransport: true, interactiveOwnerPresent: true,
        requestedAt: "2026-08-04T11:00:00.000Z", reason: "Owner approved the evaluated profile.",
      },
      decidedAt: "2026-08-04T11:00:01.000Z",
    });
    const second = ledger.transition({
      current: first.nextProfile!,
      request: {
        requestId: randomUUID(), actor: "owner_local", operation: "delete", ownerId: current.ownerId,
        profileId: current.profileId, currentVersion: first.nextProfile!.version, localTransport: true, interactiveOwnerPresent: true,
        requestedAt: "2026-08-04T11:00:02.000Z", reason: "Owner requested complete profile deletion.",
      },
      decidedAt: "2026-08-04T11:00:03.000Z",
    });
    const saved = await fixture();
    await saved.store.saveRecord(first.record);
    await saved.store.saveRecord(second.record);
    await saved.store.saveDeletionCertificate(second.deletionCertificate!);

    expect(await saved.store.loadRecord(first.record.recordHash)).toEqual(first.record);
    expect(await saved.store.loadDeletionCertificate(second.deletionCertificate!.certificateHash)).toEqual(second.deletionCertificate);
    expect((await saved.store.listRecords()).map((record) => record.recordHash)).toEqual([first.record.recordHash, second.record.recordHash]);
    expect(await saved.store.verifyStoredChain()).toBe(true);

    const serialized = (await Promise.all((await readdir(saved.directory)).map((name) => readFile(join(saved.directory, name), "utf8")))).join("\n");
    expect(serialized).not.toContain(current.ownerId);
    expect(serialized).not.toContain(current.profileId);
    expect(serialized).not.toContain("complete profile deletion");
  });

  it("rejects wrong keys, tampering, and non-chain record sets", async () => {
    const current = profile();
    const firstLedger = new PersonaGovernanceLedger();
    const first = firstLedger.transition({
      current,
      request: {
        requestId: randomUUID(), actor: "owner_local", operation: "approve", ownerId: current.ownerId,
        profileId: current.profileId, currentVersion: current.version, localTransport: true, interactiveOwnerPresent: true,
        requestedAt: "2026-08-04T11:00:00.000Z", reason: "approve",
      },
      decidedAt: "2026-08-04T11:00:01.000Z",
    });
    const saved = await fixture();
    await saved.store.saveRecord(first.record);
    const wrong = new EncryptedPersonaGovernanceStore({ directory: saved.directory, key: randomBytes(32) });
    await expect(wrong.loadRecord(first.record.recordHash)).rejects.toThrow(/authentication failed/i);

    const [name] = await readdir(saved.directory);
    const path = join(saved.directory, name!);
    const envelope = JSON.parse(await readFile(path, "utf8")) as { ciphertext: string };
    envelope.ciphertext = `${envelope.ciphertext.startsWith("A") ? "B" : "A"}${envelope.ciphertext.slice(1)}`;
    await writeFile(path, JSON.stringify(envelope));
    await expect(saved.store.loadRecord(first.record.recordHash)).rejects.toThrow(/authentication failed/i);

    const isolated = await fixture();
    const secondLedger = new PersonaGovernanceLedger();
    const unrelated = secondLedger.transition({
      current,
      request: {
        requestId: randomUUID(), actor: "owner_local", operation: "approve", ownerId: current.ownerId,
        profileId: current.profileId, currentVersion: current.version, localTransport: true, interactiveOwnerPresent: true,
        requestedAt: "2026-08-04T12:00:00.000Z", reason: "unrelated",
      },
      decidedAt: "2026-08-04T12:00:01.000Z",
    });
    await isolated.store.saveRecord(unrelated.record);
    await isolated.store.saveRecord({ ...first.record, decidedAt: "2026-08-04T13:00:01.000Z" } as never).catch(() => undefined);
    expect(await isolated.store.verifyStoredChain()).toBe(true);
  });
});
