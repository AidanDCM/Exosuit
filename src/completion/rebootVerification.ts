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
import { verifyKeyRegistry } from "./signing.js";

const DIR = resolve(process.env["EXOSUIT_COMPLETION_DIR"] ?? "docs/qa/completion-m05");
const ARTIFACTS = join(DIR, "artifacts");
const KEY_DIR = resolve(process.env["EXOSUIT_COMPLETION_KEY_DIR"] ?? "");
const CAPTURE_PATH = resolve(process.env["EXOSUIT_REBOOT_CAPTURE"] ?? join(DIR, "reboot-capture.json"));

const FILES = ["keys.json", "manifest.json", "ledger.json", "evidence.json"] as const;

function powershell(script: string): string {
  return execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
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
  const registry = keyRegistrySchema.parse(JSON.parse(readFileSync(join(DIR, "keys.json"), "utf8")));
  const manifest = buildCompletionManifestSchema.parse(JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8")));
  const ledger = completionLedgerSchema.parse(JSON.parse(readFileSync(join(DIR, "ledger.json"), "utf8")));
  const evidence = evidenceStoreSchema.parse(JSON.parse(readFileSync(join(DIR, "evidence.json"), "utf8")));
  return { registry, manifest, ledger, evidence };
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
  const before = JSON.parse(readFileSync(CAPTURE_PATH, "utf8"));
  const { registry, manifest, ledger, evidence } = loadState();
  const now = new Date().toISOString();
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

  // 5. ledger continuity
  const storeResult = verifyEvidenceStore({
    records: evidence.records,
    manifest: manifest as BuildCompletionManifest,
    registry,
    artifacts: artifactSource(),
    now,
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
    });
    const rejected = !replayResult.valid.has(replay.evidenceId);
    checks.push({
      name: "nonce replay rejected after restart",
      pass: rejected,
      detail: (replayResult.failures.get(replay.evidenceId) ?? []).join("; ") || "accepted",
    });
  }

  // 8. old boot id rejection — a pre-reboot boot cannot still be producing
  //    evidence after the machine restarted.
  const oldBootId: string | undefined = before.usedBootIds[0];
  if (oldBootId !== undefined && sample !== undefined) {
    const stale: CompletionEvidence = {
      ...sample,
      evidenceId: `${sample.evidenceId}-stale-boot`,
      nonce: createHash("sha256").update(`${sample.nonce}-stale`).digest("hex").slice(0, 32),
      observedAt: now,
      environment: { ...sample.environment, fieldBootId: oldBootId },
    };
    const staleResult = verifyEvidenceStore({
      records: [...evidence.records, stale],
      manifest: manifest as BuildCompletionManifest,
      registry,
      artifacts: artifactSource(),
      now,
    });
    const rejected = !staleResult.valid.has(stale.evidenceId);
    checks.push({
      name: "pre-reboot boot id rejected for new evidence",
      pass: rejected,
      detail: (staleResult.failures.get(stale.evidenceId) ?? []).join("; ") || "ACCEPTED",
      // The contract has no rule tying evidence to the current host boot; if
      // this passes it is because of artifact/nonce reuse, not a boot rule.
      gap: !rejected,
    });
  }

  // 9. host attestation freshness relative to the current boot
  const hostAttestationPath = join(DIR, "host-attestation.json");
  if (existsSync(hostAttestationPath)) {
    const attestation = JSON.parse(readFileSync(hostAttestationPath, "utf8"));
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
