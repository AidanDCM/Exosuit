import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createFieldAttestation,
  fieldDisplayContractSchema,
  fieldIdentitySchema,
  fieldPolicySchema,
} from "../src/fieldContracts.js";
import { FakeFieldProvisioner, FieldManager } from "../src/fieldManager.js";

const secret = "field-manager-test-secret-that-is-long-enough-for-hmac";
const t = (seconds: number) => new Date(`2026-07-21T18:0${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.000Z`);

function fixture(mode: "teach" | "shadow" | "pilot" = "teach") {
  const fieldId = randomUUID();
  const identity = fieldIdentitySchema.parse({
    subsystem: "field",
    fieldId,
    fieldGeneration: 1,
    agentId: "field-agent-a",
    machineId: "vm-a",
    windowsSessionId: "session-a",
    baseImageDigest: "a".repeat(64),
    personalStateDiskId: "personal-state-a",
    personalStateGeneration: 1,
    taskDiskId: "task-disk-a",
    createdAt: "2026-07-21T18:00:00.000Z",
  });
  const display = fieldDisplayContractSchema.parse({
    monitorCount: 1,
    width: 1920,
    height: 1080,
    scalePercent: 100,
    browserZoomPercent: 100,
    keyboardLayout: "en-US",
    dynamicResolutionAllowed: false,
  });
  const policy = fieldPolicySchema.parse({
    contractVersion: 1,
    policyId: randomUUID(),
    field: { fieldId, fieldGeneration: 1 },
    mode,
    allowedExecutables: [
      { processName: "chrome.exe", executableSha256: "c".repeat(64) },
      { processName: "notepad.exe", executableSha256: "d".repeat(64) },
    ],
    allowedCapabilities:
      mode === "teach"
        ? ["observe_desktop", "record_demonstration", "file_workspace"]
        : mode === "shadow"
          ? ["observe_desktop", "predict_next_action"]
          : ["observe_desktop", "semantic_input", "physical_input", "file_workspace"],
    allowedOrigins: ["https://example.com"],
    maximumRuntimeSeconds: 3_600,
    maximumActions: 10_000,
    recordingConsent: mode === "teach" ? "granted" : "not_applicable",
    allowHostDesktopAccess: false,
    allowHostDriveWrite: false,
    allowPrivilegeEscalation: false,
    allowSecurityControlChanges: false,
    issuedAt: "2026-07-21T18:00:00.000Z",
    expiresAt: "2026-07-21T19:00:00.000Z",
  });
  const attestation = createFieldAttestation({
    identity,
    display,
    policy,
    issuerKeyId: "field-manager-test-key",
    secret,
    issuedAt: "2026-07-21T18:00:00.000Z",
    ttlSeconds: 600,
  });
  return { identity, display, policy, attestation };
}

describe("fake first field manager", () => {
  it("runs a complete planned to provisioned to taught to stopped to destroyed pulse", async () => {
    const provider = new FakeFieldProvisioner();
    const manager = new FieldManager({ provisioner: provider });
    const sample = fixture("teach");
    manager.plan({ identity: sample.identity, gloveAgentId: "glove-agent-a", actor: "owner", now: t(0) });
    expect(
      await manager.provision({
        field: sample.identity,
        policy: sample.policy,
        attestation: sample.attestation,
        attestationSecret: secret,
        actor: "field-manager",
        now: t(1),
      }),
    ).toMatchObject({ lifecycle: "ready" });
    expect(manager.enterMode({ field: sample.identity, policy: sample.policy, actor: "owner", now: t(2) }).lifecycle).toBe("teaching");
    expect(
      manager.returnReady({
        field: sample.identity,
        actor: "owner",
        reason: "Demonstration completed.",
        now: t(3),
      }).lifecycle,
    ).toBe("ready");
    expect(
      (await manager.stop({ field: sample.identity, actor: "owner", reason: "Task complete.", now: t(4) })).lifecycle,
    ).toBe("stopped");
    expect((await manager.destroy({ field: sample.identity, actor: "field-manager", now: t(5) })).lifecycle).toBe("destroyed");
    expect(provider.events.map((event) => event.split(":")[0])).toEqual(["provision", "stop", "destroy"]);
    expect(manager.auditTail().map((event) => event.eventType)).toEqual([
      "field_planned",
      "field_provisioning_started",
      "field_ready",
      "field_mode_entered",
      "field_mode_exited",
      "field_stopping",
      "field_stopped",
      "field_destroyed",
    ]);
    expect(manager.verifyAudit()).toBe(true);
  });

  it("faults visibly when fake provisioning fails and can still be destroyed", async () => {
    const manager = new FieldManager({ provisioner: new FakeFieldProvisioner({ failProvision: true }) });
    const sample = fixture("shadow");
    manager.plan({ identity: sample.identity, gloveAgentId: "glove-agent-a", actor: "owner", now: t(0) });
    const faulted = await manager.provision({
      field: sample.identity,
      policy: sample.policy,
      attestation: sample.attestation,
      attestationSecret: secret,
      actor: "field-manager",
      now: t(1),
    });
    expect(faulted).toMatchObject({ lifecycle: "faulted", faultReason: "Fake field provisioning failed." });
    expect((await manager.destroy({ field: sample.identity, actor: "field-manager", now: t(2) })).lifecycle).toBe("destroyed");
    expect(manager.verifyAudit()).toBe(true);
  });

  it("rejects a changed policy before provisioning mutates lifecycle", async () => {
    const manager = new FieldManager({ provisioner: new FakeFieldProvisioner() });
    const sample = fixture("pilot");
    manager.plan({ identity: sample.identity, gloveAgentId: "glove-agent-a", actor: "owner", now: t(0) });
    const changedPolicy = fieldPolicySchema.parse({ ...sample.policy, maximumActions: sample.policy.maximumActions + 1 });
    await expect(
      manager.provision({
        field: sample.identity,
        policy: changedPolicy,
        attestation: sample.attestation,
        attestationSecret: secret,
        actor: "field-manager",
        now: t(1),
      }),
    ).rejects.toThrow(/policy hash/);
    expect(manager.get(sample.identity)?.lifecycle).toBe("planned");
    expect(manager.auditTail().map((event) => event.eventType)).toEqual(["field_planned"]);
  });

  it("rejects policy substitution or expiry after provisioning", async () => {
    const manager = new FieldManager({ provisioner: new FakeFieldProvisioner() });
    const sample = fixture("teach");
    manager.plan({ identity: sample.identity, gloveAgentId: "glove-agent-a", actor: "owner", now: t(0) });
    await manager.provision({
      field: sample.identity,
      policy: sample.policy,
      attestation: sample.attestation,
      attestationSecret: secret,
      actor: "field-manager",
      now: t(1),
    });
    const substituted = fieldPolicySchema.parse({
      ...sample.policy,
      policyId: randomUUID(),
      mode: "shadow",
      allowedCapabilities: ["observe_desktop", "predict_next_action"],
      recordingConsent: "not_applicable",
    });
    expect(() => manager.enterMode({ field: sample.identity, policy: substituted, actor: "owner", now: t(2) })).toThrow(
      /differs from the policy used for provisioning/,
    );
    expect(() =>
      manager.enterMode({ field: sample.identity, policy: sample.policy, actor: "owner", now: new Date("2026-07-21T19:00:00.000Z") }),
    ).toThrow(/expired/);
    expect(manager.get(sample.identity)?.lifecycle).toBe("ready");
  });
});
