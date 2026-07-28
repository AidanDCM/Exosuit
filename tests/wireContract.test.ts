import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  actionProposalSchema,
  actionResultSchema,
  agentStatusSchema,
  auditEventSchema,
  observationSchema,
} from "../src/contracts.js";

const wireFixtureSchema = z.object({
  status: agentStatusSchema,
  observation: observationSchema,
  proposal: actionProposalSchema,
  result: actionResultSchema,
  auditEvent: auditEventSchema,
});

describe("shared TypeScript/.NET wire contract", () => {
  it("parses the canonical fixture without coercion or field loss", async () => {
    const path = resolve(process.cwd(), "tests/fixtures/wire-contract-v1.json");
    const fixture = wireFixtureSchema.parse(JSON.parse(await readFile(path, "utf8")));

    expect(fixture.status).toMatchObject({ mode: "sandbox", provider: "fake-sandbox" });
    expect(fixture.observation.elements[0]).toMatchObject({
      id: "el-editor",
      source: "fake",
      supportedActions: ["set_element_value"],
    });
    expect(fixture.proposal.action).toMatchObject({
      actionType: "set_element_value",
      route: "os_accessibility",
      requestedBy: "test",
    });
    expect(fixture.proposal.decision).toMatchObject({ status: "allow", riskLevel: "medium" });
    expect(fixture.result).toMatchObject({ status: "succeeded", verificationStatus: "passed" });
    expect(fixture.auditEvent.hash).toHaveLength(64);
  });
});
