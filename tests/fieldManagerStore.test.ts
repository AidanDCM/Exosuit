import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFieldAttestation, fieldDisplayContractSchema, fieldIdentitySchema, fieldPolicySchema } from "../src/fieldContracts.js";
import { FakeFieldProvisioner, FieldManager } from "../src/fieldManager.js";
import { FileFieldManagerStateStore } from "../src/fieldManagerStore.js";

const roots: string[] = [];
const secret = "field-manager-store-test-secret-long-enough-for-hmac";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function statePath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "exosuit-field-manager-"));
  roots.push(root);
  return join(root, "field-manager-state.json");
}

function fixture() {
  const fieldId = randomUUID();
  const identity = fieldIdentitySchema.parse({
    subsystem: "field", fieldId, fieldGeneration: 1, agentId: "field-agent-store", machineId: "vm-store",
    windowsSessionId: "session-store", baseImageDigest: "a".repeat(64), personalStateDiskId: "personal-store",
    personalStateGeneration: 1, taskDiskId: "task-store", createdAt: "2026-07-28T20:00:00.000Z",
  });
  const display = fieldDisplayContractSchema.parse({
    monitorCount: 1, width: 1920, height: 1080, scalePercent: 100, browserZoomPercent: 100,
    keyboardLayout: "en-US", dynamicResolutionAllowed: false,
  });
  const policy = fieldPolicySchema.parse({
    contractVersion: 1, policyId: randomUUID(), field: { fieldId, fieldGeneration: 1 }, mode: "teach",
    allowedExecutables: [{ processName: "notepad.exe", executableSha256: "d".repeat(64) }],
    allowedCapabilities: ["observe_desktop", "record_demonstration", "file_workspace"],
    allowedOrigins: ["https://example.com"], maximumRuntimeSeconds: 3_600, maximumActions: 1_000,
    recordingConsent: "granted", allowHostDesktopAccess: false, allowHostDriveWrite: false,
    allowPrivilegeEscalation: false, allowSecurityControlChanges: false,
    issuedAt: "2026-07-28T20:00:00.000Z", expiresAt: "2026-07-28T21:00:00.000Z",
  });
  const attestation = createFieldAttestation({
    identity, display, policy, issuerKeyId: "field-manager-store-test-key", secret,
    issuedAt: "2026-07-28T20:00:00.000Z", ttlSeconds: 600,
  });
  return { identity, policy, attestation };
}

async function provisionedManager() {
  const manager = new FieldManager({ provisioner: new FakeFieldProvisioner() });
  const sample = fixture();
  manager.plan({ identity: sample.identity, gloveAgentId: "glove-agent-store", actor: "owner", now: new Date("2026-07-28T20:00:00.000Z") });
  await manager.provision({ field: sample.identity, policy: sample.policy, attestation: sample.attestation,
    attestationSecret: secret, actor: "field-manager", now: new Date("2026-07-28T20:00:01.000Z") });
  return { manager, sample };
}

describe("durable Field Manager state", () => {
  it("restores lifecycle, policy binding, and verified audit after restart", async () => {
    const store = new FileFieldManagerStateStore({ path: await statePath() });
    const { manager, sample } = await provisionedManager();
    await store.save(manager, new Date("2026-07-28T20:00:02.000Z"));
    const restored = await store.restore(new FakeFieldProvisioner());
    expect(restored.get(sample.identity)?.lifecycle).toBe("ready");
    expect(restored.verifyAudit()).toBe(true);
    expect(restored.enterMode({ field: sample.identity, policy: sample.policy, actor: "owner",
      now: new Date("2026-07-28T20:00:03.000Z") }).lifecycle).toBe("teaching");
  });

  it("rejects tampering before hydrating manager authority", async () => {
    const path = await statePath();
    const store = new FileFieldManagerStateStore({ path });
    const { manager } = await provisionedManager();
    await store.save(manager);
    const envelope = JSON.parse(await readFile(path, "utf8")) as { state: { records: Array<{ gloveAgentId: string }> } };
    envelope.state.records[0]!.gloveAgentId = "attacker-agent";
    await writeFile(path, JSON.stringify(envelope), "utf8");
    await expect(store.restore(new FakeFieldProvisioner())).rejects.toThrow(/integrity verification/);
  });

  it("rejects duplicate bindings and broken audit chains even when schema-valid", async () => {
    const { manager } = await provisionedManager();
    const duplicate = manager.exportState();
    duplicate.policyBindings.push(structuredClone(duplicate.policyBindings[0]!));
    expect(() => new FieldManager({ provisioner: new FakeFieldProvisioner(), state: duplicate })).toThrow(/duplicate policy binding/);
    const broken = manager.exportState();
    broken.audit[0]!.previousHash = "f".repeat(64);
    expect(() => new FieldManager({ provisioner: new FakeFieldProvisioner(), state: broken })).toThrow(/chain verification/);
  });

  it("starts empty when no snapshot exists and enforces configured size limits", async () => {
    const small = new FileFieldManagerStateStore({ path: await statePath(), maxBytes: 1_024 });
    expect((await small.restore(new FakeFieldProvisioner())).exportState().records).toEqual([]);
    const { manager } = await provisionedManager();
    await expect(small.save(manager)).rejects.toThrow(/size limit/);
  });
});
