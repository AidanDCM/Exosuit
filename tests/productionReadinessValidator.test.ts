import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const validator = resolve(process.cwd(), "scripts/validate-production-readiness.mjs");

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
] as const;

async function fixture(input: {
  passing: boolean;
  includeLockfile?: boolean;
  candidateCommit?: string;
}): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "exosuit-production-readiness-"));
  await mkdir(resolve(root, "docs/qa"), { recursive: true });
  await writeFile(resolve(root, "docs/qa/PRODUCTION_READINESS_ASSESSMENT_2026-07-22.md"), "# Assessment\n", "utf8");
  if (input.includeLockfile) {
    await writeFile(resolve(root, "package-lock.json"), JSON.stringify({ name: "fixture", lockfileVersion: 3 }), "utf8");
  }
  const candidateCommit = input.candidateCommit ?? "a".repeat(40);
  await writeFile(
    resolve(root, "docs/qa/production-readiness.json"),
    JSON.stringify(
      {
        contractVersion: 1,
        candidateCommit: input.passing ? candidateCommit : null,
        candidateVersion: input.passing ? "1.0.0-rc.1" : null,
        generatedAt: "2026-07-22T19:15:00Z",
        ownerApproved: input.passing,
        productionDecision: input.passing ? "approved" : "denied",
        developmentAccessEnabled: false,
        developmentUnattendedSetupEnabled: false,
        unresolvedBlockers: input.passing ? [] : ["fixture blocker"],
        gates: requiredGates.map((gate) => ({
          gate,
          status: input.passing ? "pass" : "not_run",
          evidence: input.passing ? [`evidence/${gate}.json`] : [],
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
  return root;
}

function run(root: string, args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [validator, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("production readiness validator", () => {
  it("reports a denied manifest without failing report-only evidence collection", async () => {
    const root = await fixture({ passing: false });
    const result = run(root, ["--report-only"]);
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("NOT PRODUCTION READY");
    expect(`${result.stdout}${result.stderr}`).toContain("package-lock.json is missing");
  });

  it("fails the release gate for a denied manifest", async () => {
    const root = await fixture({ passing: false });
    const result = run(root);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("production decision is denied");
  });

  it("passes only a complete manifest with evidence, lockfile, owner approval, and matching commit", async () => {
    const commit = "b".repeat(40);
    const root = await fixture({ passing: true, includeLockfile: true, candidateCommit: commit });
    const result = run(root, [], { EXOSUIT_RELEASE_COMMIT: commit });
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("PRODUCTION READINESS GATE PASSED");
  });

  it("rejects a candidate manifest for a different execution commit", async () => {
    const root = await fixture({ passing: true, includeLockfile: true, candidateCommit: "c".repeat(40) });
    const result = run(root, [], { EXOSUIT_RELEASE_COMMIT: "d".repeat(40) });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("candidateCommit does not match execution commit");
  });

  it("rejects an otherwise complete candidate with development access enabled", async () => {
    const commit = "e".repeat(40);
    const root = await fixture({ passing: true, includeLockfile: true, candidateCommit: commit });
    const manifestPath = resolve(root, "docs/qa/production-readiness.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.developmentAccessEnabled = true;
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    const result = run(root, [], { EXOSUIT_RELEASE_COMMIT: commit });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("development access must be explicitly disabled");
  });

  it("rejects an otherwise complete candidate with development unattended setup enabled", async () => {
    const commit = "f".repeat(40);
    const root = await fixture({ passing: true, includeLockfile: true, candidateCommit: commit });
    const manifestPath = resolve(root, "docs/qa/production-readiness.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.developmentUnattendedSetupEnabled = true;
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    const result = run(root, [], { EXOSUIT_RELEASE_COMMIT: commit });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("development unattended setup must be explicitly disabled");
  });
});
