import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const reportOnly = process.argv.includes("--report-only");
const manifestPath = resolve(root, "docs/qa/production-readiness.json");
const assessmentPath = resolve(root, "docs/qa/PRODUCTION_READINESS_ASSESSMENT_2026-07-22.md");

const requiredGates = [
  "source_validation",
  "dependency_reproducibility",
  "glove_windows_acceptance",
  "glove_multiwindow_acceptance",
  "field_hyperv_lifecycle",
  "field_authenticated_channel",
  "field_guest_readiness",
  "field_scene_production",
  "teach_privacy_and_recording",
  "artifact_transfer",
  "shadow_no_input",
  "correction_mode",
  "personal_models",
  "assisted_mode",
  "synthetic_pilot",
  "chatgpt_mcp_acceptance",
  "owner_acceptance",
  "reliability_and_performance",
  "cockpit_and_human_factors",
  "packaging_signing_update_rollback",
  "security_privacy_penetration",
  "operations_incident_response",
];

const errors = [];
const warnings = [];
let manifest;

try {
  const details = await stat(manifestPath);
  if (!details.isFile() || details.size === 0) errors.push("production readiness manifest is missing or empty");
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  errors.push(`production readiness manifest could not be read: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  await access(assessmentPath);
} catch {
  errors.push("production readiness assessment document is missing");
}

try {
  await access(resolve(root, "package-lock.json"));
} catch {
  errors.push("package-lock.json is missing; Node dependency resolution is not reproducible");
}

if (manifest) {
  if (manifest.contractVersion !== 1) errors.push("unsupported production readiness contract version");
  if (!Array.isArray(manifest.gates)) errors.push("production readiness gates must be an array");

  const gateMap = new Map();
  for (const gate of Array.isArray(manifest.gates) ? manifest.gates : []) {
    if (!gate || typeof gate !== "object" || typeof gate.gate !== "string") {
      errors.push("production readiness manifest contains an invalid gate record");
      continue;
    }
    if (gateMap.has(gate.gate)) errors.push(`duplicate production readiness gate: ${gate.gate}`);
    gateMap.set(gate.gate, gate);
  }

  for (const gateName of requiredGates) {
    const gate = gateMap.get(gateName);
    if (!gate) {
      errors.push(`missing production readiness gate: ${gateName}`);
      continue;
    }
    if (gate.status !== "pass") errors.push(`${gateName}: ${gate.status ?? "missing status"}`);
    if (!Array.isArray(gate.evidence) || gate.evidence.length === 0) {
      errors.push(`${gateName}: no evidence references`);
    } else if (gate.evidence.some((item) => typeof item !== "string" || item.trim().length === 0)) {
      errors.push(`${gateName}: evidence references must be non-empty strings`);
    }
  }

  for (const gateName of gateMap.keys()) {
    if (!requiredGates.includes(gateName)) warnings.push(`unrecognized production readiness gate: ${gateName}`);
  }

  if (typeof manifest.candidateCommit !== "string" || !/^[a-f0-9]{40}$/.test(manifest.candidateCommit)) {
    errors.push("candidateCommit must be an exact 40-character lowercase Git commit SHA");
  }
  if (typeof manifest.candidateVersion !== "string" || manifest.candidateVersion.trim().length === 0) {
    errors.push("candidateVersion is missing");
  }
  if (manifest.ownerApproved !== true) errors.push("owner approval is absent");
  if (manifest.productionDecision !== "approved") errors.push(`production decision is ${manifest.productionDecision ?? "missing"}`);
  if (manifest.developmentAccessEnabled !== false) errors.push("development access must be explicitly disabled");
  if (manifest.developmentUnattendedSetupEnabled !== false) errors.push("development unattended setup must be explicitly disabled");
  if (!Array.isArray(manifest.unresolvedBlockers)) errors.push("unresolvedBlockers must be an array");
  if (Array.isArray(manifest.unresolvedBlockers) && manifest.unresolvedBlockers.length > 0) {
    errors.push(`unresolved production blockers remain (${manifest.unresolvedBlockers.length})`);
  }

  const expectedCommit = process.env.EXOSUIT_RELEASE_COMMIT ?? process.env.GITHUB_SHA;
  if (expectedCommit && manifest.candidateCommit !== expectedCommit) {
    errors.push(`candidateCommit does not match execution commit ${expectedCommit}`);
  }
}

console.log("Exosuit production readiness assessment");
console.log(`Mode: ${reportOnly ? "report-only" : "release gate"}`);
if (manifest?.candidateCommit) console.log(`Candidate commit: ${manifest.candidateCommit}`);
if (manifest?.candidateVersion) console.log(`Candidate version: ${manifest.candidateVersion}`);

if (warnings.length > 0) {
  console.log("\nWarnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (errors.length > 0) {
  console.error("\nNOT PRODUCTION READY:");
  for (const error of errors) console.error(`- ${error}`);
  if (!reportOnly) process.exitCode = 1;
} else {
  console.log("\nPRODUCTION READINESS GATE PASSED.");
}
