#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const fileIndex = process.argv.indexOf("--file");
const path = resolve(root, fileIndex >= 0 ? process.argv[fileIndex + 1] : "development/current-slice.json");
const failures = [];
let slice;
try {
  slice = JSON.parse(await readFile(path, "utf8"));
} catch (error) {
  failures.push(`slice is unreadable or invalid JSON: ${error instanceof Error ? error.message : "unknown error"}`);
}
if (slice) {
  if (slice.contractVersion !== 1) failures.push("contractVersion must equal 1");
  for (const field of ["sliceId", "goal", "promotionGate", "subsystem", "riskBoundary", "rollback"]) {
    if (typeof slice[field] !== "string" || slice[field].trim().length === 0) failures.push(`${field} is required`);
  }
  if (!Array.isArray(slice.masterPlanPhases) || slice.masterPlanPhases.length === 0 || slice.masterPlanPhases.some((phase) => !/^L(?:[0-9]|1[0-9]|20)$/.test(phase))) failures.push("masterPlanPhases must contain L0-L20 values");
  if (!Array.isArray(slice.allowedOperations) || slice.allowedOperations.length === 0 || slice.allowedOperations.some((operation) => !["provision", "observe", "destroy"].includes(operation))) failures.push("allowedOperations exceeds the lifecycle service boundary");
  for (const literalFalse of ["modelFacing", "pilotMayChangePolicy", "recordingAuthority", "keyAuthority", "exportAuthority", "fullControlAuthority"]) {
    if (slice[literalFalse] !== false) failures.push(`${literalFalse} must remain false`);
  }
  if (!Array.isArray(slice.tests) || slice.tests.length < 8) failures.push("slice must enumerate the complete validation surface");
  if (!Array.isArray(slice.evidenceClasses) || slice.evidenceClasses.length === 0) failures.push("slice must declare evidence classes");
  if (slice.liveValidationRequired !== true) failures.push("Field owner authority requires explicit live validation");
}
if (failures.length) {
  console.error("Exosuit development slice validation failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Exosuit development slice validation passed (${slice.sliceId}; ${slice.masterPlanPhases.join(", ")}).`);
