/**
 * TPM participation proof for live signing events (contract v2.3).
 *
 * The custody ledger closed part of the gap: a record's `keyProtectionBackend`
 * must agree with an append-only chain rather than standing alone. But a
 * custody event is signed by the *same Ed25519 key whose custody it describes*,
 * so an attacker holding that key can mint both the record and its custody
 * event and have them agree perfectly. The TPM claim was still, ultimately, a
 * self-report.
 *
 * This closes it. A separate RSA key is created inside the TPM, non-exportable,
 * and is never used for anything but attesting signing events. Each live
 * signature carries a proof: the attestation key signs a challenge naming the
 * exact record, the completion key, the registry, the machine, the custody
 * event, the recovery state, a fresh nonce and a timestamp.
 *
 * A holder of the Ed25519 key alone cannot produce that proof. Producing it
 * requires the physical TPM that holds the attestation key, which is precisely
 * the property the earlier design asserted but could not demonstrate.
 *
 * What it still does not prove: the completion key and the attestation key are
 * distinct objects, so this shows *the TPM participated in this signing event*,
 * not *this Ed25519 private key was unwrapped by that TPM*. Binding those
 * together needs the completion key itself to be a TPM key, which TPM 2.0
 * cannot do for Ed25519. The residual gap is narrow and is stated rather than
 * papered over.
 */

import { execFileSync } from "node:child_process";
import {
  constants,
  createHash,
  createPublicKey,
  sign as createSignature,
  verify as verifySignature,
} from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../fieldContracts.js";

/** Versioned so the attestation key can be rotated without ambiguity. */
export const TPM_ATTESTATION_KEY_NAME = "exosuit-completion-attestation-v1";

const PROVIDER = "Microsoft Platform Crypto Provider";

const base64 = z.string().min(1).max(2000);
const identifier = z.string().min(1).max(200);
const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

/** RSA public half of the attestation key, as the TPM reports it. */
export const tpmAttestationPublicKeySchema = z.object({
  modulus: base64,
  exponent: base64,
}).strict();
export type TpmAttestationPublicKey = z.infer<typeof tpmAttestationPublicKeySchema>;

/**
 * The challenge a proof signs. Every field is something an attacker would have
 * to hold constant to replay a proof: change any of them and the proof no
 * longer matches.
 */
export const tpmChallengeSchema = z.object({
  /** SHA-256 of the record this proof is for, excluding its own signature and proof id. */
  recordDigest: sha256Hex,
  /** The Ed25519 completion key that signed the record. */
  completionKeyId: identifier,
  /** SHA-256 of the key registry in force. */
  registryHash: sha256Hex,
  machineId: identifier,
  /** The custody event asserting the backend for this signing. */
  custodyEventId: identifier,
  /** SHA-256 over the sorted open recovery grants, so a grant cannot be hidden. */
  recoveryStateDigest: sha256Hex,
  nonce: z.string().regex(/^[a-f0-9]{32}$/),
  timestamp: z.string().datetime(),
}).strict();
export type TpmChallenge = z.infer<typeof tpmChallengeSchema>;

export const tpmProofSchema = z.object({
  proofId: identifier,
  challenge: tpmChallengeSchema,
  attestationKeyName: identifier,
  /** SHA-256 of the canonical public key. Pinned, so an unapproved key is rejected. */
  attestationKeyFingerprint: sha256Hex,
  attestationPublicKey: tpmAttestationPublicKeySchema,
  /** RSA-PSS over SHA-256 of the canonical challenge. Base64. */
  signature: base64,
}).strict();
export type TpmProof = z.infer<typeof tpmProofSchema>;

export const tpmProofStoreSchema = z.object({
  contractVersion: z.literal(2),
  proofs: z.array(tpmProofSchema),
}).strict();
export type TpmProofStore = z.infer<typeof tpmProofStoreSchema>;

export const EMPTY_TPM_PROOF_STORE: TpmProofStore = { contractVersion: 2, proofs: [] };

/* ------------------------------------------------------------------ host */

function powershell(script: string, input?: string): string {
  return execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...(input === undefined ? { stdio: ["ignore", "pipe", "pipe"] as const } : { input, stdio: ["pipe", "pipe", "pipe"] as const }),
  }).trim();
}

const OPEN_OR_CREATE_ATTESTATION =
  `$provider = [System.Security.Cryptography.CngProvider]::new('${PROVIDER}'); `
  + `$name = '${TPM_ATTESTATION_KEY_NAME}'; `
  + "if ([System.Security.Cryptography.CngKey]::Exists($name, $provider)) { "
  + "  $key = [System.Security.Cryptography.CngKey]::Open($name, $provider) "
  + "} else { "
  + "  $p = [System.Security.Cryptography.CngKeyCreationParameters]::new(); "
  + "  $p.Provider = $provider; "
  + "  $key = [System.Security.Cryptography.CngKey]::Create("
  + "    [System.Security.Cryptography.CngAlgorithm]::Rsa, $name, $p) "
  + "}; "
  + "$rsa = [System.Security.Cryptography.RSACng]::new($key); ";

/** Canonical fingerprint of an attestation public key. */
export function attestationKeyFingerprint(publicKey: TpmAttestationPublicKey): string {
  return createHash("sha256").update(canonicalJson(publicKey)).digest("hex");
}

export interface TpmAttestationStatus {
  readonly available: boolean;
  readonly keyName: string;
  readonly exists: boolean;
  readonly exportPolicy?: string;
  readonly publicKey?: TpmAttestationPublicKey;
  readonly reason?: string;
}

/** Read-only: reports whether attestation is possible without creating the key. */
export function tpmAttestationStatus(): TpmAttestationStatus {
  try {
    const raw = powershell(
      `$provider = [System.Security.Cryptography.CngProvider]::new('${PROVIDER}'); `
      + `$name = '${TPM_ATTESTATION_KEY_NAME}'; `
      + "if (-not [System.Security.Cryptography.CngKey]::Exists($name, $provider)) { 'absent||' } "
      + "else { $k = [System.Security.Cryptography.CngKey]::Open($name, $provider); "
      + "  $r = [System.Security.Cryptography.RSACng]::new($k); "
      + "  $p = $r.ExportParameters($false); "
      + "  'exists|' + $k.ExportPolicy + '|' + [Convert]::ToBase64String($p.Modulus) "
      + "    + '.' + [Convert]::ToBase64String($p.Exponent) }",
    );
    const [state, exportPolicy, key] = raw.split("|");
    if (state !== "exists") return { available: true, keyName: TPM_ATTESTATION_KEY_NAME, exists: false };
    const [modulus, exponent] = (key ?? "").split(".");
    return {
      available: true,
      keyName: TPM_ATTESTATION_KEY_NAME,
      exists: true,
      ...(exportPolicy ? { exportPolicy } : {}),
      ...(modulus && exponent ? { publicKey: { modulus, exponent } } : {}),
    };
  } catch (error) {
    return {
      available: false,
      keyName: TPM_ATTESTATION_KEY_NAME,
      exists: false,
      reason: error instanceof Error ? error.message.split("\n")[0] : String(error),
    };
  }
}

/** Creates the attestation key on first use and returns its public half. */
export function ensureAttestationKey(): TpmAttestationPublicKey {
  const raw = powershell(
    OPEN_OR_CREATE_ATTESTATION
    + "$p = $rsa.ExportParameters($false); "
    + "[Convert]::ToBase64String($p.Modulus) + '.' + [Convert]::ToBase64String($p.Exponent)",
  );
  const [modulus, exponent] = raw.split(".");
  if (modulus === undefined || exponent === undefined) {
    throw new Error("Could not read the TPM attestation public key.");
  }
  return tpmAttestationPublicKeySchema.parse({ modulus, exponent });
}

/** Canonical bytes a proof signs. */
export function challengeBytes(challenge: TpmChallenge): Buffer {
  return Buffer.from(canonicalJson(tpmChallengeSchema.parse(challenge)), "utf8");
}

/**
 * Signs a challenge with the TPM attestation key. The private half never
 * leaves the chip, so this is the one step an attacker holding only the
 * Ed25519 completion key cannot perform.
 */
export function signTpmChallenge(challenge: TpmChallenge): string {
  return powershell(
    OPEN_OR_CREATE_ATTESTATION
    + "$msg = [Convert]::FromBase64String([Console]::In.ReadLine()); "
    + "$sig = $rsa.SignData($msg, [System.Security.Cryptography.HashAlgorithmName]::SHA256, "
    + "  [System.Security.Cryptography.RSASignaturePadding]::Pss); "
    + "[Convert]::ToBase64String($sig)",
    challengeBytes(challenge).toString("base64"),
  );
}

/**
 * Signs a challenge with a software RSA key.
 *
 * For fixtures only. The adversarial suite must be able to construct both
 * honest and forged proofs on machines with no TPM, exactly as it stands in a
 * software root key for the offline root. The real signing path is
 * `signTpmChallenge`, whose private half cannot leave the chip; nothing in the
 * CLI calls this.
 */
export function signChallengeWithPrivateKey(challenge: TpmChallenge, privateKeyPem: string): string {
  return createSignature("sha256", challengeBytes(challenge), {
    key: privateKeyPem,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32,
  }).toString("base64");
}

/* ---------------------------------------------------------------- verify */

function publicKeyObject(publicKey: TpmAttestationPublicKey) {
  const toBase64Url = (value: string) => Buffer.from(value, "base64").toString("base64url");
  return createPublicKey({
    key: { kty: "RSA", n: toBase64Url(publicKey.modulus), e: toBase64Url(publicKey.exponent) },
    format: "jwk",
  });
}

/**
 * Verifies a proof's signature. Pure: no TPM needed, so a verifier on another
 * machine — which is the entire point — can check it.
 */
export function verifyTpmProofSignature(proof: TpmProof): boolean {
  try {
    return verifySignature(
      "sha256",
      challengeBytes(proof.challenge),
      {
        key: publicKeyObject(proof.attestationPublicKey),
        padding: constants.RSA_PKCS1_PSS_PADDING,
        // .NET's RSASignaturePadding.Pss salts with the hash length; Node
        // defaults differently, so it is pinned rather than left implicit.
        saltLength: 32,
      },
      Buffer.from(proof.signature, "base64"),
    );
  } catch {
    return false;
  }
}

/** SHA-256 over a record's content, excluding its own signature and proof reference. */
export function recordDigest(record: Record<string, unknown>): string {
  const { signature: _signature, tpmProofId: _proofId, ...rest } = record;
  return createHash("sha256").update(canonicalJson(rest)).digest("hex");
}

/** SHA-256 over the sorted open recovery grants, so a grant cannot be hidden. */
export function recoveryStateDigest(openKeyIds: readonly string[]): string {
  return createHash("sha256").update(canonicalJson([...openKeyIds].sort())).digest("hex");
}

/** SHA-256 over the canonical registry, binding a proof to the key set in force. */
export function registryHash(registry: unknown): string {
  return createHash("sha256").update(canonicalJson(registry)).digest("hex");
}

export interface TpmProofVerificationInput {
  /** The record under test, including its `tpmProofId` and `signature`. */
  readonly record: Record<string, unknown> & { signingKeyId: string; tpmProofId?: string };
  readonly proofs: readonly TpmProof[];
  readonly registryHash: string;
  readonly machineId: string;
  readonly openRecoveryKeyIds: readonly string[];
  readonly custodyEventId?: string;
  /** Attestation keys this deployment trusts. */
  readonly acceptedAttestationFingerprints: readonly string[];
  /** Proof ids already consumed by an earlier record. Mutated by the caller. */
  readonly consumedProofIds: Set<string>;
}

/**
 * Full binding check for a live record's TPM participation proof.
 *
 * This is what makes `keyProtectionBackend: tpm` more than a self-report. Every
 * rejection below corresponds to a way an attacker holding only the Ed25519
 * completion key could otherwise have produced a convincing live record.
 */
export function verifyTpmProofBinding(input: TpmProofVerificationInput): readonly string[] {
  const reasons: string[] = [];
  const { record } = input;

  const proofId = record["tpmProofId"];
  if (typeof proofId !== "string" || proofId.length === 0) {
    reasons.push(
      "live record carries no TPM participation proof; a backend claim signed only by the "
      + "completion key is a self-report",
    );
    return reasons;
  }

  const proof = input.proofs.find((candidate) => candidate.proofId === proofId);
  if (proof === undefined) {
    reasons.push(`TPM proof ${proofId} is not in the proof store`);
    return reasons;
  }

  // Single use. A replayed proof would let one genuine TPM signing event vouch
  // for any number of later forged records.
  if (input.consumedProofIds.has(proofId)) {
    reasons.push(`TPM proof ${proofId} was already used by another record`);
  }
  input.consumedProofIds.add(proofId);

  // The attestation key must be one this deployment trusts, and must have been
  // reported non-exportable when it was created.
  const fingerprint = attestationKeyFingerprint(proof.attestationPublicKey);
  if (fingerprint !== proof.attestationKeyFingerprint) {
    reasons.push(`TPM proof ${proofId} states a fingerprint that does not match its own public key`);
  }
  if (!input.acceptedAttestationFingerprints.includes(fingerprint)) {
    reasons.push(`TPM proof ${proofId} uses attestation key ${fingerprint.slice(0, 12)}, which is not approved`);
  }

  // The challenge must name this exact record and nothing else.
  const expectedDigest = recordDigest(record);
  if (proof.challenge.recordDigest !== expectedDigest) {
    reasons.push(`TPM proof ${proofId} was issued for a different record`);
  }
  if (proof.challenge.completionKeyId !== record.signingKeyId) {
    reasons.push(
      `TPM proof ${proofId} names completion key ${proof.challenge.completionKeyId}, `
      + `but the record was signed by ${record.signingKeyId}`,
    );
  }
  if (proof.challenge.registryHash !== input.registryHash) {
    reasons.push(`TPM proof ${proofId} was issued under a different key registry`);
  }
  if (proof.challenge.machineId !== input.machineId) {
    reasons.push(`TPM proof ${proofId} was issued on machine ${proof.challenge.machineId}`);
  }
  if (input.custodyEventId !== undefined && proof.challenge.custodyEventId !== input.custodyEventId) {
    reasons.push(`TPM proof ${proofId} names custody event ${proof.challenge.custodyEventId}`);
  }
  const expectedRecovery = recoveryStateDigest(input.openRecoveryKeyIds);
  if (proof.challenge.recoveryStateDigest !== expectedRecovery) {
    reasons.push(`TPM proof ${proofId} was issued under a different recovery state`);
  }

  // Last, and only meaningful once the above bind it to this record: the TPM
  // actually signed it.
  if (!verifyTpmProofSignature(proof)) {
    reasons.push(`TPM proof ${proofId} signature does not verify under its attestation key`);
  }

  return reasons;
}
