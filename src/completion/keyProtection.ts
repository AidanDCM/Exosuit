/**
 * Key protection boundary for the completion gate.
 *
 * The first cut of TPM sealing loaded keys TPM -> DPAPI -> plaintext. That is a
 * *preference*, not a boundary: a missing, corrupted, or unopenable TPM vault
 * fell through to DPAPI silently, and a stray plaintext PEM fell through again.
 * The consequence is that no live signature proved the TPM was involved, and
 * the whole key set stayed recoverable from a DPAPI copy — so calling the setup
 * machine-bound was wrong even though the `.pem.tpm` file itself is.
 *
 * The rule is now:
 *
 *   live registry        TPM vault present and unsealing, or STOP.
 *   development registry TPM, then DPAPI, then plaintext, as before.
 *
 * There is no automatic fallback on the live path. DPAPI remains reachable, but
 * only through an explicit, signed, operator-approved recovery grant that
 * blocks live attestation until the key is sealed again — see
 * `keyRecovery.ts`.
 *
 * Plaintext is never acceptable for a live registry, with or without a grant.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { RegistryPurpose } from "./policy.js";
import { unsealFromTpm } from "./tpmSeal.js";

/** Which vault actually produced the key material. Recorded, never asserted. */
export const keyProtectionBackends = ["tpm", "dpapi", "plaintext"] as const;
export const keyProtectionBackendSchema = z.enum(keyProtectionBackends);
export type KeyProtectionBackend = (typeof keyProtectionBackends)[number];

export interface LoadedPrivateKey {
  readonly pem: string;
  /** The backend that actually opened the key, not the one that was preferred. */
  readonly backend: KeyProtectionBackend;
  /** Set when the key was opened under a recovery grant rather than normally. */
  readonly underRecoveryGrant?: boolean;
}

export class KeyProtectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyProtectionError";
  }
}

export function tpmVaultPath(keyDir: string, keyId: string): string {
  return join(keyDir, `${keyId}.pem.tpm`);
}
export function dpapiVaultPath(keyDir: string, keyId: string): string {
  return join(keyDir, `${keyId}.pem.dpapi`);
}
export function plaintextPath(keyDir: string, keyId: string): string {
  return join(keyDir, `${keyId}.pem`);
}

export interface LoadPrivateKeyInput {
  readonly keyDir: string;
  readonly keyId: string;
  readonly registryPurpose: RegistryPurpose;
  /** Opens the DPAPI fallback for this key on the live path. Signed and audited. */
  readonly recoveryGrant?: boolean;
  /** Injected so tests and the CLI share one implementation. */
  readonly dpapiUnprotect: (vaultPath: string) => string;
}

/**
 * Opens a private key under the rules above, reporting which backend actually
 * produced it so callers can bind that fact into what they sign.
 */
export function loadPrivateKey(input: LoadPrivateKeyInput): LoadedPrivateKey {
  const { keyDir, keyId, registryPurpose } = input;
  const tpmPath = tpmVaultPath(keyDir, keyId);
  const dpapiPath = dpapiVaultPath(keyDir, keyId);
  const plainPath = plaintextPath(keyDir, keyId);

  if (registryPurpose === "live") {
    // Plaintext is never acceptable here, and saying so before anything else
    // means a stray PEM cannot be reached by any path, grant or not.
    if (input.recoveryGrant === true) {
      if (!existsSync(dpapiPath)) {
        throw new KeyProtectionError(
          `${keyId}: recovery grant is open but no DPAPI vault exists at ${dpapiPath}.`,
        );
      }
      return { pem: input.dpapiUnprotect(dpapiPath), backend: "dpapi", underRecoveryGrant: true };
    }

    if (!existsSync(tpmPath)) {
      throw new KeyProtectionError(
        `${keyId}: live registries require a TPM vault at ${tpmPath}. `
        + "Seal it with scripts/completion/seal-live-keys-to-tpm.mjs --apply, or open a recovery "
        + "grant with `completion:recover-key`. There is no automatic DPAPI fallback on the live path.",
      );
    }
    let pem: string;
    try {
      pem = unsealFromTpm(JSON.parse(readFileSync(tpmPath, "utf8"))).toString("utf8");
    } catch (error) {
      // Corrupt vault, cleared TPM, absent wrapping key — all stop here. Falling
      // back would be indistinguishable from an attacker deleting the vault.
      throw new KeyProtectionError(
        `${keyId}: TPM vault present but could not be unsealed (${
          error instanceof Error ? error.message.split("\n")[0] : String(error)
        }). Refusing to fall back to DPAPI on the live path; use \`completion:recover-key\`.`,
      );
    }
    return { pem, backend: "tpm" };
  }

  // Development fixtures keep the old preference chain. They cannot sign live
  // evidence — the registry purpose gates that independently — so requiring a
  // TPM here would only make the fixture set unusable on machines without one.
  if (existsSync(tpmPath)) {
    return { pem: unsealFromTpm(JSON.parse(readFileSync(tpmPath, "utf8"))).toString("utf8"), backend: "tpm" };
  }
  if (existsSync(dpapiPath)) return { pem: input.dpapiUnprotect(dpapiPath), backend: "dpapi" };
  if (existsSync(plainPath)) return { pem: readFileSync(plainPath, "utf8"), backend: "plaintext" };
  throw new KeyProtectionError(`${keyId}: no key material found in ${keyDir}.`);
}

/**
 * The backend a record signed under this registry purpose must report.
 * Live attestation is only meaningful if the key came out of the TPM.
 */
export function requiredBackendFor(purpose: RegistryPurpose): KeyProtectionBackend | undefined {
  return purpose === "live" ? "tpm" : undefined;
}
