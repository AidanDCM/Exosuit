import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  sealToTpm,
  tpmStatus,
  tpmVaultSchema,
  unsealFromTpm,
  TPM_WRAPPING_KEY_NAME,
} from "../src/completion/tpmSeal.js";

/**
 * These exercise a real TPM. On a host without one — CI containers, non-Windows
 * — sealing cannot be simulated without defeating the point of the module, so
 * the round-trip cases skip rather than assert against a fake. The schema and
 * fail-closed cases below run everywhere.
 */
const status = tpmStatus();
const withTpm = status.available ? it : it.skip;
const TPM_TIMEOUT = 60_000;

function ed25519Pem(): Buffer {
  const { privateKey } = generateKeyPairSync("ed25519");
  return Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" }) as string, "utf8");
}

describe("tpmStatus", () => {
  it("reports the pinned provider and wrapping key name", () => {
    expect(status.provider).toBe("Microsoft Platform Crypto Provider");
    expect(status.wrappingKeyName).toBe(TPM_WRAPPING_KEY_NAME);
  });

  it("explains itself when the provider is unavailable", () => {
    if (status.available) {
      expect(status.reason).toBeUndefined();
    } else {
      expect(status.reason).toBeTruthy();
    }
  });
});

describe("tpmVaultSchema", () => {
  const valid = {
    format: "exosuit-tpm-vault",
    version: 1,
    provider: "Microsoft Platform Crypto Provider",
    wrappingKeyName: TPM_WRAPPING_KEY_NAME,
    wrappedDataKey: "AA==",
    iv: "AA==",
    authTag: "AA==",
    ciphertext: "AA==",
  };

  it("accepts a well-formed vault", () => {
    expect(() => tpmVaultSchema.parse(valid)).not.toThrow();
  });

  it("rejects unknown fields rather than ignoring them", () => {
    expect(() => tpmVaultSchema.parse({ ...valid, smuggled: "x" })).toThrow();
  });

  it("rejects a vault claiming a different provider", () => {
    expect(() => tpmVaultSchema.parse({ ...valid, provider: "Microsoft Software Key Storage Provider" }))
      .toThrow();
  });

  it("rejects a future vault version rather than guessing at it", () => {
    expect(() => tpmVaultSchema.parse({ ...valid, version: 2 })).toThrow();
  });
});

describe("sealToTpm / unsealFromTpm", () => {
  withTpm("round-trips an Ed25519 private key exactly", () => {
    const pem = ed25519Pem();
    expect(unsealFromTpm(sealToTpm(pem)).equals(pem)).toBe(true);
  }, TPM_TIMEOUT);

  withTpm("never puts the plaintext in the vault", () => {
    const pem = ed25519Pem();
    const serialized = JSON.stringify(sealToTpm(pem));
    expect(serialized).not.toContain("PRIVATE KEY");
    expect(serialized).not.toContain(pem.toString("base64"));
  }, TPM_TIMEOUT);

  withTpm("produces a different vault each time for the same input", () => {
    const pem = ed25519Pem();
    // Fresh data key and nonce per seal, so two vaults over one key are not
    // byte-identical and neither reveals that they protect the same secret.
    expect(sealToTpm(pem).ciphertext).not.toBe(sealToTpm(pem).ciphertext);
  }, TPM_TIMEOUT);

  withTpm("fails closed on a tampered ciphertext", () => {
    const vault = sealToTpm(ed25519Pem());
    const raw = Buffer.from(vault.ciphertext, "base64");
    raw[0] = (raw[0] ?? 0) ^ 0xff;
    expect(() => unsealFromTpm({ ...vault, ciphertext: raw.toString("base64") })).toThrow();
  }, TPM_TIMEOUT);

  withTpm("fails closed on a tampered authentication tag", () => {
    const vault = sealToTpm(ed25519Pem());
    const tag = Buffer.from(vault.authTag, "base64");
    tag[0] = (tag[0] ?? 0) ^ 0xff;
    expect(() => unsealFromTpm({ ...vault, authTag: tag.toString("base64") })).toThrow();
  }, TPM_TIMEOUT);

  withTpm("refuses a vault naming a wrapping key this host does not have", () => {
    const vault = sealToTpm(ed25519Pem());
    expect(() => unsealFromTpm({ ...vault, wrappingKeyName: "exosuit-absent-key-not-on-this-host" }))
      .toThrow();
  }, TPM_TIMEOUT);
});
