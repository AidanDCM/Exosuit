import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPersonaProfile, type PersonaProfile } from "../src/personaBehavior.js";
import {
  EncryptedPersonaProfileStore,
  PersonaGovernanceLedger,
  personaDeletionCertificateSchema,
  personaGovernanceRecordSchema,
  type PersonaGovernanceOperation,
} from "../src/personaProfileVault.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function profile(version = 1, status: PersonaProfile["status"] = "evaluating", overrides: Partial<PersonaProfile> = {}): PersonaProfile {
  return createPersonaProfile({
    contractVersion: 1,
    profileId: overrides.profileId ?? "11111111-1111-4111-8111-111111111111",
    ownerId: overrides.ownerId ?? "owner-a",
    version,
    ...(version > 1 ? { supersedesVersion: version - 1 } : {}),
    createdAt: `2026-08-04T00:00:0${Math.min(version, 9)}.000Z`,
    status,
    ownerApproved: status === "approved",
    traits: overrides.traits ?? {
      cautiousness: 0.4,
      patience: 0.2,
      exploration: -0.1,
      directness: 0.3,
      expressiveness: 0,
      thoroughness: 0.5,
    },
    timing: overrides.timing ?? {
      minimumThinkingMs: 100,
      maximumThinkingMs: 10_000,
      baseReactionMs: 400,
      readingMsPer100Characters: 900,
      uncertaintyMultiplier: 1.8,
      riskMultiplier: 1.6,
      familiarityDiscount: 0.8,
      urgencyDiscount: 0.75,
      deterministicVariationFraction: 0.1,
    },
    imperfection: overrides.imperfection ?? {
      strategy: "observed_distribution_only",
      purpose: "personalization_not_evasion",
      maximumDraftTypoProbability: 0.03,
      maximumDraftMisclickProbability: 0.01,
      maximumImperfectionsPerActionChunk: 1,
      immediateCorrectionRequired: true,
      suppressAtOrAboveRisk: "medium",
      suppressDuringFinalSubmission: true,
    },
    habits: overrides.habits ?? [{
      habitId: "verify-export-name",
      description: "Verifies exported file names immediately.",
      confidence: 0.8,
      evidenceCount: 12,
      lastObservedAt: "2026-08-03T20:00:00.000Z",
    }],
  });
}

async function store(key = randomBytes(32)): Promise<{ directory: string; store: EncryptedPersonaProfileStore; key: Buffer }> {
  const directory = await mkdtemp(join(tmpdir(), "exosuit-persona-"));
  directories.push(directory);
  return { directory, store: new EncryptedPersonaProfileStore({ directory, key }), key };
}

function request(current: PersonaProfile, operation: PersonaGovernanceOperation, overrides: Record<string, unknown> = {}) {
  return {
    requestId: randomUUID(),
    actor: "owner_local" as const,
    operation,
    ownerId: current.ownerId,
    profileId: current.profileId,
    currentVersion: current.version,
    localTransport: true,
    interactiveOwnerPresent: true,
    requestedAt: "2026-08-04T01:00:00.000Z",
    reason: `${operation} requested by owner`,
    ...overrides,
  };
}

describe("EncryptedPersonaProfileStore", () => {
  it("round-trips integrity-valid versions without plaintext profile metadata", async () => {
    const fixture = await store();
    const first = profile();
    const second = profile(2, "approved");
    await fixture.store.save(first);
    await fixture.store.save(second);

    expect(await fixture.store.load(first.ownerId, first.profileId, 1)).toEqual(first);
    expect(await fixture.store.listVersions(first.ownerId, first.profileId)).toEqual([1, 2]);

    const names = await readdir(fixture.directory);
    expect(names).toHaveLength(2);
    const serialized = await readFile(join(fixture.directory, names[0]!), "utf8");
    expect(serialized).not.toContain(first.ownerId);
    expect(serialized).not.toContain(first.profileId);
    expect(serialized).not.toContain("verify-export-name");
  });

  it("rejects wrong keys and tampered ciphertext", async () => {
    const fixture = await store();
    const value = profile();
    await fixture.store.save(value);
    const wrong = new EncryptedPersonaProfileStore({ directory: fixture.directory, key: randomBytes(32) });
    await expect(wrong.load(value.ownerId, value.profileId, value.version)).rejects.toThrow(/authentication failed/i);

    const [name] = await readdir(fixture.directory);
    const path = join(fixture.directory, name!);
    const envelope = JSON.parse(await readFile(path, "utf8")) as { ciphertext: string };
    envelope.ciphertext = `${envelope.ciphertext.startsWith("A") ? "B" : "A"}${envelope.ciphertext.slice(1)}`;
    await writeFile(path, JSON.stringify(envelope));
    await expect(fixture.store.load(value.ownerId, value.profileId, value.version)).rejects.toThrow(/authentication failed/i);
  });

  it("deletes only the exact requested encrypted version", async () => {
    const fixture = await store();
    const first = profile();
    const second = profile(2, "approved");
    await fixture.store.save(first);
    await fixture.store.save(second);
    await fixture.store.delete(first.ownerId, first.profileId, first.version);
    expect(await fixture.store.load(first.ownerId, first.profileId, 1)).toBeUndefined();
    expect(await fixture.store.load(second.ownerId, second.profileId, 2)).toEqual(second);
  });
});

describe("PersonaGovernanceLedger", () => {
  it("creates a new approved version and an integrity-bound audit record", () => {
    const ledger = new PersonaGovernanceLedger();
    const current = profile();
    const result = ledger.transition({ current, request: request(current, "approve"), decidedAt: "2026-08-04T01:01:00.000Z" });
    expect(result.record.decision).toBe("allow");
    expect(result.nextProfile).toMatchObject({ version: 2, status: "approved", ownerApproved: true, supersedesVersion: 1 });
    expect(result.nextProfile?.profileHash).not.toBe(current.profileHash);
    expect(personaGovernanceRecordSchema.parse(result.record)).toEqual(result.record);
    expect(ledger.verifyChain()).toBe(true);
  });

  it("blocks model, service, remote, and unattended attempts", () => {
    for (const overrides of [
      { actor: "pilot_model" },
      { actor: "field_service" },
      { localTransport: false },
      { interactiveOwnerPresent: false },
    ]) {
      const ledger = new PersonaGovernanceLedger();
      const current = profile();
      const result = ledger.transition({ current, request: request(current, "approve", overrides) });
      expect(result.record.decision).toBe("block");
      expect(result.nextProfile).toBeUndefined();
      expect(result.record.modelMaySatisfyOwnerPresence).toBe(false);
    }
  });

  it("rolls back content by creating a newer approved version", () => {
    const ledger = new PersonaGovernanceLedger();
    const old = profile(1, "approved");
    const current = profile(3, "approved", {
      traits: { ...old.traits, patience: -0.8 },
      habits: [],
    });
    const result = ledger.transition({ current, rollbackTarget: old, request: request(current, "rollback") });
    expect(result.nextProfile).toMatchObject({ version: 4, supersedesVersion: 3, status: "approved" });
    expect(result.nextProfile?.traits).toEqual(old.traits);
    expect(result.nextProfile?.habits).toEqual(old.habits);
  });

  it("produces a privacy-preserving deletion certificate", () => {
    const ledger = new PersonaGovernanceLedger();
    const current = profile(2, "approved");
    const result = ledger.transition({ current, request: request(current, "delete"), decidedAt: "2026-08-04T01:02:00.000Z" });
    expect(result.nextProfile).toBeUndefined();
    expect(result.deletionCertificate).toBeDefined();
    expect(result.deletionCertificate?.ownerIdHash).not.toContain(current.ownerId);
    expect(personaDeletionCertificateSchema.parse(result.deletionCertificate)).toEqual(result.deletionCertificate);
    expect(result.record.deletionCertificateHash).toBe(result.deletionCertificate?.certificateHash);
  });

  it("enforces exact identity, version, rollback direction, and unique requests", () => {
    const ledger = new PersonaGovernanceLedger();
    const current = profile(2, "approved");
    const duplicateRequest = request(current, "retire");
    expect(ledger.transition({ current, request: { ...duplicateRequest, currentVersion: 1 } }).record.decision).toBe("block");
    expect(() => ledger.transition({ current, request: duplicateRequest })).toThrow(/only once/i);

    const freshLedger = new PersonaGovernanceLedger();
    const invalidTarget = profile(3, "approved");
    expect(freshLedger.transition({ current, rollbackTarget: invalidTarget, request: request(current, "rollback") }).record.decision).toBe("block");
  });
});
