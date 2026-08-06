/**
 * Reboot verification for the completion gate (M0.5, post-reboot step).
 *
 *   capture  — snapshot the invariants that must survive a restart
 *   verify   — re-check them after the machine has come back up
 *
 * Run `capture`, reboot, then run `verify`. The assistant cannot be alive
 * across the restart, so the two halves are separate invocations and the
 * captured file is the only thing carried between them.
 *
 * Usage:
 *   EXOSUIT_COMPLETION_DIR=docs/qa/completion-m05 tsx src/completion/rebootVerification.ts capture
 *   EXOSUIT_COMPLETION_DIR=docs/qa/completion-m05 tsx src/completion/rebootVerification.ts verify
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  completionLedgerSchema,
  evidenceStoreSchema,
  keyRegistrySchema,
  buildCompletionManifestSchema,
  type BuildCompletionManifest,
  type CompletionEvidence,
} from "./contracts.js";
import { verifyEvidenceStore, type EvidenceArtifactSource } from "./evidence.js";
import { hashLedgerEvent, verifyCompletionLedger } from "./ledger.js";
import { verifyFieldLifecycle } from "./fieldLifecycle.js";
import { fieldLifecycleLedgerSchema } from "./contracts.js";
import { signRecord, verifyKeyRegistry } from "./signing.js";
import { randomBytes } from "node:crypto";
import { writeFileSync as writeArtifact } from "node:fs";

const DIR = resolve(process.env["EXOSUIT_COMPLETION_DIR"] ?? "docs/qa/completion-m05");
const ARTIFACTS = join(DIR, "artifacts");
const KEY_DIR = resolve(process.env["EXOSUIT_COMPLETION_KEY_DIR"] ?? "");
const CAPTURE_PATH = resolve(process.env["EXOSUIT_REBOOT_CAPTURE"] ?? join(DIR, "reboot-capture.json"));

const FILES = ["keys.json", "manifest.json", "ledger.json", "evidence.json", "field-lifecycle.json"] as const;

function powershell(script: string): string {
  return execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

/**
 * Reads JSON, tolerating a UTF-8 BOM. PowerShell 5.1's `Set-Content -Encoding
 * utf8` emits one, and JSON.parse rejects it.
 */
function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
}

function fileSha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function lastBootUpTime(): string {
  return powershell("(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')");
}

function dpapiReadable(keyId: string): boolean {
  const vault = join(KEY_DIR, `${keyId}.pem.dpapi`);
  if (!existsSync(vault)) return false;
  try {
    const out = powershell(
      "Add-Type -AssemblyName System.Security; "
      + `$b=[IO.File]::ReadAllBytes('${vault.replace(/'/g, "''")}'); `
      + "$u=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'); "
      + "[Console]::Out.Write($u.Length)",
    );
    return Number.parseInt(out, 10) > 0;
  } catch {
    return false;
  }
}

function artifactSource(): EvidenceArtifactSource {
  return {
    read(hash) {
      const path = join(ARTIFACTS, hash);
      return existsSync(path) ? readFileSync(path) : undefined;
    },
  };
}

function loadState() {
  const registry = keyRegistrySchema.parse(readJsonFile(join(DIR, "keys.json")));
  const manifest = buildCompletionManifestSchema.parse(readJsonFile(join(DIR, "manifest.json")));
  const ledger = completionLedgerSchema.parse(readJsonFile(join(DIR, "ledger.json")));
  const evidence = evidenceStoreSchema.parse(readJsonFile(join(DIR, "evidence.json")));
  // Field-bound evidence fails closed without this, so the verifier must load
  // it exactly as the evaluator does.
  const lifecyclePath = join(DIR, "field-lifecycle.json");
  const lifecycleLedger = fieldLifecycleLedgerSchema.parse(
    existsSync(lifecyclePath) ? readJsonFile(lifecyclePath) : { contractVersion: 2, events: [] },
  );
  return { registry, manifest, ledger, evidence, lifecycleLedger };
}

/* ---------------------------------------------------------------- capture */

function capture(): void {
  const { ledger, evidence } = loadState();
  const events = [...ledger.events].sort((a, b) => a.sequence - b.sequence);
  const tip = events.at(-1);

  const snapshot = {
    capturedAt: new Date().toISOString(),
    lastBootUpTime: lastBootUpTime(),
    fileHashes: Object.fromEntries(FILES.map((name) => [name, fileSha(join(DIR, name))])),
    ledgerEventCount: events.length,
    ledgerTipEventId: tip?.eventId ?? null,
    ledgerTipHash: tip === undefined ? null : hashLedgerEvent(tip),
    evidenceIds: evidence.records.map((r) => r.evidenceId),
    // Nonces and boot ids that must never be accepted again after the restart.
    usedNonces: evidence.records.map((r) => r.nonce),
    usedBootIds: [...new Set(evidence.records
      .map((r) => r.environment.fieldBootId)
      .filter((v): v is string => v !== undefined))],
    artifactHashes: evidence.records.map((r) => r.artifactSha256),
    dpapiKeysReadable: ["live-root-1", "live-host-1", "live-ledger-1"]
      .map((keyId) => ({ keyId, readable: dpapiReadable(keyId) })),
  };

  writeFileSync(CAPTURE_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Captured pre-reboot state to ${CAPTURE_PATH}`);
  console.log(`  lastBootUpTime : ${snapshot.lastBootUpTime}`);
  console.log(`  ledger events  : ${snapshot.ledgerEventCount} (tip ${snapshot.ledgerTipEventId})`);
  console.log(`  evidence       : ${snapshot.evidenceIds.length} records`);
  console.log(`  nonces tracked : ${snapshot.usedNonces.length}`);
  console.log(`  boot ids       : ${snapshot.usedBootIds.join(", ") || "(none)"}`);
  for (const key of snapshot.dpapiKeysReadable) {
    console.log(`  DPAPI ${key.keyId.padEnd(16)} readable=${key.readable}`);
  }
  console.log("\nReboot now, then run this script with `verify`.");
}

/* ----------------------------------------------------------------- verify */

interface Check {
  name: string;
  pass: boolean;
  detail: string;
  gap?: boolean;
}

function verify(): void {
  if (!existsSync(CAPTURE_PATH)) {
    console.error(`No pre-reboot capture at ${CAPTURE_PATH}. Run \`capture\` before rebooting.`);
    process.exitCode = 2;
    return;
  }
  const before = readJsonFile(CAPTURE_PATH) as Record<string, any>;
  const { registry, manifest, ledger, evidence, lifecycleLedger } = loadState();
  const now = new Date().toISOString();
  const lifecycle = verifyFieldLifecycle({ ledger: lifecycleLedger, registry });
  const checks: Check[] = [];

  // 1. the machine actually rebooted
  const bootNow = lastBootUpTime();
  checks.push({
    name: "new host boot identity",
    pass: bootNow !== before.lastBootUpTime,
    detail: `before=${before.lastBootUpTime} after=${bootNow}`,
  });

  // 2. evidence persistence — state survived byte-identical
  for (const name of FILES) {
    const actual = fileSha(join(DIR, name));
    checks.push({
      name: `persistence: ${name}`,
      pass: actual === before.fileHashes[name],
      detail: actual === before.fileHashes[name] ? "unchanged" : `changed (${actual.slice(0, 12)})`,
    });
  }

  // 3. artifacts still present and content-addressed
  const missing = before.artifactHashes.filter((h: string) => artifactSource().read(h) === undefined);
  checks.push({
    name: "artifact store persistence",
    pass: missing.length === 0,
    detail: missing.length === 0 ? `${before.artifactHashes.length} artifacts present` : `missing ${missing.length}`,
  });

  // 4. registry and key loading
  const registryFailures = verifyKeyRegistry(registry, now);
  checks.push({
    name: "registry loads and root signature verifies",
    pass: registryFailures.length === 0,
    detail: registryFailures.join("; ") || "root signature valid",
  });

  for (const key of before.dpapiKeysReadable) {
    const readable = dpapiReadable(key.keyId);
    checks.push({
      name: `DPAPI key loading: ${key.keyId}`,
      pass: readable === key.readable && readable,
      detail: `before=${key.readable} after=${readable}`,
    });
  }

  checks.push({
    name: "Field lifecycle ledger verifies",
    pass: lifecycle.failures.length === 0,
    detail: lifecycle.failures.slice(0, 2).join("; ")
      || `${lifecycleLedger.events.length} events, ${lifecycle.boots.length} boot windows`,
  });

  // 5. ledger continuity
  const storeResult = verifyEvidenceStore({
    records: evidence.records,
    manifest: manifest as BuildCompletionManifest,
    registry,
    artifacts: artifactSource(),
    now,
    lifecycle,
  });
  const ledgerResult = verifyCompletionLedger({
    ledger,
    registry,
    validEvidence: storeResult.valid,
    knownTestIds: new Set(manifest.tests.map((t) => t.id)),
    now,
  });
  const events = [...ledger.events].sort((a, b) => a.sequence - b.sequence);
  const tip = events.at(-1);
  checks.push({
    name: "ledger continuity (chain verifies)",
    pass: ledgerResult.failures.length === 0,
    detail: ledgerResult.failures.slice(0, 2).join("; ") || `${events.length} events, chain intact`,
  });
  checks.push({
    name: "ledger tip unchanged",
    pass: tip !== undefined && hashLedgerEvent(tip) === before.ledgerTipHash,
    detail: `tip=${tip?.eventId ?? "none"}`,
  });

  // 6. evidence still verifies after restart
  checks.push({
    name: "recorded evidence still verifies",
    pass: storeResult.valid.size === before.evidenceIds.length && storeResult.failures.size === 0,
    detail: `${storeResult.valid.size} valid, ${storeResult.failures.size} rejected`,
  });

  // 7. nonce replay rejection after restart
  const sample = evidence.records[0];
  if (sample !== undefined) {
    const replay: CompletionEvidence = {
      ...sample,
      evidenceId: `${sample.evidenceId}-replay`,
      observedAt: now,
    };
    const replayResult = verifyEvidenceStore({
      records: [...evidence.records, replay],
      manifest: manifest as BuildCompletionManifest,
      registry,
      artifacts: artifactSource(),
      now,
      lifecycle,
    });
    const rejected = !replayResult.valid.has(replay.evidenceId);
    checks.push({
      name: "nonce replay rejected after restart",
      pass: rejected,
      detail: (replayResult.failures.get(replay.evidenceId) ?? []).join("; ") || "accepted",
    });
  }

  // 8. old boot id rejection.
  //
  //    This must be an isolated test. An earlier version reused the sample's
  //    artifact and nonce, so the record was rejected for artifact reuse and a
  //    broken signature — which scores a pass while proving nothing about boot
  //    rules. Here the record gets a fresh artifact, a fresh nonce, and a valid
  //    host signature, so a stale boot id is the only defect left.
  const oldBootId: string | undefined = before.usedBootIds[0];
  if (oldBootId !== undefined && sample !== undefined) {
    const freshArtifact = Buffer.from(
      `post-reboot probe ${randomBytes(8).toString("hex")}`,
      "utf8",
    );
    const freshHash = createHash("sha256").update(freshArtifact).digest("hex");
    writeArtifact(join(ARTIFACTS, freshHash), freshArtifact);

    const unsigned = {
      ...sample,
      evidenceId: `post-reboot-stale-boot-${freshHash.slice(0, 8)}`,
      artifactSha256: freshHash,
      artifactBytes: freshArtifact.byteLength,
      nonce: randomBytes(16).toString("hex"),
      observedAt: now,
      environment: { ...sample.environment, fieldBootId: oldBootId },
    };
    delete (unsigned as Partial<CompletionEvidence>).signature;

    let stale: CompletionEvidence | undefined;
    try {
      const vault = join(KEY_DIR, `${sample.signingKeyId}.pem.dpapi`);
      const pem = Buffer.from(powershell(
        "Add-Type -AssemblyName System.Security; "
        + `$b=[IO.File]::ReadAllBytes('${vault.replace(/'/g, "''")}'); `
        + "$u=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'); "
        + "[Console]::Out.Write([Convert]::ToBase64String($u))",
      ), "base64").toString("utf8");
      stale = { ...unsigned, signature: signRecord(unsigned, pem) } as CompletionEvidence;
    } catch {
      stale = undefined;
    }

    if (stale === undefined) {
      checks.push({
        name: "pre-reboot boot id rejected for new evidence",
        pass: false,
        detail: "could not sign the probe; test inconclusive",
      });
    } else {
      const staleResult = verifyEvidenceStore({
        records: [...evidence.records, stale],
        manifest: manifest as BuildCompletionManifest,
        registry,
        artifacts: artifactSource(),
        now,
        lifecycle,
      });
      const reasons = staleResult.failures.get(stale.evidenceId) ?? [];
      const rejected = !staleResult.valid.has(stale.evidenceId);
      // Only a boot- or freshness-based reason counts. Anything else means the
      // probe was defective, not that the contract caught a stale boot.
      const rightReason = reasons.some((r) => /boot|superseded|stale/i.test(r));
      checks.push({
        name: "pre-reboot boot id rejected for new evidence",
        pass: rejected && rightReason,
        detail: rejected
          ? `rejected: ${reasons.join("; ")}`
          : "ACCEPTED — a fully valid record carrying a pre-reboot boot id was admitted",
        gap: !rejected || !rightReason,
      });
    }
  }

  // 9. host attestation freshness relative to the current boot
  const hostAttestationPath = join(DIR, "host-attestation.json");
  if (existsSync(hostAttestationPath)) {
    const attestation = readJsonFile(hostAttestationPath) as any;
    const attestedBoot: string | undefined = attestation?.windows?.lastBootUpTime;
    const stale = attestedBoot !== undefined && attestedBoot !== bootNow;
    checks.push({
      name: "host attestation is stale after reboot (detectable)",
      pass: stale,
      detail: `attested boot=${attestedBoot} current=${bootNow}`,
    });
  }

  let failed = 0;
  console.log(`Reboot verification against ${DIR}\n`);
  for (const check of checks) {
    if (!check.pass) failed += 1;
    console.log(`[${check.pass ? "  ok  " : " FAIL "}] ${check.name}`);
    console.log(`         ${check.detail}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);

  const gaps = checks.filter((c) => c.gap);
  if (gaps.length > 0) {
    console.log("\nContract gaps (not test bugs):");
    for (const gap of gaps) console.log(`  - ${gap.name}`);
  }
  if (failed > 0) process.exitCode = 1;
}

const mode = process.argv[2];
if (mode === "capture") capture();
else if (mode === "verify") verify();
else {
  console.error("Usage: rebootVerification.ts <capture|verify>");
  process.exitCode = 2;
}
