import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
const scriptPath = resolve("scripts/generate-sbom.mjs");
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "exosuit-sbom-"));
  directories.push(directory);
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "fixture-app", version: "1.2.3" }));
  await writeFile(join(directory, "package-lock.json"), JSON.stringify({
    name: "fixture-app",
    version: "1.2.3",
    lockfileVersion: 3,
    packages: {
      "": { name: "fixture-app", version: "1.2.3" },
      "node_modules/zod": {
        version: "4.4.3",
        resolved: "https://registry.example.invalid/zod.tgz?token=must-not-leak",
        integrity: `sha512-${Buffer.from("fixture-integrity").toString("base64")}`,
      },
      "node_modules/@scope/tool": { version: "2.0.0", dev: true, optional: true },
    },
  }));
  return directory;
}

describe("deterministic npm SBOM generator", () => {
  it("emits a sorted CycloneDX inventory without resolved URLs or secret-bearing metadata", async () => {
    const directory = await fixture();
    const output = "artifacts/sbom.json";
    const args = [
      scriptPath,
      "--output", output,
      "--commit", "a".repeat(40),
      "--timestamp", "2026-08-04T10:00:00.000Z",
    ];
    execFileSync(process.execPath, args, { cwd: directory, encoding: "utf8" });
    const first = await readFile(join(directory, output), "utf8");
    execFileSync(process.execPath, args, { cwd: directory, encoding: "utf8" });
    const second = await readFile(join(directory, output), "utf8");
    expect(second).toBe(first);
    const sbom = JSON.parse(first) as {
      bomFormat: string;
      specVersion: string;
      serialNumber: string;
      metadata: { properties: Array<{ name: string; value: string }> };
      components: Array<{ purl: string; hashes?: Array<{ alg: string; content: string }> }>;
    };
    expect(sbom.bomFormat).toBe("CycloneDX");
    expect(sbom.specVersion).toBe("1.5");
    expect(sbom.serialNumber).toMatch(/^urn:uuid:/);
    expect(sbom.components.map((component) => component.purl)).toEqual([
      "pkg:npm/%40scope/tool@2.0.0",
      "pkg:npm/zod@4.4.3",
    ]);
    expect(sbom.components[1]?.hashes?.[0]).toMatchObject({ alg: "SHA-512" });
    expect(sbom.components[1]?.hashes?.[0]?.content).toMatch(/^[a-f0-9]+$/);
    expect(first).not.toContain("registry.example.invalid");
    expect(first).not.toContain("must-not-leak");
    expect(sbom.metadata.properties).toEqual(expect.arrayContaining([
      { name: "exosuit:component-count", value: "2" },
    ]));
  });

  it("rejects unsupported lockfiles, malformed commits, and unknown arguments", async () => {
    const directory = await fixture();
    expect(() => execFileSync(process.execPath, [scriptPath, "--commit", "BAD"], { cwd: directory, stdio: "pipe" })).toThrow();
    expect(() => execFileSync(process.execPath, [scriptPath, "--unknown"], { cwd: directory, stdio: "pipe" })).toThrow();
    await writeFile(join(directory, "package-lock.json"), JSON.stringify({ lockfileVersion: 1, packages: {} }));
    expect(() => execFileSync(process.execPath, [scriptPath], { cwd: directory, stdio: "pipe" })).toThrow();
  });
});
