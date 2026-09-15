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
import { fileURLToPath } from "node:url";

const root = resolve(process.cwd());
const reportIndex = process.argv.indexOf("--report");
const rawReportPath = reportIndex > -1 ? process.argv[reportIndex + 1] : undefined;
// Resolved against the original working directory, because --clean runs the checks from a
// throwaway worktree and a relative path would land inside it and be deleted.
const reportPath = rawReportPath ? resolve(root, rawReportPath) : undefined;

/**
 * `--clean` runs every check against a pristine checkout of HEAD instead of the working
 * tree.
 *
 * A working-tree run can pass on things that would fail for anyone else: a file that was
 * never committed, or a stale `node_modules` that differs from what a fresh resolve
 * produces. That second case is not hypothetical — a local audit once reported one high
 * and two moderate advisories that a clean resolve did not have, because the installed
 * tree was older than the declared ranges allowed.
 *
 * A git worktree gives exactly the committed content and nothing else.
 *
 * The child runs *this* script — the working-tree copy — against the worktree's contents.
 * The subject under test is the committed code; the harness is whatever you are editing.
 * Running the worktree's own copy would be marginally purer, but it makes a change to the
 * harness untestable until committed, which is a bad trade for a tool you iterate on.
 */
if (process.argv.includes("--clean") && !process.env.EXOSUIT_PARITY_WORKTREE) {
  const worktree = mkdtempSync(join(tmpdir(), "exosuit-clean-"));
  const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });

  // Clear metadata a previous run could not delete. On Windows the .git directory is
  // occasionally held briefly by a sync client or scanner, so removal is best-effort at the
  // end and swept here at the start rather than left to accumulate.
  git(["worktree", "prune"]);

  const head = git(["rev-parse", "--short", "HEAD"]).stdout?.trim() ?? "unknown";
  process.stdout.write(`Clean-checkout parity: exporting HEAD (${head}) to a temporary worktree\n\n`);

  const added = git(["worktree", "add", "--detach", "--quiet", worktree, "HEAD"]);
  if (added.status !== 0) {
    process.stderr.write(`Could not create a clean worktree.\n${added.stderr ?? ""}\n`);
    rmSync(worktree, { recursive: true, force: true });
    process.exit(1);
  }

  try {
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(import.meta.url), ...(reportPath ? ["--report", reportPath] : [])],
      {
        cwd: worktree,
        stdio: "inherit",
        env: { ...process.env, EXOSUIT_PARITY_WORKTREE: "1" },
      },
    );
    process.exitCode = child.status ?? 1;
  } finally {
    // Best-effort: a locked .git must never turn a passing run into a failing one, and must
    // never block a push through the pre-push hook. Anything left behind is swept by the
    // prune at the start of the next run.
    git(["worktree", "remove", "--force", worktree]);
    rmSync(worktree, { recursive: true, force: true });
    const pruned = git(["worktree", "prune"]);
    if (pruned.status !== 0) {
      process.stdout.write(
        "note: temporary worktree metadata could not be removed yet; it will be pruned on the next run.\n",
      );
    }
  }
  process.exit(process.exitCode ?? 1);
}

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
// CI installs before it runs anything, and a clean worktree has no node_modules at all.
// Mirroring that step keeps both modes faithful; in a working tree it is close to a no-op.
run("typescript: install locked dependencies", npm, ["ci", "--ignore-scripts", "--fund=false", "--silent"]);
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
// CI installs the exact committed dependency graph. Audit that same graph in a temporary
// directory so a developer's stale node_modules cannot change the result.
const auditDir = mkdtempSync(join(tmpdir(), "exosuit-audit-"));
try {
  copyFileSync(join(root, "package.json"), join(auditDir, "package.json"));
  copyFileSync(join(root, "package-lock.json"), join(auditDir, "package-lock.json"));
  const installed = run("npm-audit: locked dependency installation", npm, [
    "ci", "--ignore-scripts", "--fund=false", "--silent",
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
