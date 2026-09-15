import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The third implementation of the KVP wire format.
 *
 * `Read-ExosuitFieldGuestKvp.ps1` reassembles chunked values in PowerShell, alongside the C#
 * writer and the TypeScript reader. The fixture already binds those two to each other; this binds
 * the PowerShell one to the same fixture.
 *
 * The script is **not modified** to make this testable. It participates in live evidence
 * ceremonies, and refactoring it for the convenience of a test would change the code that runs
 * during a ceremony for no operational reason. Instead the shipped `Resolve-KvpEnvelope` text is
 * extracted verbatim and evaluated against a stubbed `Get-FieldKvpItems`, so what is under test is
 * exactly the text that ships.
 */

const SCRIPT_PATH = "scripts/windows/Read-ExosuitFieldGuestKvp.ps1";
const FIXTURE_PATH = "tests/fixtures/kvp-chunk-contract.json";

interface FixtureCase {
  readonly description: string;
  readonly value: string;
  readonly entries: Record<string, string>;
}

interface Fixture {
  readonly name: string;
  readonly chunkCharacters: number;
  readonly cases: readonly FixtureCase[];
}

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
const windows = process.platform === "win32";

/** Pulls the shipped function body out of the script without executing the script. */
function extractResolveFunction(): string {
  const script = readFileSync(SCRIPT_PATH, "utf8");
  const start = script.indexOf("function Resolve-KvpEnvelope {");
  expect(start, "Resolve-KvpEnvelope must exist in the shipped script").toBeGreaterThanOrEqual(0);

  // The function ends at the first closing brace in column zero after its start.
  const end = script.indexOf("\n}", start);
  expect(end, "Resolve-KvpEnvelope must be a top-level function").toBeGreaterThan(start);
  return script.slice(start, end + 2);
}

/**
 * PowerShell single-quoted literal. JSON quoting cannot be used here: these values are JSON, so
 * `JSON.stringify` produces `\"` escapes, and in a PowerShell double-quoted string a backslash is
 * literal and the quote terminates the string. Single quotes also stop `$` from interpolating.
 */
function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function runResolve(entries: Record<string, string>, key: string): { ok: boolean; value: string; error: string } {
  const table = Object.entries(entries)
    .map(([name, data]) => `  ${psLiteral(name)} = ${psLiteral(data)}`)
    .join("\n");

  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$script:stub = @{\n${table}\n}`,
    // The stub stands in for the CIM query the real script performs.
    "function Get-FieldKvpItems { return $script:stub }",
    extractResolveFunction(),
    "try {",
    `  $resolved = Resolve-KvpEnvelope -Key ${psLiteral(key)}`,
    // Base64 over UTF-8: powershell.exe stdout uses the console codepage, which mangles
    // non-ASCII on the way out. Encoding the result keeps the assertion about the reassembly
    // logic rather than about the terminal's encoding.
    "  Write-Output ('OK:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($resolved)))",
    "} catch {",
    "  Write-Output ('ERR:' + $_.Exception.Message)",
    "}",
  ].join("\n");

  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    timeout: 120_000,
  });

  const output = (result.stdout ?? "").trim();
  if (output.startsWith("OK:")) {
    return { ok: true, value: Buffer.from(output.slice(3), "base64").toString("utf8"), error: "" };
  }
  return { ok: false, value: "", error: output.startsWith("ERR:") ? output.slice(4) : output };
}

describe.skipIf(!windows)("KVP chunk contract — PowerShell reader", () => {
  it.each(fixture.cases.map((testCase) => [testCase.description, testCase] as const))(
    "reassembles the fixture value: %s",
    (_description, testCase) => {
      const result = runResolve(testCase.entries, fixture.name);

      expect(result.error).toBe("");
      expect(result.ok).toBe(true);
      // Byte-for-byte agreement with the C# writer and the TypeScript reader.
      expect(result.value).toBe(testCase.value);
    },
    180_000,
  );

  it("rejects a tampered chunk on the digest, like the other two readers", () => {
    const chunked = fixture.cases.find((testCase) => Object.keys(testCase.entries).length > 1);
    expect(chunked).toBeDefined();

    const tampered = { ...chunked!.entries };
    const key = `${fixture.name}.000`;
    tampered[key] = "tampered".padEnd(tampered[key]!.length, "-");

    const result = runResolve(tampered, fixture.name);

    expect(result.ok).toBe(false);
    expect(result.error.toLowerCase()).toContain("digest");
  }, 180_000);

  it("rejects a missing chunk rather than returning a short value", () => {
    const chunked = fixture.cases.find((testCase) => Object.keys(testCase.entries).length > 2);
    expect(chunked).toBeDefined();

    const missing = { ...chunked!.entries };
    delete missing[`${fixture.name}.001`];

    const result = runResolve(missing, fixture.name);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("missing");
  }, 180_000);
});
