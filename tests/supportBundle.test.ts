import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSupportBundle,
  hashPrivateIdentifier,
  verifySupportBundle,
  writeSupportBundle,
  type SupportBundleInput,
} from "../src/supportBundle.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function input(overrides: Partial<SupportBundleInput> = {}): SupportBundleInput {
  return {
    generatedAt: "2026-07-21T17:00:00.000Z",
    exosuitVersion: "0.1.0",
    platform: "Windows 11 test VM",
    provider: "windows-ui-automation",
    mode: "observe",
    emergencyStopped: false,
    persistenceMode: "encrypted_file",
    counts: { windows: 3, workflows: 1, agents: 1, installedSkills: 0, applicationMaps: 2 },
    agents: [
      {
        agentIdHash: hashPrivateIdentifier("agent-private-id"),
        sessionKind: "vm",
        health: "healthy",
        capabilities: ["uia", "motor"],
        softwareVersion: "0.1.0",
      },
    ],
    workflowStates: { paused: 1 },
    auditSummary: { eventCount: 12, eventTypes: { desktop_observed: 10, workflow_paused: 2 }, chainValid: true },
    performanceSummary: [
      { metric: "observation_latency_ms", count: 100, p50: 20, p95: 40, p99: 50, maximum: 60 },
    ],
    recentErrorCodes: ["virtual_desktop_unavailable"],
    configurationFlags: { screenshotsEnabled: false, physicalInputEnabled: false },
    ...overrides,
  };
}

describe("privacy-safe support bundles", () => {
  it("creates, verifies, and writes metadata-only diagnostics", async () => {
    const bundle = createSupportBundle(input());
    expect(() => verifySupportBundle(bundle)).not.toThrow();
    const root = await mkdtemp(join(tmpdir(), "exosuit-support-bundle-"));
    roots.push(root);
    const path = join(root, "support.json");
    await writeSupportBundle(path, bundle);
    const serialized = await readFile(path, "utf8");
    expect(serialized).not.toContain("agent-private-id");
    expect(serialized).not.toContain("window title");
    expect(serialized).not.toContain("screenshotBase64");
    expect(JSON.parse(serialized)).toMatchObject({ formatVersion: 1 });
  });

  it("rejects secret-shaped values and forbidden content-bearing fields", () => {
    // `platform` is still free text, so it exercises the value denylist. This assertion
    // used to target recentErrorCodes, which now rejects the same string earlier at schema
    // parse because identifiers cannot contain spaces. The denylist still guards every
    // field that legitimately carries prose, so it is tested against one of those.
    expect(() =>
      createSupportBundle(input({ platform: "win32 Bearer abcdefghijklmnopqrstuvwxyz" })),
    ).toThrow(/forbidden sensitive value/);
    // The same string in an identifier field is rejected too, one layer earlier.
    expect(() =>
      createSupportBundle(input({ recentErrorCodes: ["Bearer abcdefghijklmnopqrstuvwxyz"] })),
    ).toThrow();
    expect(() =>
      createSupportBundle({
        ...input(),
        configurationFlags: { screenshotsEnabled: false },
        screenshotBytes: "not allowed",
      } as SupportBundleInput),
    ).toThrow();
  });

  // Regression for the 2026-07-28 security review. `recentErrorCodes` was typed as free
  // text up to 200 characters, so raw exception messages carrying file paths, window
  // titles, or URLs passed every check and reached a bundle intended to leave the
  // machine. A denylist cannot catch these; only an identifier allowlist can. Each string
  // below was verified to be accepted before the fix.
  it.each([
    String.raw`Failed to open C:\Users\Aidan\Documents\2025 Tax Return - SSN 123-45-6789.pdf`,
    "UIA element 'Patient: Jane Doe, DOB 1984-03-02' absent from window 'Epic - Chart Review'",
    "Timeout contacting https://internal.acme.example/api?employee=aidan.miller@acme.example",
  ])("rejects free text in recentErrorCodes: %j", (leaked) => {
    expect(() => createSupportBundle(input({ recentErrorCodes: [leaked] }))).toThrow();
  });

  it("still accepts genuine identifier-shaped diagnostics", () => {
    const bundle = createSupportBundle(
      input({ recentErrorCodes: ["virtual_desktop_unavailable", "provider.timeout", "raw-input-denied"] }),
    );
    expect(bundle.data.recentErrorCodes).toHaveLength(3);
  });

  it("constrains identifier-shaped keys and metric names, not just error codes", () => {
    // Record keys and metric names are the same class of field: an identifier is expected,
    // so free text there would be an equivalent leak.
    expect(() =>
      createSupportBundle(input({ workflowStates: { "paused on C:\\Users\\Aidan\\secret.txt": 1 } })),
    ).toThrow();
    expect(() =>
      createSupportBundle(input({ configurationFlags: { "flag for user aidan@acme.example": false } })),
    ).toThrow();
    expect(() =>
      createSupportBundle(
        input({
          performanceSummary: [
            { metric: "latency while reading Q4 Payroll.xlsx", count: 1, p50: 1, p95: 1, p99: 1, maximum: 1 },
          ],
        }),
      ),
    ).toThrow();
  });

  it("detects bundle tampering", () => {
    const bundle = createSupportBundle(input());
    expect(() =>
      verifySupportBundle({
        ...bundle,
        data: { ...bundle.data, counts: { ...bundle.data.counts, windows: 99 } },
      }),
    ).toThrow(/integrity verification/);
  });
});
