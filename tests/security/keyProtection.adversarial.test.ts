import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KeyProtectionError, loadPrivateKey } from "../../src/completion/keyProtection.js";
import { sealToTpm, tpmStatus } from "../../src/completion/tpmSeal.js";
import { foldRecoveryLedger, nextRecoveryEvent, GENESIS_RECOVERY_HASH } from "../../src/completion/keyRecovery.js";

/**
 * The first cut of TPM sealing loaded TPM -> DPAPI -> plaintext, which made the
 * TPM a preference rather than a boundary: deleting a vault silently downgraded
 * protection and no live signature proved the TPM was used. These are the
 * negatives that keep the boundary a boundary.
 */

const KEY_ID = "live-host-1";
let dir: string;
let pem: string;

/** A DPAPI vault is simulated by an injected opener; the rule under test is the branching, not DPAPI itself. */
const dpapiUnprotect = () => pem;
const noDpapi = () => {
  throw new Error("dpapiUnprotect must not be called");
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "exo-keyprot-"));
  const { privateKey } = generateKeyPairSync("ed25519");
  pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("live registry key protection", () => {
  it("1. fails when the TPM vault is missing even though a valid DPAPI vault exists", () => {
    writeFileSync(join(dir, `${KEY_ID}.pem.dpapi`), "ignored-ciphertext");
    expect(() => loadPrivateKey({
      keyDir: dir,
      keyId: KEY_ID,
      registryPurpose: "live",
      dpapiUnprotect: noDpapi,
    })).toThrow(/require a TPM vault/);
  });

  it("2. fails on a corrupted TPM vault without falling back", () => {
    writeFileSync(join(dir, `${KEY_ID}.pem.tpm`), '{"format":"exosuit-tpm-vault","version":1}');
    expect(() => loadPrivateKey({
      keyDir: dir,
      keyId: KEY_ID,
      registryPurpose: "live",
      dpapiUnprotect: noDpapi,
    })).toThrow(/could not be unsealed/);
  });

  it("3. fails when the vault names a wrapping key this host does not have", () => {
    if (!tpmStatus().available) return;
    const vault = sealToTpm(Buffer.from(pem, "utf8"));
    writeFileSync(
      join(dir, `${KEY_ID}.pem.tpm`),
      JSON.stringify({ ...vault, wrappingKeyName: "exosuit-absent-wrapping-key" }),
    );
    expect(() => loadPrivateKey({
      keyDir: dir,
      keyId: KEY_ID,
      registryPurpose: "live",
      dpapiUnprotect: noDpapi,
    })).toThrow(/could not be unsealed/);
  }, 60_000);

  it("4. never reaches a plaintext PEM on the live path", () => {
    const plainDir = mkdtempSync(join(tmpdir(), "exo-keyprot-plain-"));
    try {
      writeFileSync(join(plainDir, `${KEY_ID}.pem`), pem);
      expect(() => loadPrivateKey({
        keyDir: plainDir,
        keyId: KEY_ID,
        registryPurpose: "live",
        dpapiUnprotect: noDpapi,
      })).toThrow(/require a TPM vault/);
      // Even with a grant open, plaintext is not a recovery source.
      expect(() => loadPrivateKey({
        keyDir: plainDir,
        keyId: KEY_ID,
        registryPurpose: "live",
        recoveryGrant: true,
        dpapiUnprotect: noDpapi,
      })).toThrow(/no DPAPI vault exists/);
    } finally {
      rmSync(plainDir, { recursive: true, force: true });
    }
  });

  it("opens the TPM vault and reports the backend as tpm", () => {
    if (!tpmStatus().available) return;
    const vault = sealToTpm(Buffer.from(pem, "utf8"));
    writeFileSync(join(dir, `${KEY_ID}.pem.tpm`), JSON.stringify(vault));
    const loaded = loadPrivateKey({
      keyDir: dir,
      keyId: KEY_ID,
      registryPurpose: "live",
      dpapiUnprotect: noDpapi,
    });
    expect(loaded.backend).toBe("tpm");
    expect(loaded.pem).toBe(pem);
    expect(loaded.underRecoveryGrant).toBeUndefined();
  }, 60_000);

  it("reaches DPAPI only under an explicit grant, and says so", () => {
    const grantDir = mkdtempSync(join(tmpdir(), "exo-keyprot-grant-"));
    try {
      writeFileSync(join(grantDir, `${KEY_ID}.pem.dpapi`), "ciphertext");
      const loaded = loadPrivateKey({
        keyDir: grantDir,
        keyId: KEY_ID,
        registryPurpose: "live",
        recoveryGrant: true,
        dpapiUnprotect,
      });
      expect(loaded.backend).toBe("dpapi");
      expect(loaded.underRecoveryGrant).toBe(true);
    } finally {
      rmSync(grantDir, { recursive: true, force: true });
    }
  });
});

describe("development registry key protection", () => {
  it("5. development fixtures may still use DPAPI", () => {
    const devDir = mkdtempSync(join(tmpdir(), "exo-keyprot-dev-"));
    try {
      writeFileSync(join(devDir, "completion-host-1.pem.dpapi"), "ciphertext");
      const loaded = loadPrivateKey({
        keyDir: devDir,
        keyId: "completion-host-1",
        registryPurpose: "development",
        dpapiUnprotect,
      });
      expect(loaded.backend).toBe("dpapi");
    } finally {
      rmSync(devDir, { recursive: true, force: true });
    }
  });

  it("development fixtures may still use plaintext", () => {
    const devDir = mkdtempSync(join(tmpdir(), "exo-keyprot-devplain-"));
    try {
      writeFileSync(join(devDir, "completion-host-1.pem"), pem);
      expect(loadPrivateKey({
        keyDir: devDir,
        keyId: "completion-host-1",
        registryPurpose: "development",
        dpapiUnprotect: noDpapi,
      }).backend).toBe("plaintext");
    } finally {
      rmSync(devDir, { recursive: true, force: true });
    }
  });

  it("reports a missing key rather than returning nothing", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "exo-keyprot-empty-"));
    try {
      expect(() => loadPrivateKey({
        keyDir: emptyDir,
        keyId: "completion-host-1",
        registryPurpose: "development",
        dpapiUnprotect: noDpapi,
      })).toThrow(KeyProtectionError);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

describe("recovery ledger", () => {
  const base = {
    machineId: "machine-9c62d678dd970f15",
    signingKeyId: KEY_ID,
    signature: "sig",
  };

  it("folds an open grant and blocks nothing else", () => {
    const opened = {
      ...nextRecoveryEvent({
        ledger: { contractVersion: 2, events: [] },
        eventId: "r1",
        keyId: KEY_ID,
        kind: "opened",
        reason: "TPM cleared during firmware update",
        machineId: base.machineId,
        recordedAt: "2026-08-06T12:00:00.000Z",
        signingKeyId: KEY_ID,
      }),
      signature: "sig",
    };
    const state = foldRecoveryLedger({ contractVersion: 2, events: [opened] });
    expect(state.failures).toEqual([]);
    expect(state.openKeyIds).toEqual([KEY_ID]);
  });

  it("fails closed on a broken hash chain rather than reporting no grants", () => {
    const forged = {
      ...base,
      eventId: "r1",
      sequence: 0,
      previousEventHash: "f".repeat(64),
      keyId: KEY_ID,
      kind: "opened" as const,
      reason: "forged event with a wrong chain link",
      recordedAt: "2026-08-06T12:00:00.000Z",
    };
    const state = foldRecoveryLedger({ contractVersion: 2, events: [forged] });
    expect(state.failures.some((f) => f.includes("previousEventHash"))).toBe(true);
  });

  it("rejects closing a grant that was never opened", () => {
    const closed = {
      ...base,
      eventId: "r1",
      sequence: 0,
      previousEventHash: GENESIS_RECOVERY_HASH,
      keyId: KEY_ID,
      kind: "closed" as const,
      reason: "closing without ever having opened",
      recordedAt: "2026-08-06T12:00:00.000Z",
    };
    expect(foldRecoveryLedger({ contractVersion: 2, events: [closed] }).failures
      .some((f) => f.includes("no open grant"))).toBe(true);
  });
});
