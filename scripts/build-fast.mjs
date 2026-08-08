#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const evidenceRoot = join(root, "artifacts", "build-fabric", timestamp);
await mkdir(evidenceRoot, { recursive: true });
const node = process.execPath;

function run(label, command, args) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    const child = spawn(command, args, { cwd: root, shell: process.platform === "win32" && command.endsWith(".cmd"), env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" } });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.on("close", async (code) => {
      await writeFile(join(evidenceRoot, `${label}.log`), output, "utf8");
      resolveRun({ label, status: code === 0 ? "passed" : "failed", exitCode: code ?? 1, durationMilliseconds: Date.now() - started });
    });
  });
}

const results = await Promise.all([
  run("repository", node, [join(root, "scripts", "validate-repository.mjs")]),
  run("plan", node, [join(root, "scripts", "validate-master-plan.mjs")]),
  run("field-contract", node, [join(root, "scripts", "validate-field.mjs")]),
  run("slice", node, [join(root, "scripts", "validate-development-slice.mjs")]),
  run("typecheck", node, [join(root, "node_modules", "typescript", "bin", "tsc"), "-p", join(root, "tsconfig.json"), "--noEmit"]),
]);
const failed = results.filter((result) => result.status !== "passed");
const summary = { contractVersion: 1, runId: timestamp, evidenceClass: "working_tree_fast_feedback", status: failed.length ? "failed" : "passed", exactHead: false, results };
await writeFile(join(evidenceRoot, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
console.log(`\nFast build fabric: ${results.length - failed.length}/${results.length} lanes passed. Evidence: ${evidenceRoot}`);
process.exitCode = failed.length ? 1 : 0;
