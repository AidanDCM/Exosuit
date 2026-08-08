import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPersonaProfile } from "../src/personaBehavior.js";
import type { PersonaEvaluation } from "../src/personaDerivation.js";
import { fitTypingProcessModel } from "../src/personalBehaviorModels.js";
import { createPersonaModelBundle, PersonaModelBundleRegistry } from "../src/personaModelBundle.js";
import { EncryptedPersonaModelStore } from "../src/personaModelStore.js";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

const profile = createPersonaProfile({
  contractVersion: 1, profileId: "11111111-1111-4111-8111-111111111111", ownerId: "owner-a", version: 1,
  createdAt: "2026-08-04T00:00:00.000Z", status: "approved", ownerApproved: true,
  traits: { cautiousness: 0, patience: 0, exploration: 0, directness: 0, expressiveness: 0, thoroughness: 0 },
  timing: { minimumThinkingMs: 100, maximumThinkingMs: 5_000, baseReactionMs: 300, readingMsPer100Characters: 700, uncertaintyMultiplier: 1.5, riskMultiplier: 1.5, familiarityDiscount: 0.8, urgencyDiscount: 0.75, deterministicVariationFraction: 0 },
  imperfection: { strategy: "observed_distribution_only", purpose: "personalization_not_evasion", maximumDraftTypoProbability: 0, maximumDraftMisclickProbability: 0, maximumImperfectionsPerActionChunk: 0, immediateCorrectionRequired: true, suppressAtOrAboveRisk: "medium", suppressDuringFinalSubmission: true },
  habits: [],
});
const evaluation: PersonaEvaluation = {
  contractVersion: 1, trainingCandidateHash: "a".repeat(64), heldOutCandidateHash: "b".repeat(64), trainingEpisodeCount: 2, heldOutEpisodeCount: 2,
  maximumTraitDelta: 0.1, meanTraitDelta: 0.05, habitPrecision: 1, habitRecall: 1, medianTimingRatio: 1.1,
  stableEnoughForOwnerReview: true, reasons: ["Stable."], actionAuthority: "none",
};

function typing() {
  return fitTypingProcessModel({
    ownerId: profile.ownerId, profileId: profile.profileId, profileVersion: 1,
    observations: Array.from({ length: 5 }, (_, index) => ({
      observationId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      sourceEpisodeId: index < 3 ? "20000000-0000-4000-8000-000000000001" : "20000000-0000-4000-8000-000000000002",
      observedAt: `2026-08-04T12:00:0${index}.000Z`, stage: "drafting" as const, risk: "low" as const,
      protectedField: false as const, finalTextMatchedIntent: true as const, submittedExternally: false as const,
      characterCount: 100, durationMs: 10_000, pauseDurationsMs: [200], typoCount: 1, correctionCount: 1,
      backspaceCount: 1, immediateCorrectionCount: 1,
    })),
  });
}

async function fixture(key = randomBytes(32)) {
  const directory = await mkdtemp(join(tmpdir(), "exosuit-model-store-"));
  directories.push(directory);
  return { directory, key, store: new EncryptedPersonaModelStore({ directory, key }) };
}

describe("EncryptedPersonaModelStore", () => {
  it("round-trips models, bundles, and activation records without plaintext personal metrics", async () => {
    const model = typing();
    const bundle = createPersonaModelBundle({ profile, evaluation, typing: model });
    const registry = new PersonaModelBundleRegistry();
    registry.register(bundle);
    const activation = registry.decide({
      profile,
      request: {
        requestId: randomUUID(), actor: "owner_local", ownerId: profile.ownerId, operation: "activate",
        bundleId: bundle.bundleId, bundleHash: bundle.bundleHash, localTransport: true, interactiveOwnerPresent: true,
        requestedAt: "2026-08-04T12:10:00.000Z", reason: "Owner activated the reviewed advisory bundle.",
      },
    });
    const saved = await fixture();
    await saved.store.saveTyping(model);
    await saved.store.saveBundle(bundle);
    await saved.store.saveActivation(activation);
    expect(await saved.store.loadTyping(model.modelHash)).toEqual(model);
    expect(await saved.store.loadBundle(bundle.bundleHash)).toEqual(bundle);
    expect(await saved.store.loadActivation(activation.activationHash)).toEqual(activation);
    expect(await saved.store.listHashes("typing")).toEqual([model.modelHash]);
    const serialized = (await Promise.all((await readdir(saved.directory)).map((name) => readFile(join(saved.directory, name), "utf8")))).join("\n");
    expect(serialized).not.toContain(profile.ownerId);
    expect(serialized).not.toContain(profile.profileId);
    expect(serialized).not.toContain("charactersPerSecond");
  });

  it("rejects wrong keys, tampering, and hash-invalid records", async () => {
    const model = typing();
    const saved = await fixture();
    await saved.store.saveTyping(model);
    const wrong = new EncryptedPersonaModelStore({ directory: saved.directory, key: randomBytes(32) });
    await expect(wrong.loadTyping(model.modelHash)).rejects.toThrow(/authentication failed/i);
    const [name] = await readdir(saved.directory);
    const path = join(saved.directory, name!);
    const envelope = JSON.parse(await readFile(path, "utf8")) as { ciphertext: string };
    envelope.ciphertext = `${envelope.ciphertext.startsWith("A") ? "B" : "A"}${envelope.ciphertext.slice(1)}`;
    await writeFile(path, JSON.stringify(envelope));
    await expect(saved.store.loadTyping(model.modelHash)).rejects.toThrow(/authentication failed/i);
    await expect(saved.store.saveTyping({ ...model, charactersPerSecond: model.charactersPerSecond + 1 })).rejects.toThrow(/integrity/i);
  });

  it("deletes only an exact typed record", async () => {
    const model = typing();
    const saved = await fixture();
    await saved.store.saveTyping(model);
    await saved.store.delete("typing", model.modelHash);
    expect(await saved.store.loadTyping(model.modelHash)).toBeUndefined();
  });
});
