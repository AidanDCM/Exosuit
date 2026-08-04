/**
 * Ed25519 signing and verification for completion records.
 *
 * The repository holds only public keys. Private keys live outside the
 * repository, and keys that sign live evidence are host-bound: the key names
 * the machine it belongs to, and evidence signed by it must have been produced
 * on that machine. A generator running in a checkout therefore cannot forge
 * live evidence — it does not hold the authority to do so.
 */

import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { canonicalJson } from "../fieldContracts.js";
import {
  keyRegistrySchema,
  type KeyRegistry,
  type SigningKey,
  type SigningKeyRole,
} from "./contracts.js";
import { pinnedRootKeyFingerprints, type RegistryPurpose } from "./policy.js";

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

export function rootKeyFingerprint(rootPublicKeyBase64: string): string {
  return createHash("sha256").update(Buffer.from(rootPublicKeyBase64, "base64")).digest("hex");
}

/**
 * Verifies the registry envelope against the offline root key.
 *
 * The root private key never enters the repository. Only the fingerprint of
 * its public half is pinned, so swapping in an attacker-controlled root shows
 * up as a diff to `pinnedRootKeyFingerprints`. A verifier may pin the root
 * public key outside the repository entirely via EXOSUIT_COMPLETION_ROOT_PUBKEY.
 */
export function verifyKeyRegistry(
  registry: KeyRegistry,
  now: string,
  acceptedRootFingerprints?: readonly string[],
): string[] {
  const failures: string[] = [];
  const fingerprint = rootKeyFingerprint(registry.rootPublicKey);

  const externalPin = process.env["EXOSUIT_COMPLETION_ROOT_PUBKEY"];
  const accepted = acceptedRootFingerprints
    ?? (externalPin === undefined || externalPin.trim() === ""
      ? pinnedRootKeyFingerprints
      : [rootKeyFingerprint(externalPin.trim())]);
  if (!accepted.includes(fingerprint)) {
    failures.push(`registry root key ${fingerprint.slice(0, 12)} is not pinned`);
  }

  let rootPublic;
  try {
    rootPublic = createPublicKey({
      key: Buffer.from(registry.rootPublicKey, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    return [...failures, "registry root public key is unreadable"];
  }

  const { signature, ...core } = registry;
  const valid = verify(
    null,
    Buffer.from(canonicalJson(core), "utf8"),
    rootPublic,
    Buffer.from(signature, "base64url"),
  );
  if (!valid) failures.push("registry envelope signature does not verify against the root key");

  const nowMs = Date.parse(now);
  if (nowMs < Date.parse(registry.issuedAt)) failures.push("registry is not yet valid");
  if (nowMs > Date.parse(registry.expiresAt)) failures.push("registry has expired");

  // Revocations are themselves root-signed, so deleting the marker on a key is
  // not enough to un-revoke it.
  for (const revocation of registry.revocations) {
    const { signature: revocationSignature, ...revocationCore } = revocation;
    const revocationValid = verify(
      null,
      Buffer.from(canonicalJson(revocationCore), "utf8"),
      rootPublic,
      Buffer.from(revocationSignature, "base64url"),
    );
    if (!revocationValid) {
      failures.push(`revocation of ${revocation.keyId} does not verify against the root key`);
    }
  }

  return failures;
}

export interface KeyVerificationRequest {
  readonly registry: KeyRegistry;
  readonly keyId: string;
  readonly role: SigningKeyRole;
  /** The record's own timestamp — not "now" — so rotation does not invalidate history. */
  readonly signedAt: string;
  /** Required for host-bound keys: the machine the record claims to come from. */
  readonly machineId?: string;
  /** When set, the registry must have this purpose (live evidence needs `live`). */
  readonly requiredPurpose?: RegistryPurpose;
}

export function resolveSigningKey(request: KeyVerificationRequest): { key?: SigningKey; failures: string[] } {
  const failures: string[] = [];
  const key = request.registry.keys.find((candidate) => candidate.keyId === request.keyId);
  if (key === undefined) {
    return { failures: [`unknown signing key ${request.keyId}`] };
  }
  if (request.requiredPurpose !== undefined && request.registry.purpose !== request.requiredPurpose) {
    failures.push(
      `registry ${request.registry.registryId} has purpose ${request.registry.purpose}; `
      + `${request.requiredPurpose} evidence cannot be attested by it`,
    );
  }
  if (key.revokedAt !== undefined) {
    failures.push(`signing key ${key.keyId} is revoked${key.revocationReason ? ` (${key.revocationReason})` : ""}`);
  }
  const revocation = request.registry.revocations.find((entry) => entry.keyId === key.keyId);
  if (revocation !== undefined) {
    failures.push(`signing key ${key.keyId} is revoked (${revocation.reason})`);
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
