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
    expect(() =>
      createSupportBundle(input({ recentErrorCodes: ["Bearer abcdefghijklmnopqrstuvwxyz"] })),
    ).toThrow(/forbidden sensitive value/);
    expect(() =>
      createSupportBundle({
        ...input(),
        configurationFlags: { screenshotsEnabled: false },
        screenshotBytes: "not allowed",
      } as SupportBundleInput),
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
