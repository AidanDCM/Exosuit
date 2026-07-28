import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { fieldRefSchema } from "./fieldContracts.js";
import {
  artifactTransferDirectionSchema,
  fieldDirectorySchema,
  resolveFieldArtifactPath,
  scopedFieldPathSchema,
  type ArtifactTransferDirection,
  type FieldDirectory,
} from "./fieldPathScope.js";

export const fieldArtifactClassificationSchema = z.enum(["public", "internal", "sensitive", "untrusted"]);
export type FieldArtifactClassification = z.infer<typeof fieldArtifactClassificationSchema>;

export const fieldArtifactTransferSchema = z.object({
  contractVersion: z.literal(1),
  transferId: z.string().uuid(),
  field: fieldRefSchema,
  direction: artifactTransferDirectionSchema,
  scopedPath: scopedFieldPathSchema,
  displayName: z.string().min(1).max(500),
  mediaType: z.string().min(1).max(200),
  classification: fieldArtifactClassificationSchema,
  expectedBytes: z.number().int().nonnegative().max(2_147_483_648),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["prepared", "verified", "completed", "cancelled", "failed"]),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  verification: z
    .object({
      actualBytes: z.number().int().nonnegative(),
      actualSha256: z.string().regex(/^[a-f0-9]{64}$/),
      matched: z.boolean(),
    })
    .optional(),
  failureReason: z.string().min(1).max(2_000).optional(),
});
export type FieldArtifactTransfer = z.infer<typeof fieldArtifactTransferSchema>;

const allowedDirectories: Readonly<Record<ArtifactTransferDirection, readonly FieldDirectory[]>> = {
  host_to_field: ["Inbox", "Quarantine"],
  field_to_host: ["Outbox"],
  field_internal: ["Inbox", "Workspace", "Downloads", "Outbox", "Quarantine"],
};

export class FieldArtifactBroker {
  readonly #field: z.infer<typeof fieldRefSchema>;
  readonly #fieldRoot: string;
  readonly #maximumTransferBytes: number;
  readonly #transfers = new Map<string, FieldArtifactTransfer>();

  constructor(input: { field: z.infer<typeof fieldRefSchema>; fieldRoot?: string; maximumTransferBytes?: number }) {
    this.#field = fieldRefSchema.parse(input.field);
    this.#fieldRoot = input.fieldRoot ?? "C:\\Field";
    this.#maximumTransferBytes = input.maximumTransferBytes ?? 512 * 1024 * 1024;
    if (!Number.isInteger(this.#maximumTransferBytes) || this.#maximumTransferBytes < 1 || this.#maximumTransferBytes > 2_147_483_648) {
      throw new Error("maximumTransferBytes must be from 1 through 2147483648.");
    }
  }

  prepare(input: {
    direction: ArtifactTransferDirection;
    directory: FieldDirectory;
    relativePath: string;
    displayName: string;
    mediaType: string;
    classification: FieldArtifactClassification;
    expectedBytes: number;
    expectedSha256: string;
    now?: string;
    transferId?: string;
  }): FieldArtifactTransfer {
    const direction = artifactTransferDirectionSchema.parse(input.direction);
    const directory = fieldDirectorySchema.parse(input.directory);
    if (!allowedDirectories[direction].includes(directory)) throw new Error("Artifact transfer directory is not valid for its direction.");
    if (input.expectedBytes > this.#maximumTransferBytes) throw new Error("Artifact transfer exceeds the broker size limit.");
    if (direction === "field_to_host" && input.classification === "sensitive") {
      throw new Error("Sensitive Field artifacts require a separate owner-reviewed export path.");
    }
    if (direction === "field_to_host" && input.classification === "untrusted") {
      throw new Error("Untrusted Field artifacts must be reviewed and reclassified before export.");
    }
    const scopedPath = resolveFieldArtifactPath({
      fieldRoot: this.#fieldRoot,
      directory,
      relativePath: input.relativePath,
      direction,
    });
    const transfer = fieldArtifactTransferSchema.parse({
      contractVersion: 1,
      transferId: input.transferId ?? randomUUID(),
      field: this.#field,
      direction,
      scopedPath,
      displayName: input.displayName,
      mediaType: input.mediaType,
      classification: input.classification,
      expectedBytes: input.expectedBytes,
      expectedSha256: input.expectedSha256,
      status: "prepared",
      createdAt: input.now ?? new Date().toISOString(),
    });
    if (this.#transfers.has(transfer.transferId)) throw new Error("Artifact transfer ID already exists.");
    this.#transfers.set(transfer.transferId, transfer);
    return structuredClone(transfer);
  }

  verifyBytes(transferId: string, bytes: Uint8Array): FieldArtifactTransfer {
    const current = this.#require(transferId);
    if (current.status !== "prepared") throw new Error("Only a prepared artifact transfer can be verified.");
    if (bytes.byteLength > this.#maximumTransferBytes) throw new Error("Artifact bytes exceed the broker size limit.");
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    const matched = bytes.byteLength === current.expectedBytes && safeHexEqual(actualSha256, current.expectedSha256);
    const updated = fieldArtifactTransferSchema.parse({
      ...current,
      status: matched ? "verified" : "failed",
      verification: { actualBytes: bytes.byteLength, actualSha256, matched },
      ...(matched ? {} : { failureReason: "Artifact size or SHA-256 did not match the prepared transfer." }),
    });
    this.#transfers.set(transferId, updated);
    return structuredClone(updated);
  }

  complete(transferId: string, now?: string): FieldArtifactTransfer {
    const current = this.#require(transferId);
    if (current.status !== "verified") throw new Error("Only a verified artifact transfer can complete.");
    const updated = fieldArtifactTransferSchema.parse({ ...current, status: "completed", completedAt: now ?? new Date().toISOString() });
    this.#transfers.set(transferId, updated);
    return structuredClone(updated);
  }

  cancel(transferId: string, reason: string, now?: string): FieldArtifactTransfer {
    const current = this.#require(transferId);
    if (!["prepared", "verified"].includes(current.status)) throw new Error("Only a pending artifact transfer can be cancelled.");
    if (!reason.trim()) throw new Error("Artifact cancellation requires a reason.");
    const updated = fieldArtifactTransferSchema.parse({
      ...current,
      status: "cancelled",
      completedAt: now ?? new Date().toISOString(),
      failureReason: reason,
    });
    this.#transfers.set(transferId, updated);
    return structuredClone(updated);
  }

  get(transferId: string): FieldArtifactTransfer | undefined {
    const value = this.#transfers.get(transferId);
    return value ? structuredClone(value) : undefined;
  }

  list(): FieldArtifactTransfer[] {
    return [...this.#transfers.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.transferId.localeCompare(right.transferId))
      .map((value) => structuredClone(value));
  }

  #require(transferId: string): FieldArtifactTransfer {
    const current = this.#transfers.get(transferId);
    if (!current) throw new Error("Artifact transfer was not found.");
    return current;
  }
}

function safeHexEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
