import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FieldArtifactBroker } from "../src/fieldArtifactBroker.js";

const bytes = Buffer.from("verified artifact content", "utf8");
const digest = createHash("sha256").update(bytes).digest("hex");

function broker(maximumTransferBytes = 1024) {
  return new FieldArtifactBroker({
    field: { fieldId: randomUUID(), fieldGeneration: 1 },
    fieldRoot: "C:\\Field",
    maximumTransferBytes,
  });
}

describe("Field artifact broker", () => {
  it("prepares verifies and completes a bounded host to Field transfer", () => {
    const value = broker();
    const prepared = value.prepare({
      direction: "host_to_field",
      directory: "Inbox",
      relativePath: "tasks\\request.txt",
      displayName: "request.txt",
      mediaType: "text/plain",
      classification: "internal",
      expectedBytes: bytes.byteLength,
      expectedSha256: digest,
      now: "2026-07-21T18:00:00.000Z",
    });
    expect(prepared).toMatchObject({
      status: "prepared",
      scopedPath: { absolutePath: "C:\\Field\\Inbox\\tasks\\request.txt" },
    });
    expect(value.verifyBytes(prepared.transferId, bytes)).toMatchObject({
      status: "verified",
      verification: { matched: true, actualBytes: bytes.byteLength, actualSha256: digest },
    });
    expect(value.complete(prepared.transferId, "2026-07-21T18:00:01.000Z")).toMatchObject({
      status: "completed",
      completedAt: "2026-07-21T18:00:01.000Z",
    });
  });

  it("fails closed on hash or size mismatch and refuses completion", () => {
    const value = broker();
    const prepared = value.prepare({
      direction: "field_internal",
      directory: "Workspace",
      relativePath: "result.txt",
      displayName: "result.txt",
      mediaType: "text/plain",
      classification: "internal",
      expectedBytes: bytes.byteLength + 1,
      expectedSha256: digest,
    });
    expect(value.verifyBytes(prepared.transferId, bytes)).toMatchObject({
      status: "failed",
      verification: { matched: false },
      failureReason: expect.stringMatching(/did not match/),
    });
    expect(() => value.complete(prepared.transferId)).toThrow(/verified/);
    expect(() => value.verifyBytes(prepared.transferId, bytes)).toThrow(/prepared/);
  });

  it("allows only reviewed Outbox exports and blocks sensitive or untrusted artifacts", () => {
    const value = broker();
    expect(() =>
      value.prepare({
        direction: "field_to_host",
        directory: "Workspace",
        relativePath: "result.txt",
        displayName: "result.txt",
        mediaType: "text/plain",
        classification: "internal",
        expectedBytes: bytes.byteLength,
        expectedSha256: digest,
      }),
    ).toThrow(/directory/);
    expect(() =>
      value.prepare({
        direction: "field_to_host",
        directory: "Outbox",
        relativePath: "secret.txt",
        displayName: "secret.txt",
        mediaType: "text/plain",
        classification: "sensitive",
        expectedBytes: bytes.byteLength,
        expectedSha256: digest,
      }),
    ).toThrow(/owner-reviewed/);
    expect(() =>
      value.prepare({
        direction: "field_to_host",
        directory: "Outbox",
        relativePath: "download.exe",
        displayName: "download.exe",
        mediaType: "application/octet-stream",
        classification: "untrusted",
        expectedBytes: bytes.byteLength,
        expectedSha256: digest,
      }),
    ).toThrow(/reviewed and reclassified/);
  });

  it("enforces transfer size cancellation reasons and immutable returned snapshots", () => {
    const value = broker(32);
    expect(() =>
      value.prepare({
        direction: "host_to_field",
        directory: "Inbox",
        relativePath: "large.bin",
        displayName: "large.bin",
        mediaType: "application/octet-stream",
        classification: "internal",
        expectedBytes: 33,
        expectedSha256: digest,
      }),
    ).toThrow(/size limit/);

    const prepared = value.prepare({
      direction: "host_to_field",
      directory: "Inbox",
      relativePath: "small.txt",
      displayName: "small.txt",
      mediaType: "text/plain",
      classification: "internal",
      expectedBytes: bytes.byteLength,
      expectedSha256: digest,
    });
    expect(() => value.cancel(prepared.transferId, "")).toThrow(/reason/);
    const cancelled = value.cancel(prepared.transferId, "Owner stopped the task.");
    cancelled.status = "completed";
    expect(value.get(prepared.transferId)?.status).toBe("cancelled");
    expect(() => value.complete(prepared.transferId)).toThrow(/verified/);
  });
});
