import { describe, expect, it } from "vitest";
import {
  canonicalFieldOriginSchema,
  canonicalUtcTimestamp,
  canonicalUtcTimestampSchema,
  normalizeFieldOrigin,
  personalStateIdentitySchema,
} from "../src/fieldSecurityContracts.js";
import { fieldIdentitySchema, fieldPolicySchema } from "../src/fieldContracts.js";

const fieldId = "7d9da8c7-6d8d-4f5d-9287-06e6dba8cb60";

function basePolicy() {
  return {
    contractVersion: 1 as const,
    policyId: "57d8b6f3-4e28-4e50-854e-e065f1580aa5",
    field: { fieldId, fieldGeneration: 1 },
    mode: "shadow" as const,
    allowedProcesses: ["notepad"],
    allowedCapabilities: ["observe_desktop" as const],
    allowedOrigins: ["https://example.com"],
    maximumRuntimeSeconds: 60,
    maximumActions: 10,
    recordingConsent: "not_applicable" as const,
    allowHostDesktopAccess: false as const,
    allowHostDriveWrite: false as const,
    allowPrivilegeEscalation: false as const,
    allowSecurityControlChanges: false as const,
    issuedAt: "2026-07-21T18:00:00.000Z",
    expiresAt: "2026-07-21T18:01:00.000Z",
  };
}

describe("canonical Field security contracts", () => {
  it("accepts only millisecond-precision UTC timestamps", () => {
    expect(canonicalUtcTimestampSchema.parse("2026-07-21T18:00:00.000Z")).toBe("2026-07-21T18:00:00.000Z");
    expect(canonicalUtcTimestamp("2026-07-21T18:00:00Z")).toBe("2026-07-21T18:00:00.000Z");
    expect(() => canonicalUtcTimestampSchema.parse("2026-07-21T18:00:00Z")).toThrow(/canonical UTC/);
    expect(() => canonicalUtcTimestampSchema.parse("2026-07-21T19:00:00.000+01:00")).toThrow(/canonical UTC/);
  });

  it("normalizes default ports and rejects non-origin URL content", () => {
    expect(normalizeFieldOrigin("HTTPS://Example.COM:443")).toBe("https://example.com");
    expect(normalizeFieldOrigin("http://Example.COM:8080")).toBe("http://example.com:8080");
    expect(canonicalFieldOriginSchema.parse("https://example.com")).toBe("https://example.com");
    expect(() => canonicalFieldOriginSchema.parse("https://example.com:443")).toThrow(/not canonical/);
    expect(() => canonicalFieldOriginSchema.parse("https://example.com/path")).toThrow(/path/);
    expect(() => canonicalFieldOriginSchema.parse("https://user@example.com")).toThrow(/user information/);
    expect(() => canonicalFieldOriginSchema.parse("file:///tmp/test")).toThrow(/http or https/);
  });

  it("requires unique canonical origins in policy", () => {
    expect(fieldPolicySchema.parse(basePolicy()).allowedOrigins).toEqual(["https://example.com"]);
    expect(() => fieldPolicySchema.parse({ ...basePolicy(), allowedOrigins: ["https://example.com:443"] })).toThrow(/not canonical/);
    expect(() => fieldPolicySchema.parse({ ...basePolicy(), allowedOrigins: ["https://example.com", "https://example.com"] })).toThrow(/unique/);
  });

  it("uses stable versioned identity for writable personal state", () => {
    const personalState = personalStateIdentitySchema.parse({
      diskId: "personal-state-a",
      generation: 4,
      manifestHash: "a".repeat(64),
    });
    const identity = fieldIdentitySchema.parse({
      subsystem: "field",
      fieldId,
      fieldGeneration: 1,
      agentId: "field-agent-a",
      machineId: "vm-a",
      windowsSessionId: "session-a",
      baseImageDigest: "b".repeat(64),
      personalState,
      taskDiskId: "task-a",
      createdAt: "2026-07-21T18:00:00.000Z",
    });
    expect(identity.personalState?.generation).toBe(4);
    expect(() =>
      fieldIdentitySchema.parse({ ...identity, personalStateDigest: "c".repeat(64) }),
    ).toThrow(/either versioned personalState identity/);
  });
});
