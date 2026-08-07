import { describe, expect, it } from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import {
  attestationKeyFingerprint,
  recordDigest,
  recoveryStateDigest,
  signChallengeWithPrivateKey,
  verifyTpmProofBinding,
  verifyTpmProofSignature,
  type TpmChallenge,
  type TpmProof,
} from "../../src/completion/tpmAttestation.js";

/**
 * The attack these exist for: a holder of the Ed25519 completion key can mint a
 * record AND its custody event, and make them agree perfectly, because the
 * custody event is signed by the very key it vouches for. The TPM participation
 * proof is what that attacker cannot produce.
 */

const MACHINE = "machine-9c62d678dd970f15";
const REGISTRY_HASH = "a".repeat(64);

function attestationKey() {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = pair.publicKey.export({ format: "jwk" }) as { n: string; e: string };
  const publicKey = {
    modulus: Buffer.from(jwk.n, "base64url").toString("base64"),
    exponent: Buffer.from(jwk.e, "base64url").toString("base64"),
  };
  return {
    publicKey,
    pem: pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    fingerprint: attestationKeyFingerprint(publicKey),
  };
}

const trusted = attestationKey();
const rogue = attestationKey();

const record = {
  evidenceId: "ev-hyp-001",
  signingKeyId: "live-host-1",
  keyCustodyEventId: "custody-1",
  keyProtectionBackend: "tpm",
} as Record<string, unknown> & { signingKeyId: string; tpmProofId?: string };

function challengeFor(
  target: Record<string, unknown>,
  overrides: Partial<TpmChallenge> = {},
): TpmChallenge {
  return {
    recordDigest: recordDigest(target),
    completionKeyId: "live-host-1",
    registryHash: REGISTRY_HASH,
    machineId: MACHINE,
    custodyEventId: "custody-1",
    recoveryStateDigest: recoveryStateDigest([]),
    nonce: randomBytes(16).toString("hex"),
    timestamp: "2026-08-06T12:00:00.000Z",
    ...overrides,
  };
}

function proofFor(challenge: TpmChallenge, key = trusted, proofId = "proof-1"): TpmProof {
  return {
    proofId,
    challenge,
    attestationKeyName: "test-attestation",
    attestationKeyFingerprint: key.fingerprint,
    attestationPublicKey: key.publicKey,
    signature: signChallengeWithPrivateKey(challenge, key.pem),
  };
}

function check(
  target: Record<string, unknown> & { signingKeyId: string; tpmProofId?: string },
  proofs: readonly TpmProof[],
  opts: {
    consumed?: Set<string>;
    openRecoveryKeyIds?: readonly string[];
    accepted?: readonly string[];
    machineId?: string;
    registryHash?: string;
  } = {},
) {
  return verifyTpmProofBinding({
    record: target,
    proofs,
    registryHash: opts.registryHash ?? REGISTRY_HASH,
    machineId: opts.machineId ?? MACHINE,
    openRecoveryKeyIds: opts.openRecoveryKeyIds ?? [],
    custodyEventId: "custody-1",
    acceptedAttestationFingerprints: opts.accepted ?? [trusted.fingerprint],
    consumedProofIds: opts.consumed ?? new Set<string>(),
  });
}

describe("TPM proof signature", () => {
  it("verifies an honest proof without needing a TPM", () => {
    // The whole point: verification is pure, so another machine can check it.
    expect(verifyTpmProofSignature(proofFor(challengeFor(record)))).toBe(true);
  });

  it("rejects a proof whose challenge was altered after signing", () => {
    const proof = proofFor(challengeFor(record));
    expect(verifyTpmProofSignature({
      ...proof,
      challenge: { ...proof.challenge, machineId: "machine-somewhere-else" },
    })).toBe(false);
  });
});

describe("TPM proof binding", () => {
  it("accepts an honest proof", () => {
    const challenge = challengeFor(record);
    expect(check({ ...record, tpmProofId: "proof-1" }, [proofFor(challenge)])).toEqual([]);
  });

  it("rejects a self-signed custody claim with no TPM proof at all", () => {
    const reasons = check(record, []);
    expect(reasons.some((r) => r.includes("self-report"))).toBe(true);
  });

  it("rejects a record naming a proof that is not in the store", () => {
    const reasons = check({ ...record, tpmProofId: "proof-absent" }, []);
    expect(reasons.some((r) => r.includes("is not in the proof store"))).toBe(true);
  });

  it("rejects a reused proof", () => {
    const proof = proofFor(challengeFor(record));
    const consumed = new Set<string>();
    expect(check({ ...record, tpmProofId: "proof-1" }, [proof], { consumed })).toEqual([]);
    // A second record cannot lean on the same genuine TPM signing event.
    const reasons = check({ ...record, tpmProofId: "proof-1" }, [proof], { consumed });
    expect(reasons.some((r) => r.includes("already used by another record"))).toBe(true);
  });

  it("rejects a proof issued for a different record", () => {
    const other = { ...record, evidenceId: "ev-something-else" };
    const proof = proofFor(challengeFor(other));
    const reasons = check({ ...record, tpmProofId: "proof-1" }, [proof]);
    expect(reasons.some((r) => r.includes("issued for a different record"))).toBe(true);
  });

  it("rejects a proof naming a different completion key", () => {
    const challenge = challengeFor(record, { completionKeyId: "live-evidence-1" });
    const reasons = check({ ...record, tpmProofId: "proof-1" }, [proofFor(challenge)]);
    expect(reasons.some((r) => r.includes("names completion key live-evidence-1"))).toBe(true);
  });

  it("rejects a proof from an unapproved attestation key", () => {
    // A rogue TPM, or a software key pretending to be one.
    const proof = proofFor(challengeFor(record), rogue);
    const reasons = check({ ...record, tpmProofId: "proof-1" }, [proof]);
    expect(reasons.some((r) => r.includes("is not approved"))).toBe(true);
  });

  it("rejects a proof whose stated fingerprint does not match its own public key", () => {
    const proof = { ...proofFor(challengeFor(record)), attestationKeyFingerprint: rogue.fingerprint };
    const reasons = check({ ...record, tpmProofId: "proof-1" }, [proof]);
    expect(reasons.some((r) => r.includes("does not match its own public key"))).toBe(true);
  });

  it("rejects a proof issued under a different key registry", () => {
    const challenge = challengeFor(record, { registryHash: "b".repeat(64) });
    const reasons = check({ ...record, tpmProofId: "proof-1" }, [proofFor(challenge)]);
    expect(reasons.some((r) => r.includes("different key registry"))).toBe(true);
  });

  it("rejects a proof issued on a different machine", () => {
    const challenge = challengeFor(record, { machineId: "machine-elsewhere" });
    const reasons = check({ ...record, tpmProofId: "proof-1" }, [proofFor(challenge)]);
    expect(reasons.some((r) => r.includes("issued on machine machine-elsewhere"))).toBe(true);
  });

  it("rejects a proof naming a different custody event", () => {
    const challenge = challengeFor(record, { custodyEventId: "custody-other" });
    const reasons = check({ ...record, tpmProofId: "proof-1" }, [proofFor(challenge)]);
    expect(reasons.some((r) => r.includes("names custody event custody-other"))).toBe(true);
  });

  it("rejects a proof issued under a different recovery state", () => {
    // A proof taken while no grant was open cannot be reused once one is.
    const challenge = challengeFor(record);
    const reasons = check({ ...record, tpmProofId: "proof-1" }, [proofFor(challenge)], {
      openRecoveryKeyIds: ["live-host-1"],
    });
    expect(reasons.some((r) => r.includes("different recovery state"))).toBe(true);
  });

  it("rejects a forged signature under an approved public key", () => {
    // Attacker knows the approved fingerprint but not the private half.
    const challenge = challengeFor(record);
    const forged: TpmProof = {
      ...proofFor(challenge),
      signature: signChallengeWithPrivateKey(challenge, rogue.pem),
    };
    const reasons = check({ ...record, tpmProofId: "proof-1" }, [forged]);
    expect(reasons.some((r) => r.includes("does not verify under its attestation key"))).toBe(true);
  });

  it("rejects everything when no attestation key is trusted", () => {
    const reasons = check({ ...record, tpmProofId: "proof-1" }, [proofFor(challengeFor(record))], {
      accepted: [],
    });
    expect(reasons.some((r) => r.includes("is not approved"))).toBe(true);
  });
});
