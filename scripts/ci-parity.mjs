#!/usr/bin/env node
/**
 * Runs every job in .github/workflows locally, as closely as a workstation allows.
 *
 * This exists because hosted CI is unavailable. It produces **local evidence only**.
 * `docs/MASTER_SYSTEM_ROADMAP.md` requires CI and supported security checks for
 * `github_validated`, and this script cannot supply those. Never cite its output as
 * hosted CI evidence, and never use it to promote a phase.
 *
 * Usage:
 *   node scripts/ci-parity.mjs
 *   node scripts/ci-parity.mjs --report docs/qa/evidence/<name>.md
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const reportIndex = process.argv.indexOf("--report");
const reportPath = reportIndex > -1 ? process.argv[reportIndex + 1] : undefined;

/**
 * `dotnet` on PATH may be a hostfxr-only install with no SDK, while a usable SDK sits
 * at %USERPROFILE%\.dotnet. That shadowing cost two development sessions; see README.
 */
function resolveDotnet() {
  const probe = (exe) => {
    const result = spawnSync(exe, ["--list-sdks"], { encoding: "utf8", shell: false });
    return result.status === 0 && (result.stdout ?? "").trim().length > 0;
  };
  if (probe("dotnet")) return "dotnet";
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const userLocal = join(home, ".dotnet", process.platform === "win32" ? "dotnet.exe" : "dotnet");
  if (existsSync(userLocal) && probe(userLocal)) return userLocal;
  return undefined;
}

const dotnet = resolveDotnet();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const results = [];

function run(label, command, args, options = {}) {
  const started = Date.now();
  // Node on Windows refuses to spawn .cmd shims (npm.cmd) without a shell.
  // Arguments here are all shell-safe literals, so this stays quoting-free.
  const needsShell = process.platform === "win32" && command.endsWith(".cmd");
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    shell: needsShell,
    env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const ok = options.check ? options.check(result, output) : result.status === 0;
  results.push({
    label,
    ok,
    ms: Date.now() - started,
    detail: options.detail ? options.detail(output) : undefined,
    output,
  });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${label}\n`);
  if (!ok) {
    const tail = output.trim().split(/\r?\n/).slice(-12).join("\n");
    process.stdout.write(`${tail.replace(/^/gm, "      ")}\n`);
  }
  return ok;
}

function skip(label, reason) {
  results.push({ label, ok: false, skipped: true, reason, ms: 0 });
  process.stdout.write(`SKIP  ${label} — ${reason}\n`);
}

process.stdout.write("CI parity run (local evidence only; not hosted CI)\n\n");

// Job: repository-contract — "Required manuals and safety files"
run("repository-contract: required files and secret-shape scan", npm, [
  "run", "validate:repository", "--silent",
]);

// Job: typescript — "TypeScript contracts, gateway, and pulse"
run("typescript: typecheck", npm, ["run", "typecheck", "--silent"]);
run("typescript: unit and integration tests", npm, ["test", "--silent"], {
  detail: (out) => (out.match(/Tests\s+\d+ passed[^\n]*/) ?? [])[0],
});
run("typescript: production build", npm, ["run", "build", "--silent"]);
run("typescript: full-chain system pulse", npm, ["run", "test:pulse", "--silent"], {
  detail: (out) => (out.match(/Tests\s+\d+ passed[^\n]*/) ?? [])[0],
});

// Job: windows-agent — "Windows agent build and pure tests"
const testProject = "apps/windows-agent.Tests/Exosuit.Agent.Tests.csproj";
if (!dotnet) {
  skip("windows-agent: build and tests", "no .NET SDK found on PATH or in %USERPROFILE%\\.dotnet");
  skip("nuget-audit: vulnerable packages", "no .NET SDK found");
} else {
  run("windows-agent: restore", dotnet, ["restore", testProject]);
  run("windows-agent: build Release -warnaserror", dotnet, [
    "build", testProject, "--configuration", "Release", "--no-restore", "-warnaserror",
  ]);
  run("windows-agent: tests", dotnet, [
    "test", testProject, "--configuration", "Release", "--no-build",
  ], {
    detail: (out) => (out.match(/Passed!.*/) ?? [])[0],
  });

  // Job: nuget-audit — "NuGet dependency vulnerability audit"
  run("nuget-audit: vulnerable packages (direct + transitive)", dotnet, [
    "list", testProject, "package", "--vulnerable", "--include-transitive",
  ], {
    // CI fails on a non-zero exit OR the presence of this phrase in the output.
    check: (result, out) => result.status === 0 && !/has the following vulnerable packages/.test(out),
    detail: (out) => (out.match(/has no vulnerable packages[^\n]*/) ?? [])[0],
  });
}

// Job: npm-audit — "npm dependency vulnerability audit"
// CI runs `npm install` on a clean checkout, so it resolves fresh. A developer's stale
// node_modules can differ, so this resolves into a temp directory to match CI.
const auditDir = mkdtempSync(join(tmpdir(), "exosuit-audit-"));
try {
  copyFileSync(join(root, "package.json"), join(auditDir, "package.json"));
  const installed = run("npm-audit: fresh dependency resolution", npm, [
    "install", "--ignore-scripts", "--fund=false", "--silent",
  ], { cwd: auditDir });
  if (installed) {
    run("npm-audit: no high or critical advisories", npm, [
      "audit", "--audit-level=high",
    ], {
      cwd: auditDir,
      detail: (out) => (out.match(/found \d+ vulnerabilities|found 0 vulnerabilities/) ?? [])[0],
    });
  } else {
    skip("npm-audit: no high or critical advisories", "dependency resolution failed");
  }
} finally {
  rmSync(auditDir, { recursive: true, force: true });
}

const failed = results.filter((entry) => !entry.ok);
process.stdout.write(
  `\n${results.length - failed.length}/${results.length} checks passed.\n`,
);

if (reportPath) {
  const lines = [
    "# CI Parity Run — Local Evidence Only",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    "",
    "> This is a local workstation run, not hosted CI. `github_validated` requires CI and",
    "> supported security checks that this script cannot supply. Do not cite it as hosted",
    "> evidence and do not promote a phase on it.",
    "",
    "| Check | Result | Detail |",
    "|---|---|---|",
    ...results.map((entry) => {
      const status = entry.skipped ? "SKIPPED" : entry.ok ? "pass" : "**FAIL**";
      const detail = entry.skipped ? entry.reason : (entry.detail ?? "").replace(/\|/g, "\\|");
      return `| ${entry.label} | ${status} | ${detail} |`;
    }),
    "",
    `**Result:** ${results.length - failed.length} of ${results.length} checks passed.`,
    "",
  ];
  writeFileSync(resolve(root, reportPath), lines.join("\n"), "utf8");
  process.stdout.write(`Report written to ${reportPath}\n`);
}

process.exitCode = failed.length > 0 ? 1 : 0;
