import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileSkillRegistryStore, PersistentSkillRegistry } from "../src/skillStore.js";
import { SkillManifestSigner, type SkillManifestUnsigned } from "../src/skills.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "exosuit-skill-store-"));
  roots.push(root);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signer = new SkillManifestSigner({
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeys: {
      "owner-key-1": publicKey.export({ type: "spki", format: "pem" }).toString(),
    },
  });
  return { root, path: join(root, "skills.json"), signer };
}

function manifest(overrides: Partial<SkillManifestUnsigned> = {}): SkillManifestUnsigned {
  return {
    schemaVersion: 1,
    skillId: "example.persisted-skill",
    version: "1.0.0",
    displayName: "Persisted skill",
    allowedAgents: ["agent-a"],
    allowedApplications: ["notepad"],
    allowedOrigins: ["https://example.test"],
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    maximumSteps: 10,
    maximumDurationMs: 30_000,
    riskCeiling: "medium",
    requiredApprovals: ["local_click"],
    verificationPlan: ["Verify expected state."],
    recoveryPlan: ["Observe and stop on uncertainty."],
    retentionPolicy: "workflow",
    issuedAt: "2026-07-21T16:00:00.000Z",
    keyId: "owner-key-1",
    ...overrides,
  };
}

describe("persistent skill registry", () => {
  it("survives restart while preserving enabled and revoked state", async () => {
    const { path, signer } = await fixture();
    const store = new FileSkillRegistryStore({ path });
    const first = await PersistentSkillRegistry.open(signer, store);
    await first.install(signer.sign(manifest()));
    await first.enable("example.persisted-skill");

    const second = await PersistentSkillRegistry.open(signer, store);
    expect(second.registry.get("example.persisted-skill")?.enabled).toBe(true);
    await second.revoke("example.persisted-skill");

    const third = await PersistentSkillRegistry.open(signer, store);
    expect(third.registry.get("example.persisted-skill")).toMatchObject({ enabled: false });
    expect(third.registry.get("example.persisted-skill")?.revokedAt).toBeDefined();
    expect(() => third.registry.enable("example.persisted-skill")).toThrow(/revoked/);
  });

  it("detects tampering and rejects duplicate or invalid persisted state", async () => {
    const { path, signer } = await fixture();
    const store = new FileSkillRegistryStore({ path });
    const signed = signer.sign(manifest());
    await store.save([
      { manifest: signed, enabled: false, installedAt: "2026-07-21T16:00:00.000Z" },
    ]);
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      payload: { skills: Array<{ enabled: boolean }> };
    };
    parsed.payload.skills[0]!.enabled = true;
    await writeFile(path, JSON.stringify(parsed), "utf8");
    await expect(store.load()).rejects.toThrow(/integrity verification/);

    await expect(
      store.save([
        { manifest: signed, enabled: false, installedAt: "2026-07-21T16:00:00.000Z" },
        { manifest: signed, enabled: false, installedAt: "2026-07-21T16:00:01.000Z" },
      ]),
    ).rejects.toThrow(/Duplicate installed skill/);
    await expect(
      store.save([
        {
          manifest: signed,
          enabled: true,
          installedAt: "2026-07-21T16:00:00.000Z",
          revokedAt: "2026-07-21T16:00:01.000Z",
        },
      ]),
    ).rejects.toThrow(/revoked persisted skill/);
  });
});
