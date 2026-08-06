import { describe, expect, it } from "vitest";
import {
  FROZEN_CONTRACT_FINGERPRINT,
  FROZEN_CONTRACT_LABEL,
  frozenContractFingerprint,
  frozenContractSurface,
} from "../src/completion/frozen.js";
import { gateEvidenceAllowlist, requiredGateIds } from "../src/completion/policy.js";

describe("completion contract freeze (v2.2)", () => {
  it("matches the pinned contract fingerprint", () => {
    // If this fails, the contract surface moved. That is not automatically
    // wrong — but evidence collected under the old surface may no longer mean
    // what it did, so the change must be deliberate: bump the label, say why,
    // and re-attest anything that depended on it.
    expect(frozenContractFingerprint()).toBe(FROZEN_CONTRACT_FINGERPRINT);
  });

  it("is labelled 2.2", () => {
    expect(FROZEN_CONTRACT_LABEL).toBe("2.2");
  });

  it("covers every gate in the allowlist", () => {
    const surface = frozenContractSurface() as { approvalByGate: Record<string, string> };
    for (const gateId of requiredGateIds) {
      expect(gateEvidenceAllowlist[gateId]).toBeDefined();
      expect(surface.approvalByGate[gateId]).toBeDefined();
    }
  });

  it("pins the field list of every wire schema", () => {
    const surface = frozenContractSurface() as { schemaFields: Record<string, string[]> };
    for (const [name, fields] of Object.entries(surface.schemaFields)) {
      expect(fields.length, `${name} has no fields`).toBeGreaterThan(0);
    }
    // Spot-check the bindings M1 evidence depends on most.
    expect(surface.schemaFields["evidence"]).toContain("artifactSha256");
    expect(surface.schemaFields["evidence"]).toContain("nonce");
    expect(surface.schemaFields["environment"]).toContain("fieldBootId");
    expect(surface.schemaFields["lifecycleEvent"]).toContain("previousEventHash");
    expect(surface.schemaFields["ledgerEvent"]).toContain("reviewerSignature");
  });
});
