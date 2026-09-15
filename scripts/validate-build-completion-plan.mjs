import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const manifestPath = resolve(root, "docs/qa/build-completion-manifest.json");
const targetArg = valueAfter("--target") ?? null;
const requireReady = process.argv.includes("--require-ready");
const validTargets = new Set(["personal_mvp", "daily_driver", "production"]);
const requiredPhaseIds = ["M0", "M1", "M2", "M3", "M4", "M5", "M6", "P1", "P2", "P3"];
const requiredGateIds = [
  "SRC-001", "SRC-002", "SRC-003", "HYP-001", "CHN-001", "SCN-001", "ACT-001", "TCH-001", "SHD-001",
  "AST-001", "RCP-001", "MCP-001", "CPK-001", "INS-001", "OWN-001", "PERF-001", "COMP-001", "SEC-001",
  "REL-001", "PRD-001",
];
const evidenceRank = new Map([
  ["source", 0],
  ["unit", 1],
  ["fake_integration", 2],
  ["windows_guest", 3],
  ["hyperv_host_guest", 4],
  ["chatgpt_mcp", 5],
  ["owner_acceptance", 6],
  ["security_review", 7],
  ["release_operations", 8],
]);
const liveClasses = new Set([
  "windows_guest", "hyperv_host_guest", "chatgpt_mcp", "owner_acceptance", "security_review", "release_operations",
]);
const statusScore = new Map([
  ["planned", 0],
  ["source_validated", 0.45],
  ["ready_for_live", 0.6],
  ["passed", 1],
  ["failed", 0],
  ["blocked", 0],
]);
const severityWeight = new Map([["critical", 5], ["high", 3], ["medium", 2], ["low", 1]]);
const errors = [];
const warnings = [];

if (targetArg !== null && !validTargets.has(targetArg)) errors.push(`Unknown target: ${targetArg}`);

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  errors.push(`Could not read completion manifest: ${error instanceof Error ? error.message : String(error)}`);
}

if (manifest) validateManifest(manifest);

if (errors.length > 0) {
  console.error("Exosuit build completion plan validation failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Exosuit build completion plan validation passed.");
  for (const warning of warnings) console.log(`Warning: ${warning}`);
  const targets = targetArg ? [targetArg] : [...validTargets];
  for (const target of targets) {
    const result = evaluate(target);
    console.log(`\n${target}: ${result.weightedPercent}% weighted source/live completion`);
    console.log(`- required gates: ${result.requiredCount}`);
    console.log(`- passed gates: ${result.passedCount}`);
    console.log(`- blocking gates: ${result.blockers.join(", ") || "none"}`);
    console.log(`- next phases: ${result.nextPhases.join(", ") || "none"}`);
    console.log(`- promotion allowed: ${result.ready}`);
    if (requireReady && target === targetArg && !result.ready) process.exitCode = 1;
  }
}

function validateManifest(value) {
  if (value.contractVersion !== 1) errors.push("contractVersion must equal 1");
  if (value.productionDecision !== "denied") errors.push("planning manifest must keep productionDecision denied");
  if (!/^[a-f0-9]{40}$/.test(value.baselineCommit ?? "")) errors.push("baselineCommit must be an exact lowercase SHA");
  if (!Array.isArray(value.phases) || value.phases.length === 0) errors.push("phases must be a non-empty array");
  if (!Array.isArray(value.tests) || value.tests.length === 0) errors.push("tests must be a non-empty array");

  const { manifestHash, ...core } = value;
  if (!/^[a-f0-9]{64}$/.test(manifestHash ?? "")) errors.push("manifestHash must be SHA-256");
  else if (sha256Canonical(core) !== manifestHash) errors.push("manifestHash does not match canonical manifest content");

  const phases = Array.isArray(value.phases) ? value.phases : [];
  const tests = Array.isArray(value.tests) ? value.tests : [];
  const phaseIds = new Set();
  const orders = new Set();
  for (const phase of phases) {
    if (!/^[MP][0-9]+$/.test(phase.id ?? "")) errors.push(`invalid phase id: ${phase.id}`);
    if (phaseIds.has(phase.id)) errors.push(`duplicate phase id: ${phase.id}`);
    phaseIds.add(phase.id);
    if (!Number.isInteger(phase.order) || phase.order < 0) errors.push(`invalid phase order: ${phase.id}`);
    if (orders.has(phase.order)) errors.push(`duplicate phase order: ${phase.order}`);
    orders.add(phase.order);
    if (!Array.isArray(phase.dependencies)) errors.push(`${phase.id}: dependencies must be an array`);
    if (!Array.isArray(phase.deliverables) || phase.deliverables.length === 0) errors.push(`${phase.id}: deliverables missing`);
    if (!Array.isArray(phase.exitCriteria) || phase.exitCriteria.length === 0) errors.push(`${phase.id}: exit criteria missing`);
  }
  for (const required of requiredPhaseIds) if (!phaseIds.has(required)) errors.push(`missing required phase: ${required}`);
  for (const phase of phases) {
    for (const dependency of phase.dependencies ?? []) {
      if (!phaseIds.has(dependency)) errors.push(`${phase.id}: unknown phase dependency ${dependency}`);
      if (dependency === phase.id) errors.push(`${phase.id}: self dependency`);
    }
  }
  detectCycles(phases);

  const testIds = new Set();
  for (const test of tests) {
    if (!/^[A-Z]{2,5}-[0-9]{3}$/.test(test.id ?? "")) errors.push(`invalid test id: ${test.id}`);
    if (testIds.has(test.id)) errors.push(`duplicate test id: ${test.id}`);
    testIds.add(test.id);
    if (!phaseIds.has(test.phaseId)) errors.push(`${test.id}: unknown phase ${test.phaseId}`);
    if (!severityWeight.has(test.severity)) errors.push(`${test.id}: invalid severity`);
    if (!statusScore.has(test.status)) errors.push(`${test.id}: invalid status`);
    if (!evidenceRank.has(test.requiredEvidenceClass)) errors.push(`${test.id}: invalid evidence class`);
    if (!Array.isArray(test.requiredFor) || test.requiredFor.length === 0 || test.requiredFor.some((target) => !validTargets.has(target))) {
      errors.push(`${test.id}: invalid requiredFor targets`);
    }
    if (!Array.isArray(test.acceptanceCriteria) || test.acceptanceCriteria.length === 0) errors.push(`${test.id}: acceptance criteria missing`);
    if (typeof test.rollbackOrContainment !== "string" || test.rollbackOrContainment.trim() === "") errors.push(`${test.id}: rollback/containment missing`);
  }
  for (const required of requiredGateIds) if (!testIds.has(required)) errors.push(`missing required completion gate: ${required}`);
  for (const phase of phases) if (!tests.some((test) => test.phaseId === phase.id)) errors.push(`${phase.id}: no completion test`);

  for (const test of tests) {
    for (const prerequisite of test.prerequisites ?? []) {
      if (!testIds.has(prerequisite)) errors.push(`${test.id}: unknown prerequisite ${prerequisite}`);
      if (prerequisite === test.id) errors.push(`${test.id}: self prerequisite`);
    }
    const evidence = Array.isArray(test.evidence) ? test.evidence : [];
    const requiredRank = evidenceRank.get(test.requiredEvidenceClass) ?? Number.MAX_SAFE_INTEGER;
    const qualifying = evidence.filter((item) => (evidenceRank.get(item.evidenceClass) ?? -1) >= requiredRank);
    if (test.status === "passed" && qualifying.length === 0) errors.push(`${test.id}: passed without qualifying evidence`);
    if ((test.status === "source_validated" || test.status === "ready_for_live") && evidence.length === 0) {
      errors.push(`${test.id}: ${test.status} without evidence`);
    }
    if (test.status === "passed" && liveClasses.has(test.requiredEvidenceClass)) {
      if (qualifying.every((item) => item.synthetic === true)) errors.push(`${test.id}: live gate passed with synthetic-only evidence`);
      for (const item of qualifying) {
        if (!/^[a-f0-9]{40}$/.test(item.exactCommit ?? "")) errors.push(`${test.id}: live evidence missing exact commit`);
        if (typeof item.runReference !== "string" || item.runReference.trim() === "") errors.push(`${test.id}: live evidence missing run reference`);
      }
    }
  }

  for (const target of validTargets) {
    const required = tests.filter((test) => test.requiredFor.includes(target));
    if (required.length === 0) errors.push(`${target}: no required tests`);
    if (!required.some((test) => test.requiredEvidenceClass === "owner_acceptance")) warnings.push(`${target}: no owner acceptance gate`);
  }
}

function evaluate(target) {
  const required = manifest.tests.filter((test) => test.requiredFor.includes(target));
  const totalWeight = required.reduce((sum, test) => sum + severityWeight.get(test.severity), 0);
  const earnedWeight = required.reduce((sum, test) => sum + severityWeight.get(test.severity) * statusScore.get(test.status), 0);
  const completePhase = new Map();
  const nextPhases = [];
  const sorted = [...manifest.phases].sort((a, b) => a.order - b.order);
  for (const phase of sorted) {
    const phaseTests = required.filter((test) => test.phaseId === phase.id);
    const dependenciesComplete = phase.dependencies.every((dependency) => completePhase.get(dependency) === true);
    const complete = phaseTests.length > 0 && dependenciesComplete && phaseTests.every((test) => test.status === "passed");
    completePhase.set(phase.id, complete);
  }
  for (const phase of sorted) {
    if (completePhase.get(phase.id)) continue;
    if (phase.dependencies.every((dependency) => completePhase.get(dependency) === true)) nextPhases.push(phase.id);
    if (nextPhases.length === 2) break;
  }
  const blockers = required.filter((test) => test.status !== "passed").map((test) => test.id);
  return {
    weightedPercent: totalWeight === 0 ? 0 : Math.round((earnedWeight / totalWeight) * 10_000) / 100,
    requiredCount: required.length,
    passedCount: required.filter((test) => test.status === "passed").length,
    blockers,
    nextPhases,
    ready: required.length > 0 && blockers.length === 0,
  };
}

function detectCycles(phases) {
  const dependencyMap = new Map(phases.map((phase) => [phase.id, phase.dependencies ?? []]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (phaseId) => {
    if (visiting.has(phaseId)) {
      errors.push(`phase dependency cycle at ${phaseId}`);
      return;
    }
    if (visited.has(phaseId)) return;
    visiting.add(phaseId);
    for (const dependency of dependencyMap.get(phaseId) ?? []) visit(dependency);
    visiting.delete(phaseId);
    visited.add(phaseId);
  };
  for (const phase of phases) visit(phase.id);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

function sha256Canonical(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
