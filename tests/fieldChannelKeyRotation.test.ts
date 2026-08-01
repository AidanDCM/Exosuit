import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFieldChannelEnvelope, FieldChannelReplayGuard } from "../src/fieldChannel.js";
import {
  FakeFieldChannelKeyRotationProvider,
  FieldChannelKeyRotationCoordinator,
  fieldChannelKeyRotationRequestSchema,
  fieldChannelKeyRotationStateSchema,
  type FieldChannelKeyRotationProvider,
} from "../src/fieldChannelKeyRotation.js";

const field = { fieldId: randomUUID(), fieldGeneration: 1 };
const now = new Date("2026-08-01T06:00:00.000Z");

function request(overrides: Record<string, unknown> = {}) {
  const rotationId = typeof overrides.rotationId === "string" ? overrides.rotationId : randomUUID();
  const authorizationOverrides = (overrides.authorization as Record<string, unknown> | undefined) ?? {};
  return fieldChannelKeyRotationRequestSchema.parse({
    rotationId,
    field,
    currentKeyId: "field-key-1",
    nextKeyId: "field-key-2",
    nextSecretHandle: "local-owner-vault://field-key-2",
    ...overrides,
    authorization: {
      requestId: rotationId,
      field,
      actor: "owner_local",
      operation: "rotate_channel_key",
      localTransport: true,
      interactiveOwnerPresent: true,
      requestedAt: now.toISOString(),
      reason: "Owner initiated a bounded channel-key rotation.",
      ...authorizationOverrides,
    },
  });
}

describe("Field channel-key rotation coordinator", () => {
  it("commits an exact owner-authorized rotation without persisting the secret handle", async () => {
    const provider = new FakeFieldChannelKeyRotationProvider();
    const coordinator = new FieldChannelKeyRotationCoordinator({ provider, field, activeKeyId: "field-key-1" });

    const result = await coordinator.rotate(request(), now);

    expect(result).toMatchObject({ status: "committed", activeKeyId: "field-key-2", reconciled: false });
    expect(coordinator.isActiveKeyId("field-key-1")).toBe(false);
    expect(coordinator.isActiveKeyId("field-key-2")).toBe(true);
    expect(provider.events).toEqual([`prepare:${result.rotationId}`, `commit:${result.rotationId}`]);
    const serialized = JSON.stringify({ result, state: coordinator.exportState(), events: provider.events });
    expect(serialized).not.toContain("local-owner-vault");

    const restored = new FieldChannelKeyRotationCoordinator({ provider, state: coordinator.exportState() });
    expect(restored.isActiveKeyId("field-key-2")).toBe(true);
  });

  it("feeds the committed key identity into the existing replay guard so old-key traffic is denied", async () => {
    const coordinator = new FieldChannelKeyRotationCoordinator({
      provider: new FakeFieldChannelKeyRotationProvider(),
      field,
      activeKeyId: "field-key-1",
    });
    await coordinator.rotate(request(), now);
    const activeKeyId = coordinator.exportState().activeKeyId;
    const guard = new FieldChannelReplayGuard({ field, direction: "guest_to_host", expectedKeyId: activeKeyId });
    const envelopeInput = {
      field,
      direction: "guest_to_host" as const,
      sequence: 1,
      messageType: "heartbeat" as const,
      payload: { status: "ready" },
      sentAt: now.toISOString(),
      ttlSeconds: 10,
    };
    const oldEnvelope = createFieldChannelEnvelope({ ...envelopeInput, keyId: "field-key-1", secret: "old-channel-secret-that-is-long-enough" });
    const nextEnvelope = createFieldChannelEnvelope({ ...envelopeInput, keyId: "field-key-2", secret: "next-channel-secret-that-is-long-enough" });

    expect(() => guard.accept({ envelope: oldEnvelope, secret: "old-channel-secret-that-is-long-enough", now })).toThrow(/key identity/);
    expect(guard.accept({ envelope: nextEnvelope, secret: "next-channel-secret-that-is-long-enough", now }).keyId).toBe("field-key-2");
  });

  it("rejects model, service, absent-owner, remote, stale, and detached authorizations before provider effects", async () => {
    const invalid = [
      request({ authorization: { actor: "pilot_model" } }),
      request({ authorization: { actor: "field_service" } }),
      request({ authorization: { interactiveOwnerPresent: false } }),
      request({ authorization: { localTransport: false } }),
      request({ authorization: { requestedAt: "2026-08-01T05:54:59.000Z" } }),
      request({ authorization: { requestId: randomUUID() } }),
    ];
    for (const value of invalid) {
      const provider = new FakeFieldChannelKeyRotationProvider();
      const coordinator = new FieldChannelKeyRotationCoordinator({ provider, field, activeKeyId: "field-key-1" });
      await expect(coordinator.rotate(value, now)).rejects.toThrow();
      expect(provider.events).toEqual([]);
    }
  });

  it("rejects cross-generation, stale-current, same-key, and replayed requests", async () => {
    const provider = new FakeFieldChannelKeyRotationProvider();
    const coordinator = new FieldChannelKeyRotationCoordinator({ provider, field, activeKeyId: "field-key-1" });
    await expect(coordinator.rotate(request({
      field: { ...field, fieldGeneration: 2 },
      authorization: { field: { ...field, fieldGeneration: 2 } },
    }), now)).rejects.toThrow(/cross Field generations/);
    await expect(coordinator.rotate(request({ currentKeyId: "field-key-old" }), now)).rejects.toThrow(/current key/);
    await expect(coordinator.rotate(request({ nextKeyId: "field-key-1" }), now)).rejects.toThrow(/distinct/);

    const accepted = request();
    await coordinator.rotate(accepted, now);
    await expect(coordinator.rotate({ ...accepted, currentKeyId: "field-key-2", nextKeyId: "field-key-3" }, now)).rejects.toThrow(/replayed/);
  });

  it("rolls back a prepared next key after a failed commit", async () => {
    const provider = new FakeFieldChannelKeyRotationProvider({ failCommit: true });
    const coordinator = new FieldChannelKeyRotationCoordinator({ provider, field, activeKeyId: "field-key-1" });
    const result = await coordinator.rotate(request(), now);

    expect(result).toMatchObject({ status: "rolled_back", activeKeyId: "field-key-1", reconciled: true });
    expect(provider.events.map((event) => event.split(":")[0])).toEqual(["prepare", "commit", "reconcile", "rollback"]);
    expect(coordinator.isActiveKeyId("field-key-1")).toBe(true);
  });

  it("adopts an exact new key only when reconciliation proves it active", async () => {
    const provider = new FakeFieldChannelKeyRotationProvider({ failCommit: true, forcedReconciliation: "next_active" });
    const coordinator = new FieldChannelKeyRotationCoordinator({ provider, field, activeKeyId: "field-key-1" });
    const result = await coordinator.rotate(request(), now);

    expect(result).toMatchObject({ status: "committed", activeKeyId: "field-key-2", reconciled: true });
    expect(coordinator.isActiveKeyId("field-key-2")).toBe(true);
  });

  it("blocks continuation after unknown state or failed rollback", async () => {
    for (const provider of [
      new FakeFieldChannelKeyRotationProvider({ failCommit: true, forcedReconciliation: "unknown" }),
      new FakeFieldChannelKeyRotationProvider({ failCommit: true, failRollback: true }),
    ]) {
      const coordinator = new FieldChannelKeyRotationCoordinator({ provider, field, activeKeyId: "field-key-1" });
      const result = await coordinator.rotate(request(), now);
      expect(result.status).toBe("blocked_uncertain");
      expect(coordinator.isActiveKeyId("field-key-1")).toBe(false);
      await expect(coordinator.rotate(request(), now)).rejects.toThrow(/blocked pending/);
    }
  });

  it("redacts provider errors and rejects inconsistent hydrated authority state", async () => {
    const secretMarker = "provider-leaked-secret-marker";
    const provider = {
      name: "throwing-provider",
      async prepare() { throw new Error(secretMarker); },
      async commit() { throw new Error("unreachable"); },
      async reconcile() { throw new Error(secretMarker); },
      async rollback() { throw new Error("unreachable"); },
    };
    const coordinator = new FieldChannelKeyRotationCoordinator({ provider, field, activeKeyId: "field-key-1" });
    const result = await coordinator.rotate(request(), now);
    expect(result.status).toBe("blocked_uncertain");
    expect(JSON.stringify({ result, state: coordinator.exportState() })).not.toContain(secretMarker);

    expect(() => fieldChannelKeyRotationStateSchema.parse({
      ...coordinator.exportState(),
      continuationBlocked: false,
    })).toThrow(/Blocked state/);
  });

  it("fails closed on stale, malformed, or cross-generation prepare receipts", async () => {
    const values = [
      {
        contractVersion: 1, rotationId: "request", field, priorKeyId: "field-key-1", nextKeyId: "field-key-2",
        guestAcknowledged: true, preparedAt: "2026-08-01T05:54:59.000Z",
      },
      {
        contractVersion: 1, rotationId: "request", field, priorKeyId: "field-key-1", nextKeyId: "field-key-2",
        preparedAt: "2026-08-01T06:00:01.000Z",
      },
      {
        contractVersion: 1, rotationId: "request", field: { ...field, fieldGeneration: 2 }, priorKeyId: "field-key-1", nextKeyId: "field-key-2",
        guestAcknowledged: true, preparedAt: "2026-08-01T06:00:01.000Z",
      },
    ];
    for (const template of values) {
      const value = request();
      const events: string[] = [];
      const provider: FieldChannelKeyRotationProvider = {
        name: "receipt-fault-provider",
        async prepare() {
          events.push("prepare");
          return { ...template, rotationId: value.rotationId };
        },
        async commit() { throw new Error("Commit must not run after an invalid prepare receipt."); },
        async reconcile(input) {
          events.push("reconcile");
          return {
            contractVersion: 1,
            rotationId: input.rotationId,
            field: input.field,
            priorKeyId: input.priorKeyId,
            nextKeyId: input.nextKeyId,
            state: "current_active",
            observedAt: "2026-08-01T06:00:03.000Z",
          };
        },
        async rollback() { throw new Error("Rollback is not required when the prior key is active."); },
      };
      const coordinator = new FieldChannelKeyRotationCoordinator({ provider, field, activeKeyId: "field-key-1" });
      expect(await coordinator.rotate(value, now)).toMatchObject({ status: "rolled_back", activeKeyId: "field-key-1", reconciled: true });
      expect(events).toEqual(["prepare", "reconcile"]);
    }
  });
});
