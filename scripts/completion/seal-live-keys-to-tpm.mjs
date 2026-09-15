/**
 * M1 pre-work — seal the live signing keys to the TPM.
 *
 * Closes handoff §7.2. The live private keys rest on DPAPI alone; the TPM on
 * this host is present, ready and owned, and has been unused. This wraps each
 * key's at-rest protection under a non-exportable TPM platform key, so the
 * vault is bound to this physical machine and not merely to this Windows
 * account.
 *
 * Deliberately conservative, because these keys are the only thing that can
 * re-sign the recorded M0 attestation:
 *
 *   - ADDITIVE. Writes `<key>.pem.tpm` and never deletes or modifies
 *     `<key>.pem.dpapi`. If the TPM is ever cleared, the DPAPI vault still
 *     opens every key.
 *   - VERIFIES BEFORE IT WRITES. Each key is sealed in memory, unsealed again,
 *     and compared byte-for-byte. A key that does not round-trip is skipped and
 *     reported; nothing is written for it.
 *   - NEVER WRITES PLAINTEXT. The decrypted key exists only in memory.
 *   - DOES NOT ROTATE. Public keys, the registry, the ledger and every existing
 *     signature are untouched, so no recorded evidence changes meaning. Sealing
 *     changes how a key is stored, not what it is.
 *
 * Needs neither the network down nor a restart, so unlike
 * `offline-live-trust-setup.mjs` it is safe to run in an ordinary session.
 *
 * Requires a build first — like `verify-field-live-readiness.mjs`, it uses the
 * compiled sealing primitives so this script and the CLI cannot drift onto
 * different vault formats.
 *
 * Usage (PowerShell):
 *   npm run build
 *   $env:EXOSUIT_COMPLETION_KEY_DIR = "$env:USERPROFILE\.exosuit-live-keys"
 *   node scripts/completion/seal-live-keys-to-tpm.mjs           # report only
 *   node scripts/completion/seal-live-keys-to-tpm.mjs --apply   # seal
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sealToTpm, unsealFromTpm, tpmStatus } from "../../dist/src/completion/tpmSeal.js";

const KEY_DIR = resolve(
  process.env.EXOSUIT_COMPLETION_KEY_DIR
    ?? join(process.env.USERPROFILE ?? ".", ".exosuit-live-keys"),
);
const APPLY = process.argv.includes("--apply");

function psPath(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Opens a DPAPI vault. The plaintext never leaves this process. */
function dpapiUnprotect(vaultPath) {
  const output = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
    "Add-Type -AssemblyName System.Security; "
    + `$b=[IO.File]::ReadAllBytes(${psPath(vaultPath)}); `
    + "$u=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'); "
    + "[Console]::Out.Write([Convert]::ToBase64String($u))",
  ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
  return Buffer.from(output, "base64");
}

/* ------------------------------------------------------------------ main */

const status = tpmStatus();
if (!status.available) {
  console.error(`TPM platform provider unavailable: ${status.reason ?? "unknown"}`);
  console.error("Nothing was changed.");
  process.exit(1);
}

if (!existsSync(KEY_DIR)) {
  console.error(`Key directory does not exist: ${KEY_DIR}`);
  process.exit(1);
}

const dpapiVaults = readdirSync(KEY_DIR).filter((name) => name.endsWith(".pem.dpapi")).sort();
if (dpapiVaults.length === 0) {
  console.error(`No DPAPI vault files in ${KEY_DIR}. Nothing to seal.`);
  process.exit(1);
}

console.log(`Key directory:   ${KEY_DIR}`);
console.log(`DPAPI vaults:    ${dpapiVaults.length}`);
console.log(`TPM provider:    ${status.provider}`);
console.log(`Wrapping key:    ${status.wrappingKeyName} (${status.wrappingKeyExists ? "exists" : "will be created"})`);
console.log(`Mode:            ${APPLY ? "APPLY" : "report only"}\n`);

const results = [];
for (const vaultName of dpapiVaults) {
  const keyId = vaultName.replace(/\.pem\.dpapi$/, "");
  const tpmPath = join(KEY_DIR, `${keyId}.pem.tpm`);
  const alreadySealed = existsSync(tpmPath);

  const plaintext = dpapiUnprotect(join(KEY_DIR, vaultName));
  let existingOpens = false;
  let verified = false;
  let wrote = false;

  try {
    // An existing sealed vault is confirmed to still open and match, rather
    // than being silently overwritten with a fresh one.
    if (alreadySealed) {
      try {
        existingOpens = unsealFromTpm(JSON.parse(readFileSync(tpmPath, "utf8"))).equals(plaintext);
      } catch {
        existingOpens = false;
      }
    }

    if (alreadySealed && existingOpens) {
      verified = true;
    } else {
      const vault = sealToTpm(plaintext);
      // Verify before writing: seal, unseal, compare. A key that does not
      // round-trip is never persisted.
      verified = unsealFromTpm(vault).equals(plaintext);
      if (verified && APPLY) {
        writeFileSync(tpmPath, `${JSON.stringify(vault, null, 2)}\n`, "utf8");
        wrote = true;
      }
    }
  } finally {
    plaintext.fill(0);
  }

  results.push({ keyId, alreadySealed, existingOpens, verified, wrote });

  const state = wrote
    ? "sealed"
    : alreadySealed && existingOpens
      ? "already sealed (verified)"
      : verified
        ? "round-trip verified, not written (report only)"
        : "ROUND-TRIP FAILED — not written";
  console.log(`  ${verified ? "ok  " : "FAIL"}  ${keyId.padEnd(28)} ${state}`);
}

const failed = results.filter((result) => !result.verified);
console.log(`\n${results.length - failed.length}/${results.length} keys verified.`);

if (failed.length > 0) {
  console.error("\nKeys that did not round-trip (nothing was written for these):");
  for (const failure of failed) console.error(`  - ${failure.keyId}`);
  process.exitCode = 1;
} else if (!APPLY) {
  console.log("\nReport only. Re-run with --apply to write the sealed vaults.");
  console.log("The DPAPI vaults are kept either way; sealing never removes them.");
} else {
  console.log("\nSealed vaults written. DPAPI vaults left in place as the fallback.");
  console.log("The CLI now prefers the TPM vault; confirm with `npm run validate:completion`.");
}
