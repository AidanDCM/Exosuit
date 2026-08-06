/**
 * TPM-backed sealing for completion-gate private keys.
 *
 * Closes handoff §7.2: the TPM on this host is present, ready and owned, but
 * unused — the live signing keys rest on DPAPI alone. DPAPI binds ciphertext to
 * a Windows *user account* on a machine; its master key is derived from the
 * user's credentials, so anything that can recover those can recover the vault.
 * A TPM-wrapped vault additionally binds to the physical TPM: the wrapping key
 * is created inside it, is non-exportable, and cannot be moved to another
 * machine even with the account password.
 *
 * This does not put the signing key *in* the TPM. TPM 2.0 platform keys are RSA
 * and ECDSA; the completion gate signs Ed25519. So the Ed25519 private key is
 * encrypted at rest under a key that lives in the TPM and never leaves it:
 *
 *   random 256-bit data key  ->  AES-256-GCM over the private key PEM
 *   data key                 ->  RSA-OAEP-SHA256 under the TPM platform key
 *
 * The public key, and therefore every signature and every record already
 * recorded, is unaffected. Sealing changes how the private key is protected at
 * rest, not what it is — existing attestations stay valid.
 */

import { execFileSync } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

/** One wrapping key for the whole vault. Versioned so it can be rotated. */
export const TPM_WRAPPING_KEY_NAME = "exosuit-completion-host-wrap-v1";

const PROVIDER = "Microsoft Platform Crypto Provider";

export const tpmVaultSchema = z.object({
  format: z.literal("exosuit-tpm-vault"),
  version: z.literal(1),
  provider: z.literal(PROVIDER),
  wrappingKeyName: z.string().min(1),
  /** Data key, RSA-OAEP-SHA256 wrapped under the TPM key. Base64. */
  wrappedDataKey: z.string().min(1),
  /** AES-256-GCM nonce. Base64. */
  iv: z.string().min(1),
  /** AES-256-GCM authentication tag. Base64. */
  authTag: z.string().min(1),
  /** The protected payload. Base64. */
  ciphertext: z.string().min(1),
}).strict();
export type TpmVault = z.infer<typeof tpmVaultSchema>;

function powershell(script: string): string {
  return execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * PowerShell 5.1 runs on .NET Framework, where `RSACng` lacks the
 * `Export*`/`ImportRSAPublicKey` helpers .NET 6+ has. Everything below
 * therefore stays inside `RSACng.Encrypt`/`Decrypt`, which are present on both.
 */
const OPEN_OR_CREATE = (name: string) =>
  `$provider = [System.Security.Cryptography.CngProvider]::new('${PROVIDER}'); `
  + `$name = '${name.replace(/'/g, "''")}'; `
  + "if ([System.Security.Cryptography.CngKey]::Exists($name, $provider)) { "
  + "  $key = [System.Security.Cryptography.CngKey]::Open($name, $provider) "
  + "} else { "
  + "  $p = [System.Security.Cryptography.CngKeyCreationParameters]::new(); "
  + "  $p.Provider = $provider; "
  + "  $key = [System.Security.Cryptography.CngKey]::Create("
  + "    [System.Security.Cryptography.CngAlgorithm]::Rsa, $name, $p) "
  + "}; "
  + "$rsa = [System.Security.Cryptography.RSACng]::new($key); ";

export interface TpmStatus {
  readonly available: boolean;
  readonly provider: string;
  readonly wrappingKeyName: string;
  readonly wrappingKeyExists: boolean;
  readonly exportPolicy?: string;
  readonly reason?: string;
}

/**
 * Whether this host can seal at all, and whether the wrapping key already
 * exists. Read-only: it never creates the key, so a status check does not
 * quietly change the machine's state.
 */
export function tpmStatus(): TpmStatus {
  try {
    const raw = powershell(
      `$provider = [System.Security.Cryptography.CngProvider]::new('${PROVIDER}'); `
      + `$name = '${TPM_WRAPPING_KEY_NAME}'; `
      + "if ([System.Security.Cryptography.CngKey]::Exists($name, $provider)) { "
      + "  $k = [System.Security.Cryptography.CngKey]::Open($name, $provider); "
      + "  'exists|' + $k.ExportPolicy "
      + "} else { 'absent|' }",
    );
    const [state, exportPolicy] = raw.split("|");
    return {
      available: true,
      provider: PROVIDER,
      wrappingKeyName: TPM_WRAPPING_KEY_NAME,
      wrappingKeyExists: state === "exists",
      ...(exportPolicy ? { exportPolicy } : {}),
    };
  } catch (error) {
    return {
      available: false,
      provider: PROVIDER,
      wrappingKeyName: TPM_WRAPPING_KEY_NAME,
      wrappingKeyExists: false,
      reason: error instanceof Error ? error.message.split("\n")[0] : String(error),
    };
  }
}

/** Wraps 32 bytes under the TPM key, creating the key on first use. */
function wrapDataKey(dataKey: Buffer): string {
  return powershell(
    OPEN_OR_CREATE(TPM_WRAPPING_KEY_NAME)
    + `$plain = [Convert]::FromBase64String('${dataKey.toString("base64")}'); `
    + "$ct = $rsa.Encrypt($plain, [System.Security.Cryptography.RSAEncryptionPadding]::OaepSHA256); "
    + "[Convert]::ToBase64String($ct)",
  );
}

function unwrapDataKey(wrapped: string, keyName: string): Buffer {
  const raw = powershell(
    `$provider = [System.Security.Cryptography.CngProvider]::new('${PROVIDER}'); `
    + `$name = '${keyName.replace(/'/g, "''")}'; `
    + "if (-not [System.Security.Cryptography.CngKey]::Exists($name, $provider)) { "
    + "  throw 'TPM wrapping key ' + $name + ' does not exist on this host.' }; "
    + "$key = [System.Security.Cryptography.CngKey]::Open($name, $provider); "
    + "$rsa = [System.Security.Cryptography.RSACng]::new($key); "
    + `$ct = [Convert]::FromBase64String('${wrapped.replace(/'/g, "''")}'); `
    + "$pt = $rsa.Decrypt($ct, [System.Security.Cryptography.RSAEncryptionPadding]::OaepSHA256); "
    + "[Convert]::ToBase64String($pt)",
  );
  return Buffer.from(raw, "base64");
}

export function sealToTpm(plaintext: Buffer): TpmVault {
  const dataKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const vault: TpmVault = {
    format: "exosuit-tpm-vault",
    version: 1,
    provider: PROVIDER,
    wrappingKeyName: TPM_WRAPPING_KEY_NAME,
    wrappedDataKey: wrapDataKey(dataKey),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  // The data key is not retained anywhere; from here only the TPM can recover it.
  dataKey.fill(0);
  return tpmVaultSchema.parse(vault);
}

export function unsealFromTpm(input: unknown): Buffer {
  const vault = tpmVaultSchema.parse(input);
  const dataKey = unwrapDataKey(vault.wrappedDataKey, vault.wrappingKeyName);
  try {
    const decipher = createDecipheriv("aes-256-gcm", dataKey, Buffer.from(vault.iv, "base64"));
    decipher.setAuthTag(Buffer.from(vault.authTag, "base64"));
    // GCM authenticates: a tampered vault throws here rather than returning
    // plausible bytes, so a mutated vault fails closed.
    return Buffer.concat([decipher.update(Buffer.from(vault.ciphertext, "base64")), decipher.final()]);
  } finally {
    dataKey.fill(0);
  }
}
