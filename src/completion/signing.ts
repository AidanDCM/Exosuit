/**
 * Ed25519 signing and verification for completion records.
 *
 * The repository holds only public keys. Private keys live outside the
 * repository, and keys that sign live evidence are host-bound: the key names
 * the machine it belongs to, and evidence signed by it must have been produced
 * on that machine. A generator running in a checkout therefore cannot forge
 * live evidence — it does not hold the authority to do so.
 */

import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { canonicalJson } from "../fieldContracts.js";
import {
  keyRegistrySchema,
  type KeyRegistry,
  type SigningKey,
  type SigningKeyRole,
} from "./contracts.js";

/** Records are signed over their canonical form with `signature` removed. */
export function signingPayload(record: Record<string, unknown>): string {
  const { signature: _signature, ...rest } = record;
  return canonicalJson(rest);
}

export function signRecord<T extends Record<string, unknown>>(
  record: Omit<T, "signature">,
  privateKeyPem: string,
): string {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("Completion records must be signed with an ed25519 key.");
  }
  return sign(null, Buffer.from(signingPayload(record as Record<string, unknown>), "utf8"), key)
    .toString("base64url");
}

export interface KeyVerificationRequest {
  readonly registry: KeyRegistry;
  readonly keyId: string;
  readonly role: SigningKeyRole;
  /** The record's own timestamp — not "now" — so rotation does not invalidate history. */
  readonly signedAt: string;
  /** Required for host-bound keys: the machine the record claims to come from. */
  readonly machineId?: string;
}

export function resolveSigningKey(request: KeyVerificationRequest): { key?: SigningKey; failures: string[] } {
  const failures: string[] = [];
  const key = request.registry.keys.find((candidate) => candidate.keyId === request.keyId);
  if (key === undefined) {
    return { failures: [`unknown signing key ${request.keyId}`] };
  }
  if (key.revokedAt !== undefined) {
    failures.push(`signing key ${key.keyId} is revoked${key.revocationReason ? ` (${key.revocationReason})` : ""}`);
  }
  if (!key.roles.includes(request.role)) {
    failures.push(`signing key ${key.keyId} is not authorised for role ${request.role}`);
  }
  const signedAt = Date.parse(request.signedAt);
  if (Number.isNaN(signedAt)) {
    failures.push(`unparseable signing timestamp for key ${key.keyId}`);
  } else {
    if (signedAt < Date.parse(key.notBefore)) failures.push(`signing key ${key.keyId} used before notBefore`);
    if (signedAt > Date.parse(key.notAfter)) failures.push(`signing key ${key.keyId} used after notAfter`);
  }
  if (key.machineId !== undefined && request.machineId !== key.machineId) {
    failures.push(
      `host-bound key ${key.keyId} belongs to machine ${key.machineId} but the record names ${request.machineId ?? "no machine"}`,
    );
  }
  return { key, failures };
}

export function verifyRecordSignature(
  record: Record<string, unknown> & { signature: string },
  request: KeyVerificationRequest,
): string[] {
  const { key, failures } = resolveSigningKey(request);
  if (key === undefined) return failures;

  let publicKey;
  try {
    publicKey = createPublicKey({
      key: Buffer.from(key.publicKey, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    return [...failures, `signing key ${key.keyId} has unreadable public material`];
  }

  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(record.signature, "base64url");
  } catch {
    return [...failures, "malformed signature encoding"];
  }

  const valid = verify(
    null,
    Buffer.from(signingPayload(record), "utf8"),
    publicKey,
    signatureBytes,
  );
  if (!valid) failures.push("signature does not verify against the named key");
  return failures;
}

export function parseKeyRegistry(value: unknown): KeyRegistry {
  const registry = keyRegistrySchema.parse(value);
  const seen = new Set<string>();
  for (const key of registry.keys) {
    if (seen.has(key.keyId)) throw new Error(`Duplicate signing key id ${key.keyId}`);
    seen.add(key.keyId);
    if (Date.parse(key.notAfter) <= Date.parse(key.notBefore)) {
      throw new Error(`Signing key ${key.keyId} has an empty validity window.`);
    }
  }
  return registry;
}

/** Host-bound keys are the only ones permitted to attest live evidence. */
export function requiredRoleForLiveEvidence(): SigningKeyRole {
  return "host";
}
